// Native N3 (#1825): scorekortet — webbens Layout A speilet, pluss lever-porten.
//
// Tabellen er ren visning av lokale tall: par per tee-kjønn, SI, slag og netto
// (netto = slag − tildelte slag fra delt `strokesForHole`).
//
// Lever-knappen har webbens to porter, og de er ikke pynt:
//  1. **Kø-vakta (#668/#1370):** vi drainer først, og blokkerer så lenge køen
//     har elementer for DETTE spillet. Leverer man med usynkede slag, fryser
//     RLS kortet, RPC-en svarer `was_applied=false`, drainen leser det som
//     suksess og sletter kø-elementet — slaget er borte.
//  2. **Manglende hull (#1793):** et komplett kort leveres uten spørsmål; er
//     det hull uten slag, spør vi først, for de låses som ikke spilt.
//
// N4 (#1828): i lag-formatene som deler én ball viser kortet LAGETS rader
// (kapteinens), og Lever-knappen er byttet ut med en henvisning til nettsiden.
// Grunnen er RLS: webbens lag-levering skriver alle medlemmenes rader med
// service-role, mens appen bare kan skrive sin egen. Et halvlevert lag ville
// blokkert avslutningen av runden — så vi leverer ikke halvt.
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { GameMode, ScoringGender } from '../../../../lib/scoring/modes/types';
import { modeCollapsesToTeamCard } from '../../../../lib/scoring/modes/types';
import { isActiveForGame } from '../../../../lib/sync/queueScope';
import { getDb, listQueue } from '../data/db';
import { submitScorecard } from '../data/playerActions';
import { seedGameScores } from '../data/seedScores';
import { drainQueue } from '../data/syncWorker';
import { describeFailure } from '../lib/actionFeedback';
import { isScoringSupported } from '../lib/formatGate';
import { nameLookup } from '../lib/leaderboardModel';
import { findInRoster, toRoster } from '../lib/roster';
import { buildScorecardRows } from '../lib/scorecardRows';
import { computeGameLeaderboard } from '../lib/scoringContext';
import { buildTeamCards, findMyTeamCard, myTeamCaptainId } from '../lib/teamPlay';
import { useGameBundle, useLocalScores } from '../lib/useGameData';
import type { ScreenProps } from '../navigation';
import { useSession } from '../session';
import { COLORS, ui } from '../theme';

const HOLE_COUNT = 18;
const QUEUE_POLL_MS = 1500;

export function Scorecard({ route, navigation }: ScreenProps<'Scorecard'>) {
  const { gameId } = route.params;
  const { userId } = useSession();
  const { bundle } = useGameBundle(gameId);
  const { scores, reload } = useLocalScores(gameId);
  const [queued, setQueued] = useState(0);
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const refreshQueue = useCallback(async () => {
    const db = await getDb();
    const items = await listQueue(db);
    setQueued(items.filter((item) => isActiveForGame(item, gameId)).length);
  }, [gameId]);

  // Drain først (port 1), les så både køen og serververdiene. Rekkefølgen er
  // hele poenget: slagene skal ut FØR kortet kan fryses.
  useEffect(() => {
    void drainQueue('lever')
      .catch(() => undefined)
      .then(() => refreshQueue())
      .then(() => seedGameScores(gameId).catch(() => undefined))
      .then(() => reload());
  }, [gameId, refreshQueue, reload]);

  useEffect(() => {
    const interval = setInterval(() => {
      void refreshQueue();
    }, QUEUE_POLL_MS);
    return () => clearInterval(interval);
  }, [refreshQueue]);

  if (!bundle) {
    return (
      <View style={ui.centered} testID="scorecard-loading">
        <Text style={ui.muted}>Henter scorekortet …</Text>
      </View>
    );
  }

  const roster = toRoster(bundle.players);
  const me = findInRoster(roster, userId);
  if (!me) {
    return (
      <View style={ui.centered} testID="scorecard-missing">
        <Text style={ui.error}>Du er ikke spiller i dette spillet.</Text>
      </View>
    );
  }

  const courseHandicap = me.player.courseHandicap ?? 0;
  const mode = bundle.game.gameMode as GameMode;
  const myCaptainId = myTeamCaptainId(roster, userId);
  // «Deler denne runden ett kort i det hele tatt?» Hull 18 er spørsmålet som
  // svarer på det: patsome er det eneste formatet der svaret varierer per hull,
  // og foursomes-halvdelen der går til 18. Selve rad-eierskapet spørres likevel
  // per hull, inne i `buildScorecardRows`.
  const teamMode = myCaptainId != null && modeCollapsesToTeamCard(mode, 18);
  const myTeamCard = teamMode
    ? findMyTeamCard(buildTeamCards(roster, nameLookup(bundle.players)), userId)
    : null;
  // Motoren spørres bare når det faktisk er et lagkort som skal vises.
  const leaderboard = teamMode ? computeGameLeaderboard(bundle, scores) : null;

  const { rows, totals } = buildScorecardRows({
    holes: bundle.holes,
    scores,
    mode,
    viewerId: userId,
    teamOwnerId: myCaptainId,
    teeGender: me.player.teeGender as ScoringGender,
    courseHandicap,
    teamNumber: myTeamCard?.teamNumber ?? me.player.teamNumber,
    leaderboard,
  });
  const missing = HOLE_COUNT - totals.playedHoles;

  const canSubmit =
    bundle.game.status === 'active' &&
    me.submitted_at == null &&
    me.withdrawn_at == null &&
    isScoringSupported(bundle.game) &&
    // Lag-levering er nettsidens jobb — se fil-toppen.
    !teamMode;

  const doSubmit = async () => {
    setBusy(true);
    setErrorText(null);
    const result = await submitScorecard(gameId);
    setBusy(false);
    if (result.ok) {
      navigation.navigate('GameHome', { gameId });
      return;
    }
    setErrorText(describeFailure(result));
  };

  const onSubmitPress = () => {
    if (queued > 0 || busy) return;
    if (missing === 0) {
      void doSubmit();
      return;
    }
    Alert.alert(
      'Lever scorekortet?',
      `${missing} hull står uten slag. De blir stående som ikke spilt.`,
      [
        { text: 'Avbryt', style: 'cancel' },
        { text: 'Lever likevel', onPress: () => void doSubmit() },
      ],
    );
  };

  return (
    <ScrollView contentContainerStyle={ui.scroll} testID="scorecard-screen">
      <Text style={ui.title}>{bundle.game.name}</Text>
      {teamMode ? (
        <Text style={ui.muted} testID="scorecard-team-label">
          {myTeamCard?.label ?? 'Lagets kort'}
        </Text>
      ) : (
        <Text style={[ui.muted, ui.num]}>Banehandicap {courseHandicap}</Text>
      )}

      <View style={styles.table}>
        <View style={[styles.row, styles.headRow]}>
          <Text style={[styles.cell, styles.headCell, styles.holeCell]}>Hull</Text>
          <Text style={[styles.cell, styles.headCell]}>Par</Text>
          <Text style={[styles.cell, styles.headCell]}>SI</Text>
          <Text style={[styles.cell, styles.headCell]}>Slag</Text>
          <Text style={[styles.cell, styles.headCell]}>Netto</Text>
        </View>
        {rows.map((row) => (
          <View style={styles.row} key={row.holeNumber} testID={`card-row-${row.holeNumber}`}>
            <Text style={[styles.cell, styles.holeCell, ui.num]}>{row.holeNumber}</Text>
            <Text style={[styles.cell, styles.mutedCell, ui.num]}>{row.par}</Text>
            <Text style={[styles.cell, styles.mutedCell, ui.num]}>{row.strokeIndex}</Text>
            <Text style={[styles.cell, ui.num]}>{row.strokes ?? '—'}</Text>
            <Text style={[styles.cell, ui.num]}>{row.netto ?? '—'}</Text>
          </View>
        ))}
      </View>

      <View style={ui.card} testID="scorecard-totals">
        <Total label="Spilte hull" value={totals.playedHoles} />
        <Total label="Brutto" value={totals.totalGross} />
        {totals.totalExtra != null && totals.totalNet != null ? (
          <>
            <Total label="Tildelte slag" value={totals.totalExtra} />
            <Total label="Netto" value={totals.totalNet} />
          </>
        ) : null}
      </View>

      {teamMode ? (
        <Text style={ui.muted} testID="team-submit-gate">
          Levering av lagkort gjøres på nettsiden ennå.
        </Text>
      ) : canSubmit ? (
        <>
          {queued > 0 ? (
            <Text style={ui.muted} testID="queue-guard">
              {queued} slag venter på å bli sendt. Knappen åpner når de er framme.
            </Text>
          ) : null}
          <Pressable
            style={[ui.button, (queued > 0 || busy) && styles.buttonDisabled]}
            onPress={onSubmitPress}
            disabled={queued > 0 || busy}
            testID="submit-scorecard"
          >
            <Text style={ui.buttonText}>
              {busy ? 'Leverer …' : queued > 0 ? 'Synker slag …' : 'Lever scorekort'}
            </Text>
          </Pressable>
        </>
      ) : (
        <Text style={ui.muted} testID="scorecard-readonly">
          {me.submitted_at != null
            ? 'Kortet er levert. Dette er lesevisning.'
            : 'Kortet kan ikke leveres herfra nå.'}
        </Text>
      )}

      {errorText ? (
        <Text style={ui.error} testID="submit-error">
          {errorText}
        </Text>
      ) : null}
    </ScrollView>
  );
}

function Total({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.totalRow}>
      <Text style={ui.body}>{label}</Text>
      <Text style={[ui.value, ui.num]} testID={`total-${label.toLowerCase().replace(/\s+/g, '-')}`}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  table: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    marginTop: 12,
  },
  row: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  headRow: { borderTopWidth: 0, backgroundColor: COLORS.linen },
  cell: { flex: 1, textAlign: 'right', fontSize: 15, color: COLORS.forest },
  headCell: { fontSize: 12, fontWeight: '700', color: COLORS.muted },
  holeCell: { textAlign: 'left' },
  mutedCell: { color: COLORS.muted },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  buttonDisabled: { opacity: 0.5 },
});
