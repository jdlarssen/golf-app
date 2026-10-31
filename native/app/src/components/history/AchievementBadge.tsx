// Tegnet bragd-merke på bragd-veggen: en liten sirkel med 1,5 hårlinje-ring og
// golfens eget tall i Fraunces («1», «−2», «−1», «3×»; `achievementMarks.ts` i
// webbens `lib/stats`). Samme merke som webbens `AchievementBadge`, i stedet for
// emoji. Merket er dekor, og forelderen bærer navnet og tallet til
// skjermleseren. Opptjent: champagne-ringen (`accent` er dekor) og `accentText`
// på tallet; ellers dempet.
import { StyleSheet, Text, View } from 'react-native';
import { fraunces, useTheme } from '../../theme';

export function AchievementBadge({ mark, earned }: { mark: string; earned: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.ring, { borderColor: earned ? colors.accent : colors.border }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="achievement-badge"
    >
      <Text style={[styles.mark, { color: earned ? colors.accentText : colors.muted }]}>
        {mark}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: { ...fraunces(500, 18), fontVariant: ['tabular-nums'] },
});
