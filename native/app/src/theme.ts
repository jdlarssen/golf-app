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
import { createContext, createElement, useContext, type ReactNode } from 'react';
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
  /** Aktiv rad i flighten på hullsiden (#2252), webbens `--primary-soft`. */
  primarySoft: string;
  /**
   * Strek og tall i scoreformene på hullsiden (#2252), webbens
   * `--score-*-fg`: under par, par, bogey og dobbel bogey eller verre.
   */
  scoreUnderFg: string;
  scoreParFg: string;
  scoreOver1Fg: string;
  scoreOver2Fg: string;
  /**
   * Den skoggrønne flaten (#2254, heltekortet på Hjem) — webbens
   * `--surface-strong`. Skogen er mørk i begge draktene, så teksten oppå den
   * er lys i begge: det er {@link ThemeColors.onStrong}.
   */
  surfaceStrong: string;
  /** Tekst og strek på `surfaceStrong` — webbens `--bg-tint`. */
  onStrong: string;
};

/**
 * Begge palettene er webbens (`app/globals.css`): lys = `:root`-blokka, mørk =
 * «klubbhus-natt» (`[data-theme='dark']`-blokka), inkl. knappe-regelen
 * `dark:text-bg` fra `components/ui/Button.tsx`. `theme.test.ts` leser
 * globals.css og feiler hvis en delt rolle driver fra webben (#1980).
 * `onPrimary`/`onAccent` finnes bare i appen og låses i testen for seg.
 */
export const PALETTES: Record<Scheme, ThemeColors> = {
  light: {
    bg: '#F8F6F0',
    surface: '#FFFFFF',
    border: '#E5E0D3',
    text: '#1A2E1F',
    muted: '#4A3F30',
    primary: '#1B4332',
    onPrimary: '#FFFFFF',
    accent: '#C9A961',
    onAccent: '#1B4332',
    danger: '#B8463E',
    primarySoft: '#E8EFE8',
    scoreUnderFg: '#2F5A3C',
    scoreParFg: '#5C5347',
    scoreOver1Fg: '#7A5410',
    scoreOver2Fg: '#7A2F2A',
    surfaceStrong: '#1B4332',
    onStrong: '#F0EDE5',
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
    primarySoft: '#1F2C24',
    scoreUnderFg: '#7DAA8A',
    scoreParFg: '#9A9180',
    scoreOver1Fg: '#E5B26F',
    scoreOver2Fg: '#D67268',
    surfaceStrong: '#1F3B2C',
    onStrong: '#ECE5D2',
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

/**
 * #2252: sollys på hullsiden. Ren hvit og ren svart, uten tonede flater. Ren
 * svart er et bevisst unntak fra «ingen nye farger» (DESIGN.md §Farger).
 * `primary`, `danger` og scorefargene er lys-verdiene, som alle holder minst
 * 4,5:1 mot hvit. Ferdige hull i stripa blir svarte med hvite tall (`accent`/
 * `onAccent`) i stedet for gull.
 */
export const SUNLIGHT_COLORS: ThemeColors = {
  bg: '#FFFFFF',
  surface: '#FFFFFF',
  border: '#000000',
  text: '#000000',
  muted: '#000000',
  primary: '#1B4332',
  onPrimary: '#FFFFFF',
  accent: '#000000',
  onAccent: '#FFFFFF',
  danger: '#B8463E',
  primarySoft: '#FFFFFF',
  scoreUnderFg: '#2F5A3C',
  scoreParFg: '#5C5347',
  scoreOver1Fg: '#7A5410',
  scoreOver2Fg: '#7A2F2A',
};

/** De delte stilene, bygget én gang per palett. `borderW` er kanten sollys gjør tykkere. */
const createUi = (c: ThemeColors, { borderW = 1 }: { borderW?: number } = {}) =>
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
      borderWidth: borderW,
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
      borderWidth: borderW,
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
      borderWidth: borderW,
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
      borderWidth: borderW,
      borderColor: c.border,
      padding: 14,
      marginTop: 8,
    },
    error: { color: c.danger, fontSize: 15, fontFamily: FONTS.sans },
    badge: {
      alignSelf: 'flex-start',
      borderRadius: 999,
      borderWidth: borderW,
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

/**
 * Målene på hullsiden (#2252), i punkter. Komponentene i
 * `components/hole/` leser dem herfra og har ingen av tallene hardkodet.
 * Standard er webbens (`--hole-number-size`, `--score-button-size`,
 * `--hole-border-w`, `--active-bar-w`).
 */
export type HoleMetrics = {
  /** Det store hullnummeret øverst. */
  numberSize: number;
  /** Høyden på knappene i scoreskinna. */
  railButton: number;
  /** Kanten på rader, skinneknapper og steppere. */
  borderW: number;
  /** Streken langs venstre kant på den aktive raden. */
  activeBarW: number;
  /**
   * Valgt tilstand (putte-bryteren, BBB-valget, hullet du står på) tegnes som
   * fylt flate i stedet for en farget kant. I sollys er kant og tekst svarte,
   * så en farget kant ville ikke synes (#2252).
   */
  selectedFill: boolean;
};

const HOLE_METRICS: HoleMetrics = {
  numberSize: 44,
  railButton: 64,
  borderW: 1,
  activeBarW: 4,
  selectedFill: false,
};

export type Theme = {
  scheme: Scheme;
  colors: ThemeColors;
  ui: Ui;
  hole: HoleMetrics;
};

const THEMES: Record<Scheme, Theme> = {
  light: { scheme: 'light', colors: PALETTES.light, ui: uiVariants.light, hole: HOLE_METRICS },
  dark: { scheme: 'dark', colors: PALETTES.dark, ui: uiVariants.dark, hole: HOLE_METRICS },
};

/**
 * #2252: hullsiden i sollys. Et lyst tema uansett hva telefonen står på, med
 * kanter på 3, hullnummer på 130, skinneknapper på 84, en strek på 10
 * langs aktiv rad, og valgt tilstand som fylt flate.
 */
export const SUNLIGHT_THEME: Theme = {
  scheme: 'light',
  colors: SUNLIGHT_COLORS,
  ui: createUi(SUNLIGHT_COLORS, { borderW: 3 }),
  hole: { numberSize: 130, railButton: 84, borderW: 3, activeBarW: 10, selectedFill: true },
};

/** OS-rapportert scheme → vårt. Ingen rapport (null/undefined/'unspecified') = lys. */
export const resolveScheme = (raw: ColorSchemeName | null | undefined): Scheme =>
  raw === 'dark' ? 'dark' : 'light';

export const themeFor = (scheme: Scheme): Theme => THEMES[scheme];

const ThemeScopeContext = createContext<Theme | null>(null);

/**
 * #2252: et tema for ett utsnitt av appen. Alt under bruker `theme` i stedet
 * for telefonens lys/mørk, og `null` gir telefonens igjen. Hullsiden pakker
 * seg i den når sollys er på, så Wolf, BBB, synk-banneret og skinna følger med
 * uten egen kode, og andre skjermer merker ingenting.
 */
export function ThemeScope({ theme, children }: { theme: Theme | null; children?: ReactNode }) {
  return createElement(ThemeScopeContext.Provider, { value: theme }, children);
}

/** Tema-bevisst inngang for skjermer: stabile objekter, re-render ved scheme-bytte. */
export function useTheme(): Theme {
  const scoped = useContext(ThemeScopeContext);
  const system = themeFor(resolveScheme(useColorScheme()));
  return scoped ?? system;
}
