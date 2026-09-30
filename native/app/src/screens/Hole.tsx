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
//
// #2252: scoreskinna fra nettsiden (#2251). Flighten står som kompakte rader,
// og store knapper nederst viser resultatet før trykket. Ett trykk fører
// scoren og går videre til neste som mangler. Bingo Bango Bongo beholder
// kortene (`formatUsesScoreRail`). Visningen bor i `HoleView`, som monteres
// på nytt per hull: skinnas valg og ventende skrivinger hører til ETT hull og
// skal ikke følge med når «Neste» bare bytter parameteren.
//
// #2252 del 2: sollys. Bryteren ved pokalen gjør hullsiden hvit og svart med
// tykke kanter og store mål, uansett telefonens lys/mørk. Hele skjermen, også
// laste- og feilgrenene, står i en `ThemeScope`, så alt som henter farger fra
// `useTheme()` følger med. Statuslinja er appens, så den settes her mens
// hullsiden står.
//
// #2385: siden er designlerretets (`Main` og `Hull-sollys`), identisk. Toppen
// er den delte raden med spillnavnet i gull og sol-knappen og pokalen til
// høyre (i sollys bare den svarte «Sollys på»-pillen). Hullstripa står
// øverst, uten sidemarg på siden: hver del har sin egen luft. Skinna er et
// ark som ligger fast nederst mens lista ruller under det. Eierens svar:
// formene regnes av netto, putter er fortsatt noe man slår på, og i sollys
// (uten stripe) bytter man hull ved å sveipe på hullnummeret, og siden går
// selv videre når alle i flighten har score.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import type { GameStatus } from '../../../../lib/games/status';
import { parForPlayer } from '../../../../lib/games/parDisplay';
import { scoreOwnerForHole } from '../../../../lib/games/scoreOwner';
import {
  revealState,
  shouldHideNetto,
  type ScoreVisibility,
} from '../../../../lib/games/visibility';
import { firstName } from '../../../../lib/firstName';
import { nameInitials } from '../../../../lib/names/initials';
import { stablefordPointsForCard } from '../../../../lib/scorecard/railPoints';
import {
  formatUsesScoreRail,
  railStrokes,
  strikeStrokes,
  strokeTerm,
} from '../../../../lib/scorecard/scoreRail';
import {
  firstEntryStrokes,
  nextStrokes,
} from '../../../../lib/scorecard/strokeEntry';
import type { GameMode, ScoringGender } from '../../../../lib/scoring/modes/types';
import {
  MODE_LABELS,
  formatCapturesPutts,
  isStablefordFamily,
  modeCollapsesToTeamCard,
} from '../../../../lib/scoring/modes/types';
import { kickerHeader } from '../components/KickerHeader';
import { BingoBangoBongoCard } from '../components/hole/BingoBangoBongoCard';
import { FlightRow } from '../components/hole/FlightRow';
import { HoleHero } from '../components/hole/HoleHero';
import { HoleStrip } from '../components/hole/HoleStrip';
import {
  ScoreRail,
  type RailDisplay,
  type RailOption,
} from '../components/hole/ScoreRail';
import { SpecificValueSheet } from '../components/hole/SpecificValueSheet';
import { SunlightToggle } from '../components/hole/SunlightToggle';
import { WolfChoiceCard } from '../components/hole/WolfChoiceCard';
import { PokalHankerIcon } from '../components/icons/Icons';
import { SyncBanner } from '../components/sync/SyncBanner';
import type { LocalScore } from '../data/db';
import type { BundleGame, BundleHole, BundlePlayer, GameBundle } from '../data/gameBundle';
import { subscribeGameScores } from '../data/realtime';
import { seedGameScores } from '../data/seedScores';
import { addForegroundListener, addOnlineListener } from '../data/syncTriggers';
import { drainQueue } from '../data/syncWorker';
import { writeScore } from '../data/writeScore';
import { displayName } from '../lib/display';
import { nameLookup } from '../lib/leaderboardModel';
import { findInRoster, resolveFlight, toRoster, type RosterEntry } from '../lib/roster';
import { reopenHint } from '../lib/rosterCopy';
import { computeGameLeaderboard, playerExtraForHole } from '../lib/scoringContext';
import {
  buildTeamCards,
  filledHolesForOwner,
  findMyTeamCard,
  foursomesTeeStarterId,
  myTeamCaptainId,
  teamExtraForHole,
  type TeamCard,
} from '../lib/teamPlay';
import { useGameChoices, type GameChoices } from '../lib/useChoices';
import { useGameBundle, useLocalScores, useTeamScores } from '../lib/useGameData';
import { usePuttsTracking, type PuttsTracking } from '../lib/usePuttsTracking';
import { useScoreRail, type ScoreRailSeat } from '../lib/useScoreRail';
import { setSunlight, useSunlight } from '../lib/sunlight';
import { wolfHoleState, wolfPointsByUser } from '../lib/wolfHole';
import type { ScreenProps } from '../navigation';
import { useSession } from '../session';
import { FONTS, SUNLIGHT_THEME, TAP, ThemeScope, useTheme } from '../theme';

const HOLE_COUNT = 18;
/**
 * Hint-linja under et utastet kort. Ordrett webbens streng
 * (`holes.scoreCard.tapInstruction` i messages/no.json) — snarveien er ny i
 * appen, og uten linja finner ingen den.
 */
const TAP_INSTRUCTION = 'Trykk kort = par. Bruk − / +.';
/**
 * #2211: merket ved navnet på et levert kort. Ordrett webbens
 * `holes.scoreCard.submittedBadge` (samme ord som `game.players.stateSubmitted`).
 * Kortet er låst: serveren fryser et levert kort, så et tall tastet her ville
 * aldri blitt lagret. Ingen admin-unntak (eierens svar 2A) — et levert kort
 * åpnes igjen med «Åpne for redigering» på spillersiden.
 */
const SUBMITTED_BADGE = 'Levert';
/**
 * Sollys (eierens svar, #2385): så lenge siden venter etter siste score på
 * hullet før den går videre, så tallet rekker å synes.
 */
const AUTO_NEXT_MS = 800;
/** Så langt sidelengs et sveip på hullnummeret må gå for å bytte hull. */
const SWIPE_DISTANCE = 40;
/** Hvor ofte skjermen leser SQLite på nytt. Samme takt som Sync-laben. */
const POLL_MS = 1500;

export function Hole(props: ScreenProps<'Hole'>) {
  const sunlight = useSunlight();
  const focused = useIsFocused();

  // Toppen er den delte raden (`kickerHeader`), som selv bytter til sollys.
  return (
    <ThemeScope theme={sunlight ? SUNLIGHT_THEME : null}>
      {/* Mørk tekst i statuslinja over den hvite siden, men bare mens
          hullsiden står øverst. Tavla og scorekortet legger seg OPPÅ
          hullsiden, som blir liggende montert under; uten fokus-sjekken
          arvet de den mørke statuslinja over sin mørke side. */}
      {sunlight && focused ? <StatusBar style="dark" /> : null}
      <HoleScreen {...props} />
    </ThemeScope>
  );
}

function HoleScreen({ route, navigation }: ScreenProps<'Hole'>) {
  const { colors, ui } = useTheme();
  const { gameId, holeNumber } = route.params;
  const { userId } = useSession();
  const { bundle, loading, refresh: refreshBundle } = useGameBundle(gameId);
  const { scores: localScores, reload, loaded: scoresLoaded } = useLocalScores(gameId, POLL_MS);
  // #2067: lagets rader fra før en kontosletting ligger på den trukne
  // kapteinen. Foldes inn her, før noe annet leser slagene, så kortet, stripen
  // og «+» ser ett sett rader på den nye eieren. Skrivingen går fortsatt på
  // eier-id-en, aldri på en foldet rads `id`.
  const scores = useTeamScores(localScores, bundle);
  // Wolf/BBB henter valgene sine fra serveren. De elleve andre formatene
  // svarer `null` på kilde-spørsmålet og koster ikke et eneste nettkall — og
  // før bundelen har landet vet vi ikke formatet, så vi spør ikke da heller.
  const choices = useGameChoices(gameId, bundle?.game.gameMode ?? '');
  // Putt-føring er opt-in per runde (#939), som på web. Kallet står her oppe
  // med de andre hookene fordi skjermen har tidlige `return`-er lenger nede.
  const putts = usePuttsTracking(gameId);

  // Realtime + seed henger på SPILLET, ikke på hullet: å bytte hull skal ikke
  // bygge kanalen på nytt (#1366-disiplinen bor i `subscribeGameScores`).
  // Seeden kjører ved åpning og når kanalen er tilbake etter et brudd: det som
  // ble ført mens den lå nede, kommer aldri som en hendelse (#2093). Den kjører
  // også når appen kommer i forgrunnen og når nettet er tilbake, som webbens
  // `catchUp` på focus og online (#1980): overlever sokkelen bakgrunnen, blir
  // det ingen resubscribe, og makkerens hull ble stående tomme. Kanalen bygges
  // ikke på nytt av det.
  useEffect(() => {
    const seed = () => {
      void seedGameScores(gameId)
        .catch(() => undefined)
        .then(() => reload());
    };
    const unsubscribe = subscribeGameScores(gameId, {
      onMerge: () => {
        void reload();
      },
      onResubscribed: seed,
    });
    const removeForeground = addForegroundListener(seed);
    const removeOnline = addOnlineListener(seed);
    seed();
    return () => {
      removeForeground();
      removeOnline();
      unsubscribe();
    };
  }, [gameId, reload]);

  // #2219: «Neste» bytter bare parameteren og gir ikke nytt fokus. Status
  // leses likevel på nytt ved hvert hullbytte, som på nettsiden: er runden
  // avsluttet eller lagkortet levert, låses hullet du går til. Åpningen hentes
  // av fokus i `useGameBundle`, så ikke her.
  const lastHole = useRef(holeNumber);
  useEffect(() => {
    if (lastHole.current === holeNumber) return;
    lastHole.current = holeNumber;
    void refreshBundle();
  }, [holeNumber, refreshBundle]);

  const goToHole = useCallback(
    (next: number) => {
      if (next < 1 || next > HOLE_COUNT) return;
      navigation.setParams({ holeNumber: next });
    },
    [navigation],
  );

  // #2385 (designlerretet): toppen har spillnavnet i gull med «format · bane»
  // under, og Sollys og pokalen til høyre. I sollys står ingen tittel, som på
  // `Hull-sollys`. Et langt navn kuttes på skjermen, men leses helt.
  const sunlight = useSunlight();
  const gameName = bundle?.game.name ?? '';
  const topLine = bundle
    ? [MODE_LABELS[bundle.game.gameMode as GameMode] ?? null, bundle.courseName]
        .filter((part): part is string => !!part)
        .join(' · ')
    : '';
  useLayoutEffect(() => {
    navigation.setOptions({
      ...kickerHeader(sunlight ? '' : gameName, `Hull ${holeNumber}`, {
        subtitle: topLine || undefined,
        tone: 'gold',
        sunlight,
      }),
      headerRight: () => (
        <HoleTopTools
          sunlight={sunlight}
          onLeaderboard={() => navigation.navigate('Leaderboard', { gameId })}
        />
      ),
    });
  }, [navigation, sunlight, gameName, topLine, holeNumber, gameId]);

  if (!bundle) {
    return (
      <View style={ui.centered} testID="hole-loading">
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Text style={ui.error}>Fikk ikke tak i spillet.</Text>
        )}
      </View>
    );
  }

  const me = findInRoster(toRoster(bundle.players), userId);
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

  return (
    <HoleView
      key={holeNumber}
      gameId={gameId}
      holeNumber={holeNumber}
      userId={userId}
      bundle={bundle}
      me={me}
      hole={hole}
      scores={scores}
      scoresLoaded={scoresLoaded}
      reload={reload}
      choices={choices}
      putts={putts}
      goToHole={goToHole}
      onSubmit={() => navigation.navigate('Scorecard', { gameId })}
    />
  );
}

/**
 * Sollys og pokalen oppe til høyre i toppen (#2385). Begge har 44 pt å treffe
 * på: pokalen er en 44 pt-knapp, og sollys-pillen løftes dit av `hitSlop`.
 */
function HoleTopTools({ sunlight, onLeaderboard }: { sunlight: boolean; onLeaderboard: () => void }) {
  const { colors } = useTheme();
  // I sollys står bare den svarte pillen (Hull-sollys); pokalen er borte.
  return (
    <View style={styles.topTools}>
      <SunlightToggle on={sunlight} onToggle={() => setSunlight(!sunlight)} />
      {sunlight ? null : (
        <Pressable
          onPress={onLeaderboard}
          style={styles.topIcon}
          testID="hole-leaderboard"
          accessibilityRole="button"
          accessibilityLabel="Vis resultatene"
        >
          <PokalHankerIcon color={colors.text} size={20} strokeWidth={1.8} />
        </Pressable>
      )}
    </View>
  );
}

/**
 * Ett sete på hullet: en spiller, eller et lag i lagformatene. Raden, skinna
 * og «Annet»-arket leser alle herfra.
 */
type HoleSeat = ScoreRailSeat & {
  /** Navnet i skinna og i raden. */
  name: string;
  /** Fornavnet (eller lagets navn): «Neste: X →» og raden i sollys. */
  shortName: string;
  /** Navnet skjermleseren får i raden, med «(deg)» eller «(ditt lag)». */
  a11yName: string;
  initial: string;
  /** Slagene setet får på hullet. `null` = motoren kunne ikke svare. */
  extraStrokes: number | null;
  submitted: boolean;
  note: string | null;
  /** Raden slagene skrives til (`scoreOwnerForHole` i lagformatene). */
  owner: string;
};

function HoleView({
  gameId,
  holeNumber,
  userId,
  bundle,
  me,
  hole,
  scores,
  scoresLoaded,
  reload,
  choices,
  putts,
  goToHole,
  onSubmit,
}: {
  gameId: string;
  holeNumber: number;
  userId: string;
  bundle: GameBundle;
  me: RosterEntry;
  hole: BundleHole;
  scores: LocalScore[];
  /** SQLite er lest minst én gang (`useLocalScores`). */
  scoresLoaded: boolean;
  reload: () => Promise<void>;
  choices: GameChoices;
  putts: PuttsTracking;
  goToHole: (next: number) => void;
  onSubmit: () => void;
}) {
  const { colors, ui } = useTheme();
  // Skinna ligger fast over bunnen av siden (designet); lista ruller under den,
  // og slutter så høyt at siste rad kan rulles fram over skinna.
  const [railHeight, setRailHeight] = useState(0);
  const sunlight = useSunlight();
  const { extras, refresh: refreshChoices } = choices;
  // Setet «Annet»-arket er åpent for, eller `null`.
  const [sheetSeatId, setSheetSeatId] = useState<string | null>(null);

  const roster = toRoster(bundle.players);
  const mode = bundle.game.gameMode as GameMode;
  // Hvilke formater som i det hele tatt fanger putter er DELT regel — samme
  // uttrykk som webbens `HoleScoreList` gater på. Appen kopierer den ikke.
  const capturesPutts = formatCapturesPutts(mode);
  // #2252: alle formater unntatt Bingo Bango Bongo fører slag på skinna.
  const usesRail = formatUsesScoreRail(mode);
  const isStableford = isStablefordFamily(mode);
  // #2219: i en blind runde som pågår viser verken rader eller knapper poeng
  // eller netto. Samme delte regel som scorekortet og resultatlista.
  const hideNetto = shouldHideNetto(
    revealState(
      bundle.game.scoreVisibility as ScoreVisibility,
      bundle.game.status as GameStatus,
    ),
  );
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
  // Badgen hentes fra motoren, og bare når vi faktisk skal tegne lagrader.
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

  // Setene på hullet. I lagformatene er setet lagets: kapteinens rad, og
  // hvert tapp går dit via den delte `scoreOwnerForHole`.
  const seats: HoleSeat[] = collapsed
    ? teamCards.map((card) => {
        const row = byUserHole.get(`${card.captainId}#${holeNumber}`);
        const isMine = card.teamNumber === myCard?.teamNumber;
        const teeStarter = teeStarterNameFor({
          card,
          gameMode: mode,
          game: bundle.game,
          holeNumber,
          nameOf,
        });
        return {
          id: card.captainId,
          score: row?.strokes ?? null,
          putts: row?.putts ?? null,
          locked: locked || card.submittedAt != null,
          name: card.label,
          shortName: card.label,
          a11yName: isMine ? `${card.label} (ditt lag)` : card.label,
          initial: String(card.teamNumber),
          extraStrokes: leaderboard
            ? teamExtraForHole(leaderboard, card.teamNumber, holeNumber, hole.strokeIndex)
            : null,
          submitted: card.submittedAt != null,
          note: teeStarter ? `${teeStarter} slår ut` : null,
          owner: scoreOwnerForHole(mode, holeNumber, userId, card.captainId),
        };
      })
    : flight.map((entry) => {
        const row = byUserHole.get(`${entry.user_id}#${holeNumber}`);
        const name = displayName(entry.player);
        return {
          id: entry.user_id,
          score: row?.strokes ?? null,
          putts: row?.putts ?? null,
          locked: locked || entry.submitted_at != null,
          name,
          shortName: firstName(entry.player.name) ?? name,
          a11yName: entry.user_id === userId ? `${name} (deg)` : name,
          initial: nameInitials(entry.player.name),
          // `null` = configen peker på et annet format: da vises ingen badge.
          extraStrokes: playerExtraForHole(
            bundle.game,
            entry.player.courseHandicap,
            hole.strokeIndex,
          ),
          submitted: entry.submitted_at != null,
          note: null,
          owner: entry.user_id,
        };
      });
  const seatOf = (seatId: string) => seats.find((seat) => seat.id === seatId);

  // Alle slag-veiene skriver likt: SLAG alene (putter utelates, så mergen i
  // writeScore beholder dem), så les tilbake og drain køen.
  const writeStrokes = async (playerUserId: string, strokes: number | null) => {
    await writeScore({
      gameId,
      userId: playerUserId,
      holeNumber,
      strokes,
      enteredBy: userId,
    });
    await reload();
    void drainQueue('tasting');
  };

  // Skinna skriver via setet. Et låst sete avvises også her, ikke bare i
  // knappene: et ark som sto åpent, eller et sent trykk, skal ikke nå fram.
  const setSeatScore = async (seatId: string, strokes: number) => {
    const seat = seatOf(seatId);
    if (!seat || seat.locked) return;
    await writeStrokes(seat.owner, strokes);
  };

  // «Angre» og X i arket: eksplisitt `null`, IKKE et utelatt felt. Utelatt
  // betyr «behold» i writeScore-mergen, og da ville et feiltastet slag blitt
  // stående.
  const clearSeatScore = async (seatId: string) => {
    const seat = seatOf(seatId);
    if (!seat || seat.locked) return;
    await writeStrokes(seat.owner, null);
  };

  // Putter skrives alene. Å sende `strokes` med ville vasket ut slaget som
  // står der, fordi `writeScore` merger (#939).
  const setSeatPutts = async (seatId: string, next: number) => {
    const seat = seatOf(seatId);
    if (!seat || seat.locked) return;
    await writeScore({
      gameId,
      userId: seat.owner,
      holeNumber,
      putts: next,
      enteredBy: userId,
    });
    await reload();
    void drainQueue('tasting');
  };

  const rail = useScoreRail({
    seats,
    mySeatId: collapsed ? (myCard?.captainId ?? null) : userId,
    par,
    puttsTracking: capturesPutts && putts.enabled,
    onSetScore: setSeatScore,
    onSetPutts: setSeatPutts,
    clearScoreFor: clearSeatScore,
  });

  // Det knappene viser før trykket: poeng i stableford-familien, netto ellers,
  // bare navnet i en blind runde. Kan motoren ikke svare på slagene setet får,
  // gjetter vi ikke: da vises bare navnet.
  const railSeat = rail.activeSeatId == null ? undefined : seatOf(rail.activeSeatId);
  const railDisplay: RailDisplay =
    hideNetto || railSeat?.extraStrokes == null ? 'plain' : isStableford ? 'points' : 'netto';
  const railOptions: RailOption[] = railSeat
    ? railStrokes(par).map((strokes) => ({
        strokes,
        term: strokeTerm(strokes, par),
        points: stablefordPointsForCard({
          card: { score: strokes, extraStrokes: railSeat.extraStrokes ?? 0 },
          par,
          gameMode: mode,
          isStableford,
        }),
        netto: strokes - (railSeat.extraStrokes ?? 0),
      }))
    : [];
  const railSkipSeat = rail.skipToSeatId == null ? undefined : seatOf(rail.skipToSeatId);

  // «Stryk» i «Annet»-arket: bare stableford-familien, netto dobbel bogey for
  // setet arket er åpent for. Kan motoren ikke svare på slagene setet får,
  // finnes ingen netto dobbel bogey å sette, og da står ikke knappen.
  const sheetSeat = sheetSeatId == null ? undefined : seatOf(sheetSeatId);
  let sheetStrike: { value: number; label: string } | undefined;
  if (isStableford && sheetSeat && sheetSeat.extraStrokes != null) {
    const value = strikeStrokes(par, sheetSeat.extraStrokes);
    const points = stablefordPointsForCard({
      card: { score: value, extraStrokes: sheetSeat.extraStrokes },
      par,
      gameMode: mode,
      isStableford,
    });
    sheetStrike = {
      value,
      label: hideNetto || points == null ? 'Stryk' : `Stryk · ${points} p`,
    };
  }

  // Kortveien (Bingo Bango Bongo): «−»/«+» og tapp på kortet, som før.
  const adjustStrokes = async (playerUserId: string, delta: number) => {
    const current = byUserHole.get(`${playerUserId}#${holeNumber}`)?.strokes ?? null;
    await writeStrokes(playerUserId, nextStrokes({ current, par, delta }));
  };

  // Tapp på selve kortet er en SNARVEI TIL FØRSTE FØRING — som på web. Står det
  // alt et tall der, er tappet en no-op: en tommel på avveie skal ikke kunne
  // viske ut en ærlig retting. Bruk «−»/«+» eller «Angre» i stedet.
  const setFirstEntryStrokes = async (playerUserId: string) => {
    const current = byUserHole.get(`${playerUserId}#${holeNumber}`)?.strokes ?? null;
    if (current != null) return;
    await writeStrokes(playerUserId, firstEntryStrokes(par));
  };

  // Sollys (eierens svar, #2385): har alle i flighten fått score på hullet,
  // går siden selv til neste hull. Bare når det skjer her, ikke når man åpner
  // et hull som alt er ferdig. Utgangspunktet settes derfor først når scorene
  // er lest fra SQLite (før det er lista tom fordi den ikke er lest), og hvert
  // hull har sin egen `HoleView` (`key`).
  const everyoneScored = usesRail && seats.length > 0 && seats.every((seat) => seat.score != null);
  const scoredBefore = useRef<boolean | null>(scoresLoaded ? everyoneScored : null);
  useEffect(() => {
    if (!scoresLoaded) return;
    const before = scoredBefore.current;
    scoredBefore.current = everyoneScored;
    if (before === null) return;
    if (!sunlight || before || !everyoneScored || holeNumber >= HOLE_COUNT) return;
    const timer = setTimeout(() => goToHole(holeNumber + 1), AUTO_NEXT_MS);
    return () => clearTimeout(timer);
  }, [everyoneScored, scoresLoaded, sunlight, holeNumber, goToHole]);

  const allHolesFilled = myFilled.length >= HOLE_COUNT;
  // Telleren over radene: seter på skinna, spillere i kortformatene.
  const rowCount = usesRail ? seats.length : flight.length;
  const enteredCount = usesRail
    ? seats.filter((seat) => seat.score != null).length
    : flight.filter((entry) => byUserHole.get(`${entry.user_id}#${holeNumber}`)?.strokes != null)
        .length;

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]} testID="hole-screen">
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: railHeight + 8 }]}
        testID="hole-scroll"
      >
        {/* #1980: slag som strandet i køen, synlig også i butikkbygget. */}
        <View style={styles.pad}>
          <SyncBanner gameId={gameId} />
        </View>
        {/* #2385 (designlerretet): hullstripa står øverst, uten overskrift og
            uten «Forrige»/«Neste»: de ni hullene i halvdelen du står i.
            Sollys har ingen stripe (Hull-sollys). */}
        {sunlight ? null : (
          <HoleStrip holeNumber={holeNumber} holeCount={HOLE_COUNT} filled={myFilled} onGo={goToHole} />
        )}
        <HoleSwipe
          enabled={sunlight}
          holeNumber={holeNumber}
          holeCount={HOLE_COUNT}
          label={`Hull ${holeNumber} av ${HOLE_COUNT}, par ${par}, indeks ${hole.strokeIndex}`}
          onGo={goToHole}
        >
          <HoleHero
            holeNumber={holeNumber}
            totalHoles={HOLE_COUNT}
            par={par}
            strokeIndex={hole.strokeIndex}
            sunlight={sunlight}
          />
        </HoleSwipe>
        <View style={styles.pad}>

        {/* #2220: et levert kort i en runde som pågår får vite hvem som kan åpne
            det. Et avsluttet spill kan bare admin åpne, på nettsiden. */}
        {locked ? (
          <Text style={ui.muted} testID="hole-locked">
            {bundle.game.status !== 'active'
              ? 'Spillet er ikke aktivt. Føringen er låst.'
              : collapsed
                ? `Lagkortet er levert. Føringen er låst. ${reopenHint(bundle.game.createdBy === userId)}`
                : `Kortet ditt er levert. Føringen er låst. ${reopenHint(bundle.game.createdBy === userId)}`}
          </Text>
        ) : null}

        {/* Wolf-badgen står over radene, som på web: hvem som er Wolf avgjør
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

        </View>

        {/* «Flighten på hull 7» og hvor mange som har tastet (designet). Sollys
            har ingen overskrift, som på artboardet. */}
        {sunlight ? null : (
          <View style={styles.flightHead}>
            <Text style={[styles.flightKicker, { color: colors.muted }]} accessibilityRole="header">
              {`Flighten på hull ${holeNumber}`}
            </Text>
            <Text style={[styles.flightCount, { color: colors.muted }]} testID="flight-count">
              {`${enteredCount} av ${rowCount} tastet`}
            </Text>
          </View>
        )}

        {usesRail ? (
          <View style={sunlight ? null : styles.flightList} testID="flight-list">
            {seats.map((seat) => (
              <FlightRow
                key={seat.id}
                seatId={seat.id}
                name={sunlight ? seat.shortName : seat.name}
                a11yName={seat.a11yName}
                sunlight={sunlight}
                initial={seat.initial}
                extraStrokes={seat.extraStrokes}
                score={seat.score}
                par={par}
                active={!locked && seat.id === rail.activeSeatId}
                locked={seat.locked}
                submitted={seat.submitted}
                points={
                  hideNetto || seat.extraStrokes == null
                    ? null
                    : stablefordPointsForCard({
                        card: { score: seat.score, extraStrokes: seat.extraStrokes },
                        par,
                        gameMode: mode,
                        isStableford,
                      })
                }
                note={seat.note}
                onSelect={rail.selectRow}
              />
            ))}
          </View>
        ) : (
          <View style={styles.pad}>
          {flight.map((entry) => (
            <PlayerCard
              key={entry.user_id}
              entry={entry}
              game={bundle.game}
              hole={hole}
              score={byUserHole.get(`${entry.user_id}#${holeNumber}`)}
              isMe={entry.user_id === userId}
              locked={locked || entry.submitted_at != null}
              submitted={entry.submitted_at != null}
              onStrokes={(delta) => void adjustStrokes(entry.user_id, delta)}
              onFirstEntry={() => void setFirstEntryStrokes(entry.user_id)}
              onClearStrokes={() => void writeStrokes(entry.user_id, null)}
            />
          ))}
          </View>
        )}

        <View style={styles.pad}>

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

        {holeNumber === HOLE_COUNT || allHolesFilled ? (
          <Pressable style={ui.button} onPress={onSubmit} testID="hole-submit">
            {/* Begge veier går til Scorecard — kø-vakta og hull-dialogen har ett
                hjem der (#1918). */}
            <Text style={ui.buttonText}>
              {collapsed ? 'Lever lagets kort' : 'Lever scorekort'}
            </Text>
          </Pressable>
        ) : null}
        </View>
      </ScrollView>

      {/* Skinna står fast i tommelsonen mens flighten ruller under den, som
          arket i designet. Et låst hull har ingenting å taste, og da står den
          ikke. */}
      {usesRail && !locked ? (
        <View
          style={styles.railDock}
          onLayout={(e) => setRailHeight(e.nativeEvent.layout.height)}
          testID="rail-dock"
        >
          <ScoreRail
            active={
              railSeat
                ? {
                    seatId: railSeat.id,
                    name: railSeat.name,
                    extraStrokes: railSeat.extraStrokes,
                    score: rail.activeScore,
                    putts: railSeat.putts,
                  }
                : null
            }
            par={par}
            options={railOptions}
            display={railDisplay}
            puttsTracking={capturesPutts && putts.enabled}
            puttsAvailable={capturesPutts}
            skipTo={railSkipSeat ? railSkipSeat.shortName : null}
            otherTop={`${par + 4}+`}
            otherHint={
              isStableford && railSeat?.extraStrokes != null
                ? `${par + 4}+ eller stryk`
                : `${par + 4}+`
            }
            onPuttsToggle={putts.toggle}
            onPick={rail.pick}
            onOther={() => {
              if (rail.activeSeatId != null) setSheetSeatId(rail.activeSeatId);
            }}
            onStep={rail.step}
            onUndo={rail.undo}
            onSkip={rail.skip}
            onPutts={rail.pickPutts}
          />
        </View>
      ) : null}

      <SpecificValueSheet
        open={sheetSeat != null && !sheetSeat.locked}
        par={par}
        // Et valg i arket går videre som et trykk på skinna.
        onPick={(value) => {
          if (sheetSeatId != null) rail.pickFor(sheetSeatId, value);
        }}
        onClear={() => {
          if (sheetSeatId != null) void clearSeatScore(sheetSeatId);
        }}
        onClose={() => setSheetSeatId(null)}
        strike={sheetStrike}
      />
    </View>
  );
}

/**
 * Sollys (eierens svar, #2385): uten hullstripe bytter man hull ved å sveipe
 * sidelengs på hullnummeret, mot venstre til neste og mot høyre til forrige.
 * VoiceOver får det samme som handlingene «Neste hull» og «Forrige hull» på
 * helten, som da leses som én linje, og bare de som finnes (ikke «Forrige
 * hull» på hull 1). Utenfor sollys står helten som før.
 */
function HoleSwipe({
  enabled,
  holeNumber,
  holeCount,
  label,
  onGo,
  children,
}: {
  enabled: boolean;
  holeNumber: number;
  holeCount: number;
  label: string;
  onGo: (hole: number) => void;
  children: ReactNode;
}) {
  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dx <= -SWIPE_DISTANCE) onGo(holeNumber + 1);
          else if (gesture.dx >= SWIPE_DISTANCE) onGo(holeNumber - 1);
        },
      }),
    [holeNumber, onGo],
  );
  if (!enabled) return <>{children}</>;
  return (
    <View
      {...responder.panHandlers}
      accessible
      accessibilityLabel={label}
      accessibilityActions={[
        ...(holeNumber < holeCount ? [{ name: 'nextHole', label: 'Neste hull' }] : []),
        ...(holeNumber > 1 ? [{ name: 'previousHole', label: 'Forrige hull' }] : []),
      ]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'nextHole') onGo(holeNumber + 1);
        if (event.nativeEvent.actionName === 'previousHole') onGo(holeNumber - 1);
      }}
      testID="hole-hero-swipe"
    >
      {children}
    </View>
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
 * Ett spillerkort med «−»/«+», for formatene som ikke bruker skinna (Bingo
 * Bango Bongo, #2252).
 *
 * Ingen putte-stepper: ingen av kortformatene fanger putter
 * (`formatCapturesPutts`). Endrer et framtidig format på det, er det skinna
 * som tar puttene.
 */
function PlayerCard({
  entry,
  game,
  hole,
  score,
  isMe,
  locked,
  submitted,
  onStrokes,
  onFirstEntry,
  onClearStrokes,
}: {
  entry: RosterEntry;
  /** Formatet og configen — badgen viser slagene motoren regner med (#2218). */
  game: Pick<BundleGame, 'gameMode' | 'modeConfig'>;
  hole: BundleHole;
  score: LocalScore | undefined;
  isMe: boolean;
  locked: boolean;
  /** #2211: spilleren har levert — «Levert»-merket ved navnet. */
  submitted: boolean;
  onStrokes: (delta: number) => void;
  onFirstEntry: () => void;
  onClearStrokes: () => void;
}) {
  const { ui } = useTheme();
  const player: BundlePlayer = entry.player;
  // `null` = configen peker på et annet format: da vises ingen badge.
  const extra = playerExtraForHole(game, player.courseHandicap, hole.strokeIndex);

  // Kortflaten er selve snarveien til par. Stepperne og «Angre» inni er egne
  // Pressables, og i React Native vinner den innerste berøringen — derfor
  // trengs ingen stopPropagation slik webben må ha.
  return (
    <Pressable
      style={[ui.card, locked && styles.cardLocked]}
      testID={`player-card-${entry.user_id}`}
      onPress={onFirstEntry}
      disabled={locked}
    >
      <View style={styles.cardHead}>
        <View style={styles.nameRow}>
          <Text style={[ui.body, isMe && styles.meName]}>
            {displayName(player)}
            {isMe ? ' (deg)' : ''}
          </Text>
          {submitted ? (
            <View style={ui.badge}>
              <Text style={ui.badgeText} testID={`player-${entry.user_id}-submitted`}>
                {SUBMITTED_BADGE}
              </Text>
            </View>
          ) : null}
        </View>
        {extra != null && extra !== 0 ? (
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
      <UndoStrokes
        visible={!locked && score?.strokes != null}
        label={`Nullstill scoren for ${displayName(player)}`}
        onPress={onClearStrokes}
        testID={`player-${entry.user_id}-undo`}
      />
      {score?.strokes == null && !locked ? (
        <Text style={ui.muted} testID={`player-${entry.user_id}-hint`}>
          {TAP_INSTRUCTION}
        </Text>
      ) : null}
    </Pressable>
  );
}

/**
 * «Angre» — ett trykk tilbake til «—» når et slag er feiltastet.
 *
 * Vises kun når det står et tall der, akkurat som webbens lenke: uten en score
 * er det ingenting å angre, og en død knapp på kortet ville bare tatt plass.
 * Ordet og skjermleser-teksten er webbens (`holes.scoreCard.undoScore` /
 * `undoScoreAriaLabel` i messages/no.json).
 */
function UndoStrokes({
  visible,
  label,
  onPress,
  testID,
}: {
  visible: boolean;
  label: string;
  onPress: () => void;
  testID: string;
}) {
  const { ui } = useTheme();
  if (!visible) return null;
  return (
    <Pressable
      style={[ui.link, styles.undo]}
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={ui.linkText}>Angre</Text>
    </Pressable>
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
  const { colors, ui } = useTheme();
  const stepStyle = [
    styles.step,
    { backgroundColor: colors.primary },
    disabled && styles.stepDisabled,
  ];
  const stepTextStyle = [styles.stepText, { color: colors.onPrimary }];
  return (
    <View style={styles.stepperRow}>
      <Text style={[ui.muted, styles.stepperLabel]}>{label}</Text>
      <Pressable
        style={stepStyle}
        onPress={() => onChange(-1)}
        disabled={disabled}
        testID={`${testIDPrefix}-minus`}
      >
        <Text style={stepTextStyle}>−</Text>
      </Pressable>
      <Text style={[ui.value, ui.num, styles.stepValue]} testID={`${testIDPrefix}-value`}>
        {value ?? '—'}
      </Text>
      <Pressable
        style={stepStyle}
        onPress={() => onChange(1)}
        disabled={disabled}
        testID={`${testIDPrefix}-plus`}
      >
        <Text style={stepTextStyle}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // Rulleflaten over, skinna fast under.
  root: { flex: 1 },
  // Designet (#2385) har ingen sidemarg på selve siden: hver del har sin egen.
  scroll: { flexGrow: 1 },
  // Det som ikke er i designet (kø-banneret, låst-teksten, Wolf og BBB, kort-
  // formatenes kort og «Lever»), står med appens vanlige luft.
  pad: { paddingHorizontal: 20, gap: 8 },
  // Radene står 12 pt fra kanten (Main); i sollys går de kant til kant.
  flightList: { paddingHorizontal: 12 },
  flightHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  railDock: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  flightKicker: {
    fontSize: 10,
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  flightCount: { fontSize: 12, fontFamily: FONTS.sans, fontVariant: ['tabular-nums'] },
  topTools: { flexDirection: 'row', alignItems: 'center' },
  topIcon: { width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center' },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  // Navnet og «Levert»-merket (#2211) side om side; bryter heller enn å
  // skyve slag-badgen ut av kortet.
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    flexShrink: 1,
    gap: 8,
  },
  // Et låst kort (levert, eller runden er over) er grått, samme verdi som
  // webbens `ScoreCard` (#2211). Før ble bare stepperne dempet.
  cardLocked: { opacity: 0.6 },
  // Egen familie, ikke `fontWeight` — expo-font velger snitt på familienavn.
  meName: { fontFamily: FONTS.sansBold },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepperLabel: { width: 60 },
  step: {
    width: TAP,
    height: TAP,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDisabled: { opacity: 0.4 },
  // Venstrestilt som stepper-etikettene, ikke midtstilt som `ui.link` er.
  undo: { alignItems: 'flex-start' },
  stepText: { fontSize: 22, fontFamily: FONTS.sansBold },
  stepValue: { width: 44, textAlign: 'center' },
});
