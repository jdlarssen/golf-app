// #1830 la den additive tema-kontrakten; #1833 fjernet den lys-bare halvdelen
// av den. Testen låser derfor tre ting: at begge palettene er webbens verdier
// (lest fra `app/globals.css`, så de ikke kan drive fra hverandre igjen —
// #1980), at mørk er komplett, og at `useTheme()` er den ene veien inn — én
// `ui` per scheme, med samme nøkler.
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { createElement, type ReactNode } from 'react';
import { renderHook } from '@testing-library/react-native';
import * as theme from './theme';
import { FRAUNCES_FILES } from './fonts';
import FRAUNCES_SIZES from '../assets/fonts/fraunces-sizes.json';
import {
  FONTS,
  fraunces,
  frauncesFamily,
  frauncesLine,
  interLine,
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
  scoreUnderBg: '--score-under-bg',
  scoreParBg: '--score-par-bg',
  scoreOver1Bg: '--score-over1-bg',
  scoreOver2Bg: '--score-over2-bg',
  onStrong: '--bg-tint',
  accentText: '--accent-text',
  trackBg: '--hole-completed-bg',
  divider: '--row-divider-warm',
  scoreUnsetFg: '--score-unset-fg',
  surface2: '--surface-2',
  leaderFill: '--leader-fill-bottom',
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

  // #2254: den skoggrønne flaten til heltekortet på Hjem. Webben setter den
  // mørke verdien bare i `prefers-color-scheme`-blokka, ikke i klubbhus-natt-
  // blokka testen over leser, så rollen låses mot sin egen blokk her.
  it.each([
    ['light', ':root {'],
    ['dark', ":root:not([data-theme='light']) {"],
  ] as const)('matches the web %s --surface-strong', (scheme, opener) => {
    expect(PALETTES[scheme].surfaceStrong.toLowerCase()).toBe(cssVars(opener)['--surface-strong']);
  });

  // #2385: prikken på heltekortet er webbens mørke salvie i begge draktene,
  // fordi den sitter på skogflaten, som er mørk i begge.
  it('uses the web dark --success for the live dot in both schemes', () => {
    const sage = cssVars("[data-theme='klubbhus-natt'] {")['--success'];
    expect(PALETTES.light.live.toLowerCase()).toBe(sage);
    expect(PALETTES.dark.live.toLowerCase()).toBe(sage);
  });

  it('keeps the app-only ink roles', () => {
    // Profil v2: designlerretets varme krem på skogflaten, lik i begge draktene.
    expect(PALETTES.light.onStrongWarm).toBe('#ECE5D2');
    expect(PALETTES.dark.onStrongWarm).toBe('#ECE5D2');
    expect(PALETTES.light.onPrimary).toBe('#FFFFFF');
    expect(PALETTES.light.onAccent).toBe('#1B4332');
    expect(PALETTES.dark.onPrimary).toBe('#14201A');
    expect(PALETTES.dark.onAccent).toBe('#14201A');
  });

  it('gives every role a distinct klubbhus-natt value in dark mode', () => {
    const roles = Object.keys(PALETTES.light) as (keyof typeof PALETTES.light)[];
    expect(Object.keys(PALETTES.dark).sort()).toEqual([...roles].sort());
    // `live` og `onStrongWarm` sitter på skogflaten i begge draktene og er
    // like med vilje.
    for (const role of roles.filter((r) => r !== 'live' && r !== 'onStrongWarm')) {
      expect(PALETTES.dark[role]).not.toBe(PALETTES.light[role]);
    }
  });
});

describe('withAlpha', () => {
  it('gjør en #RRGGBB-farge om til rgba med dekningen', () => {
    expect(theme.withAlpha('#1B4332', 0.75)).toBe('rgba(27, 67, 50, 0.75)');
    expect(theme.withAlpha('#FFFFFF', 0.86)).toBe('rgba(255, 255, 255, 0.86)');
  });
});

describe('frauncesLine', () => {
  // #2385: nettleserens linjeboks for Fraunces, målt i Chromium og simulatoren
  // med samme tekst i 20 størrelser og linjehøyder. Chromium runder ascent og
  // descent til hele CSS-piksler og runder halve ledningen ned; grunnlinja er
  // ascent pluss den. Uten `lineHeight` står grunnlinja på iOS ascent (rundet
  // opp til hel piksel) under toppen; med `lineHeight` `descent` over bunnen.
  const px3 = { pixelRatio: 3 };

  it('gir marger rundt tekstens egen høyde, med Chromiums grunnlinje', () => {
    // 30 pt på 1: grunnlinja 29 − 4 = 25; iOS har den 29,34 rundet opp til
    // 29,667 under toppen av tekstens egen høyde (37).
    const box = frauncesLine(30, 30, px3);
    expect(box.lineHeight).toBeUndefined();
    expect(box.marginTop).toBeCloseTo(-4.67, 2);
    expect(box.marginBottom).toBeCloseTo(-2.33, 2);
    // Nettleserens `normal` for 18 pt er 23, med grunnlinja 18.
    expect(frauncesLine(18, 23, px3).marginTop).toBeCloseTo(0.33, 2);
    // Hullnummeret: 96 pt på 0,9. Grunnlinja 94 − 16 = 78.
    const hole = frauncesLine(96, 86.4, px3);
    expect(hole.marginTop).toBeCloseTo(-16, 2);
    expect(hole.marginBottom).toBeCloseTo(-16.27, 2);
  });

  it('beholder lineHeight for tekst som kan brekke, og flytter grunnlinja', () => {
    // iOS: 30 − 7,65 = 22,35; Chromium: 25.
    const box = frauncesLine(30, 30, { ...px3, multiline: true });
    expect(box).toMatchObject({ fontSize: 30, lineHeight: 30 });
    expect(box.marginTop).toBeCloseTo(2.65, 2);
    expect(box.marginBottom).toBeCloseTo(-2.65, 2);
    // Under skriftstørrelsen krymper iOS glyfen: da blir det marger likevel.
    expect(frauncesLine(64, 60.8, { ...px3, multiline: true }).lineHeight).toBeUndefined();
  });

  it('gjør det samme for Inter (ascent 1984 og descent 494 av 2048)', () => {
    // «HULL», 10 pt på nettleserens 12: grunnlinja 10; iOS 9,6875 rundet opp
    // til 10, i tekstens egen høyde 12,333.
    const hull = interLine(10, 12, px3);
    expect(hull.marginTop).toBeCloseTo(0, 2);
    expect(hull.marginBottom).toBeCloseTo(-0.33, 2);
    // Chromium runder halve ledningen til 1/64 piksel før den rundes ned:
    // 13 × 1,23 = 15,99 gir −0,005, altså 0; 11 × 1,27 = 13,97 gir −0,015,
    // altså −1/64 og så −1 (målt i Chromium).
    expect(interLine(13, 13 * 1.23, px3).marginTop).toBeCloseTo(13 - 12.667, 2);
    expect(interLine(11, 11 * 1.27, px3).marginTop).toBeCloseTo(10 - 10.667, 2);
  });
});

describe('FONTS', () => {
  it('names the loaded faces', () => {
    expect(FONTS).toEqual({
      holeNumber: 'FrauncesHole96',
      holeNumberSun: 'FrauncesHole132',
      sans: 'Inter_400Regular',
      sansMedium: 'Inter_500Medium',
      sansSemiBold: 'Inter_600SemiBold',
      sansBold: 'Inter_700Bold',
    });
  });
});

// #2385: Fraunces med optisk størrelse lik skriftstørrelsen, som nettleseren.
describe('fraunces', () => {
  it('gir snittet for vekten og størrelsen', () => {
    expect(frauncesFamily(500, 28)).toBe('Fraunces500O28');
    expect(frauncesFamily(600, 40)).toBe('Fraunces600O40');
    // Uten linjehøyde: nettleserens `normal`, 27 + 7 = 34 for 28 pt.
    expect(fraunces(500, 28, undefined, { pixelRatio: 3 })).toEqual({
      ...frauncesLine(28, 34, { pixelRatio: 3 }),
      fontFamily: 'Fraunces500O28',
    });
  });

  it('runder en størrelse uten eget snitt til nærmeste, og midt mellom til det største', () => {
    expect(frauncesFamily(600, 10.5)).toBe('Fraunces600O11');
    expect(frauncesFamily(600, 17)).toBe('Fraunces600O18');
    expect(frauncesFamily(500, 16)).toBe('Fraunces500O15');
    expect(frauncesFamily(600, 200)).toBe('Fraunces600O64');
    expect(frauncesFamily(600, 4)).toBe('Fraunces600O9');
  });

  it('gir nettleserens linjeboks når linjehøyden er med', () => {
    expect(fraunces(600, 30, 30, { pixelRatio: 3 })).toEqual({
      ...frauncesLine(30, 30, { pixelRatio: 3 }),
      fontFamily: 'Fraunces600O30',
    });
  });

  it('har ett snitt per størrelse i tabellen, lastet i appen og lagt i assets', () => {
    const table = Object.entries(FRAUNCES_SIZES).flatMap(([weight, sizes]) =>
      sizes.map((size) => `Fraunces${weight}O${size}`),
    );
    const holes = ['FrauncesHole96', 'FrauncesHole132'];
    expect(Object.keys(FRAUNCES_FILES).sort()).toEqual([...table, ...holes].sort());
    const files = readdirSync(join(__dirname, '../assets/fonts'))
      .filter((file) => file.endsWith('.ttf'))
      .map((file) => file.replace(/\.ttf$/, ''));
    expect(files.sort()).toEqual([...table, ...holes].sort());
  });

  it('laster hver fil under familienavnet den har inni seg', () => {
    // Skriptet gir hver fil samme familienavn som filnavnet; `fonts.ts` må
    // bruke det samme navnet som nøkkel, ellers finner ikke iOS snittet.
    const source = readFileSync(join(__dirname, 'fonts.ts'), 'utf8');
    const pairs = [...source.matchAll(/(\w+): require\('\.\.\/assets\/fonts\/(\w+)\.ttf'\)/g)];
    expect(pairs.length).toBe(Object.keys(FRAUNCES_FILES).length);
    for (const [, key, file] of pairs) expect(key).toBe(file);
  });

  it('har et eget snitt for hver fast størrelse koden bruker', () => {
    // Bare dynamiske størrelser (et tall fra en tabell eller en funksjon)
    // skal rundes. Står størrelsen som tall i koden, skal snittet finnes.
    const missing: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) {
          const src = readFileSync(path, 'utf8');
          for (const m of src.matchAll(/fraunces(?:Family)?\((500|600),\s*([0-9.]+)\b/g)) {
            const sizes: readonly number[] = FRAUNCES_SIZES[m[1] as '500' | '600'];
            if (!sizes.includes(Number(m[2]))) missing.push(`${path}: ${m[0]}`);
          }
        }
      }
    };
    walk(__dirname);
    expect(missing).toEqual([]);
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

  // #2252: hullsidens mål er de samme i begge scheme (#2385: app-designets
  // `Main`). Sollys er den eneste som skal kunne endre dem.
  it('gives both schemes the design defaults for the hole page', () => {
    for (const scheme of ['light', 'dark'] as const) {
      expect(themeFor(scheme).hole).toEqual({
        numberSize: 96,
        railButton: 72,
        borderW: 1,
        railNumber: 28,
        railLabel: 11,
        selectedFill: false,
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
    'accentText',
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
      numberSize: 132,
      railButton: 84,
      borderW: 3,
      railNumber: 40,
      railLabel: 13,
      selectedFill: true,
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
