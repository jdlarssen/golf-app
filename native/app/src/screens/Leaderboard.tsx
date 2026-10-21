// Native N4 (#1828): resultattabellen.
//
// Datasløyfa er hull-sidens, uendret: bundelen fra `cache_entries`, slagene fra
// SQLite, og den delte `useScoreCatchUp` (#2228) som henter slagene ved åpning,
// i forgrunnen og med nett igjen, og henger på spillets ene realtime-kanal.
// Hver merge leser den lokale basen på nytt, og tabellen regnes om fra den. Det
// er derfor tabellen oppdaterer seg når en makker taster på andre siden av
// banen, og hvorfor den står støtt i flymodus.
//
// Regnestykket er ikke her: `computeGameLeaderboard` bygger konteksten og kaller
// den DELTE motoren. Denne fila velger visning og passer på hva reveal-runden
// får lov å vise.
//
// #2579: slagspill og solo stableford har tavla fra designlerretet, og
// lagformatene (scramble, lag-stableford, shamble, best ball) lagtavla. Båndet
// er navigatorens header (`boardHeader`), så pila står i alle tilstander;
// stripa nederst ligger fast utenfor rullingen.
import { useIsFocused } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { GameMode } from '../../../../lib/scoring/modes/types';
import { settlementForResult } from '../../../../lib/scoring/settlement';
import {
  ResultView,
  UNKNOWN_FORMAT_RESULT_MESSAGE,
} from '../components/leaderboard/ResultView';
import { SideTournamentSection } from '../components/leaderboard/SideTournamentSection';
import { WithdrawnPlayers } from '../components/leaderboard/WithdrawnPlayers';
import { BoardStrip } from '../components/leaderboard/SoloBoard';
import { TeamStrip } from '../components/leaderboard/TeamBoard';
import { CalmNote, LeaderTable } from '../components/leaderboard/Table';
import { boardHeader } from '../components/KickerHeader';
import { WebLinkButton } from '../components/WebLinkButton';
import type { LocalScore } from '../data/db';
import type { GameBundle } from '../data/gameBundle';
import { BOARD_TEAM_TEXT, BOARD_TEXT } from '../lib/boardCopy';
import {
  GATE_LINK_LABEL,
  gameWebPath,
  gateMessage,
  gateReason,
} from '../lib/formatGate';
import {
  FIRST_HALF_WAITING_NOTE,
  firstHalfScope,
  grossLines,
  hasAnyStroke,
  leaderboardVisibility,
  nameLookup,
} from '../lib/leaderboardModel';
import {
  computeGameLeaderboard,
  type ScoringContextProblem,
  type ScoringExtras,
} from '../lib/scoringContext';
import { holeHeaderParams } from '../lib/holeHeader';
import { SETTLEMENT_TEXT } from '../lib/settlementCopy';
import { SHOW_KRONER_IN_APP } from '../../../../lib/launchRules';
import { buildSideTournament } from '../lib/sideTournament';
import { withdrawnOnBoard } from '../lib/withdrawnBoard';
import {
  boardBand,
  hasSoloBoard,
  soloBoardFor,
  type SoloBoardModel,
  type SoloBoardStripAction,
} from '../lib/soloBoard';
import {
  hasTeamBoard,
  teamBandVariant,
  teamBoardBand,
  teamBoardFor,
  type TeamBoardModel,
} from '../lib/teamBoard';
import { choicesNotYetHere, useGameChoices } from '../lib/useChoices';
import { GameLoadFailed } from '../components/GameLoadFailed';
import { CHOICES_MISSING_BOARD_TEXT, SEED_FAILED_TEXT } from '../lib/seedCopy';
import { useGameBundle, useLocalScores, useTeamScores } from '../lib/useGameData';
import { useScoreCatchUp } from '../lib/useScoreCatchUp';
import { teeShotMinimum } from '../lib/teeShotTeams';
import { useTeamTeeShots } from '../lib/useTeamTeeShots';
import { useSideWinners, type SideWinnersState } from '../lib/useSideWinners';
import type { ScreenProps } from '../navigation';
import { useSession } from '../session';
import { useTheme } from '../theme';
import { useMarkVisitRead } from '../lib/useMarkVisitRead';

/** Samme takt som hull-siden — en drain eller en merge skjer utenfor React. */
const POLL_MS = 1500;

/** Stripas høyde før den er målt: 44 pt knapp, 12 pt luft og kanten. */
const STRIP_ESTIMATE = 70;
/** Stripa står 20 pt over bunnen (pluss sikker sone), som i tegningen. */
const STRIP_BOTTOM = 20;

/**
 * Skal sideturneringen vises for dette spillet?
 *
 * Tre betingelser, og alle tre er webbens. Den viktigste er `finished`:
 * sideturneringen er et post-game-reveal-element på ALLE formater der
 * (`formats/stableford.tsx:115-121`, `formats/skins.tsx:102`,
 * `renderMatchplaySideSection` returnerer `undefined` når spillet ikke er
 * avsluttet). En pågående runde viser derfor ingenting side-relatert, uansett
 * hva `sideTournamentEnabled` sier — og fyrer heller ikke hentingen.
 */
function sideTournamentVisible(bundle: GameBundle | null): boolean {
  if (bundle === null) return false;
  const { game } = bundle;
  return (
    game.status === 'finished' &&
    game.sideTournamentEnabled &&
    gateReason(game) === null
  );
}

/**
 * Defaulten for testene som rendrer kroppen direkte. `settled: true` gjør den
 * til «ferdig, ingenting å hente» — de spillene har ikke sideturnering, så
 * feltet leses aldri, og en «laster evig»-default ville vært en felle.
 */
const NO_SIDE_WINNERS: SideWinnersState = {
  rows: [],
  neverLoaded: true,
  settled: true,
};

/**
 * Hva spilleren får se når motoren ikke kan svare. Alle er rolige: en
 * resultattabell som ikke finnes er ikke en feil spilleren har gjort.
 *
 * INGEN av dem nevner nettsiden. Fram til #1844 delte `unknown-mode` og
 * `missing-config` teksten med den gatede grenen under, og lovet dermed
 * spilleren en nettside-tabell vi ikke vet finnes. De fem årsakene er fem ulike
 * ting, og sier nå hver sin.
 */
const PROBLEM_MESSAGES: Record<ScoringContextProblem, string> = {
  'unknown-mode': UNKNOWN_FORMAT_RESULT_MESSAGE,
  // `mode_config` mangler eller peker på et annet format enn `game_mode`. Det
  // er en mangel ved SELVE runden, ikke ved app-versjonen.
  'missing-config': 'Formatet er ikke satt opp for denne runden.',
  // Wolf og BBB uten valgene: ærlig melding, ALDRI en tabell der hvert hull
  // står uavgjort. Den ville sett like autoritativ ut som en ekte stilling.
  'missing-choices': CHOICES_MISSING_BOARD_TEXT,
  'no-course': 'Banen er ikke satt for denne runden ennå.',
  'no-players': 'Ingen spillere står oppført i runden.',
};

/**
 * Én testID per årsak. Alle fem rendres gjennom det samme kallstedet, så uten
 * denne tabellen kunne en test ikke skille «appen kjenner ikke formatet» fra
 * «banen mangler» — de så like ut for testeren selv etter at tekstene ble delt.
 */
const PROBLEM_TEST_IDS: Record<ScoringContextProblem, string> = {
  'unknown-mode': 'leaderboard-unknown-format',
  'missing-config': 'leaderboard-missing-config',
  'missing-choices': 'leaderboard-missing-choices',
  'no-course': 'leaderboard-no-course',
  'no-players': 'leaderboard-no-players',
};

export function Leaderboard({ route, navigation }: ScreenProps<'Leaderboard'>) {
  const { colors, ui } = useTheme();
  const { userId } = useSession();
  const insets = useSafeAreaInsets();
  // Båndet er skog i begge drakter, så statuslinja over det er lys. Bare mens
  // skjermen er i fokus, ellers blir den hengende på skjermen over (Hole.tsx).
  const focused = useIsFocused();
  const { gameId } = route.params;
  // #2201: «resultatet er klart» er lest når du har sett tavla.
  useMarkVisitRead('gameLeaderboard', gameId);
  const { bundle, loading, refresh, notFound } = useGameBundle(gameId);
  const { scores: localScores, reload } = useLocalScores(gameId, POLL_MS);
  // #2067/#2228: lagets rader følger laget. Uten foldingen mister sideturneringen
  // og den blinde bruttotabellen hullene en trukket kaptein førte.
  const scores = useTeamScores(localScores, bundle);
  // Wolf og BBB henter halve regnestykket fra serveren. Alle andre formater
  // svarer `null` på kilde-spørsmålet og koster ikke et eneste kall — og før
  // bundelen har landet vet vi ikke formatet, så vi spør ikke da heller.
  const { extras, failed: choicesFailed } = useGameChoices(
    gameId,
    bundle?.game.gameMode ?? '',
    // Et avsluttet spill endres ikke: bare til første svar, så ingen polling.
    bundle?.game.status === 'finished' ? null : undefined,
  );
  // Valgene er på vei (første henting går): et hjul, ikke «Fikk ikke tak i
  // valgene», som skal stå bare når hentingen faktisk feilet (#2255 PR 3b).
  const choicesPending =
    bundle != null && choicesNotYetHere(bundle.game.gameMode, extras) && !choicesFailed;
  // LD/CTP-vinnerne. Samme gate som seksjonen selv, så et aktivt spill aldri
  // koster et nettkall for data det uansett ikke får vise.
  const sideWinners = useSideWinners(gameId, sideTournamentVisible(bundle));

  // Samme kanal og samme innhenting som hull-siden (#2228). Feilet hentingen
  // (uten nett), sier en linje det: et sluttresultat fra bare telefonens slag
  // ser ellers ferdig ut (#2255 PR 3a, samme som «Hull for hull»).
  //
  // #2580: lagtavla viser utslagene med «Hvem sitt utslag», hentet på de
  // samme tidspunktene. Uten innstillingen spørres det ikke.
  const minTeeShots = bundle ? teeShotMinimum(bundle.game) : null;
  const teeShots = useTeamTeeShots(gameId, { enabled: minTeeShots != null, pollMs: POLL_MS });
  const { seedFailed } = useScoreCatchUp(gameId, reload, {
    live: true,
    reloadTeeShots: minTeeShots != null ? teeShots.reload : undefined,
  });
  const teeShotRows = minTeeShots != null && teeShots.loaded ? teeShots.rows : null;

  // #2579: tavla (solo) eller lagtavla, når formatet har den og skjermen
  // tegner den. Den samme modellen gir pillen i båndet og stripa nederst.
  const soloFormat = bundle != null && hasSoloBoard(bundle.game);
  const teamFormat = bundle != null && hasTeamBoard(bundle.game);
  const boardFormat = soloFormat || teamFormat;
  const soloBoard = useMemo(
    () => (bundle && soloFormat ? soloBoardFor({ bundle, scores, userId }) : null),
    [bundle, soloFormat, scores, userId],
  );
  const teamBoard = useMemo(
    () => (bundle && teamFormat ? teamBoardFor({ bundle, scores, userId, teeShots: teeShotRows }) : null),
    [bundle, teamFormat, scores, userId, teeShotRows],
  );
  // Lagtavlas linje i båndet regnes fra motoren uten slag: én gang per bundel.
  const teamBand = useMemo(
    () => (bundle && teamFormat ? teamBoardBand(bundle) : null),
    [bundle, teamFormat],
  );
  const pill = (soloBoard ?? teamBoard)?.pill ?? null;
  const pillText = pill?.text ?? null;
  const pillLive = pill?.live ?? false;
  useLayoutEffect(() => {
    if (!bundle || !boardFormat) return;
    const band = teamBand ?? boardBand(bundle);
    navigation.setOptions(
      boardHeader({
        pill: pillText ? { text: pillText, live: pillLive } : undefined,
        kicker: band.kicker,
        title: teamBand ? BOARD_TEAM_TEXT.title : BOARD_TEXT.title,
        subtitle: band.subtitle,
        variant: teamBand ? teamBandVariant(bundle.game) : 'solo',
      }),
    );
  }, [navigation, bundle, boardFormat, teamBand, pillText, pillLive]);
  const [stripHeight, setStripHeight] = useState(STRIP_ESTIMATE);

  if (!bundle || choicesPending) {
    return (
      <View style={ui.centered} testID="leaderboard-loading">
        {boardFormat && focused ? <StatusBar style="light" /> : null}
        {loading || bundle ? (
          <ActivityIndicator color={colors.primary} testID="leaderboard-spinner" />
        ) : (
          <GameLoadFailed notFound={notFound} onRetry={() => void refresh()} />
        )}
      </View>
    );
  }

  const onStripAction = (action: SoloBoardStripAction | null) => {
    if (action?.kind === 'hole') {
      navigation.navigate('Hole', {
        gameId,
        holeNumber: action.holeNumber,
        ...holeHeaderParams(bundle.game, bundle.courseName),
      });
    } else if (action) {
      navigation.navigate('Scorecard', { gameId });
    }
  };

  if (teamFormat) {
    const strip = teamBoard?.strip ?? null;
    return (
      <View style={[styles.screen, { backgroundColor: colors.bg }]}>
        {focused ? <StatusBar style="light" /> : null}
        <ScrollView
          contentContainerStyle={[
            styles.boardScroll,
            // Stripa står i full bredde mot bunnen; ingenting skal havne bak den.
            { paddingBottom: strip ? stripHeight + 12 : STRIP_BOTTOM + insets.bottom },
          ]}
          testID="leaderboard-screen"
        >
          {seedFailed ? (
            <Text style={[ui.muted, styles.boardSeed]} testID="leaderboard-seed-failed">
              {SEED_FAILED_TEXT}
            </Text>
          ) : null}
          <View style={teamBoard ? null : styles.plainBody}>
            <LeaderboardBody
              bundle={bundle}
              scores={scores}
              extras={extras}
              sideWinners={sideWinners}
              teamBoard={teamBoard}
            />
          </View>
        </ScrollView>
        {strip ? (
          <TeamStrip
            strip={strip}
            tabular={teamBoard?.variant !== 'live'}
            bottomInset={insets.bottom}
            onLayout={setStripHeight}
            onAction={() => onStripAction(strip.action)}
          />
        ) : null}
      </View>
    );
  }

  if (boardFormat) {
    const stripBottom = STRIP_BOTTOM + insets.bottom;
    const strip = soloBoard?.strip ?? null;
    return (
      <View style={[styles.screen, { backgroundColor: colors.bg }]}>
        {focused ? <StatusBar style="light" /> : null}
        <ScrollView
          contentContainerStyle={[
            styles.boardScroll,
            // Sideturneringen og «Vis alle» skal ikke havne bak stripa.
            { paddingBottom: strip ? stripHeight + stripBottom + 12 : stripBottom },
          ]}
          testID="leaderboard-screen"
        >
          {/* Båndets siste 8 pt, bak tavleflatens øvre kant (tegningens -8). */}
          <View style={[styles.bandTail, { backgroundColor: colors.surfaceStrong }]} />
          {seedFailed ? (
            <Text style={[ui.muted, styles.boardSeed]} testID="leaderboard-seed-failed">
              {SEED_FAILED_TEXT}
            </Text>
          ) : null}
          <View style={soloBoard ? null : styles.plainBody}>
            <LeaderboardBody
              bundle={bundle}
              scores={scores}
              extras={extras}
              sideWinners={sideWinners}
              soloBoard={soloBoard}
            />
          </View>
        </ScrollView>
        {strip ? (
          <BoardStrip
            strip={strip}
            finished={soloBoard?.variant === 'finished'}
            bottom={stripBottom}
            onLayout={setStripHeight}
            onAction={() => onStripAction(strip.action)}
          />
        ) : null}
      </View>
    );
  }

  return (
    // #1954 D3: formatene uten egen tavle; luften under står over systemlinja.
    <ScrollView contentContainerStyle={[ui.scroll, { paddingBottom: 20 + insets.bottom }]} testID="leaderboard-screen">
      <Text style={ui.title}>{bundle.game.name}</Text>
      <Text style={ui.muted} testID="leaderboard-subtitle">
        {bundle.game.status === 'finished' ? 'Sluttresultat' : 'Slik står det nå'}
      </Text>
      {seedFailed ? (
        <Text style={ui.muted} testID="leaderboard-seed-failed">
          {SEED_FAILED_TEXT}
        </Text>
      ) : null}

      <LeaderboardBody
        bundle={bundle}
        scores={scores}
        extras={extras}
        sideWinners={sideWinners}
      />
    </ScrollView>
  );
}

/**
 * Rekkefølgen på portene er hele poenget: gaten først (et format appen ikke
 * fører, viser den heller ingen tall for), reveal deretter — FØR noe regnes ut
 * — og først til slutt motoren.
 */
export function LeaderboardBody({
  bundle,
  scores,
  extras = {},
  sideWinners = NO_SIDE_WINNERS,
  soloBoard = null,
  teamBoard = null,
}: {
  bundle: GameBundle;
  scores: readonly LocalScore[];
  /** Wolf-/BBB-valgene. Tomt for de elleve formatene som ikke bruker dem. */
  extras?: ScoringExtras;
  /**
   * LD/CTP-vinnerne fra skjermen over. Defaulten lar de mange testene som
   * rendrer kroppen direkte slippe å bry seg — de spillene har ikke
   * sideturnering, og da leses feltet aldri.
   */
  sideWinners?: SideWinnersState;
  /** Tavla (#2579) fra skjermen, eller `null` når formatet ikke har den. */
  soloBoard?: SoloBoardModel | null;
  /** Lagtavla (#2579 PR 2) fra skjermen, med best balls låskort i seg. */
  teamBoard?: TeamBoardModel | null;
}) {
  const { game } = bundle;
  const nameOf = nameLookup(bundle.players);

  // Gaten skiller selv på hva som er stengt — formatet (gjelder alle runder i
  // det formatet) eller nettopp denne runden (cup-halvdeler og avledninger).
  // `gateMessage` er det ene hjemmet for de to ordlydene, delt med føring-CTA-en.
  const gate = gateReason(game);
  if (gate !== null) {
    // Knappen henger på DENNE noten alene (#1891). De to søsknene lenger nede
    // — «Appen kjenner ikke dette formatet ennå» og «Formatet er ikke satt opp
    // for denne runden» — får ingen: der vet vi ikke om nettsiden har svaret.
    return (
      <>
        <CalmNote text={gateMessage(gate)} testID="leaderboard-gated-format" />
        <WebLinkButton
          label={GATE_LINK_LABEL}
          path={gameWebPath(game.id)}
          testID="leaderboard-gated-format-link"
        />
      </>
    );
  }

  // #1954 A3: «Trukne spillere» etter webbens regel per visning (ett hjem:
  // `lib/withdrawnBoard.ts`). Stableford-familien og slagspill har lista på
  // alle stier under, best ball bare når spillet er ferdig.
  const withdrawn = withdrawnOnBoard(game, bundle.players);
  const withdrawnSection = withdrawn.length > 0 ? <WithdrawnPlayers players={withdrawn} /> : null;

  const visibility = leaderboardVisibility(
    game.scoreVisibility,
    game.status,
    game.gameMode as GameMode,
  );

  // Blind runde i et format der nettsiden ikke viser noe: ingenting her
  // heller, ikke engang brutto. Lista per format er `revealActiveTable`
  // (`lib/leaderboard/firstHalfReveal.ts`, #1981).
  if (visibility === 'hidden') {
    return (
      <CalmNote
        text="Resultatet avsløres når runden avsluttes."
        testID="leaderboard-hidden"
      />
    );
  }

  if (visibility === 'gross-only') {
    return (
      <>
        <GrossOnlyTable bundle={bundle} scores={scores} />
        {withdrawnSection}
      </>
    );
  }

  // #1978: best ball viser bare første halvdel mens runden pågår, som webben.
  // Porten og klippet bor i `firstHalfScope` (delt med lagtavla, #2579).
  // Låskortet står i lagtavla alene: en klippet tavle har alltid `teamBoard`,
  // fordi porten åpner bare når et lag har spilt første halvdel, og da har
  // `teamBoardFor` både lag og slag å tegne. Den gamle tabellen under
  // (`ResultView` uten `teamBoard`) nås ikke klippet fra skjermen.
  const scope = firstHalfScope(bundle, scores);
  if (scope.view === 'waiting') {
    return <CalmNote text={FIRST_HALF_WAITING_NOTE} testID="leaderboard-first-half-waiting" />;
  }
  const scopedScores = scope.scores;
  const scopedBundle = scope.bundle;

  const outcome = computeGameLeaderboard(scopedBundle, scopedScores, extras);
  if (!outcome.ok) {
    // Ingen sideturnering her heller: uten et `ModeResult` finnes det ingen
    // fasit for lag-grupperingen, og en gjettet gruppering ville delt ut
    // sidepoengene til feil lag.
    return (
      <CalmNote
        text={PROBLEM_MESSAGES[outcome.problem]}
        testID={PROBLEM_TEST_IDS[outcome.problem]}
      />
    );
  }

  // Pengeoppgjøret (#2221) — null når formatet ikke spiller om penger eller
  // `kr_per_unit` mangler. Samme delte regel som nettsidens resultattavle, så de
  // to kan ikke vise ulike beløp. Det regnes fra resultatet over, altså etter
  // alle portene: en blind runde som pågår har returnert før denne linja.
  // #2561: null i appen ved lansering (rot-`lib/launchRules.ts`). Visningene tegner
  // kortet bare når `settlement` ikke er null, så det gjelder alle formater.
  const settlement = SHOW_KRONER_IN_APP
    ? settlementForResult(outcome.result, game.modeConfig, (unit) => SETTLEMENT_TEXT.units[unit])
    : null;

  // Sideturneringen ligger UNDER hovedresultatet — ikke i en fane som på
  // webben. Matchplay får dermed nøyaktig webbens plassering (der ligger den
  // allerede under duellkortet, #585), og de øvrige formatene en RN-tilpasning
  // av fanen. Appen har ingen fane-primitiv, og #1830-mandatet er
  // native-følelse framfor pikselparitet.
  const sideSection = sideTournamentVisible(bundle) ? (
    <SideTournamentSection
      {...buildSideTournament({
        bundle,
        scores,
        sideWinnerRows: sideWinners.rows,
        result: outcome.result,
      })}
      sideWinnersUnavailable={sideWinners.neverLoaded && sideWinners.settled}
      sideWinnersLoading={!sideWinners.settled}
    />
  ) : null;

  // Bingo Bango Bongo deler ut poeng for prestasjoner, ikke for slag: en bingo
  // kan stå registrert lenge før noen har tastet et tall. Slag-vakten under
  // ville skjult den tabellen bak «ingen slag ført ennå», som er sant og
  // irrelevant. Alle andre formater regner FRA slagene og beholder vakten.
  // Slag-vakten leser den KLIPPEDE lista: en klippet tabell uten slag på de
  // ni første hullene skal si «ingen slag ført ennå», ikke tegne en tabell av
  // bare streker. (I praksis innebærer en åpen port at slagene finnes, men de
  // to må uansett være enige om hvilke slag de snakker om.)
  if (game.gameMode !== 'bingo_bango_bongo' && !hasAnyStroke(scopedScores)) {
    // Sideturneringen henger med: LD/CTP kåres av arrangøren og finnes selv om
    // ingen rakk å føre et slag.
    return (
      <>
        <CalmNote
          text="Ingen slag er ført ennå. Tabellen fyller seg mens dere spiller."
          testID="leaderboard-empty"
        />
        {withdrawnSection}
        {sideSection}
      </>
    );
  }

  return (
    <>
      <ResultView
        result={outcome.result}
        status={game.status}
        gameId={game.id}
        settlement={settlement}
        nameOf={nameOf}
        soloBoard={soloBoard}
        teamBoard={teamBoard}
      />
      {/* #1954 A3: «Trukne spillere» rett under hovedresultatet, som på
          nettsiden, med samme sidemarg som sideturneringen. */}
      {withdrawnSection ? (
        <View style={soloBoard ? styles.boardSide : teamBoard ? styles.teamSide : null}>
          {withdrawnSection}
        </View>
      ) : null}
      {/* Under tavla står sideturneringen 12 pt fra sidene, under lagtavla 16,
          som i tegningene. */}
      {(soloBoard || teamBoard) && sideSection ? (
        <View style={teamBoard ? styles.teamSide : styles.boardSide}>{sideSection}</View>
      ) : (
        sideSection
      )}
    </>
  );
}

/** Reveal-runde som fortsatt går: bruttoslag, ingen plassering, ingen netto. */
function GrossOnlyTable({
  bundle,
  scores,
}: {
  bundle: GameBundle;
  scores: readonly LocalScore[];
}) {
  const lines = grossLines(bundle.players, scores);
  return (
    <View testID="leaderboard-gross-only">
      <CalmNote
        text="Runden spilles blindt. Du ser bruttoslag til arrangøren avslutter."
        testID="leaderboard-reveal-note"
      />
      <LeaderTable
        testID="leaderboard-table"
        columns={[
          { key: 'name', label: 'Navn', flex: 3 },
          { key: 'gross', label: 'Brutto', numeric: true },
          { key: 'holes', label: 'Hull', numeric: true },
        ]}
        rows={lines.map((line) => ({
          key: line.userId,
          cells: [
            line.name,
            line.holesPlayed === 0 ? '—' : line.totalGross,
            line.holesPlayed,
          ],
        }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  boardScroll: { flexGrow: 1 },
  bandTail: { position: 'absolute', top: 0, left: 0, right: 0, height: 8 },
  boardSeed: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  // Notene og tomtilstanden får skjermens vanlige luft (`ui.scroll`).
  plainBody: { padding: 20, gap: 8 },
  boardSide: { marginTop: 12, marginHorizontal: 12 },
  teamSide: { marginTop: 12, marginHorizontal: 16 },
});
