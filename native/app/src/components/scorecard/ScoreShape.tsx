// #2262: formene fra hullsiden på scorekortet — sirkel under par, firkant over,
// én ring til per slag lenger unna. Hvilken form et slag får, bestemmer den
// delte `scoreShape` (`lib/scoring/scoreShape.ts`), samme regel som webben.
//
// Tegnet med nestede `View`-er og kantlinjer, ikke SVG: en ring er bare en
// kant, og nesting holder tallet midt i den innerste ringen uten å regne.
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { scoreShape, type ScoreShape as ShapeKind } from '../../../../../lib/scoring/scoreShape';
import { useTheme } from '../../theme';

// Tett nok til at fire ringer (kvadruppel bogey) har plass til tallet i 26 pt.
const RING_GAP = 1.5;

const RINGS: Record<ShapeKind, { count: number; round: boolean }> = {
  none: { count: 0, round: false },
  circle: { count: 1, round: true },
  'double-circle': { count: 2, round: true },
  'triple-circle': { count: 3, round: true },
  square: { count: 1, round: false },
  'double-square': { count: 2, round: false },
  'triple-square': { count: 3, round: false },
  'quadruple-square': { count: 4, round: false },
};

/** Slaget på ett hull, i formen det har mot par. */
export function ScoreShape({
  strokes,
  par,
  size = 26,
}: {
  strokes: number;
  par: number;
  size?: number;
}) {
  const { colors, ui } = useTheme();
  const { count, round } = RINGS[scoreShape(strokes, par)];

  let content: ReactNode = (
    <Text style={[styles.number, ui.num, { color: colors.text }]}>{strokes}</Text>
  );
  // Innerst først: hver ring legger seg rundt den forrige.
  for (let ring = count - 1; ring >= 0; ring--) {
    const side = size - ring * 2 * RING_GAP;
    content = (
      <View
        style={[
          styles.ring,
          {
            width: side,
            height: side,
            borderRadius: round ? side / 2 : 2,
            borderColor: colors.text,
          },
        ]}
      >
        {content}
      </View>
    );
  }

  return (
    <View style={[styles.box, { width: size, height: size }]} testID={`shape-${scoreShape(strokes, par)}`}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
  ring: { borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  number: { fontSize: 14, textAlign: 'center' },
});
