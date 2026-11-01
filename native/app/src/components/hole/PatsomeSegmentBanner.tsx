// #2751: hvilken del av Patsome hullet hører til, med regelen i én linje. Står
// på alle 18 hull, med nettets tekster (`holes.patsome`).
import { StyleSheet, Text, View } from 'react-native';
import { PATSOME_HOLE_TEXT } from '../../lib/holesCopy';
import { patsomeSegmentFor } from '../../lib/teamPlay';
import { FONTS, fraunces, interLine, useTheme } from '../../theme';

const SEGMENT_TEXT = {
  fourball: { label: PATSOME_HOLE_TEXT.fourballLabel, rule: PATSOME_HOLE_TEXT.fourballRule },
  greensome: { label: PATSOME_HOLE_TEXT.greensomeLabel, rule: PATSOME_HOLE_TEXT.greensomeRule },
  foursomes: { label: PATSOME_HOLE_TEXT.foursomesLabel, rule: PATSOME_HOLE_TEXT.foursomesRule },
} as const;

export function PatsomeSegmentBanner({ holeNumber }: { holeNumber: number }) {
  const { colors } = useTheme();
  const { label, rule } = SEGMENT_TEXT[patsomeSegmentFor(holeNumber)];
  return (
    <View
      style={[styles.banner, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID="patsome-segment-banner"
    >
      <Text style={[styles.label, { color: colors.primary }]}>{label}</Text>
      <Text style={[styles.rule, { color: colors.muted }]}>{rule}</Text>
    </View>
  );
}

const RULE_LINE = interLine(12, 16);

const styles = StyleSheet.create({
  banner: { borderWidth: 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16 },
  label: { ...fraunces(600, 14) },
  rule: { ...RULE_LINE, fontFamily: FONTS.sans, marginTop: RULE_LINE.marginTop + 2 },
});
