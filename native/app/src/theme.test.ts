// #1830 la den additive tema-kontrakten; #1833 fjernet den lys-bare halvdelen
// av den. Testen låser derfor tre ting: at lys-paletten fortsatt HAR N3-verdiene
// (ingen skjerm skiftet farge da `COLORS` forsvant), at mørk er komplett, og at
// `useTheme()` er den ene veien inn — én `ui` per scheme, med samme nøkler.
import { renderHook } from '@testing-library/react-native';
import * as theme from './theme';
import {
  FONTS,
  PALETTES,
  resolveScheme,
  themeFor,
  useTheme,
} from './theme';

describe('PALETTES', () => {
  it('keeps the light palette on the N3 forest-and-champagne values', () => {
    expect(PALETTES.light).toEqual({
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
    });
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
