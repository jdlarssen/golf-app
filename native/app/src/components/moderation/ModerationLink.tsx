// #3019: inngangen til «Rapporter eller blokker» (tegning 1A, 7 og 9): stille
// tekst, 15/600 i dempet farge, 44 høy og midtstilt, så Apple finner den uten
// at den roper til vennene. Samme element på vennesiden, påmeldingen og
// startbilletten.
import { StyleSheet, Text } from 'react-native';
import { Tap } from '../Tap';
import { FONTS, interLine, useTheme } from '../../theme';

export function ModerationLink({
  label,
  onPress,
  testID,
}: {
  label: string;
  onPress: () => void;
  testID: string;
}) {
  const { colors } = useTheme();
  return (
    <Tap style={styles.link} onPress={onPress} accessibilityRole="button" testID={testID}>
      <Text style={[styles.text, { color: colors.muted }]}>{label}</Text>
    </Tap>
  );
}

const styles = StyleSheet.create({
  link: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  text: { ...interLine(15, 19), fontFamily: FONTS.sansSemiBold },
});
