// #2385: hullstripa øverst på hullsiden, som på designlerretet (`Main`).
//
// Én rad uten å rulle: de ni hullene i halvdelen du står i, og en brikke for
// den andre halvdelen («10–18» eller «1–9») som bytter hvilke ni som vises.
// Hullet du står på er alltid synlig når siden åpnes. Spilte hull er kremfylte
// piller, hullet du står på er fylt skog, og de som gjenstår har bare kant.
//
// Trykkflatene er 44 pt høye og 34 pt brede. Ni hull på én rad gir ikke
// plass til 44 pt i bredden på en telefon. Brikkene er avlange (22 × 30), slik
// artboardet tegnes i nettleseren (eierens svar #2385).
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FONTS, TAP, useTheme } from '../../theme';

const HALF = 9;

/**
 * Skjermleserens tekst per hull, ordrett webbens `holes.entry.hullAriaLabel*`
 * (låst i testen mot messages/no.json).
 */
export const STRIP_LABELS = {
  plain: 'Hull {n}',
  done: 'Hull {n} – score ført',
  missing: 'Hull {n} – mangler score',
} as const;

function stripLabel(n: number, filled: boolean, current: number): string {
  const key = filled ? 'done' : n < current ? 'missing' : 'plain';
  return STRIP_LABELS[key].replace('{n}', String(n));
}

export function HoleStrip({
  holeNumber,
  holeCount,
  filled,
  onGo,
}: {
  holeNumber: number;
  holeCount: number;
  /** Hullene med score på raden du fører. */
  filled: readonly number[];
  onGo: (hole: number) => void;
}) {
  const { colors, hole, scheme } = useTheme();
  const currentHalf = holeNumber > HALF ? 1 : 0;
  const [half, setHalf] = useState(currentHalf);
  const halves = holeCount > HALF ? 2 : 1;
  const first = half * HALF + 1;
  const holes = Array.from({ length: Math.min(HALF, holeCount - half * HALF) }, (_, i) => first + i);
  const other = half === 0 ? [HALF + 1, holeCount] : [1, HALF];
  // Kremen på skogen i lys drakt; i mørk er skogen salvie, og tallet følger
  // `onPrimary`.
  const onCurrent = scheme === 'dark' ? colors.onPrimary : colors.onStrong;

  return (
    <View style={styles.row} testID="hole-strip">
      {holes.map((n) => {
        const isCurrent = n === holeNumber;
        const isFilled = filled.includes(n);
        return (
          <Pressable
            key={n}
            onPress={() => onGo(n)}
            style={styles.hit}
            testID={`hole-strip-${n}`}
            accessibilityRole="button"
            accessibilityState={{ selected: isCurrent }}
            accessibilityLabel={stripLabel(n, isFilled, holeNumber)}
          >
            <View
              testID={`hole-strip-${n}-pill`}
              style={[
                styles.pill,
                isCurrent
                  ? { backgroundColor: colors.primary }
                  : isFilled
                    ? { backgroundColor: colors.trackBg }
                    : { borderWidth: hole.borderW, borderColor: colors.border },
              ]}
            >
              <Text
                style={[
                  styles.number,
                  isCurrent
                    ? { color: onCurrent, fontFamily: FONTS.serifScore }
                    : { color: colors.muted },
                ]}
              >
                {n}
              </Text>
            </View>
          </Pressable>
        );
      })}
      {halves > 1 ? (
        <Pressable
          onPress={() => setHalf(half === 0 ? 1 : 0)}
          // Brikka er smal i designet; trykkflaten går ut til hull 9 og til
          // kanten av skjermen.
          hitSlop={{ left: 6, right: 16 }}
          style={styles.chip}
          testID="hole-strip-other-half"
          accessibilityRole="button"
          accessibilityLabel={`Vis hull ${other[0]}–${other[1]}`}
        >
          {/* To linjer, «10–» over «18», som designet: det er ikke plass til
              begge på én linje etter ni hull. */}
          <Text style={[styles.chipText, { color: colors.muted }]}>{`${other[0]}–\n${other[1]}`}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// Designets mål (`Main`, slik nettleseren tegner det): knapper på 34 pt med
// 4 pt mellom fra 16 pt inn, og brikker på 22 × 30 pt med helt runde ender.
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 6, paddingHorizontal: 16 },
  hit: { width: 34, height: TAP, alignItems: 'center', justifyContent: 'center' },
  pill: {
    width: 22,
    height: 30,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  number: { fontSize: 14, fontFamily: FONTS.serifDisplay },
  chip: { minHeight: TAP, marginLeft: 2, justifyContent: 'center' },
  chipText: { fontSize: 11, fontFamily: FONTS.sans },
});
