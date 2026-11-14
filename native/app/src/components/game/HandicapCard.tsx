// #2297: kortet «Sjekk handicapet ditt» på spillsiden før runden
// (`Hcp-forslag-kort-*`) og kvitteringen som står der kortet sto etter lagring
// (`Hcp-forslag-oppdatert-*`).
//
// Kortet er bare tegnet: tallet, når det sist ble oppdatert og to knapper. Hva
// knappene gjør, og når kortet står, er `HandicapSection` sin sak.
import type { Ref } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  formatRelativeAgoNb,
  HANDICAP_CARD_TEXT,
  HANDICAP_RECEIPT_TEXT,
} from '../../lib/handicapCopy';
import { formatHcpNb } from '../../lib/profileCopy';
import { FONTS, fraunces, interLine, useTheme } from '../../theme';
import { BetaltHakeIcon } from '../icons/Icons';

export function HandicapCard({
  hcpIndex,
  updatedAt,
  pending,
  error,
  updateRef,
  onConfirm,
  onUpdate,
}: {
  hcpIndex: number;
  updatedAt: string | null;
  /** «Ja, stemmer» lagrer: knappen sier «Lagrer …» og begge er låst. */
  pending: boolean;
  /** Linja under knappene når «Ja, stemmer» ikke gikk gjennom. */
  error: string | null;
  updateRef?: Ref<View>;
  onConfirm: () => void;
  onUpdate: () => void;
}) {
  const { colors } = useTheme();
  const hcp = formatHcpNb(hcpIndex);
  const relative = updatedAt ? formatRelativeAgoNb(updatedAt) : 'for lenge siden';

  return (
    <View
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID="handicap-card"
    >
      <View style={styles.text}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          {HANDICAP_CARD_TEXT.title}
        </Text>
        <Text
          style={[styles.body, { color: colors.text }]}
          accessibilityLabel={HANDICAP_CARD_TEXT.bodySpoken(hcp, relative)}
        >
          {HANDICAP_CARD_TEXT.bodyBefore}
          <Text style={styles.num}>{hcp}</Text>
          {HANDICAP_CARD_TEXT.bodyAfter(relative)}
        </Text>
      </View>
      <View style={styles.buttons}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: pending, busy: pending }}
          disabled={pending}
          onPress={onConfirm}
          style={[styles.button, styles.filled, { backgroundColor: colors.primary }]}
          testID="handicap-card-confirm"
        >
          <Text style={[styles.buttonText, { color: colors.onPrimary }]} numberOfLines={1}>
            {pending ? HANDICAP_CARD_TEXT.pending : HANDICAP_CARD_TEXT.confirm}
          </Text>
        </Pressable>
        <Pressable
          ref={updateRef}
          accessibilityRole="button"
          accessibilityState={{ disabled: pending }}
          disabled={pending}
          onPress={onUpdate}
          style={[styles.button, { borderColor: colors.primary, borderWidth: 1 }]}
          testID="handicap-card-update"
        >
          <Text style={[styles.buttonText, { color: colors.primary }]} numberOfLines={1}>
            {HANDICAP_CARD_TEXT.update}
          </Text>
        </Pressable>
      </View>
      {error ? (
        <Text
          accessibilityRole="alert"
          style={[styles.error, { color: colors.danger }]}
          testID="handicap-card-error"
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** «Handicapet ditt er oppdatert.» Står der kortet sto, og får fokus når den kommer. */
export function HandicapReceipt({ receiptRef }: { receiptRef?: Ref<View> }) {
  const { colors } = useTheme();
  return (
    <View
      ref={receiptRef}
      accessible
      accessibilityLabel={HANDICAP_RECEIPT_TEXT}
      style={[styles.receipt, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID="handicap-receipt"
    >
      <BetaltHakeIcon color={colors.scoreUnderFg} />
      <Text style={[styles.receiptText, { color: colors.scoreUnderFg }]}>{HANDICAP_RECEIPT_TEXT}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // 16 pt til billetten under: skjermens `gap` på 8 og 8 til her.
  card: { marginBottom: 8, borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 },
  text: { gap: 6 },
  title: fraunces(500, 22, 27.5),
  body: { ...interLine(15, 21.75, { multiline: true }), fontFamily: FONTS.sans },
  num: { fontFamily: FONTS.sansSemiBold, fontVariant: ['tabular-nums'] },
  buttons: { flexDirection: 'row', gap: 10 },
  button: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filled: { borderWidth: 0 },
  buttonText: { ...interLine(16, 19), fontFamily: FONTS.sansSemiBold },
  error: { ...interLine(15, 20, { multiline: true }), fontFamily: FONTS.sans },
  receipt: {
    marginBottom: 8,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  receiptText: { ...interLine(15, 18), fontFamily: FONTS.sansSemiBold },
});
