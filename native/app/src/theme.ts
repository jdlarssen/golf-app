// Native N3 (#1825): fargene og de få stilene alle spillerskjermene deler.
// #1830 la design-fundamentet oppå: Fraunces/Inter-tokens og lys/mørk
// palett-splitt med samme semantiske roller som webben (`app/globals.css`).
//
// #1833 fjernet den siste dobbeltheten: den flate `COLORS`-tabellen og den
// statiske lys-`ui`-en er borte. `useTheme()` er nå den ene veien inn, og
// derfor finnes det ingen måte å skrive en skjerm som bare virker i lys drakt.
//
// Mønsteret alle flatene følger: layout i et statisk `StyleSheet.create`-ark,
// farger inline fra `colors`/`ui`. Aldri hardkodede farger eller fonter.
import { StyleSheet, useColorScheme, type ColorSchemeName } from 'react-native';

/** Minste tappbare flate (≥44px, Apple HIG). Brukt av alle steppere. */
export const TAP = 44;

export type Scheme = 'light' | 'dark';

/** Semantiske roller — vokser ved behov, ikke på forskudd. */
export type ThemeColors = {
  bg: string;
  surface: string;
  border: string;
  text: string;
  muted: string;
  primary: string;
  onPrimary: string;
  accent: string;
  /**
   * Tekst og merker OPPÅ en gull-flate — hull-stripens førte hull, matchplay-
   * stripens vunne hull. Egen rolle fordi gull er lys i begge palettene: `text`
   * er mørk skog i lys modus og lys krem i mørk, og den siste forsvinner i
   * gullet. Blekket på gull er mørkt uansett scheme.
   */
  onAccent: string;
  danger: string;
};

/**
 * Lys = N3-paletten uendret (forest `#1B4332`, gold `#C9A961`, linen
 * `#F8F6F0`). Mørk = webbens «klubbhus-natt» (`app/globals.css`
 * `[data-theme='dark']`-blokka), inkl. knappe-regelen `dark:text-bg` fra
 * `components/ui/Button.tsx`.
 */
export const PALETTES: Record<Scheme, ThemeColors> = {
  light: {
    bg: '#F8F6F0',
    surface: '#FFFFFF',
    border: '#E3DFD3',
    text: '#1B4332',
    muted: '#5C6B60',
    primary: '#1B4332',
    onPrimary: '#FFFFFF',
    accent: '#C9A961',
    onAccent: '#1B4332',
    danger: '#B00020',
  },
  dark: {
    bg: '#14201A',
    surface: '#1C2A22',
    border: '#2F3F34',
    text: '#ECE5D2',
    muted: '#9A9180',
    primary: '#7EAA80',
    onPrimary: '#14201A',
    accent: '#D4B870',
    onAccent: '#14201A',
    danger: '#D67268',
  },
};

/**
 * Familienavn per snitt (expo-font registrerer én familie per vekt —
 * `fontWeight` velger IKKE snitt for custom-fonter, bruk disse).
 * Vektskalaen speiler webbens (`--fw-*` i globals.css).
 */
export const FONTS = {
  serifDisplay: 'Fraunces_500Medium',
  serifScore: 'Fraunces_600SemiBold',
  sans: 'Inter_400Regular',
  sansMedium: 'Inter_500Medium',
  sansSemiBold: 'Inter_600SemiBold',
  sansBold: 'Inter_700Bold',
} as const;

/** De delte stilene, bygget én gang per palett. */
const createUi = (c: ThemeColors) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: c.bg,
      padding: 20,
      gap: 8,
    },
    scroll: {
      flexGrow: 1,
      backgroundColor: c.bg,
      padding: 20,
      gap: 8,
    },
    centered: {
      flex: 1,
      backgroundColor: c.bg,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      gap: 12,
    },
    title: {
      fontSize: 26,
      fontFamily: FONTS.serifScore,
      color: c.text,
    },
    sectionTitle: {
      fontSize: 13,
      fontFamily: FONTS.sansSemiBold,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: c.muted,
      marginTop: 16,
    },
    body: { fontSize: 16, fontFamily: FONTS.sans, color: c.text },
    muted: { fontSize: 14, fontFamily: FONTS.sans, color: c.muted },
    value: { fontSize: 22, fontFamily: FONTS.serifScore, color: c.text },
    /** Tall i tabeller og totaler — samme regel som på web. */
    num: { fontVariant: ['tabular-nums'] },
    card: {
      backgroundColor: c.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
      gap: 8,
    },
    button: {
      backgroundColor: c.primary,
      borderRadius: 10,
      minHeight: TAP,
      paddingHorizontal: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
    },
    buttonText: { color: c.onPrimary, fontSize: 16, fontFamily: FONTS.sansSemiBold },
    buttonSecondary: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.primary,
      minHeight: TAP,
      paddingHorizontal: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
    },
    buttonSecondaryText: { color: c.primary, fontSize: 16, fontFamily: FONTS.sansSemiBold },
    link: {
      minHeight: TAP,
      justifyContent: 'center',
      alignItems: 'center',
    },
    linkText: {
      color: c.primary,
      fontSize: 15,
      fontFamily: FONTS.sansMedium,
      textDecorationLine: 'underline',
    },
    /**
     * Skjema-etikett — teksten over et felt, ikke en seksjonsoverskrift.
     * `sectionTitle` er versalt og luftig; en etikett skal ligge tett på
     * feltet sitt.
     */
    label: {
      fontSize: 14,
      fontFamily: FONTS.sansMedium,
      color: c.muted,
      marginTop: 8,
    },
    /**
     * Tekstfelt. `color` er satt EKSPLISITT: `TextInput` tegner ellers svart
     * tekst uansett palett, og i mørk modus blir feltet da uleselig.
     * `minHeight` er tap-flaten (44), ikke en estetisk høyde.
     */
    input: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      backgroundColor: c.surface,
      color: c.text,
      fontSize: 16,
      fontFamily: FONTS.sans,
      minHeight: TAP,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    banner: {
      backgroundColor: c.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
      padding: 14,
      marginTop: 8,
    },
    error: { color: c.danger, fontSize: 15, fontFamily: FONTS.sans },
    badge: {
      alignSelf: 'flex-start',
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    badgeText: { fontSize: 12, fontFamily: FONTS.sansSemiBold, color: c.text },
  });

/** De delte stilene for én palett — det `useTheme().ui` gir deg. */
export type Ui = ReturnType<typeof createUi>;

const uiVariants: Record<Scheme, Ui> = {
  light: createUi(PALETTES.light),
  dark: createUi(PALETTES.dark),
};

export type Theme = {
  scheme: Scheme;
  colors: ThemeColors;
  ui: Ui;
};

const THEMES: Record<Scheme, Theme> = {
  light: { scheme: 'light', colors: PALETTES.light, ui: uiVariants.light },
  dark: { scheme: 'dark', colors: PALETTES.dark, ui: uiVariants.dark },
};

/** OS-rapportert scheme → vårt. Ingen rapport (null/undefined/'unspecified') = lys. */
export const resolveScheme = (raw: ColorSchemeName | null | undefined): Scheme =>
  raw === 'dark' ? 'dark' : 'light';

export const themeFor = (scheme: Scheme): Theme => THEMES[scheme];

/** Tema-bevisst inngang for skjermer: stabile objekter, re-render ved scheme-bytte. */
export function useTheme(): Theme {
  return themeFor(resolveScheme(useColorScheme()));
}
