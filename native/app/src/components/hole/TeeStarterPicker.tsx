// #2751: «Hvem slår ut?» på hull-siden, for Patsome og foursomes. Trykket lagres
// på telefonen og sendes når det er nett, så det lykkes uansett. Valget kan ikke
// endres etterpå, som på nettet. Hvem som får spørsmålet, er `showsTeeStarterPicker`;
// skrivingen gjør skjermen (`onPick`).
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TEE_STARTER_TEXT } from '../../lib/holesCopy';
import { FONTS, TAP, fraunces, interLine, useTheme } from '../../theme';

export function TeeStarterPicker({
  question,
  options,
  saveFailed,
  onPick,
}: {
  question: string;
  /** Begge på laget. */
  options: readonly { userId: string; name: string }[];
  /** Telefonen fikk ikke lagret forrige trykk. */
  saveFailed: boolean;
  onPick: (userId: string) => void;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID="tee-starter-picker"
    >
      <Text style={[styles.question, { color: colors.text }]} accessibilityRole="header">
        {question}
      </Text>
      <View style={styles.buttons}>
        {options.map((option) => (
          <Pressable
            key={option.userId}
            onPress={() => onPick(option.userId)}
            accessibilityRole="button"
            style={[styles.button, { backgroundColor: colors.bg, borderColor: colors.border }]}
            testID={`tee-starter-${option.userId}`}
          >
            <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
              {option.name}
            </Text>
          </Pressable>
        ))}
      </View>
      {saveFailed ? (
        <Text
          style={[styles.error, { color: colors.danger }]}
          accessibilityLiveRegion="polite"
          testID="tee-starter-error"
        >
          {TEE_STARTER_TEXT.saveFailed}
        </Text>
      ) : null}
    </View>
  );
}

const ERROR_LINE = interLine(12, 16);

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16 },
  question: { ...fraunces(500, 14) },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 8 },
  button: {
    flex: 1,
    minWidth: 0,
    minHeight: TAP,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  name: { ...interLine(14, 17), fontFamily: FONTS.sansSemiBold },
  error: { ...ERROR_LINE, fontFamily: FONTS.sans, marginTop: ERROR_LINE.marginTop + 8 },
});
