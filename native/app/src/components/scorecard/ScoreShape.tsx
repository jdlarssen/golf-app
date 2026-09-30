// #2262: formene fra hullsiden på scorekortet — sirkel under par, firkant over,
// én ring til per slag lenger unna. Hvilken form et slag får, bestemmer den
// delte `scoreShape` (`lib/scoring/scoreShape.ts`), samme regel som webben.
//
// Tegnet med nestede `View`-er og kantlinjer, ikke SVG: en ring er bare en
// kant, og nesting holder tallet midt i den innerste ringen uten å regne.
//
// Uten `toned` er ringene i blekk. «Hull for hull» (#2255) farger ringene
// etter scoretonen, som webbens visning gjør (`toned`), med den delte
// `scoreTone`. Scorekortet (#2385, designlerretet `Scorekort-forslag`) farger
// også tallet (`tonedNumber`): under par grønt, +1 amber, +2 og verre
// murstein, par mørkt uten form.
//
// #2385 la tegningen på designlerretet for alle som bruker formen: tallet
// står i Fraunces, firkantene har skarpe hjørner, streken er 1,5, og en dobbel
// form har tydelig luft mellom ringene.
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { scoreShape, type ScoreShape as ShapeKind } from '../../../../../lib/scoring/scoreShape';
import { scoreTone } from '../../../../../lib/scoring/scoreTone';
import { scoreToneColor } from '../../lib/scoreToneColor';
import { FONTS, useTheme } from '../../theme';

/** Streken i ringene, som designets 1,5 px. */
const RING_W = 1.5;

/**
 * Luft mellom to ringer. Designets doble former har rundt 2 pt; tre og fire
 * ringer må stå tettere for at tallet skal få plass i 26 pt.
 */
const ringSpace = (count: number) => (count <= 2 ? 2 : 0.5);

/** Tallet krymper med ringene rundt; uten form står det litt større. */
const NUMBER_SIZE = [15, 14, 13, 11, 9] as const;

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
  toned = false,
  tonedNumber = false,
}: {
  strokes: number;
  par: number;
  size?: number;
  /** Ringene i scoretonen (webbens «Hull for hull»), ellers i blekk. */
  toned?: boolean;
  /** Tallet i scoretonen også (scorekortet); par står alltid i blekk. */
  tonedNumber?: boolean;
}) {
  const { colors, ui } = useTheme();
  const { count, round } = RINGS[scoreShape(strokes, par)];
  const tone = scoreTone(strokes, par);
  const toneColor = tone === 'par' ? colors.text : scoreToneColor(tone, colors);
  const ringColor = toned ? toneColor : colors.text;
  const numberColor = tonedNumber ? toneColor : colors.text;
  const step = RING_W + ringSpace(count);

  let content: ReactNode = (
    <Text
      style={[styles.number, ui.num, { color: numberColor, fontSize: NUMBER_SIZE[count] ?? 9 }]}
      testID="score-shape-number"
    >
      {strokes}
    </Text>
  );
  // Innerst først: hver ring legger seg rundt den forrige.
  for (let ring = count - 1; ring >= 0; ring--) {
    const side = size - ring * 2 * step;
    content = (
      <View
        style={[
          styles.ring,
          {
            width: side,
            height: side,
            borderRadius: round ? side / 2 : 0,
            borderColor: ringColor,
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
  ring: { borderWidth: RING_W, alignItems: 'center', justifyContent: 'center' },
  number: { fontFamily: FONTS.serifScore, textAlign: 'center' },
});
