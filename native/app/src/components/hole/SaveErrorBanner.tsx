// #2228 (designlerretet, «Lagringsfeil-forslag»): banneret når telefonen ikke
// fikk lagret et trykk på hullsiden. Rød tekst og varseltrekant på et lyst rødt
// fyll med tynn rød ramme, rett under hull-hodet.
//
// Skjermleseren får teksten to veier: hullsiden kunngjør den når feilen
// oppstår, og `accessibilityLiveRegion` leser en ny tekst opp på Android.
import { StyleSheet, Text, View } from 'react-native';
import { FONTS, interLine, useTheme } from '../../theme';
import { VarselIcon } from '../icons/Icons';

export function SaveErrorBanner({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.banner, { backgroundColor: colors.dangerSoft, borderColor: colors.dangerBorder }]}
      accessibilityLiveRegion="polite"
      testID="hole-save-error"
    >
      <VarselIcon color={colors.danger} size={18} strokeWidth={2} />
      <Text style={[styles.text, { color: colors.danger }]} lineBreakStrategyIOS="push-out">
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginTop: 10,
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  // Lerretet: 13 pt med 18 pt linje, vekt 500.
  text: { flex: 1, ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sansMedium },
});
