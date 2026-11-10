// #2749: kontingentkortet under startbilletten (`Venterom-forslag-kort`, og
// `Venterom-forslag-lenke-foldet` for plassen på siden). Fire tilstander:
// betalingslenke, Vipps-nummer med «Kopier», ingen lenke og betalt. Valget er
// `lib/paymentView.ts`; ordene er nettets (`lib/paymentCopy.ts`).
//
// Betalingen skjer utenfor appen: «Betal her» åpner arrangørens lenke i
// nettleseren, og «Kopier» legger Vipps-nummeret på utklippstavla.
import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { PAYMENT_TEXT } from '../../lib/paymentCopy';
import type { PaymentView } from '../../lib/paymentView';
import { FONTS, fraunces, interLine, TAP, useTheme } from '../../theme';
import { BetaltHakeIcon, PilUtIcon } from '../icons/Icons';

/** Hvor lenge «Kopiert» står, som på nettet. */
const COPIED_MS = 2000;

export function PaymentCard({ view }: { view: PaymentView }) {
  const { colors } = useTheme();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  if (view.kind === 'none') return null;
  const card = { backgroundColor: colors.surface, borderColor: colors.border };

  if (view.kind === 'paid') {
    return (
      <View style={[styles.card, styles.paid, card]} testID="payment-card-paid">
        <BetaltHakeIcon color={colors.scoreUnderFg} />
        <Text style={[styles.paidText, { color: colors.scoreUnderFg }]}>{PAYMENT_TEXT.paidBadge}</Text>
      </View>
    );
  }

  const copy = async (value: string) => {
    try {
      await Clipboard.setStringAsync(value);
      setCopied(true);
      if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(PAYMENT_TEXT.copied);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      // Som nettet: en kopi som feiler, gir ingen beskjed. Nummeret står synlig på kortet.
    }
  };

  return (
    <View
      style={[styles.card, view.kind === 'arrange' ? styles.gapTight : styles.gap, card]}
      testID={`payment-card-${view.kind}`}
    >
      <View style={styles.head}>
        <Text style={[styles.label, { color: colors.muted }]}>{PAYMENT_TEXT.label}</Text>
        <Text style={[styles.amount, { color: colors.text }]}>{PAYMENT_TEXT.amount(view.amountKr)}</Text>
      </View>
      {view.kind === 'link' ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => void Linking.openURL(view.url).catch(() => undefined)}
          style={[styles.pay, { backgroundColor: colors.primary }]}
          testID="payment-pay"
        >
          <Text style={[styles.payText, { color: colors.onPrimary }]}>{PAYMENT_TEXT.payVia}</Text>
          <PilUtIcon color={colors.onPrimary} />
        </Pressable>
      ) : view.kind === 'vipps' ? (
        <View style={styles.vipps}>
          <Text style={[styles.vippsText, { color: colors.text }]}>{PAYMENT_TEXT.vippsTo(view.number)}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void copy(view.number)}
            style={[styles.copy, { borderColor: colors.primary }]}
            testID="payment-copy"
          >
            <Text style={[styles.copyText, { color: colors.primary }]}>
              {copied ? PAYMENT_TEXT.copied : PAYMENT_TEXT.copy}
            </Text>
          </Pressable>
        </View>
      ) : (
        <Text style={[styles.arrange, { color: colors.muted }]}>{PAYMENT_TEXT.arrangeWithHost}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // 16 pt under billetten i tegningen: skjermens `gap` på 8 og 8 til.
  card: { marginTop: 8, borderWidth: 1, borderRadius: 16, padding: 16 },
  gap: { gap: 12 },
  gapTight: { gap: 6 },
  paid: { paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  paidText: { ...interLine(15, 18), fontFamily: FONTS.sansSemiBold },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  label: { ...interLine(12, 15), fontFamily: FONTS.sansSemiBold },
  amount: { ...fraunces(600, 20), fontVariant: ['tabular-nums'] },
  pay: {
    minHeight: 48,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  payText: { ...interLine(16, 19), fontFamily: FONTS.sansSemiBold },
  vipps: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  vippsText: { ...interLine(15, 18), fontFamily: FONTS.sans, flexGrow: 1, flexShrink: 1, fontVariant: ['tabular-nums'] },
  copy: {
    minHeight: TAP,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyText: { ...interLine(15, 18), fontFamily: FONTS.sansSemiBold },
  arrange: { ...interLine(13, 16), fontFamily: FONTS.sans },
});
