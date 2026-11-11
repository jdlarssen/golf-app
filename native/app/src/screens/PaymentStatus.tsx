// #2749 PR C: «Hvem har betalt?» i appen (`Venterom-forslag-betaling`), samme side
// som nettets Betaling. Arrangøren kommer hit fra «Se betalingsstatus» under
// «Arrangør». Hele raden er trykkflaten. Haken settes med en gang og går tilbake
// med «Kunne ikke lagre. Prøv igjen.» over lista hvis lagringen feiler.
//
// Reglene (hvem som teller, hvem purringen når) er serverens
// (`lib/games/payments.ts`); skjermen viser svaret og henter på nytt etter hver
// lagring, så tallet på purre-knappen alltid er serverens.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KEYBOARD_SCROLL_PROPS, useBottomInsetUnlessKeyboard } from '../components/KeyboardInset';
import { BetaltHakeIcon } from '../components/icons/Icons';
import { fetchPayments, remindUnpaid, setPaid, type PaymentsOverview, type PaymentsPlayer } from '../data/payments';
import { BETALING_TEXT } from '../lib/paymentCopy';
import type { ScreenProps } from '../navigation';
import { useSession } from '../session';
import { FONTS, fraunces, interLine, TAP, useTheme } from '../theme';

type Load = { state: 'loading' } | { state: 'failed'; noFee: boolean } | { state: 'ready'; overview: PaymentsOverview };

export function PaymentStatus({ route }: ScreenProps<'PaymentStatus'>) {
  const { gameId } = route.params;
  const { userId } = useSession();
  const { colors, ui } = useTheme();
  const bottomInset = useBottomInsetUnlessKeyboard();
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  const [saveFailed, setSaveFailed] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [remindNote, setRemindNote] = useState<string | null>(null);

  /** Henter på nytt. Sant når den nye lista kom; ellers står den forrige. */
  const reload = useCallback(async (): Promise<boolean> => {
    const result = await fetchPayments(gameId);
    if (result.ok) setLoad({ state: 'ready', overview: result.overview });
    else setLoad((was) => (was.state === 'ready' ? was : { state: 'failed', noFee: result.reason === 'no_fee' }));
    return result.ok;
  }, [gameId]);

  // Første henting inline, med `cancelled`: skjermen kan forlates før svaret kommer.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const result = await fetchPayments(gameId);
      if (cancelled) return;
      setLoad(result.ok ? { state: 'ready', overview: result.overview } : { state: 'failed', noFee: result.reason === 'no_fee' });
    };
    void tick();
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  const toggle = async (player: PaymentsPlayer) => {
    const next = !(optimistic[player.userId] ?? player.paid);
    setSaveFailed(false);
    setOptimistic((was) => ({ ...was, [player.userId]: next }));
    const result = await setPaid(gameId, player.userId, next);
    if (!result.ok) {
      setOptimistic((was) => {
        const rest = { ...was };
        delete rest[player.userId];
        return rest;
      });
      setSaveFailed(true);
      return;
    }
    // Lagringen gikk. Haken slippes bare når den nye lista har den; feiler
    // hentingen, står haken (basen er oppdatert) til neste henting.
    if (!(await reload())) return;
    setOptimistic((was) => {
      const rest = { ...was };
      delete rest[player.userId];
      return rest;
    });
  };

  const remind = async () => {
    setReminding(true);
    setRemindNote(null);
    const result = await remindUnpaid(gameId);
    setRemindNote(result.ok ? BETALING_TEXT.remindDone(result.reminded) : BETALING_TEXT.remindFailed);
    setReminding(false);
  };

  if (load.state === 'loading') {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]} testID="payment-status-loading">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (load.state === 'failed') {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]} testID="payment-status-failed">
        <Text style={[ui.muted, styles.centerText]}>{load.noFee ? BETALING_TEXT.noFee : BETALING_TEXT.loadFailed}</Text>
        {load.noFee ? null : (
          <Pressable
            accessibilityRole="button"
            onPress={() => void reload()}
            style={ui.buttonSecondary}
            testID="payment-status-retry"
          >
            <Text style={ui.buttonSecondaryText}>{BETALING_TEXT.retry}</Text>
          </Pressable>
        )}
      </View>
    );
  }

  const { overview } = load;
  return (
    <ScrollView
      {...KEYBOARD_SCROLL_PROPS}
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={[styles.scroll, { paddingBottom: 24 + bottomInset }]}
      testID="payment-status-screen"
    >
      <View style={styles.head}>
        <Text style={[styles.kicker, { color: colors.muted }]}>{BETALING_TEXT.kicker}</Text>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          {BETALING_TEXT.heading}
        </Text>
        <Text style={[styles.subline, { color: colors.muted }]}>
          {BETALING_TEXT.subline(overview.gameName, overview.entryFeeKr)}
        </Text>
      </View>

      {overview.remindable > 0 ? (
        <Pressable
          accessibilityRole="button"
          disabled={reminding}
          onPress={() => void remind()}
          style={[styles.remind, { borderColor: colors.primary }, reminding && styles.busy]}
          testID="payment-status-remind"
        >
          <Text style={[styles.remindText, { color: colors.primary }]}>
            {BETALING_TEXT.remindButton(overview.remindable)}
          </Text>
        </Pressable>
      ) : null}
      {remindNote ? (
        <Text style={[styles.note, { color: colors.muted }]} testID="payment-status-remind-note">
          {remindNote}
        </Text>
      ) : null}

      <Text style={[styles.section, { color: colors.muted }]}>{BETALING_TEXT.rosterLabel}</Text>
      {saveFailed ? (
        <Text style={ui.error} testID="payment-status-error">
          {BETALING_TEXT.toggleError}
        </Text>
      ) : null}
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {overview.players.map((player, index) => {
          const paid = optimistic[player.userId] ?? player.paid;
          const base = player.name ?? BETALING_TEXT.unknownPlayer;
          const name = player.userId === userId ? BETALING_TEXT.you(base) : base;
          const last = index === overview.players.length - 1;
          return (
            <Pressable
              key={player.userId}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: paid }}
              accessibilityLabel={BETALING_TEXT.markPaidAria(base)}
              onPress={() => void toggle(player)}
              style={[styles.row, last ? null : { borderBottomWidth: 1, borderBottomColor: colors.divider }]}
              testID={`payment-row-${player.userId}`}
            >
              <View style={styles.nameWrap}>
                <Text style={[styles.name, { color: player.withdrawn ? colors.muted : colors.text }]} numberOfLines={1}>
                  {name}
                  {player.withdrawn ? ` (${BETALING_TEXT.withdrawn})` : ''}
                </Text>
                {player.isGuest ? (
                  <View style={[styles.guest, { backgroundColor: colors.surface2 }]}>
                    <Text style={[styles.guestText, { color: colors.muted }]}>{BETALING_TEXT.guest}</Text>
                  </View>
                ) : null}
              </View>
              <Text
                style={[
                  styles.status,
                  paid ? { color: colors.scoreUnderFg, fontFamily: FONTS.sansSemiBold } : { color: colors.muted },
                ]}
              >
                {paid ? BETALING_TEXT.paid : BETALING_TEXT.unpaid}
              </Text>
              <View
                style={[
                  styles.box,
                  paid
                    ? { backgroundColor: colors.primary, borderColor: colors.primary }
                    : { borderColor: colors.fieldBorder, backgroundColor: colors.surface },
                ]}
                testID={`payment-box-${player.userId}`}
              >
                {paid ? <BetaltHakeIcon color={colors.onPrimary} size={16} strokeWidth={2.6} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 16, paddingTop: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  centerText: { textAlign: 'center' },
  head: { paddingHorizontal: 4, gap: 4 },
  kicker: { ...interLine(12, 15), fontFamily: FONTS.sansSemiBold },
  title: { ...fraunces(500, 26, 30), letterSpacing: -0.39 },
  subline: { ...interLine(14, 17), fontFamily: FONTS.sans, fontVariant: ['tabular-nums'], marginTop: 2 + interLine(14, 17).marginTop },
  remind: {
    marginTop: 16,
    minHeight: TAP,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  busy: { opacity: 0.6 },
  remindText: { ...interLine(16, 19), fontFamily: FONTS.sansSemiBold },
  note: { ...interLine(14, 17), fontFamily: FONTS.sans, textAlign: 'center', marginTop: 8 + interLine(14, 17).marginTop },
  section: {
    ...interLine(12, 15),
    fontFamily: FONTS.sansSemiBold,
    marginTop: 22 + interLine(12, 15).marginTop,
    marginBottom: 8 + interLine(12, 15).marginBottom,
    marginHorizontal: 4,
  },
  card: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  row: { minHeight: 56, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  nameWrap: { flexGrow: 1, flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { ...interLine(16, 19), fontFamily: FONTS.sans, flexShrink: 1 },
  guest: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  guestText: { ...interLine(11, 14), fontFamily: FONTS.sansSemiBold },
  status: { ...interLine(13, 16), fontFamily: FONTS.sans },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
