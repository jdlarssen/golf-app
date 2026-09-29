// #2252: «Annet»-arket på skinna, appens motstykke til webbens
// `components/hole/SpecificValueSheet.tsx` (#2251).
//
// Hele det lovlige spennet i ett rutenett (1 til `MAX_STROKES`), så et
// kollapshull er ett trykk og ikke sju på stepperen. X fjerner scoren. I
// stableford-familien står «Stryk» under rutenettet: netto dobbel bogey, med
// poengene i etiketten. Kalleren skriver etiketten, så arket regner ingenting.
//
// Ingen animasjon, som på web: arket står der med en gang og forsvinner med en
// gang.
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { MAX_STROKES } from '../../../../../lib/scorecard/strokeEntry';
import { FONTS, useTheme } from '../../theme';

export type SpecificValueSheetProps = {
  open: boolean;
  par: number;
  onPick: (value: number) => void;
  onClear: () => void;
  onClose: () => void;
  /** «Stryk» i stableford-familien: verdien og etiketten, poeng inkludert. */
  strike?: { value: number; label: string };
};

const VALUES: number[] = Array.from({ length: MAX_STROKES }, (_, i) => i + 1);

export function SpecificValueSheet({
  open,
  par,
  onPick,
  onClear,
  onClose,
  strike,
}: SpecificValueSheetProps) {
  const { colors } = useTheme();
  if (!open) return null;

  const cell = [styles.cell, { borderColor: colors.border, backgroundColor: colors.bg }];
  const cellText = [styles.cellText, { color: colors.text }];

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        testID="specific-value-backdrop"
        accessibilityLabel="Lukk"
      >
        {/* Et trykk i selve arket skal ikke lukke det: den indre Pressable-en
            tar berøringen før bakgrunnen får den. */}
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.surface }]}
          testID="specific-value-sheet"
          accessibilityViewIsModal
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <Text style={[styles.kicker, { color: colors.muted }]} accessibilityRole="header">
            SPESIFIKK SCORE
          </Text>
          <View style={styles.grid}>
            {VALUES.map((v) => (
              <Pressable
                key={v}
                onPress={() => {
                  onPick(v);
                  onClose();
                }}
                // Par-knappen er ankeret øyet finner i et rutenett på 16.
                style={[cell, v === par && { borderColor: colors.primary }]}
                testID={`specific-value-${v}`}
                accessibilityRole="button"
                accessibilityLabel={`Sett score til ${v}`}
              >
                <Text style={cellText}>{v}</Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => {
                onClear();
                onClose();
              }}
              style={cell}
              testID="specific-value-clear"
              accessibilityRole="button"
              accessibilityLabel="Fjern score"
            >
              <Text style={cellText}>X</Text>
            </Pressable>
          </View>
          {strike ? (
            <Pressable
              onPress={() => {
                onPick(strike.value);
                onClose();
              }}
              style={[cell, styles.strike]}
              testID="specific-value-strike"
              accessibilityRole="button"
            >
              <Text style={[styles.strikeText, { color: colors.text }]}>{strike.label}</Text>
            </Pressable>
          ) : null}
          <Text style={[styles.caption, { color: colors.muted }]}>
            Trykk for å sette. X fjerner.
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15,22,18,0.4)',
  },
  sheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 20,
    paddingHorizontal: 18,
    paddingBottom: 36,
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  kicker: { fontSize: 11, fontFamily: FONTS.sansSemiBold, letterSpacing: 2.2, marginBottom: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // Fire i bredden.
  cell: {
    flexBasis: '22%',
    flexGrow: 1,
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellText: { fontSize: 22, fontFamily: FONTS.serifScore, fontVariant: ['tabular-nums'] },
  strike: { flexBasis: 'auto', marginTop: 8 },
  strikeText: { fontSize: 16, fontFamily: FONTS.sansSemiBold, fontVariant: ['tabular-nums'] },
  caption: { fontSize: 12, fontFamily: FONTS.sans, textAlign: 'center', marginTop: 14 },
});
