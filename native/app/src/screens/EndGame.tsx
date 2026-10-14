// native/app/src/screens/EndGame.tsx
// Native N6c (#1856): arrangørens avslutt-flate. Tegnet om etter
// designlerretet i #2578 (rad 69 «Arrangøren avslutter runden»).
//
// **Egen skjerm, ikke en knapp på spill-hjem.** Flippen er praktisk
// irreversibel for arrangøren (gjenåpning er admin-only på nettsiden), og
// husregelen er at noe som ikke kan angres får sin egen bekreftelses-flate.
// Her er den også en arbeidsflate: manglene kvitteres ut og LD/CTP kåres før
// knappen i det hele tatt blir aktiv.
//
// **To steg i samme skjerm (#2578).** Lista viser bare det som stopper
// avslutningen, med handlingen rett under navnet, og knappen nederst sier hva
// den venter på. «Avslutt runden» åpner bekreft-steget: en egen side med det
// som lagres og det som skjer etterpå, før noe låses. Steget er tilstand og
// ikke en ny rute, så haker og vinnere følger med begge veier. Tilbake fra
// bekreft-steget (pila, sveip, Android-tilbake) går til lista
// (`usePreventRemove`).
//
// **Reglene er ikke her.** Hvem som blokkerer, hva knappen krever og hva som
// lagres, regnes ut av `lib/endGamePlan.ts`; tekstene bor i
// `lib/endGameCopy.ts`; selve skrivingene bor i `data/endGame.ts`, som har RLS
// bak seg. Planen og skrivingen leser sperren fra `lib/games/finishGate.ts`, den
// samme som webbens `endGameCore` bruker. Skjermen er montering.
//
// **Manglende godkjenning har ingen vei rundt** — men den har en vei
// GJENNOM (#1891). Arrangøren godkjenner med den samme `approveScorecard` som
// spillerne bruker. Siden #2215 går den via scorekort-ruta, som gir arrangøren
// `organizer`-rollen når hen ikke står i flighten og sender
// `scorecard_approved`-varselet til spilleren, slik webbens overstyring
// (`adminApproveScorecard`) gjør. Det som fortsatt IKKE finnes er en vei rundt:
// kortet må godkjennes, av en medspiller eller av arrangøren.
//
// **Purringen er den ikke-destruktive utveien (#1889).** Manglet noen kort, var
// eneste knapp «marker som trukket» — en destruktiv handling presentert som
// eneste alternativ. Purringen krever Node (`notify()`, Resend, push), så den
// bor på serveren; skjermen spør `/api/games/{id}/remind` via `data/remind.ts`
// og viser svaret. Regelen om HVEM som purres speiles aldri her.
import { usePreventRemove } from '@react-navigation/native';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { GameMode } from '../../../../lib/scoring/modes/types';
import { WinnerSheet } from '../components/endGame/WinnerSheet';
import { ChevronIcon, HakeIcon, LaasIcon } from '../components/icons/Icons';
import { kickerHeader } from '../components/KickerHeader';
import { PageTitle } from '../components/PageTitle';
import { WebLinkButton } from '../components/WebLinkButton';
import { finishRound } from '../data/endGame';
import type { BundlePlayer } from '../data/gameBundle';
import { approveScorecard } from '../data/playerActions';
import { fetchOwnProfile } from '../data/profile';
import {
  fetchReminderPreview,
  sendReminder,
  type UnremindableCounts,
  type ReminderPreview,
} from '../data/remind';
import { withdrawSelf } from '../data/withdrawSelf';
import { describeFailure } from '../lib/actionFeedback';
import { displayName, formatClock } from '../lib/display';
import {
  allDeliveredLine,
  approveConfirmBody,
  approveOnBehalfLabel,
  countHeading,
  CUP_LINK_LABEL,
  CUP_NOTE,
  cupWebPath,
  describeEndRoundFailure,
  describeReminderFailure,
  describeReminderPreviewFailure,
  END_GAME_TEXT,
  endGameKicker,
  nameList,
  ofTotal,
  opensWhenNote,
  ownRowHint,
  progressLine,
  REMIND_BUSY_LABEL,
  REMIND_DONE_NOTE,
  remindLabel,
  reminderNote,
  reopenNote,
  resultLine,
  slotLabel,
  slotRowLabel,
  titleSubtitle,
  unremindableNotes,
} from '../lib/endGameCopy';
import {
  activeChoices,
  buildFinishPlan,
  canFinish,
  confirmSummary,
  deliveryCounts,
  finishBlockers,
  returnsToList,
  toSideWinners,
  winnerCandidates,
  withdrawUserIds,
  NO_WINNER,
  type FinishPlan,
  type FinishSlot,
} from '../lib/endGamePlan';
import { ownCardApproval, submittedLabel, toRoster } from '../lib/roster';
import {
  describeSelfWithdrawFailure,
  WITHDRAW_SELF,
} from '../lib/rosterCopy';
import { useGameBundle } from '../lib/useGameData';
import { useMarkVisitRead } from '../lib/useMarkVisitRead';
import type { ScreenProps } from '../navigation';
import { useSession } from '../session';
import { FONTS, fraunces, interLine, TAP, useTheme } from '../theme';

/**
 * Hvor en melding hører hjemme (#2578): rett under godkjenn-knappen til den
 * spilleren, rett under «Trekk meg», over knappen på bekreft-steget, eller over
 * den grå knappen når et avslag sendte skjermen tilbake til lista.
 */
type NoticeAt = `approve:${string}` | 'withdraw-self' | 'confirm' | 'list';

export function EndGame({ route, navigation }: ScreenProps<'EndGame'>) {
  const { colors, scheme, ui } = useTheme();
  const { gameId } = route.params;
  // #2203: «Alle har levert» og påminnelsen om et spill som står stille lenker
  // til avslutt-siden; her i appen er det denne skjermen, så de er lest.
  useMarkVisitRead('gameFinish', gameId);
  const { userId } = useSession();
  const { bundle, loading, refresh } = useGameBundle(gameId);

  const [acknowledged, setAcknowledged] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; at: NoticeAt } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [sheetSlot, setSheetSlot] = useState<FinishSlot | null>(null);
  const isAdmin = useIsAdmin(userId);

  // Bekreft-steget: pila, sveip tilbake og Android-tilbake går til lista i
  // stedet for å forlate skjermen. `replace` til tavla er også en fjerning, så
  // suksess-stien slipper gjennom her. Sjekken MÅ stå i tilbakekallet: hooken
  // leser `confirming` fra siste render, og ingen ny render skjer mellom
  // `leavingRef.current = true` og `replace`. Core merker handlingen, så den
  // ikke fanges igjen når den sendes på nytt.
  const leavingRef = useRef(false);
  usePreventRemove(confirming, ({ data }) => {
    if (leavingRef.current) navigation.dispatch(data.action);
    else setConfirming(false);
  });

  const game = bundle?.game ?? null;
  const kicker = !game
    ? ''
    : game.tournamentId !== null || game.status !== 'active'
      ? game.name
      : endGameKicker(
          game.name,
          confirming ? (bundle?.courseName ?? null) : END_GAME_TEXT.kickerActive,
        );
  const backLabel = confirming ? END_GAME_TEXT.backToList : END_GAME_TEXT.backToGame;
  useLayoutEffect(() => {
    navigation.setOptions(kickerHeader(kicker, END_GAME_TEXT.heading, { backLabel }));
  }, [navigation, kicker, backLabel]);

  const toggle = useCallback((playerUserId: string) => {
    setNotice(null);
    setAcknowledged((prev) => {
      const next = new Set(prev);
      if (!next.delete(playerUserId)) next.add(playerUserId);
      return next;
    });
  }, []);

  /**
   * Kjør avslutningen.
   *
   * `alreadyFinished: true` er SUKSESS, ikke et avslag: runden ER avsluttet —
   * nettsiden eller en annen enhet rakk flippen først. Samme semantikk som
   * `alreadyRunning` i starten (#502). Begge veier ender på resultatskjermen,
   * og `replace` gjør at «tilbake» ikke lander på en avslutt-flate for en runde
   * som alt er lukket.
   *
   * Avslagene som betyr at lista er utdatert ({@link returnsToList}: et
   * avkrysset kort kom inn, #1896, eller en valgt vinner trakk seg, #2284)
   * henter bundelen på nytt og sender skjermen tilbake til lista, med
   * setningen over den grå knappen. Uten en refetch ville arrangøren stått
   * fast i samme avslag ved hvert nye trykk — skjermen mister aldri fokus. Et
   * valg som pekte på en som trakk seg, faller bort av seg selv
   * ({@link activeChoices}): sloten står tom og knappen er grå til arrangøren
   * velger på nytt.
   */
  const finish = useCallback(
    async (plan: FinishPlan, players: readonly BundlePlayer[]) => {
      setBusy(true);
      setNotice(null);
      try {
        const result = await finishRound(gameId, {
          allowMissing: plan.missing.length > 0,
          withdrawUserIds: withdrawUserIds(plan, acknowledged),
          sideWinners: toSideWinners(
            plan.slots,
            activeChoices(choices, winnerCandidates(plan, acknowledged)),
          ),
        });
        if (result.ok) {
          leavingRef.current = true;
          navigation.replace('Leaderboard', { gameId });
          return;
        }
        const text = describeEndRoundFailure(
          result.reason,
          namesFor(players, result.blockedUserIds),
        );
        if (returnsToList(result.reason)) {
          await refresh();
          setConfirming(false);
          setNotice({ text, at: 'list' });
          return;
        }
        setNotice({ text, at: 'confirm' });
      } catch {
        setNotice({ text: describeEndRoundFailure('db'), at: 'confirm' });
      } finally {
        setBusy(false);
      }
    },
    [acknowledged, choices, gameId, navigation, refresh],
  );

  /**
   * «Trekk meg» — arrangøren trekker seg selv fra avslutt-flaten (#1917).
   *
   * Fram til nå sto det en lenke til nettsiden her: `withdrawn_at` på egen rad
   * er sperret av `guard_game_players_self_update` vakt (c) (0147/0168), så
   * appen kan ikke skrive frafallet selv. Den spør
   * `/api/games/[id]/withdraw-self`, som kaller samme kjerne som nettsiden.
   *
   * `refresh()` uansett utfall: gikk frafallet gjennom, skal raden forsvinne fra
   * «mangler kort»-lista, og gikk det ikke, er lista på skjermen utdatert.
   * Derfor leses ikke `kept` fra svaret — bundelen er fasiten.
   */
  const withdrawMe = useCallback(async () => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await withdrawSelf(gameId);
      if (!result.ok) {
        setNotice({ text: describeSelfWithdrawFailure(result.reason), at: 'withdraw-self' });
      }
    } catch {
      setNotice({ text: describeSelfWithdrawFailure('withdraw_failed'), at: 'withdraw-self' });
    } finally {
      setBusy(false);
      await refresh();
    }
  }, [gameId, refresh]);

  /**
   * Godkjenn en medspillers kort på vegne av gruppa (#1891).
   *
   * Ingen egen regel: dette er `approveScorecard` slik spilleren selv bruker
   * den. Siden #2215 går den via scorekort-ruta, og rutas port er fasiten: den
   * slipper arrangøren gjennom på andres rad, og kjernens UPDATE-filter
   * (`submitted_at not null`, `approved_at is null`) sørger for at et ULEVERT
   * kort aldri kan godkjennes herfra. Ruta sender `scorecard_approved` til
   * spilleren, som webbens overstyring gjør.
   *
   * `refresh()` kjøres uansett utfall. Ble kortet godkjent, skal kortet
   * forsvinne; ble det avvist, er lista på skjermen utdatert og en ny henting
   * er nettopp det som gjør avslaget forståelig.
   */
  const approve = useCallback(
    async (player: BundlePlayer) => {
      setBusy(true);
      setNotice(null);
      const at: NoticeAt = `approve:${player.userId}`;
      try {
        // `alreadyDone: true` er suksess, ikke et avslag: kortet ER godkjent —
        // en medspiller rakk det først. Samme semantikk som `alreadyFinished`.
        const result = await approveScorecard(gameId, player.userId);
        const text = describeFailure(result);
        setNotice(text ? { text, at } : null);
      } catch {
        setNotice({ text: describeEndRoundFailure('db'), at });
      } finally {
        setBusy(false);
        await refresh();
      }
    },
    [gameId, refresh],
  );

  if (!bundle || !game) {
    return (
      <View style={ui.centered} testID={loading ? 'end-game-loading' : 'end-game-error'}>
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Text style={ui.error}>{END_GAME_TEXT.loadFailed}</Text>
        )}
      </View>
    );
  }

  // Cup-runder eies av cup-flyten på nettsiden: den avslutter kampene som hører
  // sammen og demper per-spill-varslene. En app-flipp ville gått utenom begge.
  // Datamodulen avviser dem uansett; her slipper arrangøren å trykke først.
  if (game.tournamentId !== null) {
    return (
      <ScrollView
        style={{ backgroundColor: colors.bg }}
        contentContainerStyle={styles.scroll}
        testID="end-game-screen"
      >
        <TitleBlock title={END_GAME_TEXT.heading} />
        <Card style={styles.stateCard}>
          <Text style={[styles.body14, { color: colors.text }]} testID="end-game-cup-note">
            {CUP_NOTE}
          </Text>
          <WebLinkButton
            label={CUP_LINK_LABEL}
            path={cupWebPath(game.tournamentId)}
            testID="end-game-cup-link"
          />
        </Card>
      </ScrollView>
    );
  }

  if (game.status !== 'active') {
    return (
      <ScrollView
        style={{ backgroundColor: colors.bg }}
        contentContainerStyle={styles.scroll}
        testID="end-game-screen"
      >
        <TitleBlock title={END_GAME_TEXT.heading} />
        <Card style={styles.stateCard}>
          <Text style={[styles.body14, { color: colors.text }]} testID="end-game-not-active">
            {game.status === 'finished'
              ? END_GAME_TEXT.alreadyFinished
              : END_GAME_TEXT.notActive}
          </Text>
        </Card>
      </ScrollView>
    );
  }

  const plan = buildFinishPlan(bundle, userId);
  // #2284: bare valg som peker på en som kan kåres, teller. En vinner som trakk
  // seg etter at hen ble valgt, er borte fra velgeren etter neste henting, og
  // en som er huket av for frafall her, er borte med én gang. Valget skal ikke
  // stå usynlig igjen og sendes ved neste trykk.
  const candidates = winnerCandidates(plan, acknowledged);
  const liveChoices = activeChoices(choices, candidates);
  const blockers = finishBlockers(plan, acknowledged, liveChoices);
  // Sperren er `canFinish`; `blockers` gir bare linja under knappen. Begge
  // leser `finishBlockers`, så de kan ikke bli uenige.
  const ready = canFinish(plan, acknowledged, liveChoices);

  if (confirming) {
    const summary = confirmSummary(plan, acknowledged, liveChoices);
    return (
      <ConfirmStep
        resultText={resultLine(summary.resultCount, summary.deliveredCount)}
        rows={[
          ...summary.winners.map((row) => ({
            key: row.slot.key,
            label: slotLabel(row.slot),
            value: row.winner ? displayName(row.winner) : END_GAME_TEXT.noQualified,
          })),
          ...(summary.withdrawn.length > 0
            ? [
                {
                  key: 'withdrawn',
                  label: END_GAME_TEXT.withdrawnLabel,
                  value: nameList(summary.withdrawn.map(displayName)),
                },
              ]
            : []),
          ...(summary.noCard.length > 0
            ? [
                {
                  key: 'no-card',
                  label: END_GAME_TEXT.noCardRowLabel,
                  value: nameList(summary.noCard.map(displayName)),
                },
              ]
            : []),
        ]}
        isAdmin={isAdmin}
        busy={busy}
        notice={notice?.at === 'confirm' ? notice.text : null}
        onConfirm={() => void finish(plan, bundle.players)}
        onCancel={() => {
          setNotice(null);
          setConfirming(false);
        }}
      />
    );
  }

  const counts = deliveryCounts(plan);
  const allIn = plan.missing.length === 0 && plan.unapproved.length === 0;
  const noticeFor = (at: NoticeAt) =>
    notice?.at === at ? (
      <Text style={[styles.notice, { color: colors.danger }]} testID="end-game-notice">
        {notice.text}
      </Text>
    ) : null;

  const deliveries = expanded ? (
    <View style={styles.deliveries} testID="end-game-delivery">
      {plan.active.map((player) => (
        <View
          key={player.userId}
          style={[styles.deliveryRow, { borderTopColor: allIn ? colors.onStrong : colors.divider }]}
        >
          <Text style={[styles.deliveryName, { color: allIn ? colors.onStrong : colors.text }]}>
            {displayName(player)}
            {player.userId === userId ? ` ${END_GAME_TEXT.you}` : ''}
          </Text>
          <Text
            style={[styles.deliveryStatus, { color: allIn ? colors.onStrong : colors.muted }]}
            testID={`end-game-status-${player.userId}`}
          >
            {statusFor(player, plan.requirePeerApproval, bundle.players)}
          </Text>
        </View>
      ))}
    </View>
  ) : null;

  // Tegningen har 2 pt ekstra over knappen i fremdriftskortet, ikke i det sterke.
  const toggleDeliveries = (ink: string, border: string) => (
    <Pressable
      onPress={() => setExpanded((open) => !open)}
      style={[
        styles.outlinePill,
        styles.deliveriesButton,
        !allIn && styles.deliveriesButtonGap,
        { borderColor: border },
      ]}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      testID="end-game-deliveries-toggle"
    >
      <Text style={[styles.pillText14, { color: ink }]}>
        {expanded ? END_GAME_TEXT.hideDeliveries : END_GAME_TEXT.showDeliveries}
      </Text>
      <ChevronIcon color={ink} size={14} strokeWidth={2} up={expanded} />
    </Pressable>
  );

  const anyWithdrawable = plan.missing.some((entry) => entry.withdrawable);
  const ownMissing = plan.missing.some((entry) => entry.player.userId === userId);
  const ownUnapproved = plan.unapproved.some((player) => player.userId === userId);

  return (
    <View style={[styles.fill, { backgroundColor: colors.bg }]}>
      <BottomBarLayout
        bar={
          <>
            {noticeFor('list')}
            <Pressable
              style={[
                styles.submit,
                ready
                  ? { backgroundColor: colors.primary }
                  : {
                      // Tegningens `--off`: `surface2` i lys, `surface` i natt.
                      backgroundColor: scheme === 'dark' ? colors.surface : colors.surface2,
                      borderWidth: 1,
                      borderColor: colors.border,
                    },
              ]}
              disabled={!ready || busy}
              accessibilityRole="button"
              accessibilityState={{ disabled: !ready || busy }}
              testID="end-game-submit"
              onPress={() => {
                setNotice(null);
                setConfirming(true);
              }}
            >
              <Text style={[styles.submitText, { color: ready ? colors.onPrimary : colors.muted }]}>
                {END_GAME_TEXT.submit}
              </Text>
            </Pressable>
            <Text style={[styles.barHint, { color: colors.muted }]} testID="end-game-submit-hint">
              {ready
                ? END_GAME_TEXT.submitHint
                : opensWhenNote(
                    {
                      unapproved: blockers.unapproved.map(displayName),
                      unacknowledged: blockers.unacknowledged.map(displayName),
                      winnersOpen: blockers.winnersOpen,
                    },
                    plan.slots.length,
                  )}
            </Text>
          </>
        }
      >
        <TitleBlock
          title={END_GAME_TEXT.heading}
          subtitle={titleSubtitle(bundle.courseName, plan.active.length)}
        />

        {allIn ? (
          <View
            style={[styles.strong, { backgroundColor: colors.surfaceStrong }]}
            testID="end-game-all-ready"
          >
            <View style={styles.strongKickerRow}>
              <HakeIcon color={colors.live} size={14} strokeWidth={2.5} />
              <Text style={[styles.strongKicker, { color: colors.onStrong }]}>
                {END_GAME_TEXT.allIn}
              </Text>
            </View>
            <Text style={[styles.strongCount, { color: colors.onStrong }]}>
              {allDeliveredLine(counts.total)}
            </Text>
            <Text style={[styles.strongBody, { color: colors.onStrong }]}>
              {END_GAME_TEXT.allReady}
            </Text>
            {toggleDeliveries(colors.onStrong, colors.onStrong)}
            {deliveries}
          </View>
        ) : (
          <Card style={styles.progress} testID="end-game-progress">
            <View style={styles.progressHead}>
              <Text style={[styles.progressLabel, { color: colors.text }]}>
                {END_GAME_TEXT.deliveredHeading}
              </Text>
              <Text style={[styles.progressCount, { color: colors.text }]}>
                {`${counts.delivered} `}
                <Text style={[styles.progressTotal, { color: colors.muted }]}>
                  {ofTotal(counts.total)}
                </Text>
              </Text>
            </View>
            <View style={[styles.track, { backgroundColor: colors.trackBg }]}>
              <View
                style={[
                  styles.track,
                  {
                    backgroundColor: colors.primary,
                    width: `${counts.total > 0 ? (counts.delivered / counts.total) * 100 : 0}%`,
                  },
                ]}
              />
            </View>
            <Text style={[styles.progressLine, { color: colors.muted }]}>
              {progressLine(counts, plan.requirePeerApproval)}
            </Text>
            {toggleDeliveries(colors.primary, colors.primary)}
            {deliveries}
          </Card>
        )}

        {plan.unapproved.length > 0 ? (
          <View testID="end-game-unapproved">
            <SectionHeading
              text={countHeading(END_GAME_TEXT.unapprovedHeading, plan.unapproved.length)}
              color={colors.scoreOver1Fg}
              below={8}
            />
            <View style={styles.stack}>
              {plan.unapproved.map((player) => {
                const own = player.userId === userId;
                return (
                  <Card key={player.userId} style={styles.approveCard}>
                    <View style={styles.approveHead}>
                      <View style={[styles.dot, { backgroundColor: colors.scoreOver1Fg }]} />
                      <View style={styles.grow}>
                        <Text style={[styles.name15, { color: colors.text }]}>
                          {displayName(player)}
                        </Text>
                        <Text style={[styles.sub12, { color: colors.muted }]}>
                          {statusFor(player, plan.requirePeerApproval, bundle.players)}
                        </Text>
                      </View>
                    </View>
                    {/* Egen rad får ingen knapp. `guard_game_players_self_update`
                        nekter enhver spiller å sette godkjenning på sitt eget
                        kort, så knappen kunne bare feilet. #2200: leverte eneste
                        makker kortet mitt, kan ingen godkjenne det, og «be en
                        medspiller» ville vært en blindvei. Da står veien ut i
                        stedet, som på nettsidens avslutt-side. */}
                    {own ? (
                      ownCardApproval(
                        toRoster(bundle.players),
                        game.gameMode as GameMode,
                        userId,
                      ) === 'own_card_no_peer' ? (
                        <Text
                          style={[styles.sub13, { color: colors.muted }]}
                          testID="end-game-own-card-no-peer"
                        >
                          {END_GAME_TEXT.ownCardNoPeer}
                        </Text>
                      ) : (
                        <Text
                          style={[styles.sub13, { color: colors.muted }]}
                          testID="end-game-own-card-needs-peer"
                        >
                          {END_GAME_TEXT.ownCardNeedsPeer}
                        </Text>
                      )
                    ) : (
                      <Pressable
                        style={[
                          styles.outlinePill,
                          { borderColor: colors.primary, backgroundColor: colors.surface },
                        ]}
                        disabled={busy}
                        accessibilityRole="button"
                        accessibilityLabel={approveOnBehalfLabel(displayName(player))}
                        accessibilityState={{ disabled: busy }}
                        testID={`end-game-approve-${player.userId}`}
                        onPress={() =>
                          Alert.alert(
                            END_GAME_TEXT.approveOnBehalf,
                            approveConfirmBody(displayName(player)),
                            [
                              { text: END_GAME_TEXT.cancel, style: 'cancel' },
                              {
                                text: END_GAME_TEXT.approveConfirmCta,
                                onPress: () => void approve(player),
                              },
                            ],
                          )
                        }
                      >
                        <Text style={[styles.pillText14, { color: colors.primary }]}>
                          {END_GAME_TEXT.approveOnBehalf}
                        </Text>
                      </Pressable>
                    )}
                    {noticeFor(`approve:${player.userId}`)}
                  </Card>
                );
              })}
            </View>
            {ownUnapproved && plan.unapproved.length === 1 ? null : (
              <View style={styles.noteBox}>
                <Text style={[styles.note13, { color: colors.muted }]}>
                  {END_GAME_TEXT.unapprovedNote}
                </Text>
              </View>
            )}
          </View>
        ) : null}

        {plan.missing.length > 0 ? (
          <>
            <SectionHeading
              text={countHeading(END_GAME_TEXT.missingHeading, plan.missing.length)}
              color={colors.muted}
              below={4}
            />
            <View style={styles.introBox}>
              <Text style={[styles.intro13, { color: colors.muted }]}>
                {END_GAME_TEXT.missingIntro}
              </Text>
            </View>
            <View style={styles.stack}>
              {plan.missing.map((entry) => (
                <View key={entry.player.userId}>
                  <CheckRow
                    label={displayName(entry.player)}
                    action={
                      entry.withdrawable
                        ? END_GAME_TEXT.withdrawLabel
                        : END_GAME_TEXT.noCardLabel
                    }
                    checked={acknowledged.has(entry.player.userId)}
                    disabled={busy}
                    testID={`end-game-check-${entry.player.userId}`}
                    onPress={() => toggle(entry.player.userId)}
                  />
                  {entry.player.userId === userId ? (
                    <View style={styles.ownHintBox}>
                      <Text style={[styles.hint12, { color: colors.muted }]}>
                        {ownRowHint(plan.withdrawalSupported)}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
            <View style={styles.hintBox}>
              <Text style={[styles.hint12, { color: colors.muted }]}>
                {anyWithdrawable ? END_GAME_TEXT.withdrawHint : END_GAME_TEXT.noCardHint}
              </Text>
            </View>
            {plan.withdrawalSupported && ownMissing ? (
              // Egen rad står i lista med `ownRowHint`, og knappen finnes BARE i
              // formatene som har frafall (#1934). Knappen står under lista og
              // ikke inni raden: raden er selv en `Pressable` (avkryssingen), og
              // en knapp inni den ville stjålet tappet. #1917: her sto en lenke
              // til nettsiden. Nå gjøres frafallet her.
              <View style={styles.actionBox}>
                <Pressable
                  style={[styles.outlinePill, { borderColor: colors.primary }]}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: busy }}
                  testID="end-game-withdraw-self"
                  onPress={() =>
                    Alert.alert(WITHDRAW_SELF.confirmTitle, WITHDRAW_SELF.confirmBody, [
                      { text: END_GAME_TEXT.cancel, style: 'cancel' },
                      {
                        text: WITHDRAW_SELF.confirmCta,
                        style: 'destructive',
                        onPress: () => void withdrawMe(),
                      },
                    ])
                  }
                >
                  <Text style={[styles.pillText15, { color: colors.primary }]}>
                    {WITHDRAW_SELF.label}
                  </Text>
                </Pressable>
                {noticeFor('withdraw-self')}
              </View>
            ) : null}
            <ReminderPanel gameId={gameId} />
          </>
        ) : null}

        {plan.slots.length > 0 ? (
          <>
            <SectionHeading
              text={END_GAME_TEXT.awardHeading}
              color={colors.muted}
              below={4}
              above={18}
            />
            <View style={styles.awardIntroBox}>
              <Text style={[styles.note13, { color: colors.muted }]}>
                {END_GAME_TEXT.awardIntro}
              </Text>
            </View>
            <Card style={styles.listCard}>
              {plan.slots.map((slot, index) => {
                const value = liveChoices[slot.key];
                const winner =
                  value === undefined
                    ? null
                    : value === NO_WINNER
                      ? END_GAME_TEXT.noQualified
                      : displayName(
                          candidates.find((player) => player.userId === value) ?? {
                            name: null,
                            nickname: null,
                          },
                        );
                return (
                  <Pressable
                    key={slot.key}
                    style={[
                      styles.slotRow,
                      index < plan.slots.length - 1 && {
                        borderBottomWidth: 1,
                        borderBottomColor: colors.divider,
                      },
                    ]}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={slotRowLabel(slot, winner)}
                    testID={`end-game-slot-${slot.key}`}
                    onPress={() => {
                      setNotice(null);
                      setSheetSlot(slot);
                    }}
                  >
                    <View style={styles.grow}>
                      <Text style={[styles.slotLabel, { color: colors.muted }]}>
                        {slotLabel(slot)}
                      </Text>
                      {winner ? (
                        <Text style={[styles.slotWinner, { color: colors.text }]}>{winner}</Text>
                      ) : null}
                    </View>
                    <Text style={[styles.pillText14, { color: colors.primary }]}>
                      {winner ? END_GAME_TEXT.changeWinner : END_GAME_TEXT.chooseWinner}
                    </Text>
                  </Pressable>
                );
              })}
            </Card>
          </>
        ) : null}
      </BottomBarLayout>

      <WinnerSheet
        slot={sheetSlot}
        candidates={candidates}
        choices={liveChoices}
        withdrawalSupported={plan.withdrawalSupported}
        onPick={(value) => {
          if (sheetSlot) setChoices((prev) => ({ ...prev, [sheetSlot.key]: value }));
        }}
        onClose={() => setSheetSlot(null)}
      />
    </View>
  );
}

/**
 * Om den innloggede er admin, til lås-linja på bekreft-steget.
 *
 * Fail-closed: `false` mens profilen lastes og ved feil. Da sier linja «Bare
 * en administrator kan åpne runden igjen.», som ikke lover noe. Samme
 * `cancelled`-form som purre-panelets henting.
 */
function useIsAdmin(userId: string): boolean {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetchOwnProfile(userId)
      .then((profile) => {
        if (!cancelled) setIsAdmin(profile.isAdmin);
      })
      .catch(() => {
        if (!cancelled) setIsAdmin(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);
  return isAdmin;
}

/**
 * Innholdet ruller, og bunnlinja ligger fast nederst over den nederste
 * sikker-sonen, med strek øverst. Innholdet får like mye luft under seg som
 * linja er høy, så det siste kan rulles fram.
 */
function BottomBarLayout({
  bar,
  gap = 6,
  children,
}: {
  bar: ReactNode;
  gap?: number;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [barHeight, setBarHeight] = useState(0);
  return (
    <View style={styles.fill}>
      <ScrollView
        style={{ backgroundColor: colors.bg }}
        contentContainerStyle={[styles.scroll, { paddingBottom: barHeight + 16 }]}
        testID="end-game-screen"
      >
        {children}
      </ScrollView>
      <View
        style={[
          styles.bar,
          { gap, paddingBottom: 20 + insets.bottom, backgroundColor: colors.bg, borderTopColor: colors.border },
        ]}
        onLayout={(event) => setBarHeight(event.nativeEvent.layout.height)}
        testID="end-game-bar"
      >
        {bar}
      </View>
    </View>
  );
}

/** «Avslutt runden» og undertittelen, i flukt med tekstkolonnen (20 pt). */
function TitleBlock({
  title,
  subtitle,
  confirm = false,
}: {
  title: string;
  subtitle?: string;
  confirm?: boolean;
}) {
  return (
    <View style={confirm ? styles.titleConfirm : styles.title}>
      <PageTitle title={title} subtitle={subtitle} size={confirm ? 'endConfirm' : 'endList'} />
    </View>
  );
}

/** Kortet: hvit flate, strek og 16 i hjørnene, 16 inn fra kanten. */
function Card({
  style,
  testID,
  children,
}: {
  style?: object;
  testID?: string;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style]}
      testID={testID}
    >
      {children}
    </View>
  );
}

/** Seksjonsoverskrift: små sperrede versaler, 20 pt inn. */
function SectionHeading({
  text,
  color,
  below,
  above = 12,
}: {
  text: string;
  color: string;
  below: number;
  above?: number;
}) {
  return (
    <View style={[styles.sectionBox, { paddingTop: above, paddingBottom: below }]}>
      <Text style={[styles.section, { color }]} accessibilityRole="header">
        {text}
      </Text>
    </View>
  );
}

/**
 * Bekreft-steget (#2578): det som lagres, det som skjer etterpå, og hvem som
 * kan åpne runden igjen. Ingenting skrives før «Ja, avslutt runden».
 */
function ConfirmStep({
  resultText,
  rows,
  isAdmin,
  busy,
  notice,
  onConfirm,
  onCancel,
}: {
  resultText: string;
  rows: { key: string; label: string; value: string }[];
  isAdmin: boolean;
  busy: boolean;
  notice: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { colors } = useTheme();
  const saved = [
    { key: 'result', label: END_GAME_TEXT.resultLabel, value: resultText },
    ...rows,
  ];
  const next = [END_GAME_TEXT.nextLocked, END_GAME_TEXT.nextBoard, END_GAME_TEXT.nextNotified];
  return (
    <View style={[styles.fill, { backgroundColor: colors.bg }]} testID="end-game-confirm">
      <BottomBarLayout
        gap={4}
        bar={
          <>
            {notice ? (
              <Text style={[styles.notice, { color: colors.danger }]} testID="end-game-notice">
                {notice}
              </Text>
            ) : null}
            <Pressable
              style={[styles.submit, { backgroundColor: colors.primary }]}
              disabled={busy}
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
              testID="end-game-confirm-submit"
              onPress={onConfirm}
            >
              <Text style={[styles.submitText, { color: colors.onPrimary }]}>
                {busy ? END_GAME_TEXT.submitBusy : END_GAME_TEXT.confirmCta}
              </Text>
            </Pressable>
            <Pressable
              style={styles.cancel}
              disabled={busy}
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
              testID="end-game-confirm-cancel"
              onPress={onCancel}
            >
              <Text style={[styles.pillText15, { color: colors.primary }]}>
                {END_GAME_TEXT.cancel}
              </Text>
            </Pressable>
          </>
        }
      >
        <TitleBlock title={END_GAME_TEXT.confirmTitle} subtitle={END_GAME_TEXT.confirmLead} confirm />

        <SectionHeading text={END_GAME_TEXT.savedHeading} color={colors.muted} above={18} below={8} />
        <Card style={styles.listCard}>
          {saved.map((row, index) => (
            <View
              key={row.key}
              style={[
                styles.savedRow,
                // Tegningens rad er 50 pluss streken under (content-box).
                index < saved.length - 1 && {
                  minHeight: 51,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.divider,
                },
              ]}
              testID={`end-game-saved-${row.key}`}
            >
              <Text style={[styles.savedLabel, { color: colors.muted }]}>{row.label}</Text>
              <Text style={[styles.savedValue, { color: colors.text }]}>{row.value}</Text>
            </View>
          ))}
        </Card>

        <SectionHeading text={END_GAME_TEXT.nextHeading} color={colors.muted} above={18} below={8} />
        <Card style={styles.listCard}>
          {next.map((line, index) => (
            <View
              key={line}
              style={[
                styles.stepRow,
                index < next.length - 1 && {
                  borderBottomWidth: 1,
                  borderBottomColor: colors.divider,
                },
              ]}
            >
              <View
                style={[styles.stepNumber, { borderColor: colors.primary }]}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <Text style={[styles.stepDigit, { color: colors.primary }]}>{index + 1}</Text>
              </View>
              <Text style={[styles.stepText, { color: colors.text }]}>{line}</Text>
            </View>
          ))}
        </Card>

        <View style={[styles.lock, { backgroundColor: colors.scoreOver1Bg }]}>
          <LaasIcon color={colors.scoreOver1Fg} size={18} strokeWidth={2} />
          <Text style={[styles.lockText, { color: colors.text }]} testID="end-game-reopen">
            {reopenNote(isAdmin)}
          </Text>
        </View>
      </BottomBarLayout>
    </View>
  );
}

/**
 * Purreknappen og alt som hører til den (#1889).
 *
 * **Egen komponent, ikke en gren i skjermen.** Den eier en effekt og tre
 * tilstander, og monteres bare når det faktisk mangler kort — som en gren
 * ville betydd at GET-en gikk av gårde også for runder der alle har levert,
 * eller at hooks-rekkefølgen i skjermen ble avhengig av bundelen.
 *
 * **Tallene kommer fra serveren, aldri fra lista på skjermen.** Lista er
 * «mangler kort», mens `targets` er «ferdig UTEN å ha levert» — bare den
 * siste kan purres (`selectDeliveryReminderTargets`). Hvorfor resten ikke kan
 * purres, teller serveren også, per grunn (#1933). Skjermen regnet før
 * differansen selv og kalte alle «ikke ferdig», også en gjest som var det.
 */
function ReminderPanel({ gameId }: { gameId: string }) {
  const { colors } = useTheme();
  const [preview, setPreview] = useState<{
    targets: number;
    unremindable: UnremindableCounts | null;
    lastRemindedAt: string | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  /**
   * Ta imot et GET-svar.
   *
   * Uten et tall vet vi ikke hvem knappen ville truffet, så den vises ikke —
   * setningen står i stedet. En tom plass ville sett ut som «ingen å purre»,
   * som er et helt annet svar enn «vi fikk ikke spurt».
   */
  const applyPreview = useCallback((result: ReminderPreview) => {
    if (result.ok) {
      setPreview({
        targets: result.targets,
        unremindable: result.unremindable,
        lastRemindedAt: result.lastRemindedAt,
      });
      setProblem(null);
      return;
    }
    setPreview(null);
    setProblem(describeReminderPreviewFailure(result.reason));
  }, []);

  // Samme form som `DeleteAccount`s status-henting: `cancelled`-flagget hindrer
  // en setState etter at arrangøren har forlatt flaten, og `.catch` fanger det
  // datalaget ikke forutså — en skjerm som bare ble stående tom ville vært den
  // stille feilen guardrailen finnes for.
  useEffect(() => {
    let cancelled = false;
    fetchReminderPreview(gameId)
      .then((result) => {
        if (!cancelled) applyPreview(result);
      })
      .catch(() => {
        if (!cancelled) applyPreview({ ok: false, reason: 'remind_failed' });
      });
    return () => {
      cancelled = true;
    };
  }, [applyPreview, gameId]);

  /**
   * Purr, og hent antallet på nytt etterpå.
   *
   * Den andre GET-en er ikke pynt: «Sist purret kl. …» ER guardrailen mot en
   * dobbeltpurring (eieren valgte bort en sperre), og en linje som ikke
   * oppdaterte seg etter trykket ville vært verre enn ingen linje.
   */
  const remind = useCallback(async () => {
    setBusy(true);
    setNotice(null);
    setProblem(null);
    try {
      const result = await sendReminder(gameId);
      if (result.ok) {
        setNotice(REMIND_DONE_NOTE);
        applyPreview(await fetchReminderPreview(gameId));
        return;
      }
      setProblem(describeReminderFailure(result.reason));
    } finally {
      setBusy(false);
    }
  }, [applyPreview, gameId]);

  // Uten grunn-tallene (`null`) står ingen setning: å gjette en grunn var
  // nettopp feilen (#1933).
  const sentences = preview
    ? reminderNote(
        preview.unremindable ? unremindableNotes(preview.unremindable) : [],
        formatClock(preview.lastRemindedAt),
      )
    : [];
  const clockLast = preview?.lastRemindedAt ? sentences.length - 1 : -1;

  return (
    <View style={styles.reminder} testID="end-game-reminder">
      {preview !== null && preview.targets > 0 ? (
        <Pressable
          style={[styles.outlinePill, { borderColor: colors.primary }, busy && styles.buttonOff]}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          testID="end-game-remind"
          onPress={() => void remind()}
        >
          <Text style={[styles.pillText15, { color: colors.primary }]}>
            {busy ? REMIND_BUSY_LABEL : remindLabel(preview.targets)}
          </Text>
        </Pressable>
      ) : null}

      {sentences.length > 0 ? (
        <View style={styles.reminderNoteBox}>
          <Text style={[styles.hint12, { color: colors.muted }]} testID="end-game-reminder-note">
            {sentences.map((sentence, index) => (
              // Klokka med `tabular-nums`, som i tegningen.
              <Text key={sentence} style={index === clockLast ? styles.num : undefined}>
                {index > 0 ? ' ' : ''}
                {sentence}
              </Text>
            ))}
          </Text>
        </View>
      ) : null}

      {notice ? (
        <View style={styles.reminderNoteBox}>
          <Text style={[styles.hint12, { color: colors.muted }]} testID="end-game-reminder-done">
            {notice}
          </Text>
        </View>
      ) : null}

      {problem ? (
        <View style={styles.reminderNoteBox}>
          <Text style={[styles.notice, { color: colors.danger }]} testID="end-game-reminder-error">
            {problem}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * «Levert · godkjent», «Levert av Ola», «Ikke levert», … — én linje per
 * spiller. #2200: «Levert av …» når en annen leverte kortet (`submittedLabel`).
 */
function statusFor(
  player: BundlePlayer,
  requirePeerApproval: boolean,
  players: readonly BundlePlayer[],
): string {
  if (player.submittedAt === null) return END_GAME_TEXT.notSubmitted;
  const submitted = submittedLabel(player, players);
  if (!requirePeerApproval) return submitted;
  return player.approvedAt === null
    ? `${submitted} · ${END_GAME_TEXT.awaitingApproval}`
    : `${submitted} · ${END_GAME_TEXT.approved}`;
}

/**
 * Navnene bak `blockedUserIds` — datalaget kjenner bare id-er. En id uten rad
 * får `displayName` sin plassholder.
 */
function namesFor(
  players: readonly BundlePlayer[],
  userIds: readonly string[] | undefined,
): string[] {
  if (!userIds) return [];
  return userIds.map((id) =>
    displayName(
      players.find((candidate) => candidate.userId === id) ?? { name: null, nickname: null },
    ),
  );
}

/**
 * Avkryssing, som i tegningen: firkant med grønn hake, gullkant på 2 når den er
 * huket av. Hele raden er tap-flaten (56 høy). Hva avkryssingen gjør, står
 * under navnet, og hinten står én gang under lista.
 */
function CheckRow({
  label,
  action,
  checked,
  disabled,
  testID,
  onPress,
}: {
  label: string;
  action: string;
  checked: boolean;
  disabled: boolean;
  testID: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.checkRow,
        checked
          ? { borderWidth: 2, borderColor: colors.accent, paddingVertical: 7, paddingHorizontal: 13 }
          : { borderWidth: 1, borderColor: colors.border },
        { backgroundColor: colors.surface },
      ]}
    >
      <View
        style={[
          styles.box,
          checked
            ? { backgroundColor: colors.primary }
            : { borderWidth: 1.5, borderColor: colors.primary },
        ]}
      >
        {checked ? <HakeIcon color={colors.onPrimary} size={14} strokeWidth={3} /> : null}
      </View>
      <View style={styles.grow}>
        <Text style={[styles.name15, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.sub12, { color: colors.muted }]}>{action}</Text>
      </View>
    </Pressable>
  );
}

// Linjeboksene er nettleserens (`interLine`/`fraunces`): `normal` for Inter er
// 12 på 10 pt, 15 på 12, 16 på 13, 17 på 14, 19 på 15 og 20 på 16. Tekst med
// `line-height` i tegningen har den ganget ut (1,4 og 1,45).
const NAME_15 = interLine(15, 19);
const SUB_12 = interLine(12, 15);
const SLOT_WINNER = fraunces(600, 19);

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flexGrow: 1, flexShrink: 1 },
  num: { fontVariant: ['tabular-nums'] },
  scroll: { flexGrow: 1 },
  title: { paddingTop: 2, paddingHorizontal: 20 },
  titleConfirm: { paddingTop: 6, paddingHorizontal: 20 },
  card: { marginHorizontal: 16, borderWidth: 1, borderRadius: 16 },
  stateCard: { marginTop: 12, padding: 14, gap: 8 },
  body14: { ...interLine(14, 19.6, { multiline: true }), fontFamily: FONTS.sans },
  sectionBox: { paddingHorizontal: 20 },
  section: {
    ...interLine(10, 12),
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  stack: { marginHorizontal: 16, gap: 8 },

  // Fremdriftskortet.
  progress: { marginTop: 12, paddingVertical: 12, paddingHorizontal: 14, gap: 6 },
  // Tallet står på samme grunnlinje som etiketten: Fraunces 22 har grunnlinja
  // 22 ned i sin 28-boks, Inter 13 har den 13 ned, altså 9 lavere.
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  progressLabel: {
    ...interLine(13, 16),
    fontFamily: FONTS.sansMedium,
    marginTop: 9 + interLine(13, 16).marginTop,
  },
  progressCount: { ...fraunces(600, 22), fontVariant: ['tabular-nums'] },
  progressTotal: {
    fontFamily: fraunces(500, 14).fontFamily,
    fontSize: 14,
  },
  track: { height: 8, borderRadius: 999 },
  progressLine: { ...interLine(12, 15), fontFamily: FONTS.sans, fontVariant: ['tabular-nums'] },
  outlinePill: {
    minHeight: TAP,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  deliveriesButton: { alignSelf: 'flex-start' },
  deliveriesButtonGap: { marginTop: 2 },
  pillText14: { ...interLine(14, 17), fontFamily: FONTS.sansSemiBold },
  pillText15: { ...interLine(15, 19), fontFamily: FONTS.sansSemiBold },
  deliveries: { marginTop: 4 },
  deliveryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    minHeight: TAP,
    borderTopWidth: 1,
  },
  deliveryName: { ...interLine(14, 17), fontFamily: FONTS.sans, flexShrink: 1 },
  deliveryStatus: { ...interLine(12, 15), fontFamily: FONTS.sans, textAlign: 'right', flexShrink: 1 },

  // Det sterke kortet.
  strong: {
    marginTop: 14,
    marginHorizontal: 16,
    borderRadius: 18,
    padding: 16,
    gap: 8,
  },
  strongKickerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  strongKicker: {
    ...interLine(10, 12),
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 2.2,
    textTransform: 'uppercase',
  },
  strongCount: { ...fraunces(500, 26, 31.2, { multiline: true }), fontVariant: ['tabular-nums'] },
  strongBody: { ...interLine(14, 20.3, { multiline: true }), fontFamily: FONTS.sans },

  // Godkjenningskortene.
  // `stack` står alt 16 inn fra kanten; kortet skal ikke legge til sine egne 16.
  approveCard: {
    marginHorizontal: 0,
    paddingTop: 10,
    paddingRight: 12,
    paddingBottom: 12,
    paddingLeft: 14,
    gap: 8,
  },
  approveHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dot: { width: 10, height: 10, borderRadius: 999, flexShrink: 0 },
  name15: { ...NAME_15, fontFamily: FONTS.sansSemiBold },
  sub12: { ...SUB_12, fontFamily: FONTS.sans, marginTop: 2 + SUB_12.marginTop },
  sub13: { ...interLine(13, 18.2, { multiline: true }), fontFamily: FONTS.sans },
  noteBox: { paddingTop: 8, paddingHorizontal: 20 },
  note13: { ...interLine(13, 18.2, { multiline: true }), fontFamily: FONTS.sans },

  // Mangler kort.
  introBox: { paddingHorizontal: 20, paddingBottom: 8 },
  intro13: { ...interLine(13, 16, { multiline: true }), fontFamily: FONTS.sans },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  box: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  ownHintBox: { paddingTop: 6, paddingHorizontal: 4 },
  hintBox: { paddingTop: 6, paddingHorizontal: 20 },
  hint12: { ...interLine(12, 16.8, { multiline: true }), fontFamily: FONTS.sans },
  actionBox: { marginTop: 8, marginHorizontal: 16, gap: 4 },
  reminder: { marginTop: 8, marginHorizontal: 16, gap: 4 },
  reminderNoteBox: { paddingHorizontal: 4 },
  buttonOff: { opacity: 0.4 },
  notice: { ...interLine(14, 19.6, { multiline: true }), fontFamily: FONTS.sans },

  // Kår vinnerne.
  awardIntroBox: { paddingHorizontal: 20, paddingBottom: 10 },
  listCard: { overflow: 'hidden' },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  slotLabel: { ...SUB_12, fontFamily: FONTS.sansMedium },
  slotWinner: { ...SLOT_WINNER, marginTop: 2 + SLOT_WINNER.marginTop },

  // Bunnlinja.
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  submit: {
    height: 52,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: { ...interLine(16, 20), fontFamily: FONTS.sansSemiBold },
  barHint: {
    ...interLine(12, 16.8, { multiline: true }),
    fontFamily: FONTS.sans,
    textAlign: 'center',
  },
  cancel: { height: TAP, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },

  // Bekreft-steget.
  savedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    minHeight: 50,
    paddingHorizontal: 14,
  },
  savedLabel: { ...interLine(14, 17), fontFamily: FONTS.sans },
  savedValue: {
    ...interLine(15, 19, { multiline: true }),
    fontFamily: FONTS.sansSemiBold,
    textAlign: 'right',
    flexShrink: 1,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  stepNumber: {
    width: 26,
    height: 26,
    borderRadius: 999,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepDigit: { ...fraunces(600, 14) },
  stepText: {
    ...interLine(14, 20.3, { multiline: true }),
    fontFamily: FONTS.sans,
    flexShrink: 1,
    marginTop: 3 + interLine(14, 20.3, { multiline: true }).marginTop,
  },
  lock: {
    marginTop: 12,
    marginHorizontal: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  lockText: { ...interLine(14, 19.6, { multiline: true }), fontFamily: FONTS.sans, flexShrink: 1 },
});
