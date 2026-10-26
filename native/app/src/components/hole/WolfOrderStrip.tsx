// #2314: «Wolf-rekkefølgen» under hullhodet. Hvem er ulv på dette hullet og
// de tre neste, så flighten vet hvem som slår sist før den står på tee.
//
// Innholdet er ferdig regnet i `wolfOrderStrip` (`lib/wolfHole.ts`): «Deg»,
// fornavnet, eller «Avgjøres» på de siste hullene der stillingen bestemmer.
// Ditt eget hull er markert med skogsflaten, ikke gull: å være ulv er ikke en
// seier. Ingen knapp her: ulvens kort på hullet kan ikke lukkes uten et valg,
// så det finnes ikke noe å åpne igjen.
import { StyleSheet, Text, View } from 'react-native';
import type { WolfOrderStripState } from '../../lib/wolfHole';
import { FONTS, useTheme } from '../../theme';

export function WolfOrderStrip({ strip }: { strip: WolfOrderStripState }) {
  const { colors, hole, ui } = useTheme();
  return (
    <View style={styles.wrap} testID="wolf-order">
      <Text style={ui.kicker} accessibilityRole="header">
        Wolf-rekkefølgen
      </Text>
      <View style={styles.row} accessibilityRole="list">
        {strip.columns.map((column) => (
          <View
            key={column.hole}
            accessible
            accessibilityLabel={column.accessibilityLabel}
            style={[
              styles.cell,
              {
                backgroundColor: column.isMine ? colors.primarySoft : colors.bg,
                borderColor: column.isMine ? colors.primary : colors.border,
                borderWidth: hole.borderW,
              },
            ]}
            testID={`wolf-order-${column.hole}`}
          >
            <Text style={[styles.hole, { color: colors.muted }]}>{`Hull ${column.hole}`}</Text>
            <Text
              style={[styles.name, { color: column.isMine ? colors.primary : colors.text }]}
              numberOfLines={1}
            >
              {column.label}
            </Text>
          </View>
        ))}
      </View>
      {strip.ruleLine ? (
        <Text style={[ui.muted, styles.rule]} testID="wolf-order-rule">
          {strip.ruleLine}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  cell: {
    flex: 1,
    minHeight: 56,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 8,
    justifyContent: 'center',
    gap: 2,
  },
  hole: { fontSize: 11, fontFamily: FONTS.sans, fontVariant: ['tabular-nums'] },
  name: { fontSize: 15, fontFamily: FONTS.sansSemiBold },
  rule: { fontSize: 13 },
});
