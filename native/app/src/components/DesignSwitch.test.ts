// Type A: the off track of a list switch meets the 3:1 non-text contrast
// (WCAG 1.4.11) against the card it sits on, in both themes.
import { PALETTES, type Scheme } from '../theme';
import { listSwitchOffColor } from './DesignSwitch';

function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}
function luminance([r, g, b]: [number, number, number]): number {
  const [R, G, B] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}
function ratio(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
/** Blends an `#RRGGBBAA` colour over an opaque `#RRGGBB` background. */
function over(rgba: string, bg: string): [number, number, number] {
  const alpha = parseInt(rgba.slice(7, 9), 16) / 255;
  const fg = channels(rgba);
  const back = channels(bg);
  return [0, 1, 2].map((i) => fg[i] * alpha + back[i] * (1 - alpha)) as [number, number, number];
}

describe('listSwitchOffColor', () => {
  it.each<Scheme>(['light', 'dark'])('%s: track is at least 3:1 against the card and the page', (scheme) => {
    const colors = PALETTES[scheme];
    const track = listSwitchOffColor(colors, scheme);
    expect(ratio(over(track, colors.surface), channels(colors.surface))).toBeGreaterThanOrEqual(3);
    expect(ratio(over(track, colors.bg), channels(colors.bg))).toBeGreaterThanOrEqual(3);
    expect(ratio(over(track, colors.surface2), channels(colors.surface2))).toBeGreaterThanOrEqual(3);
  });
});
