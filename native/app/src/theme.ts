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
import { PixelRatio, StyleSheet, useColorScheme, type ColorSchemeName } from 'react-native';
import FRAUNCES_SIZES from '../assets/fonts/fraunces-sizes.json';

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
   * Flaten bak en score-tone, webbens `--score-*-bg`: under par, par, bogey og
   * dobbel bogey eller verre. Skinneknappene på hullsiden (#2385) og mot par-
   * pillene i «Hull for hull» for best ball (#2255 PR 3d).
   */
  scoreUnderBg: string;
  scoreParBg: string;
  scoreOver1Bg: string;
  scoreOver2Bg: string;
  /**
   * Den skoggrønne flaten (#2254, heltekortet på Hjem) — webbens
   * `--surface-strong`. Skogen er mørk i begge draktene, så teksten oppå den
   * er lys i begge: det er {@link ThemeColors.onStrong}.
   */
  surfaceStrong: string;
  /** Tekst og strek på `surfaceStrong` — webbens `--bg-tint`. */
  onStrong: string;
  /**
   * Gull som TEKST (#2256, seire-flisa på profilen) — webbens `--accent-text`.
   * `accent` er for lys som tekst på lys flate; denne er mørkere i lys drakt
   * og lik `accent` i mørk.
   */
  accentText: string;
  /**
   * Kremfarget spor (#2255, fremdriftslinja på startbilletten) — webbens
   * `--hole-completed-bg`, samme kremtone designet bruker. `surface-2` er for
   * blek på det hvite kortet, `border` for grå.
   */
  trackBg: string;
  /**
   * Salvieprikken foran «Pågår nå» på heltekortet (#2385, designlerretet) —
   * webbens mørke `--success`. Den sitter på `surfaceStrong`, som er mørk skog
   * i begge draktene, så den er lik i begge: webbens lyse salvie forsvinner i
   * skogen.
   */
  live: string;
  /**
   * Skillelinja mellom radene i scorekortet (#2385) og i listene i
   * profil-rommene (Profil v2), fra designlerretet — webbens
   * `--row-divider-warm`, varmere enn `border`.
   */
  divider: string;
  /** Det som ennå ikke er tastet (#2385): stiplede sirkler — webbens `--score-unset-fg`. */
  scoreUnsetFg: string;
  /**
   * Flaten i seire-flisa (Profil v2) — webbens `--leader-fill-bottom`, kremen
   * webben bruker under lederkortets gullstrek.
   */
  leaderFill: string;
  /**
   * Den varme kremen designet bruker for små ord på skogflaten (#2385: «UT»
   * og «INN» i scorekortets bånd; Profil v2: «HANDICAP», initialene,
   * endepunktet på kurven og «Få med gjengen»). Lik i begge draktene, som
   * `live`; `onStrong` er kaldere i lys drakt.
   */
  onStrongWarm: string;
  /**
   * Den litt nedsenkede flaten (#2255, deuce-raden i Acey Deucey «Hull for
   * hull») — webbens `--surface-2`.
   */
  surface2: string;
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
    scoreUnderBg: 'rgba(74, 124, 89, 0.16)',
    scoreParBg: 'rgba(92, 83, 71, 0.10)',
    scoreOver1Bg: 'rgba(216, 155, 58, 0.18)',
    scoreOver2Bg: 'rgba(184, 70, 62, 0.16)',
    surfaceStrong: '#1B4332',
    onStrong: '#F0EDE5',
    accentText: '#7D6224',
    trackBg: '#EFE9DA',
    live: '#7DAA8A',
    divider: '#EDE6D2',
    scoreUnsetFg: '#9A8F7C',
    leaderFill: '#FBF8EE',
    onStrongWarm: '#ECE5D2',
    surface2: '#F0EDE5',
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
    scoreUnderBg: 'rgba(125, 170, 138, 0.18)',
    scoreParBg: 'rgba(154, 145, 128, 0.14)',
    scoreOver1Bg: 'rgba(229, 178, 111, 0.18)',
    scoreOver2Bg: 'rgba(214, 114, 104, 0.18)',
    surfaceStrong: '#1F3B2C',
    onStrong: '#ECE5D2',
    accentText: '#D4B870',
    trackBg: '#243429',
    live: '#7DAA8A',
    divider: '#2F3F34',
    scoreUnsetFg: '#9A9180',
    leaderFill: '#1A3D2E',
    onStrongWarm: '#ECE5D2',
    surface2: '#243429',
  },
};

/**
 * Fraunces sin egen linjehøyde, i skriftstørrelser: (ascent 1956 + descent 510)
 * / 2000 fra `hhea`, lik i alle snittene appen har (den variable fonten har ingen
 * mål som endrer seg med størrelsen).
 */
export const FRAUNCES_LINE = 1.233;

/** `multiline`: teksten kan brekke og trenger designets linjeavstand. */
type LineOptions = { multiline?: boolean; pixelRatio?: number };

/** Fraunces sin ascent og descent i skriftstørrelser (`hhea`: 1956 og 510 av 2000). */
const FRAUNCES_METRICS = { ascent: 0.978, descent: 0.255, natural: FRAUNCES_LINE };

/**
 * Nettleserens linjeboks for Fraunces (#2385), så teksten står der den står i
 * designet. Målt med samme tekst i 20 størrelser og linjehøyder i Chromium og
 * i simulatoren:
 *
 *  - **Chromium** runder ascent og descent til hele CSS-piksler. Grunnlinja
 *    står ascent pluss halve ledningen (linjehøyden minus ascent og descent)
 *    under toppen av linja, med halve ledningen rundet ned.
 *  - **iOS med `lineHeight`** legger grunnlinja `descent` over bunnen av linja,
 *    og krymper glyfen når linja er lavere enn skriftstørrelsen.
 *  - **iOS uten `lineHeight`** gir teksten sin egen høyde (1,233, rundet opp
 *    til hel piksel), med grunnlinja ascent (også rundet opp) under toppen.
 *
 * Teksten står i sin egen høyde, og margene gir linjeboksen, med grunnlinja
 * der Chromium har den (treffer innenfor en piksel). Det holder for én linje.
 * En tekst som kan brekke (`multiline`), beholder `lineHeight`, så linjene står
 * med designets avstand, og grunnlinja flyttes med like store marger over og
 * under (treffer innenfor to piksler). Linjer lavere enn skriftstørrelsen får
 * alltid marger, for der krymper iOS glyfen. Boksen blir `lineHeight` høy.
 *
 * Regnet og målt for iOS. Android legger til `includeFontPadding` og bruker
 * skriftens win-mål (1,47), så en Android-versjon må måles for seg.
 */
export function frauncesLine(size: number, lineHeight: number, options: LineOptions = {}) {
  return browserLine(FRAUNCES_METRICS, size, lineHeight, options);
}

/** Inter sin egen linjehøyde: (ascent 1984 + descent 494) / 2048 fra `hhea`. */
export const INTER_LINE = 1.2099609375;
const INTER_METRICS = { ascent: 1984 / 2048, descent: 494 / 2048, natural: INTER_LINE };

/**
 * Samme linjeboks for Inter (`frauncesLine` forklarer modellen). Nettleserens
 * `normal` for Inter på 10 pt er 12, mens iOS legger teksten ut på 12,333
 * (#2385: «HULL» over hullnummeret).
 */
export function interLine(size: number, lineHeight: number, options: LineOptions = {}) {
  return browserLine(INTER_METRICS, size, lineHeight, options);
}

function browserLine(
  metrics: { ascent: number; descent: number; natural: number },
  size: number,
  lineHeight: number,
  { multiline = false, pixelRatio = PixelRatio.get() }: LineOptions,
): { fontSize: number; lineHeight?: number; marginTop: number; marginBottom: number } {
  const ascent = Math.round(size * metrics.ascent);
  const descent = Math.round(size * metrics.descent);
  // Chromium regner i 1/64 piksel: halve ledningen rundes dit før den rundes
  // ned (−0,005 blir 0, −0,015 blir −1).
  const halfLeading = Math.round(((lineHeight - ascent - descent) / 2) * 64) / 64;
  const baseline = ascent + Math.floor(halfLeading);
  if (multiline && lineHeight >= size) {
    const shift = baseline - (lineHeight - size * metrics.descent);
    return { fontSize: size, lineHeight, marginTop: shift, marginBottom: -shift };
  }
  const ceilPx = (value: number) => Math.ceil(value * pixelRatio) / pixelRatio;
  const marginTop = baseline - ceilPx(size * metrics.ascent);
  return {
    fontSize: size,
    marginTop,
    marginBottom: lineHeight - ceilPx(size * metrics.natural) - marginTop,
  };
}

/**
 * Nettleserens `normal` linjehøyde for Fraunces: ascent og descent rundet
 * hver for seg til hele piksler (28 pt gir 27 + 7 = 34).
 */
function frauncesNormalLine(size: number): number {
  return (
    Math.round(size * FRAUNCES_METRICS.ascent) + Math.round(size * FRAUNCES_METRICS.descent)
  );
}

/**
 * Hvor nettleseren tegner en tekstlinje som er sentrert i en boks: midt i,
 * rundet til hel piksel, og en halv rundes opp (målt i Chromium: en 23-linje
 * i 52 tegnes som i 53). `justifyContent: 'center'` lar Yoga runde til
 * skjermpiksel i stedet, så teksten kan havne en halv pt over designet. Gi
 * boksen dette som `paddingTop` og `justifyContent: 'flex-start'`.
 */
export function centeredLineTop(inner: number, line: number): number {
  return Math.round((inner - line) / 2);
}

/** Fraunces-vektene appen bruker: 500 til ord, 600 til tall og uthevinger. */
type FrauncesWeight = 500 | 600;

/**
 * Fraunces-snittet for en vekt og størrelse (#2385). Nettleseren tegner
 * Fraunces med optisk størrelse lik skriftstørrelsen; appen har ett snitt per
 * størrelse den bruker (`assets/fonts/fraunces-sizes.json`), så teksten blir
 * like bred og like formet som i designet. En størrelse uten eget snitt (en
 * dynamisk størrelse) får det nærmeste, og midt mellom to det største.
 */
export function frauncesFamily(weight: FrauncesWeight, size: number): string {
  const sizes: readonly number[] = FRAUNCES_SIZES[weight];
  let best = sizes[0];
  for (const candidate of sizes) {
    const gap = Math.abs(candidate - size);
    const bestGap = Math.abs(best - size);
    if (gap < bestGap || (gap === bestGap && candidate > best)) best = candidate;
  }
  return `Fraunces${weight}O${best}`;
}

/**
 * Stilen for Fraunces i en vekt og størrelse: snittet og nettleserens
 * linjeboks (`frauncesLine`), med designets linjehøyde eller `normal` når den
 * ikke er gitt. Linjeboksen bruker `marginTop` og `marginBottom`; en stil med
 * egen margin over eller under må legge den til, ellers overstyrer den
 * linjeboksen på den siden.
 */
export function fraunces(
  weight: FrauncesWeight,
  size: number,
  lineHeight = frauncesNormalLine(size),
  options: LineOptions = {},
): ReturnType<typeof frauncesLine> & { fontFamily: string } {
  return { ...frauncesLine(size, lineHeight, options), fontFamily: frauncesFamily(weight, size) };
}

/**
 * Familienavn per snitt (expo-font registrerer én familie per vekt —
 * `fontWeight` velger IKKE snitt for custom-fonter, bruk disse).
 * Vektskalaen speiler webbens (`--fw-*` i globals.css). Fraunces velges med
 * `fraunces()` over, etter størrelsen.
 */
export const FONTS = {
  /**
   * Hullnummeret (#2385): Fraunces tegnet for 96 og 132 pt, som nettleseren
   * gjør det. Bare sifre (`assets/fonts/README.md`).
   */
  holeNumber: 'FrauncesHole96',
  holeNumberSun: 'FrauncesHole132',
  sans: 'Inter_400Regular',
  sansMedium: 'Inter_500Medium',
  sansSemiBold: 'Inter_600SemiBold',
  sansBold: 'Inter_700Bold',
  /**
   * Systemfonten (SF), til «→» (#2385). Inter fra Google Fonts har ikke pila,
   * så designet tegner den med `system-ui`. Se `SystemArrow.tsx`.
   */
  system: 'System',
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
  // Pillene bak mot par i best ball (#2255 PR 3d): samme toner som lys drakt,
  // som strekene over. Sollys har ingen egen CSS-blokk å låses mot. Skinna på
  // hullsiden bruker dem ikke i sollys: knappene der er hvite med svart kant.
  scoreUnderBg: 'rgba(74, 124, 89, 0.16)',
  scoreParBg: 'rgba(92, 83, 71, 0.10)',
  scoreOver1Bg: 'rgba(216, 155, 58, 0.18)',
  scoreOver2Bg: 'rgba(184, 70, 62, 0.16)',
  // Heltekortets skogflate på Hjem (#2254). Hullsiden tegner den ikke, så
  // lys-verdiene står her bare for at paletten skal ha alle rollene.
  surfaceStrong: '#1B4332',
  onStrong: '#F0EDE5',
  // Gull som tekst (#2256). I sollys er gullet svart, som `accent` over.
  accentText: '#000000',
  // Billettens spor (#2255). Hullsiden tegner det ikke; ren hvit som flatene.
  trackBg: '#FFFFFF',
  // Hjem-prikken (#2385). Hullsiden tegner den ikke; lik de andre draktene.
  live: '#7DAA8A',
  // Sollys: svarte streker og ren kontrast, som resten av drakten. Seire-flisa
  // (Profil v2) tegnes ikke på hullsiden; ren hvit som flatene, og kremen på
  // skogen som `onStrong`.
  divider: '#000000',
  scoreUnsetFg: '#000000',
  leaderFill: '#FFFFFF',
  onStrongWarm: '#F0EDE5',
  // Deuce-raden i «Hull for hull» (#2255). Hullsiden tegner den ikke; ren hvit.
  surface2: '#FFFFFF',
};

/**
 * Kortskyggen (#2255, DESIGN.md: «Skygger er hvisking … mørk modus bytter til en
 * svak svart»). Lys drakt er designlerretets to lag i skoggrønt; mørk er en svak
 * svart. Brukes som `boxShadow` på kort som skal løfte seg fra linet.
 */
export function cardShadow(scheme: Scheme): string {
  return scheme === 'dark'
    ? '0 1px 2px rgba(0, 0, 0, 0.3), 0 8px 24px rgba(0, 0, 0, 0.25)'
    : '0 1px 2px rgba(26, 46, 31, 0.04), 0 8px 24px rgba(26, 46, 31, 0.06)';
}

/**
 * Skyggen under heltekortet på Hjem (#2385, designlerretet: «0 10px 28px» med
 * 20 % skog). Tydeligere enn {@link cardShadow}, fordi kortet er det ene som
 * skal løfte seg på skjermen. Mørk drakt bytter til svart, som kortskyggen.
 */
export function heroShadow(scheme: Scheme): string {
  return scheme === 'dark'
    ? '0 10px 28px rgba(0, 0, 0, 0.35)'
    : '0 10px 28px rgba(26, 46, 31, 0.2)';
}

/**
 * En temafarge (`#RRGGBB`) med dekning `alpha` (0–1), som `rgba(...)`. Brukt der
 * designet legger blekk eller en flate delvis gjennomsiktig oppå noe annet
 * (#2385: stempelet over scorekortets hjørne).
 */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

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
      // Spillnavnet kan brekke.
      ...fraunces(600, 26, undefined, { multiline: true }),
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
    /**
     * Små sperrede versaler over en seksjon (#2385, designlerretet: 10 px,
     * 0,2em sperring). Designets seksjonsoverskrifter og feltetiketter.
     */
    kicker: {
      fontSize: 10,
      fontFamily: FONTS.sansSemiBold,
      letterSpacing: 2,
      textTransform: 'uppercase',
      color: c.muted,
    },
    body: { fontSize: 16, fontFamily: FONTS.sans, color: c.text },
    muted: { fontSize: 14, fontFamily: FONTS.sans, color: c.muted },
    value: { ...fraunces(600, 22), color: c.text },
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
    // Knappene er piller (DESIGN.md: «Button / LinkButton: pill, minst 44 px
    // høy»), i hele appen (#2255).
    button: {
      backgroundColor: c.primary,
      borderRadius: 999,
      minHeight: TAP,
      paddingHorizontal: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
    },
    buttonText: { color: c.onPrimary, fontSize: 16, fontFamily: FONTS.sansSemiBold },
    buttonSecondary: {
      borderRadius: 999,
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
 * `components/hole/` leser dem herfra. Fra #2385 er de app-designets (`Main`
 * og `Hull-sollys`), ikke webbens.
 */
export type HoleMetrics = {
  /** Det store hullnummeret øverst. */
  numberSize: number;
  /** Høyden på knappene i scoreskinna. */
  railButton: number;
  /** Kanten på rader, skinneknapper og steppere. */
  borderW: number;
  /** Tallet og etiketten i skinneknappene (#2385: 28/11, sollys 40/13). */
  railNumber: number;
  railLabel: number;
  /**
   * Valgt tilstand (putte-bryteren, BBB-valget, hullet du står på) tegnes som
   * fylt flate i stedet for en farget kant. I sollys er kant og tekst svarte,
   * så en farget kant ville ikke synes (#2252).
   */
  selectedFill: boolean;
};

const HOLE_METRICS: HoleMetrics = {
  // `Main` (#2385): nummeret på 96 og skinneknappene på 72.
  numberSize: 96,
  railButton: 72,
  borderW: 1,
  railNumber: 28,
  railLabel: 11,
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
 * kanter på 3, hullnummer på 132 (`Hull-sollys`), skinneknapper på 84, og valgt
 * tilstand som fylt flate.
 */
export const SUNLIGHT_THEME: Theme = {
  scheme: 'light',
  colors: SUNLIGHT_COLORS,
  ui: createUi(SUNLIGHT_COLORS, { borderW: 3 }),
  hole: {
    numberSize: 132,
    railButton: 84,
    borderW: 3,
    railNumber: 40,
    railLabel: 13,
    selectedFill: true,
  },
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
