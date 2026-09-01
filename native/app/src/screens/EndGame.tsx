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
// **Statisk `ui`/`COLORS`, ikke `useTheme()`.** Samme valg som
// `OrganiserSection` (N6b): spill-stacken er statisk, og #1866 (lys/mørk) er et
// utsatt eier-valg. Avkryssingen og slot-velgeren er derfor bygget lokalt etter
// formen til `components/create/primitives.tsx` i stedet for å importeres
// derfra — de primitivene er tema-bevisste, og én mørk-kapabel flate midt i en
// lys stack er verre enn litt duplisert layout.
//
// **Manglende godkjenning har ingen vei rundt.** Den kan ikke krysses bort,
// verken her eller i datamodulen. Appen har ingen Sekretariat-overstyring;
// skjermen navngir hvem det står på og sier hvor overstyringen finnes.
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { finishRound } from '../data/endGame';
import type { BundlePlayer } from '../data/gameBundle';
import { displayName } from '../lib/display';
import {
  CUP_NOTE,
  END_GAME_TEXT,
  describeEndRoundFailure,
  slotLabel,
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
import { useGameBundle } from '../lib/useGameData';
import type { ScreenProps } from '../navigation';
import { useSession } from '../session';
import { COLORS, TAP, ui } from '../theme';

export function EndGame({ route, navigation }: ScreenProps<'EndGame'>) {
  const { gameId } = route.params;
  const { userId } = useSession();
  const { bundle, loading } = useGameBundle(gameId);

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
      } catch {
        setNotice(describeEndRoundFailure('db'));
      } finally {
        setBusy(false);
      }
    },
    [acknowledged, choices, gameId, navigation],
  );

  if (!bundle) {
    return (
      <View style={ui.centered} testID={loading ? 'end-game-loading' : 'end-game-error'}>
        {loading ? (
          <ActivityIndicator color={COLORS.forest} />
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
                    ? END_GAME_TEXT.ownRowHint
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
  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.checkRow, checked && styles.checkRowOn]}
    >
      <View style={[styles.box, checked && styles.boxOn]}>
        {checked ? <Text style={styles.boxMark}>✓</Text> : null}
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
              style={[styles.chip, active && styles.chipOn]}
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
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    minHeight: TAP + 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 8,
  },
  checkRowOn: { borderWidth: 2, borderColor: COLORS.gold },
  checkText: { flex: 1, gap: 2 },
  box: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.forest,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  boxOn: { backgroundColor: COLORS.forest },
  boxMark: { color: COLORS.card, fontSize: 15 },
  slot: { gap: 6, marginTop: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: TAP,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipOn: { borderWidth: 2, borderColor: COLORS.gold, backgroundColor: COLORS.card },
});
