// #2262: summene under scorekortet i store tall (BRUTTO · NETTO · POENG) og
// «14 av 18 hull» så lenge noe mangler. Bare tallene kortet selv viser: et
// reveal-spill har ingen NETTO-rad, og da står heller ingen netto-sum her.
//
// #2385 la summene på designlerretet (`Scorekort-forslag`): de står nederst i
// det siste kortet (`ScorecardGrid` sin `footer`, under den tykke streken),
// BRUTTO og NETTO til venstre og POENG større og skoggrønt til høyre.
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
            <Text style={label}>Poeng</Text>
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
  row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  left: { flexDirection: 'row', gap: 16 },
  right: { alignItems: 'flex-end' },
  label: {
    fontSize: 10,
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  value: { fontSize: 22, lineHeight: 27, fontFamily: FONTS.serifScore },
  points: { fontSize: 30, lineHeight: 32, fontFamily: FONTS.serifScore },
});
