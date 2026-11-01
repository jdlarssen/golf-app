// #2752: én cup i «Cupene dine» på Hjem. Samme rad som ligaen (`LeagueHomeRow`):
// navnet, fremdriften og pila. Ingen poeng (#1468).
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AppCupSummary } from '../../../../../lib/cup/appCupView';
import { homeCupLine } from '../../lib/cupCopy';
import { FONTS, fraunces, interLine, TAP, useTheme } from '../../theme';
import { ChevronIcon } from '../icons/Icons';

export function CupHomeRow({ cup, onPress }: { cup: AppCupSummary; onPress: () => void }) {
  const { colors } = useTheme();
  const line = homeCupLine(cup.status, cup.progress);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${cup.name}. ${line}`}
      style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID={`home-cup-${cup.id}`}
    >
      <View style={styles.text}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {cup.name}
        </Text>
        <Text style={[styles.line, { color: colors.muted }]} testID={`home-cup-line-${cup.id}`}>
          {line}
        </Text>
      </View>
      <ChevronIcon direction="right" color={colors.primary} size={16} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Rammen er ligaradens, siden de står under hverandre på Hjem.
  row: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: Math.max(TAP, 64),
  },
  text: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...fraunces(500, 15, 19) },
  line: { ...interLine(12, 16), fontFamily: FONTS.sans },
});
