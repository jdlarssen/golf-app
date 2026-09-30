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
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FONTS, SUNLIGHT_THEME, TAP, ThemeScope, useTheme } from '../theme';
import { TilbakeIcon } from './icons/Icons';

/** Luften over raden (under sikker-sonen) og ut til kantene, som i designet. */
const BAR_INSET = 8;
/** Pila sin etikett når designet ikke sier noe annet. */
const BACK_LABEL = 'Tilbake';
/**
 * Sollys (`Hull-sollys`): raden er 56 pt, med 12 pt ut til høyre kant, og
 * pila er 22 pt med 2,4 pt strek.
 */
const SUNLIGHT_ROW = 48;
const SUNLIGHT_RIGHT = 12;

type TopOptions = {
  backLabel?: string;
  /** En linje under ordet (hullsiden: «format · bane»). */
  subtitle?: string;
  /** Gull er spillnavnet på hullsiden; ellers det dempede ordet. */
  tone?: 'muted' | 'gold';
  /** Hullsiden i sollys: svart og hvitt, større pil, ingen tittel. */
  sunlight?: boolean;
};

/**
 * Header-valgene for toppen. `title` er skjermens navn for systemet: iOS
 * bruker det på tilbake-knappen og i tilbake-menyen på neste skjerm med
 * native topp (tavla), og det kan være et annet enn ordet i toppen.
 * Høyre-knappene er skjermens egen `headerRight` (del-knappen på billetten,
 * sollys og pokalen på hullsiden), som skjermen setter med `setOptions`.
 */
export function kickerHeader(
  kicker: string,
  title: string,
  { backLabel = BACK_LABEL, subtitle, tone = 'muted', sunlight = false }: TopOptions = {},
): NativeStackNavigationOptions {
  return {
    title,
    header: ({ back, navigation, options }) => (
      <ThemeScope theme={sunlight ? SUNLIGHT_THEME : null}>
        <KickerTopBar
          kicker={kicker}
          subtitle={subtitle}
          tone={tone}
          sunlight={sunlight}
          backLabel={backLabel}
          onBack={back ? () => navigation.goBack() : undefined}
          right={options.headerRight?.({ canGoBack: back != null })}
        />
      </ThemeScope>
    ),
  };
}

/**
 * Raden: tilbake-pila til venstre, ordet i midten og høyre-knappene. Venstre
 * side er alltid like bred som høyre (minst 44 pt), så ordet står midt på
 * skjermen også når høyre side har to knapper.
 */
function KickerTopBar({
  kicker,
  subtitle,
  tone,
  sunlight,
  backLabel,
  onBack,
  right,
}: {
  kicker: string;
  subtitle?: string;
  tone: 'muted' | 'gold';
  sunlight: boolean;
  backLabel: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  const { colors, ui } = useTheme();
  const insets = useSafeAreaInsets();
  const [rightWidth, setRightWidth] = useState<number>(TAP);
  const side = Math.max(TAP, rightWidth);
  const ink = tone === 'gold' ? colors.accentText : colors.muted;
  return (
    <View
      style={[
        styles.bar,
        { paddingTop: insets.top + BAR_INSET, backgroundColor: colors.bg },
        sunlight && [styles.barSunlight, { minHeight: insets.top + BAR_INSET + SUNLIGHT_ROW }],
      ]}
      testID="kicker-top-bar"
    >
      <View style={[styles.side, { width: side }]}>
        {onBack ? <BareBack label={backLabel} large={sunlight} onPress={onBack} /> : null}
      </View>
      {/* Et langt ord (et spillnavn, #2392) kuttes med «…» på én linje i
          stedet for å bryte toppen over to; skjermleseren får hele. */}
      {kicker ? (
        <View
          style={styles.title}
          accessible
          accessibilityRole="header"
          accessibilityLabel={[kicker, subtitle].filter(Boolean).join(', ')}
        >
          <Text numberOfLines={1} ellipsizeMode="tail" style={[ui.kicker, styles.center, { color: ink }]}>
            {kicker}
          </Text>
          {subtitle ? (
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={[styles.subtitle, styles.center, { color: colors.muted }]}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.title} />
      )}
      <View
        style={[styles.side, styles.right]}
        onLayout={(e) => setRightWidth(e.nativeEvent.layout.width)}
        testID="kicker-top-bar-right"
      >
        {right}
      </View>
    </View>
  );
}

/** Tilbake-pila uten bakgrunn, midt i 44 pt å treffe på. */
function BareBack({
  label,
  large,
  onPress,
}: {
  label: string;
  large: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.back}
      testID="header-back"
    >
      <TilbakeIcon color={colors.text} size={large ? 22 : 20} strokeWidth={large ? 2.4 : 2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: BAR_INSET },
  barSunlight: { paddingRight: SUNLIGHT_RIGHT },
  side: { minWidth: TAP, height: TAP, justifyContent: 'center' },
  right: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  back: { width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, alignItems: 'center' },
  center: { textAlign: 'center' },
  subtitle: { fontSize: 12, fontFamily: FONTS.sans, marginTop: 2 },
});
