// #2265: kurven i formkortet og handicap-formen, med tallene ved prikkene.
//
// Målene er designlerretets (`Historikk-forslag`): 124 pt høy, kortets indre
// bredde minus 2 pt (se `CURVE.trailing`), rutelinjer på y 24, 60 og 96, beste runde på den øverste og
// dårligste på den nederste linja (ingen luft i domenet), x fra 12 til
// bredden − 14, og flaten ned til y 118. Bedre runder står høyere
// (`invertY`), så «opp er bedre» i begge kurvene.
//
// Tallene er vanlig tekst lagt oppå, ikke SVG-tekst: da er skriften appens
// Inter, og grunnlinja står der designet setter den (startverdien på y 112,
// etiketten ved gullprikken på y 12). Etiketten står 8 pt til venstre for
// prikken, høyrejustert; er det ikke plass (beste runde helt til venstre),
// står den 8 pt til høyre i stedet.
//
// Hele kurven er ÉN node for skjermleseren, med en oppsummering fra kalleren.
// Rundene står som tekst i dagboka under.
import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { buildScoringTrend } from '../../../../../lib/stats/scoringTrend';
import { FONTS, useTheme } from '../../theme';
import { TrendCurve } from '../icons/Icons';

/** Designets mål, i punkter. */
export const CURVE = {
  height: 124,
  /**
   * Designet tegner kurven 326 pt bred i kortets 328 pt indre bredde, så den
   * slutter 2 pt før høyrekanten.
   */
  trailing: 2,
  padding: { top: 24, right: 14, bottom: 28, left: 12 },
  areaBottom: 118,
  gridYs: [24, 60, 96],
  startBaseline: 112,
  bestBaseline: 12,
  labelGap: 8,
  startGap: 6,
} as const;

/** Inter sin ascent (1984/2048 fra `hhea`): fra toppen av linja til grunnlinja. */
const INTER_ASCENT = 1984 / 2048;
const LABEL_SIZE = 11;
const labelTop = (baseline: number) => baseline - LABEL_SIZE * INTER_ASCENT;

export function FormCurve({
  values,
  formatValue,
  bestText,
  accessibilityLabel,
  testID,
}: {
  /** Verdiene i kurven, eldst først; minst to. Lavere er bedre. */
  values: readonly number[];
  formatValue: (value: number) => string;
  /** Etiketten ved gullprikken («82 · ny rekord»). */
  bestText: string;
  accessibilityLabel: string;
  testID?: string;
}) {
  const { colors } = useTheme();
  // Boksens bredde; kurven er `CURVE.trailing` smalere (se over).
  const [boxWidth, setBoxWidth] = useState(0);
  const width = boxWidth > 0 ? boxWidth - CURVE.trailing : 0;
  const [bestWidth, setBestWidth] = useState(0);

  const geometry =
    width > 0
      ? buildScoringTrend(
          values.map((brutto) => ({ brutto, netto: null })),
          {
            width,
            height: CURVE.height,
            padding: CURVE.padding,
            invertY: true,
            padDomain: false,
            areaBottom: CURVE.areaBottom,
          },
        )
      : null;
  const first = geometry?.bruttoPoints[0];
  const best = geometry?.bruttoBestPoint;
  const bestRoomLeft = best ? best.x - CURVE.labelGap : 0;
  const bestOnRight = best != null && bestWidth > 0 && bestWidth > bestRoomLeft;

  return (
    <View
      style={styles.box}
      onLayout={(e: LayoutChangeEvent) => setBoxWidth(Math.round(e.nativeEvent.layout.width))}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      {geometry && first && best ? (
        <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <TrendCurve
            geometry={geometry}
            gridYs={CURVE.gridYs}
            colors={{
              grid: colors.divider,
              area: colors.primarySoft,
              line: colors.primary,
              best: colors.accent,
              bestRing: colors.surface,
            }}
            testID={testID ? `${testID}-svg` : undefined}
          />
          <Text
            style={[
              styles.label,
              { color: colors.muted, left: first.x + CURVE.startGap, top: labelTop(CURVE.startBaseline) },
            ]}
            testID={testID ? `${testID}-start` : undefined}
          >
            {formatValue(values[0])}
          </Text>
          <Text
            onLayout={(e) => setBestWidth(e.nativeEvent.layout.width)}
            style={[
              styles.label,
              styles.bestLabel,
              { color: colors.accentText, top: labelTop(CURVE.bestBaseline) },
              bestOnRight
                ? { left: best.x + CURVE.labelGap }
                : { right: boxWidth - bestRoomLeft, textAlign: 'right' },
            ]}
            testID={testID ? `${testID}-best-label` : undefined}
          >
            {bestText}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { height: CURVE.height, marginTop: 8 },
  // Ingen `lineHeight`: teksten står i Inter sin egen linjehøyde, så
  // grunnlinja ligger `LABEL_SIZE × ascent` under toppen.
  label: { position: 'absolute', fontSize: LABEL_SIZE, fontFamily: FONTS.sans },
  bestLabel: { fontFamily: FONTS.sansSemiBold },
});
