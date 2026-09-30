// Toppen fra designlerretet (#2255, #2256): tilbake-pila, et lite sperret ord
// i midten og ingen skillelinje. Ordet sier hvor du er («STARTBILLETT»,
// «PROFIL», «MITT SCOREKORT»); sidens egen tittel står stort i innholdet
// (`PageTitle`). Én stil for alle: den delte `ui.kicker`.
//
// #2385 flyttet den hit fra `navigation.tsx`, så en skjerm kan sette ordet
// selv når det først er kjent etter lasting (scorekortet sier «Lagets
// scorekort · Lag 2» i lagformatene).
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { Pressable, StyleSheet, Text } from 'react-native';
import { TAP, useTheme } from '../theme';
import { TilbakeIcon } from './icons/Icons';

/**
 * Header-valgene for toppen. `title` er skjermens navn for systemet
 * (app-bytteren, VoiceOver sin «tilbake»), som kan være et annet enn ordet i
 * toppen.
 */
export function kickerHeader(kicker: string, title: string): NativeStackNavigationOptions {
  return {
    title,
    headerTitle: () => <KickerTitle label={kicker} />,
    headerShadowVisible: false,
    // Designets bare vinkel i stedet for iOS 26 sin glassboble: egen knapp,
    // og `hidesSharedBackground` tar bort boblen bak den.
    headerBackVisible: false,
    unstable_headerLeftItems: ({ canGoBack }) =>
      canGoBack ? [{ type: 'custom', element: <BareBack />, hidesSharedBackground: true }] : [],
  };
}

/** Tilbake-pila uten bakgrunn, med 44 pt å treffe på. */
function BareBack() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => navigation.goBack()}
      accessibilityRole="button"
      accessibilityLabel="Tilbake"
      style={styles.back}
      testID="header-back"
    >
      <TilbakeIcon color={colors.text} size={20} strokeWidth={2} />
    </Pressable>
  );
}

/**
 * Ordet i toppen. Et langt ord (et spillnavn, #2392) kuttes med «…» på én
 * linje i stedet for å bryte toppen over to; skjermleseren får hele.
 */
function KickerTitle({ label }: { label: string }) {
  const { ui } = useTheme();
  return (
    <Text
      accessibilityRole="header"
      accessibilityLabel={label}
      numberOfLines={1}
      ellipsizeMode="tail"
      style={ui.kicker}
    >
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  back: { width: TAP, height: TAP, alignItems: 'flex-start', justifyContent: 'center' },
});
