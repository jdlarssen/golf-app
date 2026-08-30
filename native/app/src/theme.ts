// Native N3 (#1825): fargene og de få stilene alle spillerskjermene deler.
// #1830 legger design-fundamentet oppå: Fraunces/Inter-tokens og lys/mørk
// palett-splitt med samme semantiske roller som webben (`app/globals.css`).
//
// Additivt av hensyn til N4 (#1828): `COLORS`, `TAP` og `ui` beholder navn og
// nøkler; nye flater bygges mot `useTheme()`. Skjermer bruker alltid
// tokens/primitivene her — aldri hardkodede farger eller fonter.
import { StyleSheet, useColorScheme, type ColorSchemeName } from 'react-native';

export const COLORS = {
  /** Deep forest — tekst, knapper, rammer. */
  forest: '#1B4332',
  /** Champagne gold — kun til framheving (aktivt hull, vinnermarkør). */
  gold: '#C9A961',
  /** Linen — bakgrunn. */
  linen: '#F8F6F0',
  card: '#FFFFFF',
  border: '#E3DFD3',
  muted: '#5C6B60',
  error: '#B00020',
} as const;

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
  danger: string;
};

/**
 * Lys = N3-paletten uendret. Mørk = webbens «klubbhus-natt»
 * (`app/globals.css` `[data-theme='dark']`-blokka), inkl. knappe-regelen
 * `dark:text-bg` fra `components/ui/Button.tsx`.
 */
export const PALETTES: Record<Scheme, ThemeColors> = {
  light: {
    bg: COLORS.linen,
    surface: COLORS.card,
    border: COLORS.border,
    text: COLORS.forest,
    muted: COLORS.muted,
    primary: COLORS.forest,
    onPrimary: '#FFFFFF',
    accent: COLORS.gold,
    danger: COLORS.error,
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

const uiVariants: Record<Scheme, ReturnType<typeof createUi>> = {
  light: createUi(PALETTES.light),
  dark: createUi(PALETTES.dark),
};

/** Lys-varianten — navnet N3-skjermene alt importerer. Nye flater: `useTheme()`. */
export const ui = uiVariants.light;

export type Theme = {
  scheme: Scheme;
  colors: ThemeColors;
  ui: typeof ui;
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
