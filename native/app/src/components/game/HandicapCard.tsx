// #2297: «Sjekk handicapet ditt» på spillsiden før runden, og kvitteringen som
// står der etter en lagring fra arket (tegningene `Hcp-forslag-kort-*` og
// `Hcp-forslag-oppdatert-*`).
//
// Kortet viser seg selv ikke: spill-hjem avgjør når det står (planlagt spill,
// du står på lista, handicapet er fire uker gammelt).
import type { Ref } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Tap } from '../Tap';
import { HANDICAP_TEXT, handicapCardBody } from '../../lib/handicapCopy';
import { FONTS, fraunces, interLine, TAP, useTheme } from '../../theme';
import { HakeIcon } from '../icons/Icons';

export function HandicapCard({
  hcp,
  updatedAt,
  busy,
  onConfirm,
  onUpdate,
  updateRef,
}: {
  /** Signert: plusshandicap er negativt. */
  hcp: number;
  updatedAt: string;
  /** «Ja, stemmer» lagrer: knappene er låst så lenge. */
  busy: boolean;
  onConfirm: () => void;
  onUpdate: () => void;
  /** «Oppdater», som fokus går tilbake til når arket lukkes uten lagring. */
  updateRef?: Ref<View>;
}) {
  const { colors } = useTheme();
  const body = handicapCardBody(hcp, updatedAt);
  return (
    <View
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID="hcp-card"
    >
      <View style={styles.text}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          {HANDICAP_TEXT.cardTitle}
        </Text>
        <Text style={[styles.body, { color: colors.text }]} testID="hcp-card-body">
          {body.before}
          <Text style={styles.num}>{body.hcp}</Text>
          {body.after}
        </Text>
      </View>
      <View style={styles.row}>
        <Tap
          onPress={onConfirm}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy, busy }}
          style={[styles.button, { backgroundColor: colors.primary }, busy && styles.off]}
          testID="hcp-card-confirm"
        >
          <Text style={[styles.buttonText, { color: colors.onPrimary }]}>{HANDICAP_TEXT.confirm}</Text>
        </Tap>
        <Tap
          ref={updateRef}
          onPress={onUpdate}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          style={[styles.button, styles.outline, { borderColor: colors.primary }, busy && styles.off]}
          testID="hcp-card-update"
        >
          <Text style={[styles.buttonText, { color: colors.primary }]}>{HANDICAP_TEXT.update}</Text>
        </Tap>
      </View>
    </View>
  );
}

/** «Handicapet ditt er oppdatert.» der kortet sto. Målene er «Startkontingent betalt». */
export function HandicapReceipt({ receiptRef }: { receiptRef?: Ref<View> }) {
  const { colors } = useTheme();
  return (
    <View
      ref={receiptRef}
      accessible
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      style={[styles.card, styles.receipt, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID="hcp-receipt"
    >
      <HakeIcon color={colors.scoreUnderFg} size={18} strokeWidth={2.2} />
      <Text style={[styles.receiptText, { color: colors.scoreUnderFg }]}>{HANDICAP_TEXT.receipt}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Rammen som kontingentkortet. Skjermen har 8 mellom delene; 8 til gir
  // tegningens 16 ned til billetten.
  card: { marginBottom: 8, borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 },
  text: { gap: 6 },
  // Tittel og brødtekst som «Meld på laget ditt» (`OwnTeamCard`).
  title: fraunces(500, 22, 27.5),
  body: { ...interLine(15, 21.75, { multiline: true }), fontFamily: FONTS.sans },
  num: { fontFamily: FONTS.sansSemiBold, fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', gap: 10 },
  button: {
    flex: 1,
    minWidth: 0,
    minHeight: TAP,
    paddingHorizontal: 12,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outline: { borderWidth: 1 },
  buttonText: { ...interLine(16, 19), fontFamily: FONTS.sansSemiBold },
  off: { opacity: 0.4 },
  receipt: { paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  receiptText: { ...interLine(15, 18), fontFamily: FONTS.sansSemiBold },
});
