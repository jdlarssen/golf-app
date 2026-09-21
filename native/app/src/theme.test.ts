// #1830 la den additive tema-kontrakten; #1833 fjernet den lys-bare halvdelen
// av den. Testen låser derfor tre ting: at begge palettene er webbens verdier
// (lest fra `app/globals.css`, så de ikke kan drive fra hverandre igjen —
// #1980), at mørk er komplett, og at `useTheme()` er den ene veien inn — én
// `ui` per scheme, med samme nøkler.
import { readFileSync } from 'fs';
import { join } from 'path';
import { renderHook } from '@testing-library/react-native';
import * as theme from './theme';
import {
  FONTS,
  PALETTES,
  resolveScheme,
  themeFor,
  useTheme,
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
