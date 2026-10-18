// Native N3 (#1825): scorekortet og lever-porten.
//
// #2262: kortet er et klassisk scorekort — UT og INN med HULL, PAR, SLAG og så
// POENG (stableford-familien) eller NETTO — med summene i store tall under, og
// et stempel når kortet er levert. Tallene er radene fra `buildScorecardRows`
// (som følger motoren), delt i halvdeler av den delte `buildScorecardGrid`.
// I en blind runde som pågår, viser kortet bare SLAG og BRUTTO, og hodet har
// ingen handicapdel. #2219 skjulte netto; kontrakten for #2262 (eierens svar)
// skjuler også poeng og handicapen, for de avslører det samme.
//
// Lever-knappen har webbens to porter, og de er ikke pynt:
//  1. **Kø-vakta (#668/#1370):** vi drainer først, og blokkerer så lenge køen
//     har elementer for DETTE spillet. Leverer man med usynkede slag, fryser
//     RLS kortet og avviser skrivingen; drainen retter telefonen etter
//     serveren og setter elementet i karantene (#2211, `interpretUpsertReply`),
//     men slaget kommer uansett ikke fram. Knappen er også sperret til køen er
//     lest første gang (#2219): før det vet vi ikke om den er tom.
//  2. **Manglende hull (#1793):** et komplett kort leveres uten spørsmål; er
//     det hull uten slag, spør vi først, for de låses som ikke spilt.
//
// N4 (#1828): i lag-formatene som deler én ball viser kortet LAGETS rader
// (kapteinens). #1918: «Lever lagets kort» går gjennom app→server-ruta
// (`data/submitCard.ts`), ikke rett i basen. Grunnen er RLS: appen kan bare
// skrive sin egen rad, mens rutas kjerne markerer hele lagets aktive, uleverte
// rader med service-role. Et halvlevert lag ville blokkert avslutningen av
// runden — så vi leverer ikke halvt. #2215: solo-kortet går samme vei, fordi
// varslene til makkerne og admin er serverens. Kjernen avgjør selv om kortet er
// et lagkort.
//
// #2200: den som fører, leverer for flighten. Har spilleren ført hvert hull til
// en makker, eller er makkeren en gjest med fullt kort, leverer knappen de
// kortene sammen med spillerens eget («Lever 3 kort ✓»), og en blokk over
// knappen sier hvem og hvorfor. Hvem som kan leveres, er den delte regelen
// (`flightDeliveryFor` → `lib/games/flightDelivery.ts`) over de lokale slagene.
// Makker-kortene går med i det samme kallet til `data/submitCard.ts`
// (`alsoFor`), så appen har én vei inn for levering; ruta spør regelen igjen
// og leverer bare snittet. Er mitt eget kort alt levert, står «Lever for Ola ✓»
// under lesevisningen, og samme kall leverer da bare makkernes kort. Kø-vakta
// gjelder begge knappene: makkernes slag skal også være framme før kortene
// fryses. Lag-formatene med én ball gir ingen makkere i den delte regelen.
//
// #2220: et kort som kan leveres, kan også rettes. «Rediger hullene» tar
// spilleren til hull 1, som nettsidens «← Rediger». Uten den var et avvist,
// fullt kort en blindvei: spill-hjem sender et fullt kort hit, og radene under
// er ren visning.
//
// #2299: når alle hullene er ført og kortet kan leveres, starter skjermen med
// oppsummeringen (`RoundDoneCard`): hilsenen, tallene, dagens beste hull og det
// som svidde, og hvem i flighten som mangler hull. Alt under står som før.
// Knappene «Se over og lever scorekortet» og «Tilbake til hull 18» står i en
// fast linje over bunnen av rulla (`RoundDoneBar`, eierens valg B), som viker
// når scorekortets egen «Lever scorekort» kommer til syne: aldri to
// leverknapper. Innholdet har like mye luft nederst som linja er høy, så rulla
// er like stor med og uten linja, og ingenting hopper når den går.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import {
  AccessibilityInfo,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { GameStatus } from '../../../../lib/games/status';
import {
  revealState,
  shouldHideNetto,
  type ScoreVisibility,
} from '../../../../lib/games/visibility';
import { nameInitials } from '../../../../lib/names/initials';
import { deliveryCoversWholeTeam } from '../../../../lib/games/teamDelivery';
import { buildScorecardGrid, stablefordPointsFnFor } from '../../../../lib/scorecard/scorecardGrid';
import { resolveScorecardStamp } from '../../../../lib/scorecard/scorecardStamp';
import type { GameMode, ScoringGender } from '../../../../lib/scoring/modes/types';
import { modeCollapsesToTeamCard } from '../../../../lib/scoring/modes/types';
import { isActiveForGame } from '../../../../lib/sync/queueScope';
import {
  ScorecardGrid,
  type EnteredByName,
  type ScorecardRowKind,
  type TeeShotName,
} from '../components/scorecard/ScorecardGrid';
import {
  TeeShotLockedSubmit,
  TeeShotShortBox,
  type TeeShotShortBoxPlayer,
} from '../components/scorecard/TeeShotShortBox';
import { kickerHeader } from '../components/KickerHeader';
import {
  RoundDoneBar,
  RoundDoneCard,
  roundDoneBarHeight,
} from '../components/scorecard/RoundDoneCard';
import { ScorecardHeader } from '../components/scorecard/ScorecardHeader';
import {
  ScorecardStampMark,
  ScorecardStatusList,
} from '../components/scorecard/ScorecardStamp';
import { ScorecardTotals } from '../components/scorecard/ScorecardTotals';
import { getDb, listQueue, listTeeShotQueue } from '../data/db';
import { submitCard } from '../data/submitCard';
import { drainQueue } from '../data/syncWorker';
import { describeSubmitFailure } from '../lib/actionFeedback';
import { isScoringSupported } from '../lib/formatGate';
import { holeHeaderParams } from '../lib/holeHeader';
import { nameLookup } from '../lib/leaderboardModel';
import {
  deliverForButton,
  findInRoster,
  flightDeliveryButton,
  flightDeliveryFor,
  flightDeliveryLines,
  partialDeliveryNotice,
  toRoster,
  toStampPlayers,
} from '../lib/roster';
import { reopenHint } from '../lib/rosterCopy';
import { buildRoundDoneModel, roundDoneBarVisible, submitInView } from '../lib/roundDone';
import {
  SCORECARD_TEXT,
  scorecardHandicapPart,
  scorecardHeaderLine,
  teamScorecardKicker,
} from '../lib/scorecardHeader';
import { buildScorecardRows } from '../lib/scorecardRows';
import {
  UNKNOWN_PLAYER,
  teeShotDeliveryLock,
  teeShotMinimum,
  teeShotNameOf,
  teeShotTeam,
  teamTeeShotState,
} from '../lib/teeShotTeams';
import { TEE_SHOTS_APP_TEXT, queueGuardText, teeShotBoxText, teeShotCountText } from '../lib/teeShotsCopy';
import { computeGameLeaderboard } from '../lib/scoringContext';
import {
  buildTeamCards,
  findMyTeamCard,
  myTeamCaptainId,
  teamHandicapFor,
} from '../lib/teamPlay';
import { useGameBundle, useLocalScores, useTeamScores } from '../lib/useGameData';
import { useScoreCatchUp } from '../lib/useScoreCatchUp';
import { useTeamTeeShots } from '../lib/useTeamTeeShots';
import type { ScreenProps } from '../navigation';
import { useSession } from '../session';
import { useTheme } from '../theme';
import { useMarkVisitRead } from '../lib/useMarkVisitRead';
import { GAME_LOAD_FAILED_TEXT } from '../lib/seedCopy';

const HOLE_COUNT = 18;
const QUEUE_POLL_MS = 1500;

export function Scorecard({ route, navigation }: ScreenProps<'Scorecard'>) {
  const { colors, ui } = useTheme();
  const insets = useSafeAreaInsets();
  const { gameId } = route.params;
  const { userId } = useSession();
  // #2201: lever-påminnelsen er lest når du har åpnet scorekortet (webbens
  // /games/[id]/submit).
  useMarkVisitRead('gameSubmit', gameId);
  const { bundle, loading, refresh } = useGameBundle(gameId);
  const { scores: localScores, reload } = useLocalScores(gameId);
  // #2067: hullene en trukket kaptein førte, teller for laget. Foldes inn før
  // noe annet leser slagene.
  const scores = useTeamScores(localScores, bundle);
  // `null` til køen er lest første gang (#2219). Da er lever-knappen sperret.
  // #2580: utslag som venter, sperrer som slagene; serveren teller bare det
  // som er framme.
  const [queueCounts, setQueueCounts] = useState<{ strokes: number; teeShots: number } | null>(null);
  const queued = queueCounts ? queueCounts.strokes + queueCounts.teeShots : null;
  // #2580: «Hvem sitt utslag». Før bundelen har landet, spørres det ikke.
  const minTeeShots = bundle ? teeShotMinimum(bundle.game) : null;
  const teeShots = useTeamTeeShots(gameId, { enabled: minTeeShots != null, pollMs: QUEUE_POLL_MS });
  const reloadTeeShots = teeShots.reload;
  // Boksen over leverknappen; et trykk på den sperrede knappen gir den fokus.
  const teeShotBoxRef = useRef<View>(null);
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [noticeText, setNoticeText] = useState<string | null>(null);
  // #2299: «Se over og lever scorekortet» ruller hit, til toppen av scorekortet.
  const scrollRef = useRef<ScrollView>(null);
  const scorecardTop = useRef(0);
  // Hvor rulla står og hvor leverknappen er, til bunnlinja. Bare om linja
  // står, er state, og den settes bare når svaret snur (siste svar i en ref).
  const barGeometry = useRef<{ scrollY: number; viewportHeight: number; submitTop: number | null }>({
    scrollY: 0,
    viewportHeight: 0,
    submitTop: null,
  });
  const barShownRef = useRef(true);
  const [barShown, setBarShown] = useState(true);
  // «Se over og lever scorekortet» ruller uten animasjon når telefonen ber om
  // redusert bevegelse. Leses bare ved trykk, så en ref holder.
  const reduceMotion = useRef(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (alive) reduceMotion.current = value;
      })
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
      reduceMotion.current = value;
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  // En feil lar `queued` stå: står den på `null`, er knappen fortsatt sperret,
  // og intervallet prøver igjen.
  const refreshQueue = useCallback(async () => {
    try {
      const db = await getDb();
      const [items, teeShotItems] = await Promise.all([listQueue(db), listTeeShotQueue(db)]);
      setQueueCounts({
        strokes: items.filter((item) => isActiveForGame(item, gameId)).length,
        teeShots: teeShotItems.filter((item) => isActiveForGame(item, gameId)).length,
      });
    } catch (err: unknown) {
      console.error('[Scorecard] listQueue', err);
    }
  }, [gameId]);

  // Drain først (port 1), les så køen og den lokale basen. Rekkefølgen er
  // hele poenget: slagene skal ut FØR kortet kan fryses. Kjeden kjører hver
  // gang skjermen får fokus (#2220): «Rediger hullene» legger hullene oppå et
  // scorekort som står montert, og kommer spilleren tilbake etter å ha rettet
  // et hull, skal kortet vise det nye tallet før det leveres.
  //
  // Serververdiene hentes av `useScoreCatchUp` (#2228), ved fokus, i
  // forgrunnen og med nett igjen. At den seeden går samtidig med drainen, er
  // trygt: `mergeServerScores` slipper bare inn rader som er strengt nyere enn
  // den lokale (`data/seedScores.ts`), så en ventende lokal rad blir stående.
  //
  // #2219: køen leses også med én gang, parallelt med drainen. Uten det sto
  // knappen åpen til drainen var ferdig eller intervallet slo inn, og et
  // komplett kort gikk da rett til levering foran slagene i køen.
  useFocusEffect(
    useCallback(() => {
      void refreshQueue();
      void drainQueue('lever')
        .catch(() => undefined)
        .then(() => refreshQueue())
        .then(() => Promise.all([reload(), reloadTeeShots()]));
    }, [refreshQueue, reload, reloadTeeShots]),
  );
  useScoreCatchUp(gameId, reload, {
    reloadTeeShots: minTeeShots != null ? reloadTeeShots : undefined,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      void refreshQueue();
    }, QUEUE_POLL_MS);
    return () => clearInterval(interval);
  }, [refreshQueue]);

  if (!bundle) {
    // #1954 A2: en feilet første henting uten cache sier fra, som hull- og
    // tavleskjermen. Uten dette sto «Henter scorekortet …» til skjermen ble
    // åpnet på nytt.
    return loading ? (
      <View style={ui.centered} testID="scorecard-loading">
        <Text style={ui.muted}>Henter scorekortet …</Text>
      </View>
    ) : (
      <View style={ui.centered} testID="scorecard-error">
        <Text style={ui.error}>{GAME_LOAD_FAILED_TEXT}</Text>
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
    game: bundle.game,
    viewerId: userId,
    teamOwnerId: myCaptainId,
    teeGender: me.player.teeGender as ScoringGender,
    courseHandicap,
    teamNumber: myTeamCard?.teamNumber ?? me.player.teamNumber,
    leaderboard,
  });
  const missing = HOLE_COUNT - totals.playedHoles;

  // #2262: kortet. POENG i stableford-familien, NETTO ellers. I en blind runde
  // som pågår, ingen av dem (#2219): samme delte regel som resultatlista
  // (`shouldHideNetto`). Brutto står.
  const revealActive = shouldHideNetto(
    revealState(
      bundle.game.scoreVisibility as ScoreVisibility,
      bundle.game.status as GameStatus,
    ),
  );
  const pointsFn = revealActive ? null : stablefordPointsFnFor(mode);
  const grid = buildScorecardGrid({ rows, pointsFn });
  const valueRows: ScorecardRowKind[] = revealActive ? [] : pointsFn ? ['points'] : ['net'];

  const teamNumber = myTeamCard?.teamNumber ?? me.player.teamNumber;
  const headerLine = scorecardHeaderLine({
    courseName: bundle.courseName,
    teeBoxName: bundle.teeBoxName,
    gameMode: bundle.game.gameMode,
    handicapPart: scorecardHandicapPart({
      game: bundle.game,
      courseHandicap: me.player.courseHandicap,
      teamMode,
      teamHandicap:
        leaderboard != null && teamNumber != null ? teamHandicapFor(leaderboard, teamNumber) : null,
      revealActive,
    }),
  });

  const stamp = resolveScorecardStamp({
    ownerUserId: userId,
    players: toStampPlayers(bundle.players),
    gameMode: mode,
    gameStatus: bundle.game.status,
    requirePeerApproval: bundle.game.requirePeerApproval,
    // Designet (#2385): «Markør: Jonas Berg har godkjent», fullt navn.
    markerName: 'full',
  });

  const canSubmit =
    bundle.game.status === 'active' &&
    me.submitted_at == null &&
    me.withdrawn_at == null &&
    isScoringSupported(bundle.game);

  // #2299: oppsummeringen, eller `null` når kortet ikke kan leveres herfra
  // eller et hull mangler slag.
  const roundDone = buildRoundDoneModel({
    bundle,
    scores,
    localScores,
    userId,
    rows,
    totals: grid.totals,
    revealActive,
    canSubmit,
    missing,
    teamMode,
  });
  const barHeight = roundDoneBarHeight(insets.bottom);
  const showBar = roundDone != null && barShown;
  // Leses i hendelsene, så de ser denne tegningens oppsummering. Uten
  // oppsummering finnes ingen linje å flytte på.
  const updateBar = () => {
    if (roundDone == null) return;
    const next = roundDoneBarVisible({
      hasSummary: true,
      submitInView: submitInView({
        ...barGeometry.current,
        coveredBottom: barShownRef.current ? barHeight : 0,
      }),
    });
    if (next === barShownRef.current) return;
    barShownRef.current = next;
    setBarShown(next);
  };
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    barGeometry.current.scrollY = event.nativeEvent.contentOffset.y;
    updateBar();
  };
  const onScrollLayout = (event: LayoutChangeEvent) => {
    barGeometry.current.viewportHeight = event.nativeEvent.layout.height;
    updateBar();
  };
  const onSubmitLayout = (event: LayoutChangeEvent) => {
    barGeometry.current.submitTop = event.nativeEvent.layout.y;
    updateBar();
  };
  const openHole = (holeNumber: number) =>
    navigation.navigate('Hole', {
      gameId,
      holeNumber,
      ...holeHeaderParams(bundle.game, bundle.courseName),
    });

  // «Ført av» (eierens svar 2026-09-29): før levering, og bare når noen andre
  // har ført minst ett av hullene på kortet. Har du ført alt selv, ville raden
  // bare vært dine egne initialer 18 ganger.
  const enteredByOthers = rows.some(
    (row) => row.enteredBy != null && row.enteredBy !== userId,
  );
  const showEnteredBy = canSubmit && enteredByOthers;
  const enteredBy = new Map<number, EnteredByName>();
  if (showEnteredBy) {
    for (const row of rows) {
      if (row.enteredBy == null) continue;
      const who = bundle.players.find((player) => player.userId === row.enteredBy);
      enteredBy.set(row.holeNumber, {
        initials: nameInitials(who?.name ?? null),
        fullName: who?.name ?? 'ukjent',
      });
    }
  }
  // #2580: raden «Utslag», lagets valg per hull, i rekkefølgen Slag, Netto,
  // Utslag, Ført av. I shamble viser hver spillers kort lagets rad. Den som
  // mangler utslag, står i pille.
  const teeShotsReady = minTeeShots != null && teeShots.loaded;
  const myTeeShotTeamNumber = myTeamCard?.teamNumber ?? me.player.teamNumber;
  const myTeeShotTeam =
    teeShotsReady && myTeeShotTeamNumber != null ? teeShotTeam(bundle.players, myTeeShotTeamNumber) : null;
  const teeShotCells = new Map<number, TeeShotName>();
  if (myTeeShotTeam && minTeeShots != null) {
    const { status } = teamTeeShotState(myTeeShotTeam, minTeeShots, teeShots.rows);
    for (const row of teeShots.rows) {
      if (row.teamNumber !== myTeeShotTeam.teamNumber || row.teeShotBy == null) continue;
      const who = bundle.players.find((player) => player.userId === row.teeShotBy);
      teeShotCells.set(row.holeNumber, {
        initials: nameInitials(who?.name ?? null),
        // Står midt i skjermleserens setning («…, utslaget til ukjent spiller»).
        fullName: who?.name ?? UNKNOWN_PLAYER.toLowerCase(),
        short: (status.players.find((p) => p.userId === row.teeShotBy)?.missing ?? 0) > 0,
      });
    }
  }
  const gridRows: ScorecardRowKind[] = [
    'strokes',
    ...valueRows,
    ...(myTeeShotTeam ? (['teeShots'] as const) : []),
    ...(showEnteredBy ? (['enteredBy'] as const) : []),
  ];

  // #2200: makkernes kort jeg kan levere med mitt eget. De rå lokale slagene,
  // ikke de lag-foldede: den delte regelen finner selv eieren av hver rad.
  const flightMates = flightDeliveryFor(bundle, localScores, userId);
  // Mitt kort er levert, men makkernes står igjen: egen knapp under
  // lesevisningen. Samme porter som lever-knappen, bortsett fra eget kort.
  const canDeliverForFlight =
    flightMates.length > 0 &&
    bundle.game.status === 'active' &&
    me.submitted_at != null &&
    me.withdrawn_at == null &&
    isScoringSupported(bundle.game);

  // #2580: mangler noen på et av lagene som skal leveres utslag, står boksen
  // over knappene og leverknappen er sperret, som serveren (412
  // `tee_shots_short`). «Lever likevel» finnes ikke da.
  const mateIds = flightMates.map((player) => player.userId);
  const teeShotLock =
    teeShotsReady && minTeeShots != null
      ? teeShotDeliveryLock({
          players: bundle.players,
          minimum: minTeeShots,
          rows: teeShots.rows,
          deliveringIds: canSubmit ? [userId, ...mateIds] : canDeliverForFlight ? mateIds : [],
        })
      : null;
  const teeShotBox = teeShotLock ? teeShotBoxFor(teeShotLock, mode) : null;

  const doSubmit = async () => {
    setBusy(true);
    setErrorText(null);
    setNoticeText(null);
    // Solo og lag går samme vei (#2215): ruta leverer, varsler og tømmer
    // web-cachen. Laget kan bare leveres der uansett — RLS lar appen skrive sin
    // egen rad, og halve laget levert er verre enn ingen. #2200: makker-kortene
    // jeg har ført, går med i samme kall (`alsoFor`); ruta spør regelen igjen.
    const result = await submitCard(
      gameId,
      flightMates.map((player) => player.userId),
    );
    setBusy(false);
    if (result.ok) {
      // #2200: leverte serveren færre makkerkort enn knappen lovet, blir
      // spilleren stående med en beskjed, og kortet hentes på nytt så det viser
      // hva som står igjen.
      const notice = partialDeliveryNotice(result.alsoDelivered, flightMates.length);
      if (notice) {
        setNoticeText(notice);
        void refresh();
        return;
      }
      navigation.navigate('GameHome', { gameId });
      return;
    }
    setErrorText(describeSubmitFailure(result.reason));
  };

  const submitLabel = teamMode
    ? 'Lever lagets kort'
    : flightMates.length > 0
      ? flightDeliveryButton(flightMates)
      : 'Lever scorekort';
  const submitTestID = teamMode
    ? 'submit-team-card'
    : flightMates.length > 0
      ? 'submit-flight'
      : 'submit-scorecard';

  // Sperret til køen er lest (`null`) og mens den har slag for spillet. #2580:
  // også til utslagene er lest, som køen (#2219): før det vet vi ikke om noen
  // mangler.
  const queueBlocked = queued === null || queued > 0 || (minTeeShots != null && !teeShots.loaded);
  const syncing = queued !== null && queued > 0;
  const syncingLabel =
    queueCounts && queueCounts.strokes === 0 ? TEE_SHOTS_APP_TEXT.syncingTeeShots : 'Synker slag …';

  const onSubmitPress = () => {
    if (queueBlocked || busy || teeShotLock) return;
    if (missing === 0) {
      void doSubmit();
      return;
    }
    // Siste setning er webbens `game.submit.confirmBase` (#2220): bare
    // arrangøren kan åpne et levert kort igjen.
    Alert.alert(
      teamMode ? 'Lever lagets kort?' : 'Lever scorekortet?',
      teamMode
        ? `${missing} hull står uten slag. De blir stående som ikke spilt for hele laget. Dette kan bare angres av arrangøren.`
        : `${missing} hull står uten slag. De blir stående som ikke spilt. Dette kan bare angres av arrangøren.`,
      [
        { text: 'Avbryt', style: 'cancel' },
        { text: 'Lever likevel', onPress: () => void doSubmit() },
      ],
    );
  };

  const onDeliverForPress = () => {
    if (queueBlocked || busy || teeShotLock) return;
    void doSubmit();
  };

  // Under et stempel sier «Kortet er levert» seg selv (#2262), og designet
  // har ingen linje til under sjekklista (#2385).
  const readonlyText =
    me.submitted_at == null
      ? 'Kortet kan ikke leveres herfra nå.'
      : stamp != null
        ? null
        : bundle.game.status === 'active'
          ? `Kortet er levert. Dette er lesevisning. ${reopenHint(bundle.game.createdBy === userId)}`
          : 'Kortet er levert. Dette er lesevisning.';

  const queueGuard =
    syncing && queueCounts ? (
      <Text style={ui.muted} testID="queue-guard">
        {queueGuardText(queueCounts)}
      </Text>
    ) : null;

  const flightBlock =
    flightMates.length > 0 ? (
      <View style={ui.card} testID="flight-delivery">
        {flightDeliveryLines(flightMates).map((line) => (
          <Text key={line} style={ui.body}>
            {line}
          </Text>
        ))}
      </View>
    ) : null;

  return (
    <View style={[styles.fill, { backgroundColor: colors.bg }]}>
      <ScrollView
        ref={scrollRef}
        style={styles.fill}
        // Luft nederst: like høy som linja mens oppsummeringen står (rulla er da
        // like stor om linja står eller ikke), ellers ut av hjem-streken.
        contentContainerStyle={[
          ui.scroll,
          styles.scroll,
          { paddingBottom: roundDone ? barHeight : 20 + insets.bottom },
        ]}
        // Rullefeltet stopper over linja, ikke bak den.
        scrollIndicatorInsets={{ bottom: roundDone ? barHeight : 0 }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onLayout={onScrollLayout}
        testID="scorecard-screen"
      >
        {teamMode ? (
          <HeaderKicker navigation={navigation} kicker={teamScorecardKicker(myTeamCard?.label)} />
        ) : null}
        {roundDone ? (
          <View style={styles.roundDone}>
            <RoundDoneCard model={roundDone} onOpenHole={openHole} />
          </View>
        ) : null}
        <View
          onLayout={(event) => {
            scorecardTop.current = event.nativeEvent.layout.y;
          }}
        >
          <ScorecardHeader title={bundle.game.name} line={headerLine} />
        </View>

        <ScorecardGrid
          grid={grid}
          rows={gridRows}
          enteredBy={enteredBy}
          teeShots={teeShotCells}
          footer={
            <ScorecardTotals
              totals={grid.totals}
              // Designet har BRUTTO · NETTO også i stableford; en blind runde
              // skjuler netto som før (#2219).
              showNet={!revealActive}
              showPoints={valueRows.includes('points')}
            />
          }
          overlay={stamp ? <ScorecardStampMark stamp={stamp} /> : null}
        />
        {showEnteredBy ? (
          <Text style={ui.muted} testID="scorecard-entered-by-note">
            Initialene viser hvem som førte hvert hull.
          </Text>
        ) : null}

        {stamp ? <ScorecardStatusList stamp={stamp} ownerFullName={me.player.name} /> : null}

        {canSubmit ? (
          <>
            {teeShotsReady ? <TeeShotBoxSlot box={teeShotBox} boxRef={teeShotBoxRef} /> : null}
            {/* Står også mens kø-vakta holder lever-knappen igjen: det er lov å
                rette mens slagene synker. Avstanden ned til lever-knappen er
                minst 24 pt (#1793), for de to knappene gjør det motsatte. */}
            <Pressable
              style={[ui.buttonSecondary, styles.editButton]}
              onPress={() => openHole(1)}
              testID="scorecard-edit"
            >
              <Text style={ui.buttonSecondaryText}>Rediger hullene</Text>
            </Pressable>
            {flightBlock}
            {queueGuard}
            {teeShotBox ? (
              <TeeShotLockedSubmit
                label={submitLabel}
                boxRef={teeShotBoxRef}
                testID={submitTestID}
                onLayout={onSubmitLayout}
              />
            ) : (
            <Pressable
              style={[ui.button, (queueBlocked || busy) && styles.buttonDisabled]}
              onLayout={onSubmitLayout}
              onPress={onSubmitPress}
              disabled={queueBlocked || busy}
              testID={submitTestID}
            >
              <Text style={ui.buttonText}>
                {busy
                  ? 'Leverer …'
                  : syncing
                    ? syncingLabel
                    : submitLabel}
              </Text>
            </Pressable>
            )}
          </>
        ) : (
          <>
            {readonlyText ? (
              <Text style={ui.muted} testID="scorecard-readonly">
                {readonlyText}
              </Text>
            ) : null}
            {canDeliverForFlight ? (
              <>
                {teeShotsReady ? <TeeShotBoxSlot box={teeShotBox} boxRef={teeShotBoxRef} /> : null}
                {flightBlock}
                {queueGuard}
                {teeShotBox ? (
                  <TeeShotLockedSubmit
                    label={deliverForButton(flightMates)}
                    boxRef={teeShotBoxRef}
                    testID="deliver-for-flight"
                  />
                ) : (
                <Pressable
                  style={[ui.button, (queueBlocked || busy) && styles.buttonDisabled]}
                  onPress={onDeliverForPress}
                  disabled={queueBlocked || busy}
                  testID="deliver-for-flight"
                >
                  <Text style={ui.buttonText}>
                    {busy
                      ? 'Leverer …'
                      : syncing
                        ? syncingLabel
                        : deliverForButton(flightMates)}
                  </Text>
                </Pressable>
                )}
              </>
            ) : null}
          </>
        )}

        {noticeText ? (
          <Text style={ui.muted} testID="submit-partial">
            {noticeText}
          </Text>
        ) : null}
        {errorText ? (
          <Text style={ui.error} testID="submit-error">
            {errorText}
          </Text>
        ) : null}
      </ScrollView>
      {showBar ? (
        <RoundDoneBar
          onReview={() =>
            scrollRef.current?.scrollTo({ y: scorecardTop.current, animated: !reduceMotion.current })
          }
          onBack={() => openHole(HOLE_COUNT)}
        />
      ) : null}
    </View>
  );
}

/**
 * Lagkortet sier «Lagets scorekort · Lag 2» i toppen (#2385). Ordet er først
 * kjent når bundelen er lest, så skjermen setter det selv; solo-kortet har
 * navigatorens «Mitt scorekort».
 */
function HeaderKicker({
  navigation,
  kicker,
}: {
  navigation: ScreenProps<'Scorecard'>['navigation'];
  kicker: string;
}) {
  useLayoutEffect(() => {
    navigation.setOptions(kickerHeader(kicker, SCORECARD_TEXT.screenTitle));
  }, [navigation, kicker]);
  return null;
}

type TeeShotLock = NonNullable<ReturnType<typeof teeShotDeliveryLock>>;
type TeeShotBox = { title: string; body: string; players: TeeShotShortBoxPlayer[] };

/** Boksens tittel, setning og antall per spiller (#2580, `Utslag-forslag-levering`). */
function teeShotBoxFor(lock: TeeShotLock, mode: GameMode): TeeShotBox {
  const nameOf = teeShotNameOf(lock.team);
  const { title, body } = teeShotBoxText(lock.advice, lock.status, deliveryCoversWholeTeam(mode), nameOf);
  return {
    title,
    body,
    players: lock.status.players.map((p) => ({
      userId: p.userId,
      name: nameOf(p.userId),
      countText: teeShotCountText(p, lock.status.minimum),
      short: p.missing > 0,
    })),
  };
}

/**
 * Plassen til boksen (#2580). Den leses opp bare når den dukker opp etter en
 * endring på kortet (en makker byttet utslag), ikke når kortet åpnes med den.
 */
function TeeShotBoxSlot({ box, boxRef }: { box: TeeShotBox | null; boxRef: RefObject<View | null> }) {
  const shown = box != null;
  const [prevShown, setPrevShown] = useState(shown);
  const [announce, setAnnounce] = useState(false);
  if (shown !== prevShown) {
    setPrevShown(shown);
    setAnnounce(shown);
  }
  if (!box) return null;
  return (
    <View style={styles.teeShotBox}>
      <TeeShotShortBox ref={boxRef} title={box.title} body={box.body} players={box.players} announce={announce} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Designet: tittelen står rett under toppen.
  fill: { flex: 1 },
  scroll: { paddingTop: 4 },
  // #2299: båndet går kant til kant og helt opp, som i designet. Margene
  // opphever rullas padding: 20 på sidene, og 4 over (`scroll` over).
  roundDone: { marginHorizontal: -20, marginTop: -4 },
  buttonDisabled: { opacity: 0.5 },
  // Med skjermens `gap` (8) og lever-knappens `marginTop` (8) blir det 32 pt
  // ned til lever-knappen, over kravet på 24.
  editButton: { marginBottom: 16 },
  // #2580: boksen står 16 pt fra kanten (skjermens padding er 20), 12 under
  // kortet og 12 over «Rediger hullene» (skjermens `gap` er 8, knappens
  // `marginTop` 8).
  teeShotBox: { marginHorizontal: -4, marginTop: 4, marginBottom: -4 },
});
