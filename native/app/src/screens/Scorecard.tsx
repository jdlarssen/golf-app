// Native N3 (#1825): scorekortet — webbens Layout A speilet, pluss lever-porten.
//
// Tabellen er ren visning av lokale tall: par per tee-kjønn, SI, slag og netto
// (netto = slag − tildelte slag fra delt `strokesForHole`).
//
// Lever-knappen har webbens to porter, og de er ikke pynt:
//  1. **Kø-vakta (#668/#1370):** vi drainer først, og blokkerer så lenge køen
//     har elementer for DETTE spillet. Leverer man med usynkede slag, fryser
//     RLS kortet og avviser skrivingen; drainen setter elementet i karantene
//     (#2211, `interpretUpsertReply`), men slaget kommer uansett ikke fram.
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
// #2262: kortet er et klassisk scorekort — UT og INN med HULL, PAR, SLAG og så
// POENG (stableford-familien) eller NETTO — med summene i store tall under, og
// et stempel når kortet er levert. Tallene er de samme radene som før
// (`buildScorecardRows`, som følger motoren), delt i halvdeler av den delte
// `buildScorecardGrid`. Et reveal-spill som pågår, viser bare SLAG og BRUTTO:
// netto er det reveal holder tilbake. Leveringsdelen under er uendret.
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { GameStatus } from '../../../../lib/games/status';
import { revealState, shouldHideNetto, type ScoreVisibility } from '../../../../lib/games/visibility';
import { nameInitials } from '../../../../lib/names/initials';
import { buildScorecardGrid, stablefordPointsFnFor } from '../../../../lib/scorecard/scorecardGrid';
import { resolveScorecardStamp, type StampPlayer } from '../../../../lib/scorecard/scorecardStamp';
import type { GameMode, ScoringGender } from '../../../../lib/scoring/modes/types';
import { modeCollapsesToTeamCard } from '../../../../lib/scoring/modes/types';
import { isActiveForGame } from '../../../../lib/sync/queueScope';
import {
  ScorecardGrid,
  type EnteredByName,
  type ScorecardRowKind,
} from '../components/scorecard/ScorecardGrid';
import { ScorecardHeader } from '../components/scorecard/ScorecardHeader';
import { ScorecardStamp } from '../components/scorecard/ScorecardStamp';
import { ScorecardTotals } from '../components/scorecard/ScorecardTotals';
import type { BundlePlayer } from '../data/gameBundle';
import { getDb, listQueue } from '../data/db';
import { seedGameScores } from '../data/seedScores';
import { submitCard } from '../data/submitCard';
import { drainQueue } from '../data/syncWorker';
import { describeSubmitFailure } from '../lib/actionFeedback';
import { isScoringSupported } from '../lib/formatGate';
import { nameLookup } from '../lib/leaderboardModel';
import {
  deliverForButton,
  findInRoster,
  flightDeliveryButton,
  flightDeliveryFor,
  flightDeliveryLines,
  partialDeliveryNotice,
  toRoster,
} from '../lib/roster';
import { reopenHint } from '../lib/rosterCopy';
import { scorecardHandicapPart, scorecardHeaderLine } from '../lib/scorecardHeader';
import { buildScorecardRows } from '../lib/scorecardRows';
import { computeGameLeaderboard } from '../lib/scoringContext';
import {
  buildTeamCards,
  findMyTeamCard,
  myTeamCaptainId,
  teamHandicapFor,
} from '../lib/teamPlay';
import { useGameBundle, useLocalScores, useTeamScores } from '../lib/useGameData';
import type { ScreenProps } from '../navigation';
import { useSession } from '../session';
import { useTheme } from '../theme';

const HOLE_COUNT = 18;
const QUEUE_POLL_MS = 1500;

/** Rosteret i formen den delte stempel-regelen leser. */
function toStampPlayers(players: readonly BundlePlayer[]): StampPlayer[] {
  return players.map((player) => ({
    user_id: player.userId,
    flight_number: player.flightNumber,
    withdrawn_at: player.withdrawnAt,
    submitted_at: player.submittedAt,
    submitted_by_user_id: player.submittedByUserId,
    approved_at: player.approvedAt,
    approved_by_user_id: player.approvedByUserId ?? null,
    name: player.name,
    nickname: player.nickname,
  }));
}

export function Scorecard({ route, navigation }: ScreenProps<'Scorecard'>) {
  const { ui } = useTheme();
  const { gameId } = route.params;
  const { userId } = useSession();
  const { bundle, refresh } = useGameBundle(gameId);
  const { scores: localScores, reload } = useLocalScores(gameId);
  // #2067: hullene en trukket kaptein førte, teller for laget. Foldes inn før
  // noe annet leser slagene.
  const scores = useTeamScores(localScores, bundle);
  const [queued, setQueued] = useState(0);
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [noticeText, setNoticeText] = useState<string | null>(null);

  const refreshQueue = useCallback(async () => {
    const db = await getDb();
    const items = await listQueue(db);
    setQueued(items.filter((item) => isActiveForGame(item, gameId)).length);
  }, [gameId]);

  // Drain først (port 1), les så både køen og serververdiene. Rekkefølgen er
  // hele poenget: slagene skal ut FØR kortet kan fryses. Kjeden kjører hver
  // gang skjermen får fokus (#2220): «Rediger hullene» legger hullene oppå et
  // scorekort som står montert, og kommer spilleren tilbake etter å ha rettet
  // et hull, skal kortet vise det nye tallet før det leveres.
  useFocusEffect(
    useCallback(() => {
      void drainQueue('lever')
        .catch(() => undefined)
        .then(() => refreshQueue())
        .then(() => seedGameScores(gameId).catch(() => undefined))
        .then(() => reload());
    }, [gameId, refreshQueue, reload]),
  );

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
    game: bundle.game,
    viewerId: userId,
    teamOwnerId: myCaptainId,
    teeGender: me.player.teeGender as ScoringGender,
    courseHandicap,
    teamNumber: myTeamCard?.teamNumber ?? me.player.teamNumber,
    leaderboard,
  });
  const missing = HOLE_COUNT - totals.playedHoles;

  // #2262: kortet. POENG i stableford-familien, NETTO ellers — og ingen av dem
  // i et reveal-spill som pågår.
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
    teeGender: me.player.teeGender,
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
  });

  const canSubmit =
    bundle.game.status === 'active' &&
    me.submitted_at == null &&
    me.withdrawn_at == null &&
    isScoringSupported(bundle.game);

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
  const gridRows: ScorecardRowKind[] = [
    'strokes',
    ...valueRows,
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

  const onSubmitPress = () => {
    if (queued > 0 || busy) return;
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
    if (queued > 0 || busy) return;
    void doSubmit();
  };

  // Under et stempel sier «Kortet er levert» seg selv (#2262); da står bare
  // veien videre for en runde som pågår (#2220).
  const readonlyText =
    me.submitted_at == null
      ? 'Kortet kan ikke leveres herfra nå.'
      : stamp != null
        ? bundle.game.status === 'active'
          ? reopenHint(bundle.game.createdBy === userId)
          : null
        : bundle.game.status === 'active'
          ? `Kortet er levert. Dette er lesevisning. ${reopenHint(bundle.game.createdBy === userId)}`
          : 'Kortet er levert. Dette er lesevisning.';

  const queueGuard =
    queued > 0 ? (
      <Text style={ui.muted} testID="queue-guard">
        {queued} slag venter på å bli sendt. Knappen åpner når de er framme.
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
    <ScrollView contentContainerStyle={ui.scroll} testID="scorecard-screen">
      <ScorecardHeader
        kicker={
          teamMode
            ? `Lagets scorekort${myTeamCard?.label ? ` · ${myTeamCard.label}` : ''}`
            : 'Mitt scorekort'
        }
        title={bundle.game.name}
        line={headerLine}
      />

      <ScorecardGrid grid={grid} rows={gridRows} enteredBy={enteredBy} />
      {showEnteredBy ? (
        <Text style={ui.muted} testID="scorecard-entered-by-note">
          Initialene viser hvem som førte hvert hull.
        </Text>
      ) : null}

      <ScorecardTotals
        totals={grid.totals}
        showNet={valueRows.includes('net')}
        showPoints={valueRows.includes('points')}
      />

      {stamp ? <ScorecardStamp stamp={stamp} ownerFullName={me.player.name} /> : null}

      {canSubmit ? (
        <>
          {/* Står også mens kø-vakta holder lever-knappen igjen: det er lov å
              rette mens slagene synker. Avstanden ned til lever-knappen er
              minst 24 pt (#1793), for de to knappene gjør det motsatte. */}
          <Pressable
            style={[ui.buttonSecondary, styles.editButton]}
            onPress={() => navigation.navigate('Hole', { gameId, holeNumber: 1 })}
            testID="scorecard-edit"
          >
            <Text style={ui.buttonSecondaryText}>Rediger hullene</Text>
          </Pressable>
          {flightBlock}
          {queueGuard}
          <Pressable
            style={[ui.button, (queued > 0 || busy) && styles.buttonDisabled]}
            onPress={onSubmitPress}
            disabled={queued > 0 || busy}
            testID={
              teamMode
                ? 'submit-team-card'
                : flightMates.length > 0
                  ? 'submit-flight'
                  : 'submit-scorecard'
            }
          >
            <Text style={ui.buttonText}>
              {busy
                ? 'Leverer …'
                : queued > 0
                  ? 'Synker slag …'
                  : teamMode
                    ? 'Lever lagets kort'
                    : flightMates.length > 0
                      ? flightDeliveryButton(flightMates)
                      : 'Lever scorekort'}
            </Text>
          </Pressable>
        </>
      ) : (
        <>
          {readonlyText ? (
            <Text
              style={[ui.muted, stamp ? styles.centered : null]}
              testID="scorecard-readonly"
            >
              {readonlyText}
            </Text>
          ) : null}
          {canDeliverForFlight ? (
            <>
              {flightBlock}
              {queueGuard}
              <Pressable
                style={[ui.button, (queued > 0 || busy) && styles.buttonDisabled]}
                onPress={onDeliverForPress}
                disabled={queued > 0 || busy}
                testID="deliver-for-flight"
              >
                <Text style={ui.buttonText}>
                  {busy
                    ? 'Leverer …'
                    : queued > 0
                      ? 'Synker slag …'
                      : deliverForButton(flightMates)}
                </Text>
              </Pressable>
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
  );
}

const styles = StyleSheet.create({
  // Under stempelet står linjene midtstilt, og veien videre står sammen med dem.
  centered: { textAlign: 'center' },
  buttonDisabled: { opacity: 0.5 },
  // Med skjermens `gap` (8) og lever-knappens `marginTop` (8) blir det 32 pt
  // ned til lever-knappen, over kravet på 24.
  editButton: { marginBottom: 16 },
});
