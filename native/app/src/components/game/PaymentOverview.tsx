// #2749 PR C: arrangørens Betaling-kort under «Arrangør» (`Venterom-forslag-kort`,
// nederst): kontingenten, «Betalt {betalt} / {påmeldt}» og «Se betalingsstatus».
// Tallene er serverens (`lib/games/payments.ts`, gjennom `data/payments.ts`) og
// hentes på nytt hver gang spillets side henter bundelen, altså når siden får
// fokus eller appen kommer tilbake (`useGameBundle`). Da stemmer de når
// arrangøren kommer tilbake fra «Hvem har betalt?».
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fetchPayments } from '../../data/payments';
import { BETALING_TEXT, PAYMENT_TEXT } from '../../lib/paymentCopy';
import { FONTS, fraunces, interLine, TAP, useTheme } from '../../theme';

export function PaymentOverview({
  gameId,
  entryFeeKr,
  refreshKey,
  onOpen,
}: {
  gameId: string;
  entryFeeKr: number;
  /** Bundelens `fetchedAt`: en ny henting av siden henter tallene på nytt. */
  refreshKey: string;
  onOpen: () => void;
}) {
  const { colors } = useTheme();
  const [counts, setCounts] = useState<{ paid: number; total: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const result = await fetchPayments(gameId);
      if (cancelled) return;
      // En feil gir «–», ikke et gammelt tall som ser ferskt ut.
      setCounts(result.ok ? { paid: result.overview.paidCount, total: result.overview.totalCount } : null);
    };
    void tick();
    return () => {
      cancelled = true;
    };
  }, [gameId, refreshKey]);

  return (
    <View testID="payment-overview">
      <Text style={[styles.section, { color: colors.muted }]}>{BETALING_TEXT.sectionLabel}</Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.row}>
          <View>
            <Text style={[styles.label, { color: colors.muted }]}>{BETALING_TEXT.feeLabel}</Text>
            <Text style={[styles.fee, { color: colors.text }]}>{PAYMENT_TEXT.amount(entryFeeKr)}</Text>
          </View>
          <View style={styles.right}>
            <Text style={[styles.label, { color: colors.muted }]}>{BETALING_TEXT.paidLabel}</Text>
            <Text style={[styles.count, { color: colors.text }]} testID="payment-overview-count">
              {counts ? `${counts.paid} / ${counts.total}` : '–'}
            </Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onOpen}
          style={[styles.open, { borderColor: colors.primary }]}
          testID="payment-overview-open"
        >
          <Text style={[styles.openText, { color: colors.primary }]}>{BETALING_TEXT.viewAll}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Linje-justeringen fra `interLine`/`fraunces` står i margene; luften legges oppå.
  section: {
    ...interLine(12, 15),
    fontFamily: FONTS.sansSemiBold,
    marginTop: 4 + interLine(12, 15).marginTop,
    marginBottom: 8 + interLine(12, 15).marginBottom,
    marginHorizontal: 4,
  },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 },
  right: { alignItems: 'flex-end' },
  label: { ...interLine(12, 15), fontFamily: FONTS.sansSemiBold },
  fee: { ...fraunces(500, 16), marginTop: 2 + fraunces(500, 16).marginTop, fontVariant: ['tabular-nums'] },
  count: { ...fraunces(500, 22), marginTop: 2 + fraunces(500, 22).marginTop, fontVariant: ['tabular-nums'] },
  open: { minHeight: TAP, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  openText: { ...interLine(16, 19), fontFamily: FONTS.sansSemiBold },
});
