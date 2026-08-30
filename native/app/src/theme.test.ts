// #1830: locks the additive theme contract N4 builds against — light palette
// bit-identical to the pre-split COLORS, dark palette complete, ui key parity
// between schemes, and the scheme resolution the useTheme hook composes.
import { renderHook } from '@testing-library/react-native';
import {
  COLORS,
  FONTS,
  PALETTES,
  resolveScheme,
  themeFor,
  ui,
  useTheme,
} from './theme';

describe('PALETTES', () => {
  it('maps the light palette bit-identical to the pre-split COLORS values', () => {
    expect(PALETTES.light).toEqual({
      bg: COLORS.linen,
      surface: COLORS.card,
      border: COLORS.border,
      text: COLORS.forest,
      muted: COLORS.muted,
      primary: COLORS.forest,
      onPrimary: '#FFFFFF',
      accent: COLORS.gold,
      danger: COLORS.error,
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

  it('keeps the legacy ui export as the light variant with key parity to dark', () => {
    const light = themeFor('light');
    const dark = themeFor('dark');
    expect(light.ui).toBe(ui);
    expect(Object.keys(dark.ui).sort()).toEqual(Object.keys(light.ui).sort());
  });

  it('selects the matching palette per scheme', () => {
    expect(themeFor('light').colors).toBe(PALETTES.light);
    expect(themeFor('dark').colors).toBe(PALETTES.dark);
  });
});

describe('useTheme', () => {
  it('resolves a full theme in the default test environment', async () => {
    const { result } = await renderHook(() => useTheme());
    expect(result.current.scheme).toBe('light');
    expect(result.current.colors).toBe(PALETTES.light);
    expect(result.current.ui).toBe(ui);
  });
});
