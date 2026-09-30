// Toppen fra designlerretet (#2255, #2256): tilbake-pila, et lite sperret ord
// i midten og ingen skillelinje. Ordet sier hvor du er («STARTBILLETT»,
// «PROFIL», «MITT SCOREKORT»); sidens egen tittel står stort i innholdet
// (`PageTitle`). Én stil for alle: den delte `ui.kicker`.
//
// #2385 flyttet den hit fra `navigation.tsx`, så en skjerm kan sette ordet
// selv når det først er kjent etter lasting (scorekortet sier «Lagets
// scorekort · Lag 2» i lagformatene).
//
// #2385 («Felles topp»): toppen er designets egen rad (`KickerTopBar`) i
// stedet for iOS sin navigasjonslinje, gjennom native-stack sin
// `header`-opsjon. iOS 26 la linja 9 pt høyere enn designet og tegnet
// glassbobler rundt knappene. Designets rad: 8 pt luft over og på sidene,
// tilbake-pila og høyre-knappen i hver sin boks på 44 × 44, og ordet midt
// mellom dem; 52 pt i alt under sikker-sonen. Sveip tilbake er fortsatt
// systemets, fordi skjermen fortsatt ligger i den native stakken.
//
// Uten ord (`kickerHeader('', …)`) er raden bare pila: Profil har den til
// bunnmenyen kommer (eierens svar, #2385). Pila heter «Tilbake», eller det
// designet kaller den der det sier noe (`backLabel`: «Tilbake til profil» i
// rommene under profilen).
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAP, useTheme } from '../theme';
import { TilbakeIcon } from './icons/Icons';

/** Luften over raden (under sikker-sonen) og ut til kantene, som i designet. */
const BAR_INSET = 8;
/** Pila sin etikett når designet ikke sier noe annet. */
const BACK_LABEL = 'Tilbake';

/**
 * Header-valgene for toppen. `title` er skjermens navn for systemet: iOS
 * bruker det på tilbake-knappen og i tilbake-menyen på neste skjerm med
 * native topp (hullsiden, tavla), og det kan være et annet enn ordet i toppen.
 * Høyre-knappen er skjermens egen `headerRight` (del-knappen på billetten),
 * som skjermen setter med `setOptions`.
 */
export function kickerHeader(
  kicker: string,
  title: string,
  { backLabel = BACK_LABEL }: { backLabel?: string } = {},
): NativeStackNavigationOptions {
  return {
    title,
    header: ({ back, navigation, options }) => (
      <KickerTopBar
        kicker={kicker}
        backLabel={backLabel}
        onBack={back ? () => navigation.goBack() : undefined}
        right={options.headerRight?.({ canGoBack: back != null })}
      />
    ),
  };
}

/**
 * Raden: tilbake-pila til venstre, ordet i midten og høyre-knappen. En tom
 * boks står der det ikke er noen knapp, så ordet alltid står midt på skjermen.
 */
function KickerTopBar({
  kicker,
  backLabel,
  onBack,
  right,
}: {
  kicker: string;
  backLabel: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  const { colors, ui } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: insets.top + BAR_INSET, backgroundColor: colors.bg }]}>
      <View style={styles.slot}>
        {onBack ? <BareBack label={backLabel} onPress={onBack} /> : null}
      </View>
      {/* Et langt ord (et spillnavn, #2392) kuttes med «…» på én linje i
          stedet for å bryte toppen over to; skjermleseren får hele. */}
      {kicker ? (
        <Text
          accessibilityRole="header"
          accessibilityLabel={kicker}
          numberOfLines={1}
          ellipsizeMode="tail"
          style={[ui.kicker, styles.kicker]}
        >
          {kicker}
        </Text>
      ) : (
        <View style={styles.kicker} />
      )}
      <View style={styles.slot} testID="kicker-top-bar-right">
        {right}
      </View>
    </View>
  );
}

/** Tilbake-pila uten bakgrunn, midt i 44 pt å treffe på. */
function BareBack({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.slot}
      testID="header-back"
    >
      <TilbakeIcon color={colors.text} size={20} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: BAR_INSET },
  slot: { width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center' },
  kicker: { flex: 1, textAlign: 'center' },
});
