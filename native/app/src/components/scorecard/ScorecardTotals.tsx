// #2262: summene under scorekortet i store tall (BRUTTO · NETTO · POENG) og
// «14 av 18 hull» så lenge noe mangler. NETTO står også i stableford, som i
// designet (#2385), men aldri mens en reveal-runde pågår.
//
// #2385 la summene på designlerretet (`Scorekort-forslag`): de står nederst i
// det siste kortet (`ScorecardGrid` sin `footer`, under den tykke streken),
// BRUTTO og NETTO til venstre og POENG større og skoggrønt til høyre.
import { StyleSheet, Text, View } from 'react-native';
import type { ScorecardGridTotals } from '../../../../../lib/scorecard/scorecardGrid';
import { FONTS, frauncesLine, useTheme } from '../../theme';

export function ScorecardTotals({
  totals,
  showNet,
  showPoints,
}: {
  totals: ScorecardGridTotals;
  showNet: boolean;
  showPoints: boolean;
}) {
  const { colors, ui } = useTheme();
  const left: { key: string; label: string; value: number | null }[] = [
    { key: 'brutto', label: 'Brutto', value: totals.brutto },
    ...(showNet ? [{ key: 'netto', label: 'Netto', value: totals.netto }] : []),
  ];
  const label = [styles.label, { color: colors.muted }];

  return (
    <View style={styles.wrap} testID="scorecard-totals">
      <View style={styles.row}>
        <View style={styles.left}>
          {left.map((stat) => (
            <View
              key={stat.key}
              accessible
              accessibilityLabel={`${stat.label} ${stat.value ?? 'ukjent'}`}
            >
              <Text style={label}>{stat.label}</Text>
              <Text style={[styles.value, ui.num, { color: colors.text }]} testID={`total-${stat.key}`}>
                {stat.value ?? '—'}
              </Text>
            </View>
          ))}
        </View>
        {showPoints ? (
          <View
            style={styles.right}
            accessible
            accessibilityLabel={`Poeng ${totals.points ?? 'ukjent'}`}
          >
            <Text style={[label, styles.rowLabel]}>Poeng</Text>
            <Text
              style={[styles.points, ui.num, { color: colors.primary }]}
              testID="total-poeng"
            >
              {totals.points ?? '—'}
            </Text>
          </View>
        ) : null}
      </View>
      {totals.played < totals.holeCount ? (
        <Text style={ui.muted} testID="totals-progress">
          {totals.played} av {totals.holeCount} hull
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  left: { flexDirection: 'row', gap: 16 },
  right: { alignItems: 'flex-end' },
  label: {
    fontSize: 10,
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  // POENG-kolonnen er den høyeste og bestemmer raden: 12 + 30, som
  // nettleserens avrundede linjer. Etikettene til venstre har sin naturlige
  // høyde, og tallene nettleserens 28, så alt står på samme punkt som i
  // designet.
  rowLabel: { lineHeight: 12 },
  value: { fontSize: 22, lineHeight: 28, fontFamily: FONTS.serifScore },
  // Designets `line-height: 1`, som nettleseren tegner den (#2385).
  points: { ...frauncesLine(30, 30), fontFamily: FONTS.serifScore },
});
