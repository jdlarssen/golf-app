// #2752: ett valg i en liste, med rund markør. Brukt i byttet og i makkervalget.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FONTS, TAP, interLine, useTheme } from '../../theme';

export function CupOption({
  label,
  detail,
  selected,
  disabled,
  onPress,
  testID,
}: {
  label: string;
  detail?: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: disabled === true }}
      style={[
        styles.row,
        { backgroundColor: colors.surface, borderColor: selected ? colors.primary : colors.border },
      ]}
      testID={testID}
    >
      <View
        style={[
          styles.dot,
          selected
            ? { borderColor: colors.primary, borderWidth: 5 }
            : { borderColor: colors.muted, borderWidth: 1.5 },
        ]}
      />
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      {detail ? <Text style={[styles.detail, { color: colors.muted }]}>{detail}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: TAP,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  dot: { width: 18, height: 18, borderRadius: 9 },
  label: { flex: 1, fontSize: 14, fontFamily: FONTS.sans },
  detail: { ...interLine(12, 16), fontFamily: FONTS.sans },
});
