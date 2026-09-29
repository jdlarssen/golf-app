// #1830 la den additive tema-kontrakten; #1833 fjernet den lys-bare halvdelen
// av den. Testen låser derfor tre ting: at begge palettene er webbens verdier
// (lest fra `app/globals.css`, så de ikke kan drive fra hverandre igjen —
// #1980), at mørk er komplett, og at `useTheme()` er den ene veien inn — én
// `ui` per scheme, med samme nøkler.
import { readFileSync } from 'fs';
import { join } from 'path';
import { createElement, type ReactNode } from 'react';
import { renderHook } from '@testing-library/react-native';
import * as theme from './theme';
import {
  FONTS,
  PALETTES,
  SUNLIGHT_THEME,
  ThemeScope,
  resolveScheme,
  themeFor,
  useTheme,
  type Theme,
} from './theme';

/** Appens roller som har et motstykke i webbens CSS-variabler. */
const WEB_VAR: Partial<Record<keyof typeof PALETTES.light, string>> = {
  bg: '--bg',
  surface: '--surface',
  border: '--border',
  text: '--text',
  muted: '--text-muted',
  primary: '--primary',
  accent: '--accent',
  danger: '--danger',
  primarySoft: '--primary-soft',
  scoreUnderFg: '--score-under-fg',
  scoreParFg: '--score-par-fg',
  scoreOver1Fg: '--score-over1-fg',
  scoreOver2Fg: '--score-over2-fg',
};

const GLOBALS_CSS = readFileSync(join(__dirname, '../../../app/globals.css'), 'utf8');

/** Variablene i den første blokka som åpner med `opener`, med små bokstaver. */
function cssVars(opener: string): Record<string, string> {
  const start = GLOBALS_CSS.indexOf(opener);
  if (start < 0) throw new Error(`fant ikke ${opener} i globals.css`);
  const body = GLOBALS_CSS.slice(start, GLOBALS_CSS.indexOf('\n}', start));
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)) {
    vars[m[1]!] = m[2]!.trim().toLowerCase();
  }
  return vars;
}

describe('PALETTES', () => {
  it.each([
    ['light', ':root {'],
    ['dark', "[data-theme='klubbhus-natt'] {"],
  ] as const)('matches the web %s palette in app/globals.css', (scheme, opener) => {
    const web = cssVars(opener);
    for (const [role, cssVar] of Object.entries(WEB_VAR)) {
      expect({ role, value: PALETTES[scheme][role as keyof typeof WEB_VAR].toLowerCase() }).toEqual({
        role,
        value: web[cssVar!],
      });
    }
  });

  it('keeps the app-only ink roles', () => {
    expect(PALETTES.light.onPrimary).toBe('#FFFFFF');
    expect(PALETTES.light.onAccent).toBe('#1B4332');
    expect(PALETTES.dark.onPrimary).toBe('#14201A');
    expect(PALETTES.dark.onAccent).toBe('#14201A');
  });

  it('gives every role a distinct klubbhus-natt value in dark mode', () => {
    const roles = Object.keys(PALETTES.light) as (keyof typeof PALETTES.light)[];
    expect(Object.keys(PALETTES.dark).sort()).toEqual([...roles].sort());
    for (const role of roles) {
      expect(PALETTES.dark[role]).not.toBe(PALETTES.light[role]);
    }
  });
});

describe('FONTS', () => {
  it('names the six loaded faces', () => {
    expect(FONTS).toEqual({
      serifDisplay: 'Fraunces_500Medium',
      serifScore: 'Fraunces_600SemiBold',
      sans: 'Inter_400Regular',
      sansMedium: 'Inter_500Medium',
      sansSemiBold: 'Inter_600SemiBold',
      sansBold: 'Inter_700Bold',
    });
  });
});

describe('themeFor / resolveScheme', () => {
  it('falls back to light when the OS reports no scheme', () => {
    expect(resolveScheme(null)).toBe('light');
    expect(resolveScheme(undefined)).toBe('light');
    expect(resolveScheme('unspecified')).toBe('light');
    expect(resolveScheme('light')).toBe('light');
    expect(resolveScheme('dark')).toBe('dark');
  });

  it('gives each scheme its own stable ui with key parity to the other', () => {
    const light = themeFor('light');
    const dark = themeFor('dark');
    // Stabile objekter: en ny `ui` per render ville brutt hver `React.memo`
    // og hver `useMemo` som har stilen i dependency-lista.
    expect(themeFor('light').ui).toBe(light.ui);
    expect(dark.ui).not.toBe(light.ui);
    expect(Object.keys(dark.ui).sort()).toEqual(Object.keys(light.ui).sort());
  });

  // #2252: hullsidens mål er webbens standard i begge scheme. Sollys er den
  // eneste som skal kunne endre dem.
  it('gives both schemes the web defaults for the hole page', () => {
    for (const scheme of ['light', 'dark'] as const) {
      expect(themeFor(scheme).hole).toEqual({
        numberSize: 44,
        railButton: 64,
        borderW: 1,
        activeBarW: 4,
      });
    }
  });

  it('selects the matching palette per scheme', () => {
    expect(themeFor('light').colors).toBe(PALETTES.light);
    expect(themeFor('dark').colors).toBe(PALETTES.dark);
  });

  // Vakten mot at en skjerm igjen kan bygges lys-bare: det finnes ingen
  // ferdigfarget eksport å importere, bare `useTheme()`/`themeFor()`.
  it('exports no light-only colour table or style sheet', () => {
    expect(theme).not.toHaveProperty('COLORS');
    expect(theme).not.toHaveProperty('ui');
  });
});

describe('useTheme', () => {
  it('resolves a full theme in the default test environment', async () => {
    const { result } = await renderHook(() => useTheme());
    expect(result.current.scheme).toBe('light');
    expect(result.current.colors).toBe(PALETTES.light);
    expect(result.current.ui).toBe(themeFor('light').ui);
  });
});

/** WCAG 2 relativ luminans for `#RRGGBB`. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** Kontrastforholdet mellom to farger, som WCAG regner det. */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

// #2252: sollys på hullsiden. Hvit og svart uten tonede flater, all tekst
// lesbar mot hvit, tykke kanter og store mål. Kontrasten er regnet, ikke
// påstått.
describe('SUNLIGHT_THEME', () => {
  const c = SUNLIGHT_THEME.colors;

  it('har de samme rollene som lys og mørk', () => {
    expect(Object.keys(c).sort()).toEqual(Object.keys(PALETTES.light).sort());
    expect(Object.keys(SUNLIGHT_THEME.ui).sort()).toEqual(
      Object.keys(themeFor('light').ui).sort(),
    );
  });

  it('er ren hvit og ren svart, uten tonede flater', () => {
    expect([c.bg, c.surface, c.primarySoft]).toEqual(['#FFFFFF', '#FFFFFF', '#FFFFFF']);
    expect([c.text, c.border, c.muted]).toEqual(['#000000', '#000000', '#000000']);
  });

  it.each([
    'text',
    'muted',
    'primary',
    'danger',
    'scoreUnderFg',
    'scoreParFg',
    'scoreOver1Fg',
    'scoreOver2Fg',
  ] as const)('%s holder minst 4,5:1 mot hvit', (role) => {
    expect(contrast(c[role], '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });

  it('har lesbart blekk på de fylte flatene', () => {
    expect(contrast(c.onPrimary, c.primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.onAccent, c.accent)).toBeGreaterThanOrEqual(4.5);
  });

  it('er lyst, med kanter på 3 og hullsidens store mål', () => {
    expect(SUNLIGHT_THEME.scheme).toBe('light');
    expect(SUNLIGHT_THEME.ui.card.borderWidth).toBe(3);
    expect(SUNLIGHT_THEME.ui.badge.borderWidth).toBe(3);
    expect(SUNLIGHT_THEME.ui.buttonSecondary.borderWidth).toBe(3);
    expect(SUNLIGHT_THEME.hole).toEqual({
      numberSize: 130,
      railButton: 84,
      borderW: 3,
      activeBarW: 10,
    });
    // Lys og mørk er urørt.
    expect(themeFor('light').ui.card.borderWidth).toBe(1);
    expect(themeFor('dark').ui.card.borderWidth).toBe(1);
  });
});

describe('ThemeScope', () => {
  function SunlightScope({ children }: { children: ReactNode }) {
    return createElement(ThemeScope, { theme: SUNLIGHT_THEME }, children);
  }
  function EmptyScope({ children }: { children: ReactNode }) {
    return createElement(ThemeScope, { theme: null as Theme | null }, children);
  }

  it('gir temaet sitt til alt under seg, og telefonens igjen med null', async () => {
    const on = await renderHook(() => useTheme(), { wrapper: SunlightScope });
    expect(on.result.current).toBe(SUNLIGHT_THEME);
    const off = await renderHook(() => useTheme(), { wrapper: EmptyScope });
    expect(off.result.current).toBe(themeFor('light'));
  });
});
