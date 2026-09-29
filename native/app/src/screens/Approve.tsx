// Native N3 (#1825): godkjenn eller send tilbake makkernes kort.
//
// Lista kommer fra den DELTE `pendingApprovalsFor` — samme regel som webbens
// godkjenn-side, spill-hjem-banneret og hjem-kortene. Den lister aldri deg selv
// (0103-triggeren forbyr selv-godkjenning uansett).
//
// #2220: lista har samme gate som «Godkjenn (N)» på spill-hjem
// (`pendingApprovals`): runden krever godkjenning og pågår. Ellers står den
// tomme tilstanden, så knappen og lista aldri sier noe forskjellig.
//
// Selve autorisasjonen ligger i scorekort-ruta (#2215): porten der avgjør hvem
// som får godkjenne og avvise, og kjernen bak den skriver, varsler og tømmer
// web-cachen. Skjermen er UX foran den porten, ikke porten selv — derfor MÅ et
// `{ ok: false }` vises, også når kortet bare ikke var til vurdering lenger.
//
// #2262: hvert kort vises som det klassiske scorekortet — UT og INN med PAR og
// SLAG — og BRUTTO under, samme kort som spilleren selv ser. Uten NETTO: den
// som godkjenner, attesterer slagene, ikke handicapen.
import { useCallback, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { parForPlayer } from '../../../../lib/games/parDisplay';
import { buildScorecardGrid } from '../../../../lib/scorecard/scorecardGrid';
import type { ScoringGender } from '../../../../lib/scoring/modes/types';
import { ScorecardGrid } from '../components/scorecard/ScorecardGrid';
import { ScorecardTotals } from '../components/scorecard/ScorecardTotals';
import type { LocalScore } from '../data/db';
import type { BundleHole } from '../data/gameBundle';
import { approveScorecard, rejectScorecard } from '../data/playerActions';
import { seedGameScores } from '../data/seedScores';
import { describeFailure } from '../lib/actionFeedback';
import { displayName } from '../lib/display';
import { findInRoster, pendingApprovals, toRoster, type RosterEntry } from '../lib/roster';
import { scoresByHoleFor, useGameBundle, useLocalScores } from '../lib/useGameData';
import type { ScreenProps } from '../navigation';
import { useSession } from '../session';
import { useTheme } from '../theme';

export function Approve({ route }: ScreenProps<'Approve'>) {
  const { colors, ui } = useTheme();
  const { gameId } = route.params;
  const { userId } = useSession();
  const { bundle, refresh } = useGameBundle(gameId);
  const { scores, reload } = useLocalScores(gameId);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void seedGameScores(gameId)
        .catch(() => undefined)
        .then(() => reload());
    }, [gameId, reload]),
  );

  const run = async (
    playerUserId: string,
    action: () => Promise<Awaited<ReturnType<typeof approveScorecard>>>,
  ) => {
    setBusyUserId(playerUserId);
    setErrorText(null);
    const result = await action();
    setBusyUserId(null);
    if (!result.ok) {
      setErrorText(describeFailure(result));
      return;
    }
    // Hent rosteret på nytt — det er det som avgjør hvem som fortsatt står i
    // lista, og skjermen skal ikke lyve om at et kort er borte før serveren
    // sier det.
    await refresh();
  };

  const confirmReject = (entry: RosterEntry) => {
    const name = displayName(entry.player);
    const doReject = (reason?: string) =>
      void run(entry.user_id, () => rejectScorecard(gameId, entry.user_id, reason));

    if (Platform.OS === 'ios') {
      Alert.prompt(
        `Send tilbake kortet til ${name}?`,
        'Skriv gjerne en kort grunn. Den er valgfri.',
        [
          { text: 'Avbryt', style: 'cancel' },
          {
            text: 'Send tilbake',
            style: 'destructive',
            onPress: (reason?: string) => doReject(reason),
          },
        ],
        'plain-text',
      );
      return;
    }
    Alert.alert(`Send tilbake kortet til ${name}?`, 'Kortet blir ulevert igjen.', [
      { text: 'Avbryt', style: 'cancel' },
      { text: 'Send tilbake', style: 'destructive', onPress: () => doReject() },
    ]);
  };

  if (!bundle) {
    return (
      <View style={ui.centered} testID="approve-loading">
        <Text style={ui.muted}>Henter kortene …</Text>
      </View>
    );
  }

  const roster = toRoster(bundle.players);
  const me = findInRoster(roster, userId);
  const pending = me ? pendingApprovals(roster, bundle.game, userId) : [];

  return (
    <ScrollView contentContainerStyle={ui.scroll} testID="approve-screen">
      <Text style={ui.title}>Godkjenn</Text>

      {pending.length === 0 ? (
        <Text style={ui.body} testID="approve-empty">
          Ingenting å godkjenne akkurat nå.
        </Text>
      ) : null}

      {pending.map((entry) => (
        <View
          style={[styles.entry, { borderTopColor: colors.border }]}
          key={entry.user_id}
          testID={`approve-card-${entry.user_id}`}
        >
          <Text style={ui.value}>{displayName(entry.player)}</Text>
          <ScoreSummary holes={bundle.holes} scores={scores} entry={entry} />
          <View style={styles.actions}>
            <Pressable
              style={[ui.button, styles.action]}
              onPress={() =>
                void run(entry.user_id, () => approveScorecard(gameId, entry.user_id))
              }
              disabled={busyUserId != null}
              testID={`approve-${entry.user_id}`}
            >
              <Text style={ui.buttonText}>
                {busyUserId === entry.user_id ? 'Jobber …' : 'Godkjenn'}
              </Text>
            </Pressable>
            <Pressable
              style={[ui.buttonSecondary, styles.action]}
              onPress={() => confirmReject(entry)}
              disabled={busyUserId != null}
              testID={`reject-${entry.user_id}`}
            >
              <Text style={ui.buttonSecondaryText}>Avvis</Text>
            </Pressable>
          </View>
        </View>
      ))}

      {errorText ? (
        <Text style={ui.error} testID="approve-error">
          {errorText}
        </Text>
      ) : null}
    </ScrollView>
  );
}

/**
 * Kortet slik spilleren selv ser det (#2262): UT og INN med PAR og SLAG, og
 * BRUTTO under. Radene kommer fra den lokale basen etter seed — RLS har alt
 * bestemt hva enheten får se, så det finnes ingen ekstra gate å gjøre her.
 */
function ScoreSummary({
  holes,
  scores,
  entry,
}: {
  holes: readonly BundleHole[];
  scores: readonly LocalScore[];
  entry: RosterEntry;
}) {
  const { ui } = useTheme();
  const byHole = scoresByHoleFor(scores, entry.user_id);
  const teeGender = entry.player.teeGender as ScoringGender;
  const grid = buildScorecardGrid({
    rows: holes.map((hole) => ({
      holeNumber: hole.holeNumber,
      par: parForPlayer(
        { mens: hole.parMens, ladies: hole.parLadies, juniors: hole.parJuniors },
        teeGender,
      ),
      strokes: byHole.get(hole.holeNumber)?.strokes ?? null,
      extra: null,
    })),
    pointsFn: null,
  });

  if (grid.totals.played === 0) {
    return (
      <Text style={ui.muted} testID={`summary-${entry.user_id}`}>
        Ingen slag synlige på denne enheten.
      </Text>
    );
  }

  return (
    <View testID={`summary-${entry.user_id}`}>
      <ScorecardGrid grid={grid} rows={['strokes']} />
      <ScorecardTotals totals={grid.totals} showNet={false} showPoints={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Ikke `ui.card`: kortene inni er egne kort, og en ramme rundt dem ville
  // spist bredden hullkolonnene trenger.
  entry: { borderTopWidth: 1, paddingTop: 16, marginTop: 8, gap: 8 },
  actions: { flexDirection: 'row', gap: 12 },
  action: { flex: 1 },
});
