// Native N3 (#1825): hull-føringen — appens viktigste flate.
//
// Alt som vises kommer fra enheten: bundelen fra `cache_entries`, slagene fra
// SQLite. Nettet gjør tre ting i bakgrunnen — seeder ned det serveren har,
// lytter på realtime, og drainer køen etter hvert tapp. Faller nettet bort midt
// i runden, merkes det ikke her.
//
// Å taste for en makker er lov (`enteredBy` = meg): flighten fører for
// hverandre på banen, og `can_score_for` (0095/0106) er porten som avgjør om
// skrivingen står seg på serveren.
import { useCallback, useEffect } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { parForPlayer } from '../../../../lib/games/parDisplay';
import type { GameMode, ScoringGender } from '../../../../lib/scoring/modes/types';
import { strokesForHole } from '../../../../lib/scoring/strokeAllocation';
import type { LocalScore } from '../data/db';
import type { BundleHole, BundlePlayer } from '../data/gameBundle';
import { subscribeGameScores } from '../data/realtime';
import { seedGameScores } from '../data/seedScores';
import { drainQueue } from '../data/syncWorker';
import { writeScore } from '../data/writeScore';
import { displayName } from '../lib/display';
import { findInRoster, resolveFlight, toRoster, type RosterEntry } from '../lib/roster';
import { filledHolesFor, useGameBundle, useLocalScores } from '../lib/useGameData';
import type { ScreenProps } from '../navigation';
import { useSession } from '../session';
import { COLORS, TAP, ui } from '../theme';

const HOLE_COUNT = 18;
/** Webbens grenser: én slag-verdi er alltid mellom 1 og 15. */
const MIN_STROKES = 1;
const MAX_STROKES = 15;
/** `scores.putts` har CHECK (0..10) fra migrasjon 0123 — samme tak her. */
const MAX_PUTTS = 10;
/** Hvor ofte skjermen leser SQLite på nytt. Samme takt som Sync-laben. */
const POLL_MS = 1500;

export function Hole({ route, navigation }: ScreenProps<'Hole'>) {
  const { gameId, holeNumber } = route.params;
  const { userId } = useSession();
  const { bundle, loading } = useGameBundle(gameId);
  const { scores, reload } = useLocalScores(gameId, POLL_MS);

  // Realtime + seed henger på SPILLET, ikke på hullet: å bytte hull skal ikke
  // bygge kanalen på nytt (#1366-disiplinen bor i `subscribeGameScores`).
  useEffect(() => {
    const unsubscribe = subscribeGameScores(gameId, {
      onMerge: () => {
        void reload();
      },
    });
    void seedGameScores(gameId)
      .catch(() => undefined)
      .then(() => reload());
    return unsubscribe;
  }, [gameId, reload]);

  const goToHole = useCallback(
    (next: number) => {
      if (next < 1 || next > HOLE_COUNT) return;
      navigation.setParams({ holeNumber: next });
    },
    [navigation],
  );

  if (!bundle) {
    return (
      <View style={ui.centered} testID="hole-loading">
        {loading ? (
          <ActivityIndicator color={COLORS.forest} />
        ) : (
          <Text style={ui.error}>Fikk ikke tak i spillet.</Text>
        )}
      </View>
    );
  }

  const roster = toRoster(bundle.players);
  const me = findInRoster(roster, userId);
  const hole = bundle.holes.find((h) => h.holeNumber === holeNumber);

  if (!me || !hole) {
    return (
      <View style={ui.centered} testID="hole-missing">
        <Text style={ui.error}>
          {me ? `Fant ikke hull ${holeNumber} på denne banen.` : 'Du er ikke spiller her.'}
        </Text>
      </View>
    );
  }

  const mode = bundle.game.gameMode as GameMode;
  const flight = resolveFlight(roster, mode, me);
  const par = parForPlayer(
    { mens: hole.parMens, ladies: hole.parLadies, juniors: hole.parJuniors },
    me.player.teeGender as ScoringGender,
  );
  const myFilled = filledHolesFor(scores, userId);
  const byUserHole = new Map(
    scores.map((row) => [`${row.userId}#${row.holeNumber}`, row]),
  );
  // Defensivt, som på web: et levert kort eller et spill som ikke lenger er
  // aktivt skal ikke kunne tastes på. RLS stopper det uansett — dette er bare
  // for at knappene ikke skal love noe de ikke kan holde.
  const locked = bundle.game.status !== 'active' || me.submitted_at != null;

  const adjustStrokes = async (playerUserId: string, delta: number) => {
    const current = byUserHole.get(`${playerUserId}#${holeNumber}`)?.strokes ?? null;
    if (current == null && delta < 0) return;
    const next = Math.min(
      MAX_STROKES,
      Math.max(MIN_STROKES, (current ?? 0) + delta),
    );
    await writeScore({
      gameId,
      userId: playerUserId,
      holeNumber,
      strokes: next,
      enteredBy: userId,
    });
    await reload();
    void drainQueue('tasting');
  };

  const adjustPutts = async (playerUserId: string, delta: number) => {
    const current = byUserHole.get(`${playerUserId}#${holeNumber}`)?.putts ?? null;
    let next: number | null;
    if (current == null) {
      // Fra «—» gir første + to putter: det vanligste tallet, ett tapp unna.
      if (delta < 0) return;
      next = 2;
    } else if (delta < 0 && current <= 0) {
      next = null; // 0 → tilbake til «—»
    } else {
      next = Math.min(MAX_PUTTS, Math.max(0, current + delta));
    }
    // Slag sendes IKKE med: `writeScore` merger, så et utelatt felt beholder
    // verdien som ligger der. Å sende `strokes` her ville vasket den ut.
    await writeScore({
      gameId,
      userId: playerUserId,
      holeNumber,
      putts: next,
      enteredBy: userId,
    });
    await reload();
    void drainQueue('tasting');
  };

  const allHolesFilled = myFilled.length >= HOLE_COUNT;

  return (
    <ScrollView contentContainerStyle={ui.scroll} testID="hole-screen">
      <Text style={ui.title}>Hull {holeNumber}</Text>
      <Text style={[ui.muted, ui.num]} testID="hole-facts">
        Par {par} · SI {hole.strokeIndex}
      </Text>

      {locked ? (
        <Text style={ui.muted} testID="hole-locked">
          {bundle.game.status === 'active'
            ? 'Kortet ditt er levert. Føringen er låst.'
            : 'Spillet er ikke aktivt. Føringen er låst.'}
        </Text>
      ) : null}

      {flight.map((entry) => (
        <PlayerCard
          key={entry.user_id}
          entry={entry}
          hole={hole}
          score={byUserHole.get(`${entry.user_id}#${holeNumber}`)}
          isMe={entry.user_id === userId}
          locked={locked}
          onStrokes={(delta) => void adjustStrokes(entry.user_id, delta)}
          onPutts={(delta) => void adjustPutts(entry.user_id, delta)}
        />
      ))}

      <Text style={ui.sectionTitle}>Runden</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} testID="hole-strip">
        <View style={styles.strip}>
          {Array.from({ length: HOLE_COUNT }, (_, i) => i + 1).map((n) => {
            const isCurrent = n === holeNumber;
            return (
              <Pressable
                key={n}
                onPress={() => goToHole(n)}
                style={[
                  styles.stripHole,
                  myFilled.includes(n) && styles.stripFilled,
                  isCurrent && styles.stripCurrent,
                ]}
                testID={`hole-strip-${n}`}
              >
                <Text style={[ui.num, styles.stripText, isCurrent && styles.stripTextCurrent]}>
                  {n}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.navRow}>
        <Pressable
          style={[ui.buttonSecondary, styles.navButton]}
          onPress={() => goToHole(holeNumber - 1)}
          disabled={holeNumber <= 1}
          testID="hole-prev"
        >
          <Text style={ui.buttonSecondaryText}>Forrige</Text>
        </Pressable>
        <Pressable
          style={[ui.buttonSecondary, styles.navButton]}
          onPress={() => goToHole(holeNumber + 1)}
          disabled={holeNumber >= HOLE_COUNT}
          testID="hole-next"
        >
          <Text style={ui.buttonSecondaryText}>Neste</Text>
        </Pressable>
      </View>

      {holeNumber === HOLE_COUNT || allHolesFilled ? (
        <Pressable
          style={ui.button}
          onPress={() => navigation.navigate('Scorecard', { gameId })}
          testID="hole-submit"
        >
          <Text style={ui.buttonText}>Lever scorekort</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

function PlayerCard({
  entry,
  hole,
  score,
  isMe,
  locked,
  onStrokes,
  onPutts,
}: {
  entry: RosterEntry;
  hole: BundleHole;
  score: LocalScore | undefined;
  isMe: boolean;
  locked: boolean;
  onStrokes: (delta: number) => void;
  onPutts: (delta: number) => void;
}) {
  const player: BundlePlayer = entry.player;
  const extra = strokesForHole(player.courseHandicap ?? 0, hole.strokeIndex);

  return (
    <View style={ui.card} testID={`player-card-${entry.user_id}`}>
      <View style={styles.cardHead}>
        <Text style={[ui.body, isMe && styles.meName]}>
          {displayName(player)}
          {isMe ? ' (deg)' : ''}
        </Text>
        {extra !== 0 ? (
          <View style={ui.badge}>
            <Text style={[ui.badgeText, ui.num]} testID={`player-${entry.user_id}-extra`}>
              {extra > 0 ? `+${extra}` : String(extra)}
            </Text>
          </View>
        ) : null}
      </View>

      <Stepper
        label="Slag"
        value={score?.strokes ?? null}
        disabled={locked}
        onChange={onStrokes}
        testIDPrefix={`player-${entry.user_id}`}
      />
      <Stepper
        label="Putter"
        value={score?.putts ?? null}
        disabled={locked}
        onChange={onPutts}
        testIDPrefix={`player-${entry.user_id}-putts`}
      />
    </View>
  );
}

function Stepper({
  label,
  value,
  disabled,
  onChange,
  testIDPrefix,
}: {
  label: string;
  value: number | null;
  disabled: boolean;
  onChange: (delta: number) => void;
  testIDPrefix: string;
}) {
  return (
    <View style={styles.stepperRow}>
      <Text style={[ui.muted, styles.stepperLabel]}>{label}</Text>
      <Pressable
        style={[styles.step, disabled && styles.stepDisabled]}
        onPress={() => onChange(-1)}
        disabled={disabled}
        testID={`${testIDPrefix}-minus`}
      >
        <Text style={styles.stepText}>−</Text>
      </Pressable>
      <Text style={[ui.value, ui.num, styles.stepValue]} testID={`${testIDPrefix}-value`}>
        {value ?? '—'}
      </Text>
      <Pressable
        style={[styles.step, disabled && styles.stepDisabled]}
        onPress={() => onChange(1)}
        disabled={disabled}
        testID={`${testIDPrefix}-plus`}
      >
        <Text style={styles.stepText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  meName: { fontWeight: '700' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepperLabel: { width: 60 },
  step: {
    width: TAP,
    height: TAP,
    borderRadius: 8,
    backgroundColor: COLORS.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDisabled: { opacity: 0.4 },
  stepText: { color: COLORS.card, fontSize: 22, fontWeight: '700' },
  stepValue: { width: 44, textAlign: 'center' },
  strip: { flexDirection: 'row', gap: 6, paddingVertical: 8 },
  stripHole: {
    width: TAP,
    height: TAP,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stripFilled: { backgroundColor: COLORS.gold },
  stripCurrent: { borderColor: COLORS.forest, borderWidth: 2 },
  stripText: { color: COLORS.forest, fontSize: 15 },
  stripTextCurrent: { fontWeight: '700' },
  navRow: { flexDirection: 'row', gap: 12 },
  navButton: { flex: 1 },
});
