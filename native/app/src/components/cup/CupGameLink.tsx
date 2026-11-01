// #2752: «Se cupen» på spillets side, som `CupStandingsLink` på nettet.
import { Pressable, StyleSheet, Text } from 'react-native';
import { CUP_TEXT } from '../../lib/cupCopy';
import { FONTS, TAP, useTheme } from '../../theme';
import { ChevronIcon } from '../icons/Icons';

export function CupGameLink({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID="open-cup"
    >
      <Text style={[styles.text, { color: colors.text }]}>{CUP_TEXT.gameLink}</Text>
      <ChevronIcon direction="right" color={colors.primary} size={16} strokeWidth={2} />
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
  },
  text: { flex: 1, fontSize: 14, fontFamily: FONTS.sansMedium },
});
