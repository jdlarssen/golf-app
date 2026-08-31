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
//
// N4 (#1828): i lag-formatene som slår ÉN ball — scramble-familien og
// alternate-shot-matchplay — er kortet lagets, ikke spillerens. Da tegnes ett
// kort per lag, og hvert tapp går til kapteinens rad via den delte
// `scoreOwnerForHole`. Tallene på kortet (lagets tildelte slag) kommer fra
// motoren; se `lib/teamPlay.ts` for hvorfor de ikke regnes her.
//
// #1832: wolf og bingo bango bongo får hver sin seksjon her, fordi halve
// regnestykket deres ikke er slag i det hele tatt — det er valg og
// prestasjoner, ført på hullet. De to seksjonene er additive: de legger seg
// over og under de vanlige kortene, og resten av skjermen merker dem ikke.
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
import { scoreOwnerForHole } from '../../../../lib/games/scoreOwner';
import type { GameMode, ScoringGender } from '../../../../lib/scoring/modes/types';
import { modeCollapsesToTeamCard } from '../../../../lib/scoring/modes/types';
import { strokesForHole } from '../../../../lib/scoring/strokeAllocation';
import { BingoBangoBongoCard } from '../components/hole/BingoBangoBongoCard';
import { WolfChoiceCard } from '../components/hole/WolfChoiceCard';
import type { LocalScore } from '../data/db';
import type { BundleGame, BundleHole, BundlePlayer } from '../data/gameBundle';
import { subscribeGameScores } from '../data/realtime';
import { seedGameScores } from '../data/seedScores';
import { drainQueue } from '../data/syncWorker';
import { writeScore } from '../data/writeScore';
import { displayName } from '../lib/display';
import { nameLookup } from '../lib/leaderboardModel';
import { findInRoster, resolveFlight, toRoster, type RosterEntry } from '../lib/roster';
import { computeGameLeaderboard } from '../lib/scoringContext';
import {
  buildTeamCards,
  filledHolesForOwner,
  findMyTeamCard,
  foursomesTeeStarterId,
  myTeamCaptainId,
  teamExtraForHole,
  type TeamCard,
} from '../lib/teamPlay';
import { useGameChoices } from '../lib/useChoices';
import { useGameBundle, useLocalScores } from '../lib/useGameData';
import { wolfHoleState, wolfPointsByUser } from '../lib/wolfHole';
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
  // Wolf/BBB henter valgene sine fra serveren. De elleve andre formatene
  // svarer `null` på kilde-spørsmålet og koster ikke et eneste nettkall — og
  // før bundelen har landet vet vi ikke formatet, så vi spør ikke da heller.
  const { extras, refresh: refreshChoices } = useGameChoices(
    gameId,
    bundle?.game.gameMode ?? '',
  );

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
  // Kollapser dette hullet til ett lagkort? Spørsmålet er per HULL (patsome
  // bytter halvveis), og laget mitt må faktisk ha en aktiv kaptein.
  const myCaptainId = myTeamCaptainId(roster, userId);
  const collapsed = myCaptainId != null && modeCollapsesToTeamCard(mode, holeNumber);
  const nameOf = nameLookup(bundle.players);
  const teamCards = collapsed ? buildTeamCards(flight, nameOf) : [];
  const myCard = findMyTeamCard(teamCards, userId);
  // Hull-stripen teller radene JEG fører i: lagets i de kollapsede modiene,
  // mine egne ellers. Den delte regelen svarer per hull.
  const myFilled = filledHolesForOwner(scores, mode, userId, myCaptainId);
  const byUserHole = new Map(
    scores.map((row) => [`${row.userId}#${row.holeNumber}`, row]),
  );
  // Defensivt, som på web: et levert kort eller et spill som ikke lenger er
  // aktivt skal ikke kunne tastes på. RLS stopper det uansett — dette er bare
  // for at knappene ikke skal love noe de ikke kan holde. På et lagkort er det
  // lagets stempel som gjelder: leverer én makker, er kortet frosset for alle.
  const mySubmittedAt = collapsed ? (myCard?.submittedAt ?? null) : me.submitted_at;
  const locked = bundle.game.status !== 'active' || mySubmittedAt != null;
  // Badgen hentes fra motoren, og bare når vi faktisk skal tegne lagkort.
  // Wolf og BBB kollapser aldri (`modeCollapsesToTeamCard` dekker
  // scramble-familien, alternate shot og patsome fra hull 7), så dette
  // kallstedet trenger ingen valg — wolf-grenen under har sitt eget.
  const leaderboard = collapsed ? computeGameLeaderboard(bundle, scores) : null;

  const isWolf = mode === 'wolf';
  const isBingoBangoBongo = mode === 'bingo_bango_bongo';
  // Trailing-wolf (hull R+1..18) er «den som ligger sist», og det tallet er
  // motorens. Uten valgene svarer adapteren `missing-choices`, og da faller
  // rotasjonen tilbake på slot-rekkefølgen — samme som webben gjør når
  // `pointsByUser` er `undefined`.
  const wolfOutcome = isWolf ? computeGameLeaderboard(bundle, scores, extras) : null;
  const wolf = isWolf
    ? wolfHoleState({
        holeNumber,
        myUserId: userId,
        gameStatus: bundle.game.status,
        players: bundle.players,
        choices: extras.wolfChoices,
        pointsByUser: wolfPointsByUser(
          wolfOutcome?.ok ? wolfOutcome.result : null,
        ),
      })
    : null;

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
          {bundle.game.status !== 'active'
            ? 'Spillet er ikke aktivt. Føringen er låst.'
            : collapsed
              ? 'Lagkortet er levert. Føringen er låst.'
              : 'Kortet ditt er levert. Føringen er låst.'}
        </Text>
      ) : null}

      {/* Wolf-badgen står over kortene, som på web: hvem som er Wolf avgjør
          hva slagene under er verdt. `key` på hullet nullstiller feil- og
          lagre-tilstanden når spilleren blar videre. */}
      {wolf ? (
        <WolfChoiceCard
          key={holeNumber}
          gameId={gameId}
          holeNumber={holeNumber}
          state={wolf}
          onSaved={refreshChoices}
        />
      ) : null}

      {collapsed
        ? teamCards.map((card) => (
            <TeamCardView
              key={card.teamNumber}
              card={card}
              // Kapteinens rad er lagets rad — samme oppslag for alle på laget.
              score={byUserHole.get(`${card.captainId}#${holeNumber}`)}
              isMine={card.teamNumber === myCard?.teamNumber}
              extra={
                leaderboard
                  ? teamExtraForHole(
                      leaderboard,
                      card.teamNumber,
                      holeNumber,
                      hole.strokeIndex,
                    )
                  : null
              }
              teeStarterName={teeStarterNameFor({
                card,
                gameMode: mode,
                game: bundle.game,
                holeNumber,
                nameOf,
              })}
              locked={locked || card.submittedAt != null}
              onStrokes={(delta) =>
                void adjustStrokes(
                  scoreOwnerForHole(mode, holeNumber, userId, card.captainId),
                  delta,
                )
              }
              onPutts={(delta) =>
                void adjustPutts(
                  scoreOwnerForHole(mode, holeNumber, userId, card.captainId),
                  delta,
                )
              }
            />
          ))
        : flight.map((entry) => (
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

      {/* BBB-registreringen står under kortene, som på web: den handler om
          det flighten så, ikke om tallene over. */}
      {isBingoBangoBongo ? (
        <BingoBangoBongoCard
          key={holeNumber}
          gameId={gameId}
          holeNumber={holeNumber}
          gameStatus={bundle.game.status}
          players={flight.map((entry) => ({
            userId: entry.user_id,
            name: displayName(entry.player),
          }))}
          saved={
            extras.bingoBangoBongoHoles?.find(
              (row) => row.holeNumber === holeNumber,
            ) ?? null
          }
          loaded={extras.bingoBangoBongoHoles !== undefined}
          onSaved={refreshChoices}
        />
      ) : null}

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
          {/* Lagkort leveres på nettsiden (RLS lar appen bare skrive egen rad),
              så knappen lover bare det den kan: å vise kortet. */}
          <Text style={ui.buttonText}>
            {collapsed ? 'Se lagets kort' : 'Lever scorekort'}
          </Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

/**
 * «Anna slår ut» — utslags-hintet for siden, eller `null`.
 *
 * Regelen bor i `teamPlay`; her settes bare navnet på svaret.
 */
function teeStarterNameFor(opts: {
  card: TeamCard;
  gameMode: GameMode;
  game: BundleGame;
  holeNumber: number;
  nameOf: (userId: string) => string;
}): string | null {
  const starterId = foursomesTeeStarterId({
    gameMode: opts.gameMode,
    game: opts.game,
    teamNumber: opts.card.teamNumber,
    holeNumber: opts.holeNumber,
    memberIds: opts.card.memberIds,
  });
  return starterId ? opts.nameOf(starterId) : null;
}

/**
 * Ett lag, ett kort, én rad.
 *
 * Kortet ser ut som spiller-kortet med vilje — samme steppere, samme
 * badge-plass — for det er den samme handlingen. Forskjellen er hvem tallet
 * havner hos, og det står i overskriften («Lag 1 · Anna, Bjørn»).
 */
function TeamCardView({
  card,
  score,
  isMine,
  extra,
  teeStarterName,
  locked,
  onStrokes,
  onPutts,
}: {
  card: TeamCard;
  score: LocalScore | undefined;
  isMine: boolean;
  /** `null` = motoren kunne ikke svare. Da vises ingen badge. */
  extra: number | null;
  teeStarterName: string | null;
  locked: boolean;
  onStrokes: (delta: number) => void;
  onPutts: (delta: number) => void;
}) {
  return (
    <View style={ui.card} testID={`team-card-${card.teamNumber}`}>
      <View style={styles.cardHead}>
        <Text style={[ui.body, isMine && styles.meName]}>
          {card.label}
          {isMine ? ' (ditt lag)' : ''}
        </Text>
        {extra != null && extra !== 0 ? (
          <View style={ui.badge}>
            <Text
              style={[ui.badgeText, ui.num]}
              testID={`team-${card.teamNumber}-extra`}
            >
              {extra > 0 ? `+${extra}` : String(extra)}
            </Text>
          </View>
        ) : null}
      </View>

      {teeStarterName ? (
        <Text style={ui.muted} testID={`team-${card.teamNumber}-tee-starter`}>
          {teeStarterName} slår ut
        </Text>
      ) : null}

      <Stepper
        label="Slag"
        value={score?.strokes ?? null}
        disabled={locked}
        onChange={onStrokes}
        testIDPrefix={`team-${card.teamNumber}`}
      />
      <Stepper
        label="Putter"
        value={score?.putts ?? null}
        disabled={locked}
        onChange={onPutts}
        testIDPrefix={`team-${card.teamNumber}-putts`}
      />
    </View>
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
