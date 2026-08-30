// Native N3 (#1825): godkjenn eller send tilbake makkernes kort.
//
// Lista kommer fra den DELTE `pendingApprovalsFor` — samme regel som webbens
// godkjenn-side, spill-hjem-banneret og hjem-kortene. Den lister aldri deg selv
// (0103-triggeren forbyr selv-godkjenning uansett).
//
// Selve autorisasjonen ligger i Postgres: `can_score_for` (0106) med
// kolonne-allowlist-triggeren. Skjermen er UX foran den porten, ikke porten
// selv — derfor MÅ et `{ ok: false }` vises, også når PostgREST svarte uten
// feil og bare traff 0 rader.
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
import type { GameMode } from '../../../../lib/scoring/modes/types';
import type { LocalScore } from '../data/db';
import { approveScorecard, rejectScorecard } from '../data/playerActions';
import { seedGameScores } from '../data/seedScores';
import { describeFailure } from '../lib/actionFeedback';
import { displayName } from '../lib/display';
import { findInRoster, pendingApprovals, toRoster, type RosterEntry } from '../lib/roster';
import { scoresByHoleFor, useGameBundle, useLocalScores } from '../lib/useGameData';
import type { ScreenProps } from '../navigation';
import { useSession } from '../session';
import { ui } from '../theme';

export function Approve({ route }: ScreenProps<'Approve'>) {
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
  const pending = me
    ? pendingApprovals(roster, bundle.game.gameMode as GameMode, userId)
    : [];

  return (
    <ScrollView contentContainerStyle={ui.scroll} testID="approve-screen">
      <Text style={ui.title}>Godkjenn</Text>

      {pending.length === 0 ? (
        <Text style={ui.body} testID="approve-empty">
          Ingenting å godkjenne akkurat nå.
        </Text>
      ) : null}

      {pending.map((entry) => (
        <View style={ui.card} key={entry.user_id} testID={`approve-card-${entry.user_id}`}>
          <Text style={ui.value}>{displayName(entry.player)}</Text>
          <ScoreSummary scores={scores} userId={entry.user_id} />
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
 * Kortet i kortformat: hvor mange hull som er ført, brutto, og selve tallene.
 * Radene kommer fra den lokale basen etter seed — RLS har alt bestemt hva
 * enheten får se, så det finnes ingen ekstra gate å gjøre her.
 */
function ScoreSummary({
  scores,
  userId,
}: {
  scores: readonly LocalScore[];
  userId: string;
}) {
  const byHole = scoresByHoleFor(scores, userId);
  const played = [...byHole.values()]
    .filter((row) => row.strokes != null)
    .sort((a, b) => a.holeNumber - b.holeNumber);
  const brutto = played.reduce((sum, row) => sum + (row.strokes ?? 0), 0);

  if (played.length === 0) {
    return (
      <Text style={ui.muted} testID={`summary-${userId}`}>
        Ingen slag synlige på denne enheten.
      </Text>
    );
  }

  return (
    <View>
      <Text style={[ui.muted, ui.num]} testID={`summary-${userId}`}>
        {played.length} hull ført · brutto {brutto}
      </Text>
      <View style={styles.holeGrid}>
        {played.map((row) => (
          <Text style={[ui.muted, ui.num, styles.holeChip]} key={row.holeNumber}>
            {row.holeNumber}: {row.strokes}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 12 },
  action: { flex: 1 },
  holeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  holeChip: { minWidth: 52 },
});
