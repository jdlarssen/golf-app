// #2385: hullstripa øverst på hullsiden, som på designlerretet (`Main`).
//
// Én rad uten å rulle: de ni hullene i halvdelen du står i, og en brikke for
// den andre halvdelen («10–18» eller «1–9») som bytter hvilke ni som vises.
// Hullet du står på er alltid synlig når siden åpnes. Spilte hull er kremfylte
// piller, hullet du står på er fylt skog, og de som gjenstår har bare kant.
//
// #2752: hullene kommer inn utenfra. På en delt cup-dag er de 18 hullene to spill,
// men stripa er den samme. Har spillet bare én halvdel, står ingen brikke.
//
// Trykkflatene er 44 pt høye og 34 pt brede. Ni hull på én rad gir ikke
// plass til 44 pt i bredden på en telefon. Brikkene er avlange (22 × 30), slik
// artboardet tegnes i nettleseren (eierens svar #2385).
//
// #2928: `hitSlop` lar flatene møtes, uten å endre det som tegnes. Hvert hull
// tar halve mellomrommet (2 pt) på hver side, det første går ut til kanten av
// skjermen, og det siste før brikka stopper der brikkas egen utvidelse begynner.
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Tap } from '../Tap';
import { FONTS, fraunces, frauncesFamily, TAP, useTheme } from '../../theme';
import { HOLE_BOX_TEXT_CAP } from './holeTextCap';

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

/** Mellomrommet mellom to hull, og luften fra kanten til det første. */
export const STRIP_GAP = 4;
export const STRIP_EDGE = 16;
/** Brikka: ut til hull 9 (mellomrommet og egen marg) og til kanten av skjermen. */
export const CHIP_SLOP = { left: 6, right: 16 };

/**
 * #2928: hvor langt trykkflaten til hull nummer `i` i raden går ut på hver side.
 * Uten brikke går det siste hullet ut til kanten, som det første.
 */
export function stripSlop(i: number, count: number, chip: boolean): { left: number; right: number } {
  const half = STRIP_GAP / 2;
  const left = i === 0 ? STRIP_EDGE : half;
  // Brikkas `hitSlop.left` (6) dekker hele luften fram til den (4 + 2).
  const right = i < count - 1 ? half : chip ? 0 : STRIP_EDGE;
  return { left, right };
}

export function HoleStrip({
  holeNumber,
  holes: allHoles,
  filled,
  onGo,
}: {
  holeNumber: number;
  /** Hullene i runden, stigende. */
  holes: readonly number[];
  /** Hullene med score på raden du fører. */
  filled: readonly number[];
  onGo: (hole: number) => void;
}) {
  const { colors, hole, scheme } = useTheme();
  const currentHalf = holeNumber > HALF ? 1 : 0;
  const [half, setHalf] = useState(currentHalf);
  const inHalf = (h: number, which: number) => (h > HALF ? 1 : 0) === which;
  const holes = allHoles.filter((n) => inHalf(n, half));
  const otherHoles = allHoles.filter((n) => !inHalf(n, half));
  // Kremen på skogen i lys drakt; i mørk er skogen salvie, og tallet følger
  // `onPrimary`.
  const onCurrent = scheme === 'dark' ? colors.onPrimary : colors.onStrong;

  return (
    <View style={styles.row} testID="hole-strip">
      {holes.map((n, i) => {
        const isCurrent = n === holeNumber;
        const isFilled = filled.includes(n);
        return (
          <Tap
            key={n}
            onPress={() => onGo(n)}
            hitSlop={stripSlop(i, holes.length, otherHoles.length > 0)}
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
              <Text maxFontSizeMultiplier={HOLE_BOX_TEXT_CAP}
                style={[
                  styles.number,
                  isCurrent
                    ? { color: onCurrent, fontFamily: frauncesFamily(600, 14) }
                    : { color: colors.muted },
                ]}
              >
                {n}
              </Text>
            </View>
          </Tap>
        );
      })}
      {otherHoles.length > 0 ? (
        <Tap
          onPress={() => setHalf(half === 0 ? 1 : 0)}
          // Brikka er smal i designet; trykkflaten går ut til hull 9 og til
          // kanten av skjermen.
          hitSlop={CHIP_SLOP}
          style={styles.chip}
          testID="hole-strip-other-half"
          accessibilityRole="button"
          accessibilityLabel={`Vis hull ${otherHoles[0]}–${otherHoles[otherHoles.length - 1]}`}
        >
          {/* To linjer, «10–» over «18», som designet: det er ikke plass til
              begge på én linje etter ni hull. */}
          <Text maxFontSizeMultiplier={HOLE_BOX_TEXT_CAP} style={[styles.chipText, { color: colors.muted }]}>{`${otherHoles[0]}–\n${otherHoles[otherHoles.length - 1]}`}</Text>
        </Tap>
      ) : null}
    </View>
  );
}

// Designets mål (`Main`, slik nettleseren tegner det): knapper på 34 pt med
// 4 pt mellom fra 16 pt inn, og brikker på 22 × 30 pt med helt runde ender.
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: STRIP_GAP, paddingTop: 6, paddingHorizontal: STRIP_EDGE },
  hit: { width: 34, height: TAP, alignItems: 'center', justifyContent: 'center' },
  pill: {
    width: 22,
    height: 30,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  number: { ...fraunces(500, 14) },
  chip: { minHeight: TAP, marginLeft: 2, justifyContent: 'center' },
  chipText: { fontSize: 11, fontFamily: FONTS.sans },
});
