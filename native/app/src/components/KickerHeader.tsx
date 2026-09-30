// Toppen fra designlerretet (#2255, #2256): tilbake-pila, et lite sperret ord
// i midten og ingen skillelinje. Egen fil, så både navigatoren (faste ord som
// «STARTBILLETT» og «PROFIL») og en skjerm som setter ordet selv (spillnavnet
// på «Hull for hull», `setOptions`) bruker samme hjelper uten å importere
// navigatoren, som importerer skjermene.
import { StyleSheet, Text } from 'react-native';
import { FONTS, useTheme } from '../theme';

/**
 * Ordet sier hvor du er; sidens egen tittel står stort i innholdet
 * (`PageTitle`). Én stil for alle, i samme kicker-stil som feltetikettene i
 * billetten.
 *
 * `title` er skjermens navn for systemet (app-bytteren, VoiceOver sin
 * «tilbake»), som kan være et annet enn ordet i toppen.
 */
export function kickerHeader(kicker: string, title: string) {
  return {
    title,
    headerTitle: () => <KickerTitle label={kicker} />,
    headerShadowVisible: false,
  };
}

function KickerTitle({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <Text
      accessibilityRole="header"
      numberOfLines={1}
      style={[styles.kickerTitle, { color: colors.muted }]}
      testID="kicker-title"
    >
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  kickerTitle: {
    fontSize: 10,
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
});
