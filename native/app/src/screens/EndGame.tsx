// native/app/src/screens/EndGame.tsx
// Native N6c (#1856): arrangørens avslutt-flate.
//
// **Egen skjerm, ikke en knapp på spill-hjem.** Flippen er praktisk
// irreversibel for arrangøren (gjenåpning er admin-only på nettsiden), og
// husregelen er at noe som ikke kan angres får sin egen bekreftelses-flate.
// Her er den også en arbeidsflate: leveringene skal leses, manglene kvitteres
// ut og LD/CTP kåres før knappen i det hele tatt blir aktiv.
//
// **Reglene er ikke her.** Hvem som blokkerer og hva knappen krever regnes ut
// av `lib/endGamePlan.ts`; selve skrivingene og portene bor i
// `data/endGame.ts`, som speiler webbens `endGameCore` og har RLS bak seg.
// Skjermen er montering: den viser hva planen sier og sender resultatet videre.
//
// **Tema-bevisst via `useTheme()` (#1833).** Avkryssingen og slot-velgeren er
// bygget lokalt etter formen til `components/create/primitives.tsx` i stedet for
// å importeres derfra: de primitivene kjenner ikke «huket av»-firkanten, og
// formen her er ikke helt den samme. Fargene er de samme tokenene.
//
// **Manglende godkjenning har ingen vei rundt** — men den har nå en vei
// GJENNOM (#1891). `guard_game_players_self_update` (0147) slipper oppretteren
// til på andres rad, og webbens egen overstyring (`adminApproveScorecard`) er
// ren DB uten varsel. Appen kan derfor gjøre nøyaktig det samme med den
// `approveScorecard` den alt har. Det som fortsatt IKKE finnes er en vei rundt:
// kortet må godkjennes, av en medspiller eller av arrangøren.
//
// **Purringen er den ikke-destruktive utveien (#1889).** Manglet noen kort, var
// eneste knapp «marker som trukket» — en destruktiv handling presentert som
// eneste alternativ. Purringen krever Node (`notify()`, Resend, push), så den
// bor på serveren; skjermen spør `/api/games/{id}/remind` via `data/remind.ts`
// og viser svaret. Regelen om HVEM som purres speiles aldri her.
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { WebLinkButton } from '../components/WebLinkButton';
import { finishRound } from '../data/endGame';
import type { BundlePlayer } from '../data/gameBundle';
import { approveScorecard } from '../data/playerActions';
import {
  fetchReminderPreview,
  sendReminder,
  type ReminderPreview,
} from '../data/remind';
import { describeFailure } from '../lib/actionFeedback';
import { displayName, formatClock } from '../lib/display';
import {
  approveConfirmBody,
  CUP_LINK_LABEL,
  CUP_NOTE,
  cupWebPath,
  describeEndRoundFailure,
  describeReminderFailure,
  describeReminderPreviewFailure,
  END_GAME_TEXT,
  lastRemindedNote,
  ownRowHint,
  REMIND_BUSY_LABEL,
  REMIND_DONE_NOTE,
  remindLabel,
  slotLabel,
  stillPlayingNote,
} from '../lib/endGameCopy';
import {
  buildFinishPlan,
  canFinish,
  toSideWinners,
  withdrawUserIds,
  NO_WINNER,
  type FinishPlan,
  type FinishSlot,
} from '../lib/endGamePlan';
import {
  WITHDRAW_SELF_LINK_LABEL,
  withdrawSelfWebPath,
} from '../lib/rosterCopy';
import { useGameBundle } from '../lib/useGameData';
import type { ScreenProps } from '../navigation';
import { useSession } from '../session';
import { TAP, useTheme } from '../theme';

export function EndGame({ route, navigation }: ScreenProps<'EndGame'>) {
  const { colors, ui } = useTheme();
  const { gameId } = route.params;
  const { userId } = useSession();
  const { bundle, loading, refresh } = useGameBundle(gameId);

  const [acknowledged, setAcknowledged] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const toggle = useCallback((playerUserId: string) => {
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
   * `withdraw-after-submit` (og `-partial`, #1896) er det ene avslaget skjermen
   * selv må gjøre noe med:
   * det betyr at listen på skjermen er utdatert, og knappen er grå til hver
   * manglende spiller er huket av. Uten en refetch her ville arrangøren stått
   * fast i samme avslag ved hvert nye trykk. Fokus-refetchen redder oss ikke —
   * skjermen mister aldri fokus.
   */
  const finish = useCallback(
    async (plan: FinishPlan, players: readonly BundlePlayer[]) => {
      setBusy(true);
      setNotice(null);
      try {
        const result = await finishRound(gameId, {
          allowMissing: plan.missing.length > 0,
          withdrawUserIds: withdrawUserIds(plan, acknowledged),
          sideWinners: toSideWinners(plan.slots, choices),
        });
        if (result.ok) {
          navigation.replace('Leaderboard', { gameId });
          return;
        }
        setNotice(
          describeEndRoundFailure(
            result.reason,
            namesFor(players, result.blockedUserIds),
            result.message,
          ),
        );
        if (
          result.reason === 'withdraw-after-submit' ||
          result.reason === 'withdraw-after-submit-partial'
        ) {
          await refresh();
        }
      } catch {
        setNotice(describeEndRoundFailure('db'));
      } finally {
        setBusy(false);
      }
    },
    [acknowledged, choices, gameId, navigation, refresh],
  );

  /**
   * Godkjenn en medspillers kort på vegne av gruppa (#1891).
   *
   * Ingen ny rute og ingen ny regel: dette er `approveScorecard` slik spilleren
   * selv bruker den, og RLS er porten. 0147-vakta slipper oppretteren gjennom
   * på andres rad, og UPDATE-filteret (`submitted_at not null`, `approved_at
   * is null`) sørger for at et ULEVERT kort aldri kan godkjennes herfra.
   *
   * **Ingen varsel sendes.** Webbens egen overstyring gjør heller ikke det
   * («success without re-notifying»): spilleren blir ikke bedt om noe, hen får
   * beskjed om at arrangøren tok jobben — og det skjer i resultatet.
   *
   * `refresh()` kjøres uansett utfall. Ble kortet godkjent, skal banneret
   * forsvinne; ble det avvist, er lista på skjermen utdatert og en ny henting
   * er nettopp det som gjør avslaget forståelig.
   */
  const approve = useCallback(
    async (player: BundlePlayer) => {
      setBusy(true);
      setNotice(null);
      try {
        // `alreadyDone: true` er suksess, ikke et avslag: kortet ER godkjent —
        // en medspiller rakk det først. Samme semantikk som `alreadyFinished`.
        const result = await approveScorecard(gameId, player.userId);
        setNotice(describeFailure(result));
      } catch {
        setNotice(describeEndRoundFailure('db'));
      } finally {
        setBusy(false);
        await refresh();
      }
    },
    [gameId, refresh],
  );

  if (!bundle) {
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

  const { game } = bundle;

  // Cup-runder eies av cup-flyten på nettsiden: den avslutter kampene som hører
  // sammen og demper per-spill-varslene. En app-flipp ville gått utenom begge.
  // Datamodulen avviser dem uansett; her slipper arrangøren å trykke først.
  if (game.tournamentId !== null) {
    return (
      <ScrollView contentContainerStyle={ui.scroll} testID="end-game-screen">
        <Text style={ui.title}>{END_GAME_TEXT.heading}</Text>
        <View style={ui.banner}>
          <Text style={ui.body} testID="end-game-cup-note">
            {CUP_NOTE}
          </Text>
          <WebLinkButton
            label={CUP_LINK_LABEL}
            path={cupWebPath(game.tournamentId)}
            testID="end-game-cup-link"
          />
        </View>
      </ScrollView>
    );
  }

  if (game.status !== 'active') {
    return (
      <ScrollView contentContainerStyle={ui.scroll} testID="end-game-screen">
        <Text style={ui.title}>{END_GAME_TEXT.heading}</Text>
        <View style={ui.banner}>
          <Text style={ui.body} testID="end-game-not-active">
            {game.status === 'finished'
              ? END_GAME_TEXT.alreadyFinished
              : END_GAME_TEXT.notActive}
          </Text>
        </View>
      </ScrollView>
    );
  }

  const plan = buildFinishPlan(bundle, userId);
  const ready = canFinish(plan, acknowledged, choices);

  return (
    <ScrollView contentContainerStyle={ui.scroll} testID="end-game-screen">
      <Text style={ui.title}>{END_GAME_TEXT.heading}</Text>

      <Text style={ui.sectionTitle}>{END_GAME_TEXT.deliveryHeading}</Text>
      <View style={ui.card} testID="end-game-delivery">
        {plan.active.map((player) => (
          <View key={player.userId} style={styles.statusRow}>
            <Text style={ui.body}>
              {displayName(player)}
              {player.userId === userId ? ' (deg)' : ''}
            </Text>
            <Text style={ui.muted} testID={`end-game-status-${player.userId}`}>
              {statusFor(player, plan.requirePeerApproval)}
            </Text>
          </View>
        ))}
      </View>

      {plan.unapproved.length > 0 ? (
        <View style={ui.banner} testID="end-game-unapproved">
          <Text style={ui.body}>
            {END_GAME_TEXT.unapprovedHeading}: {plan.unapproved.map(displayName).join(', ')}
          </Text>
          <Text style={ui.muted}>{END_GAME_TEXT.unapprovedNote}</Text>
          {/* Egen rad får ingen knapp. `guard_game_players_self_update` nekter
              enhver spiller å sette godkjenning på sitt eget kort, så knappen
              kunne bare feilet — med den rå engelske Postgres-teksten på
              skjermen. Kortet står fortsatt i lista over: det blokkerer
              avslutningen, og arrangøren skal se hvorfor. */}
          {plan.unapproved.some((player) => player.userId === userId) ? (
            <Text style={ui.muted} testID="end-game-own-card-needs-peer">
              {END_GAME_TEXT.ownCardNeedsPeer}
            </Text>
          ) : null}
          {plan.unapproved
            .filter((player) => player.userId !== userId)
            .map((player) => (
            <Pressable
              key={player.userId}
              style={ui.buttonSecondary}
              disabled={busy}
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
              testID={`end-game-approve-${player.userId}`}
              onPress={() =>
                Alert.alert(
                  END_GAME_TEXT.approveOnBehalf,
                  approveConfirmBody(displayName(player)),
                  [
                    { text: 'Avbryt', style: 'cancel' },
                    {
                      text: END_GAME_TEXT.approveConfirmCta,
                      onPress: () => void approve(player),
                    },
                  ],
                )
              }
            >
              <Text style={ui.buttonSecondaryText}>
                {END_GAME_TEXT.approveOnBehalf}
              </Text>
              {/* Navnet på egen linje, ikke i etiketten: med to ventende kort
                  er «Godkjenn på vegne av gruppa» to ganger et valg uten
                  forskjell. Etiketten står som eieren skrev den. */}
              <Text style={ui.muted}>{displayName(player)}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {plan.missing.length > 0 ? (
        <>
          <Text style={ui.sectionTitle}>{END_GAME_TEXT.missingHeading}</Text>
          <Text style={ui.muted}>{END_GAME_TEXT.missingIntro}</Text>
          <View style={ui.card}>
            {plan.missing.map((entry) => (
              <CheckRow
                key={entry.player.userId}
                label={displayName(entry.player)}
                action={
                  entry.withdrawable
                    ? END_GAME_TEXT.withdrawLabel
                    : END_GAME_TEXT.noCardLabel
                }
                hint={
                  entry.player.userId === userId
                    ? ownRowHint(plan.withdrawalSupported)
                    : entry.withdrawable
                      ? END_GAME_TEXT.withdrawHint
                      : END_GAME_TEXT.noCardHint
                }
                checked={acknowledged.has(entry.player.userId)}
                disabled={busy}
                testID={`end-game-check-${entry.player.userId}`}
                onPress={() => toggle(entry.player.userId)}
              />
            ))}
          </View>
          {plan.withdrawalSupported &&
          plan.missing.some((entry) => entry.player.userId === userId) ? (
            // Egen rad står i lista med `ownRowHint`, som sier at frafallet
            // gjøres på nettsiden — men BARE i formatene som har frafall
            // (#1934). Uten den grenen lovet teksten en side som i matchplay
            // og scramble bare sender arrangøren tilbake igjen. Knappen står
            // under KORTET og ikke inni raden: raden er selv en `Pressable`
            // (avkryssingen), og en knapp inni den ville stjålet tappet.
            <WebLinkButton
              label={WITHDRAW_SELF_LINK_LABEL}
              path={withdrawSelfWebPath(gameId)}
              testID="end-game-withdraw-self-link"
            />
          ) : null}
          <ReminderPanel gameId={gameId} missingCount={plan.missing.length} />
        </>
      ) : plan.unapproved.length === 0 ? (
        <Text style={ui.muted} testID="end-game-all-ready">
          {END_GAME_TEXT.allReady}
        </Text>
      ) : null}

      {plan.slots.length > 0 ? (
        <>
          <Text style={ui.sectionTitle}>{END_GAME_TEXT.awardHeading}</Text>
          <Text style={ui.muted}>{END_GAME_TEXT.awardIntro}</Text>
          {plan.slots.map((slot) => (
            <SlotPicker
              key={slot.key}
              slot={slot}
              players={plan.active}
              value={choices[slot.key] ?? null}
              disabled={busy}
              onPick={(value) =>
                setChoices((prev) => ({ ...prev, [slot.key]: value }))
              }
            />
          ))}
        </>
      ) : null}

      <Pressable
        style={[ui.button, !ready && styles.buttonOff]}
        disabled={!ready || busy}
        testID="end-game-submit"
        accessibilityState={{ disabled: !ready || busy }}
        onPress={() =>
          Alert.alert(END_GAME_TEXT.confirmTitle, END_GAME_TEXT.confirmBody, [
            { text: 'Avbryt', style: 'cancel' },
            {
              text: END_GAME_TEXT.confirmCta,
              style: 'destructive',
              onPress: () => void finish(plan, bundle.players),
            },
          ])
        }
      >
        <Text style={ui.buttonText}>
          {busy ? END_GAME_TEXT.submitBusy : END_GAME_TEXT.submit}
        </Text>
      </Pressable>

      {notice ? (
        <Text style={ui.error} testID="end-game-notice">
          {notice}
        </Text>
      ) : null}
    </ScrollView>
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
 * **Tallet kommer fra serveren, aldri fra lista på skjermen.** `missingCount`
 * er «mangler kort», mens `targets` er «ferdig UTEN å ha levert» — bare den
 * siste kan purres (`selectDeliveryReminderTargets`). Regnestykket for hvem
 * bor på serveren; her regnes bare differansen, for å kunne si hvorfor de to
 * tallene er ulike.
 *
 * @param missingCount hvor mange rader «Disse mangler kort» viser.
 */
function ReminderPanel({
  gameId,
  missingCount,
}: {
  gameId: string;
  missingCount: number;
}) {
  const { ui } = useTheme();
  const [preview, setPreview] = useState<{
    targets: number;
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
      setPreview({ targets: result.targets, lastRemindedAt: result.lastRemindedAt });
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

  // Negativ differanse er mulig: serveren teller på nytt, og noen kan ha
  // levert siden bundelen ble hentet. Da er «−1 av dem …» tull, ikke data.
  const stillPlaying = preview ? Math.max(0, missingCount - preview.targets) : 0;
  const lastReminded = preview ? formatClock(preview.lastRemindedAt) : null;

  return (
    <View style={styles.reminder} testID="end-game-reminder">
      {stillPlaying > 0 ? (
        <Text style={ui.muted} testID="end-game-reminder-still-playing">
          {stillPlayingNote(stillPlaying)}
        </Text>
      ) : null}

      {preview !== null && preview.targets > 0 ? (
        <Pressable
          style={[ui.buttonSecondary, busy && styles.buttonOff]}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          testID="end-game-remind"
          onPress={() => void remind()}
        >
          <Text style={ui.buttonSecondaryText}>
            {busy ? REMIND_BUSY_LABEL : remindLabel(preview.targets)}
          </Text>
        </Pressable>
      ) : null}

      {lastReminded ? (
        <Text style={ui.muted} testID="end-game-reminder-last">
          {lastRemindedNote(lastReminded)}
        </Text>
      ) : null}

      {notice ? (
        <Text style={ui.muted} testID="end-game-reminder-done">
          {notice}
        </Text>
      ) : null}

      {problem ? (
        <Text style={ui.error} testID="end-game-reminder-error">
          {problem}
        </Text>
      ) : null}
    </View>
  );
}

/** «Levert · Godkjent», «Ikke levert», … — én linje per spiller. */
function statusFor(player: BundlePlayer, requirePeerApproval: boolean): string {
  if (player.submittedAt === null) return END_GAME_TEXT.notSubmitted;
  if (!requirePeerApproval) return END_GAME_TEXT.submitted;
  return player.approvedAt === null
    ? `${END_GAME_TEXT.submitted} · ${END_GAME_TEXT.awaitingApproval}`
    : `${END_GAME_TEXT.submitted} · ${END_GAME_TEXT.approved}`;
}

/** Navnene bak `blockedUserIds` — datalaget kjenner bare id-er. */
function namesFor(
  players: readonly BundlePlayer[],
  userIds: readonly string[] | undefined,
): string[] {
  if (!userIds) return [];
  return userIds.map((id) => {
    const player = players.find((candidate) => candidate.userId === id);
    return player ? displayName(player) : 'Ukjent spiller';
  });
}

/**
 * Avkryssing.
 *
 * Bygget her og ikke i `primitives.tsx`: den er tema-bevisst, og denne stacken
 * er statisk (se fil-kommentaren). Formen er `SelectRow`-ens — gullkant når den
 * er huket av, tap-flate over 44 — med en firkant i stedet for en hake, fordi
 * en hake alene ikke sier hva som skjer når man trykker.
 */
function CheckRow({
  label,
  action,
  hint,
  checked,
  disabled,
  testID,
  onPress,
}: {
  label: string;
  action: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  testID: string;
  onPress: () => void;
}) {
  const { colors, ui } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.checkRow,
        {
          backgroundColor: colors.surface,
          borderColor: checked ? colors.accent : colors.border,
          borderWidth: checked ? 2 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.box,
          {
            borderColor: colors.primary,
            backgroundColor: checked ? colors.primary : 'transparent',
          },
        ]}
      >
        {checked ? (
          <Text style={[styles.boxMark, { color: colors.onPrimary }]}>✓</Text>
        ) : null}
      </View>
      <View style={styles.checkText}>
        <Text style={ui.body}>{label}</Text>
        <Text style={ui.muted}>{action}</Text>
        <Text style={ui.muted}>{hint}</Text>
      </View>
    </Pressable>
  );
}

/**
 * Vinner for én slot.
 *
 * Chips og ikke en dropdown: RN har ingen picker-primitiv i appen, og et valg
 * mellom fire–seks korte navn er ett trykk som chips mot tre i en modal.
 * «Ingen kvalifiserte» står som en likeverdig chip — det ER et valg, ikke en
 * tom verdi, og uten den ville en slot uten vinner blitt en null ingen tok.
 */
function SlotPicker({
  slot,
  players,
  value,
  disabled,
  onPick,
}: {
  slot: FinishSlot;
  players: readonly BundlePlayer[];
  value: string | null;
  disabled: boolean;
  onPick: (value: string) => void;
}) {
  const { colors, ui } = useTheme();
  const options = [
    ...players.map((player) => ({
      value: player.userId,
      label: displayName(player),
    })),
    { value: NO_WINNER, label: END_GAME_TEXT.noQualified },
  ];

  return (
    <View style={styles.slot} testID={`end-game-slot-${slot.key}`}>
      <Text style={ui.label}>{slotLabel(slot)}</Text>
      <View style={styles.chips}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <Pressable
              key={option.value}
              testID={`end-game-slot-${slot.key}-${option.value}`}
              accessibilityRole="button"
              accessibilityState={{ selected: active, disabled }}
              disabled={disabled}
              onPress={() => onPick(option.value)}
              style={[
                styles.chip,
                {
                  borderColor: active ? colors.accent : colors.border,
                  borderWidth: active ? 2 : 1,
                  backgroundColor: active ? colors.surface : 'transparent',
                },
              ]}
            >
              <Text style={active ? ui.body : ui.muted}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  buttonOff: { opacity: 0.4 },
  reminder: { gap: 6, marginTop: 8 },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    minHeight: TAP + 12,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 8,
  },
  checkText: { flex: 1, gap: 2 },
  box: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  boxMark: { fontSize: 15 },
  slot: { gap: 6, marginTop: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: TAP,
    borderRadius: 999,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
