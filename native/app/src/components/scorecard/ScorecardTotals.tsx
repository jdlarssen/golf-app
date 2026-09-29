// #2262: summene under scorekortet i store tall (BRUTTO · NETTO · POENG) og
// «14 av 18 hull» så lenge noe mangler. Bare tallene kortet selv viser: et
// reveal-spill har ingen NETTO-rad, og da står heller ingen netto-sum her.
import { StyleSheet, Text, View } from 'react-native';
import type { ScorecardGridTotals } from '../../../../../lib/scorecard/scorecardGrid';
import { FONTS, useTheme } from '../../theme';

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
  const stats: { key: string; label: string; value: number | null }[] = [
    { key: 'brutto', label: 'Brutto', value: totals.brutto },
    ...(showNet ? [{ key: 'netto', label: 'Netto', value: totals.netto }] : []),
    ...(showPoints ? [{ key: 'poeng', label: 'Poeng', value: totals.points }] : []),
  ];

  return (
    <View style={styles.wrap} testID="scorecard-totals">
      <View style={styles.row}>
        {stats.map((stat) => (
          <View
            key={stat.key}
            style={styles.stat}
            accessible
            accessibilityLabel={`${stat.label} ${stat.value ?? 'ukjent'}`}
          >
            <Text style={[ui.sectionTitle, styles.label]}>{stat.label}</Text>
            <Text style={[styles.value, ui.num, { color: colors.text }]} testID={`total-${stat.key}`}>
              {stat.value ?? '—'}
            </Text>
          </View>
        ))}
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
  wrap: { gap: 4, marginTop: 12, alignItems: 'center' },
  row: { flexDirection: 'row', justifyContent: 'center', gap: 28 },
  stat: { alignItems: 'center' },
  label: { marginTop: 0 },
  value: { fontSize: 34, fontFamily: FONTS.serifScore },
});
