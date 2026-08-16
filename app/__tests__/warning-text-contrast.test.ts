import { describe, it, expect } from 'vitest';
import {
  contrast,
  readVar,
  ROOT,
  DARK_MEDIA,
  DARK_ATTR,
} from './cssTokens';

/**
 * Type A (#1388) — søsteren til focus-ring-contrast.test.ts. `--warning` er en
 * DEKOR-farge (amber kant/fyll) og måler 2,24:1 mot --bg som tekst; den ble
 * likevel brukt som tekstfarge 31 steder. `--warning-text` er tekst-varianten,
 * etter samme mønster som --accent-text (#1374), og denne testen låser at den
 * faktisk er lesbar.
 *
 * WCAG 2.2 SC 1.4.3 (Contrast Minimum, AA) krever 4,5:1 for brødtekst. Flatene
 * under er dem advarsels-tekst faktisk lander på: sidebakgrunnen, kortflaten,
 * og amber-tint-fyllet warning-bannere maler bak seg selv.
 */

const TOKEN = 'warning-text';

/** bg-warning/[0.18] er det mørkeste amber-fyllet i bruk (score-over1-bg). */
const TINT_ALPHA = 0.18;

/** Amber-tinten lagt over en flate, slik nettleseren komponerer den. */
function amberTint(surface: string, warning: string): string {
  const px = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const [fr, fg, fb] = px(warning);
  const [br, bg, bb] = px(surface);
  const mix = (f: number, b: number) =>
    Math.round(f * TINT_ALPHA + b * (1 - TINT_ALPHA))
      .toString(16)
      .padStart(2, '0');
  return `#${mix(fr, br)}${mix(fg, bg)}${mix(fb, bb)}`;
}

describe('--warning-text (#1388)', () => {
  it('er definert i :root, ikke bare i dark-blokkene', () => {
    expect(readVar(ROOT, TOKEN)).not.toBeNull();
  });

  it('har identisk verdi i begge dark-blokkene', () => {
    const media = readVar(DARK_MEDIA, TOKEN);
    expect(media).not.toBeNull();
    expect(readVar(DARK_ATTR, TOKEN)).toBe(media);
  });

  describe.each([
    ['lys', ROOT],
    ['mørk', DARK_ATTR],
  ])('%s modus', (_mode, tokens) => {
    it.each(['bg', 'surface', 'surface-2'])('holder 4,5:1 mot --%s', (name) => {
      const text = readVar(tokens, TOKEN);
      expect(text, '--warning-text mangler i blokken').not.toBeNull();
      const surface = readVar(tokens, name);
      expect(surface, `--${name} mangler i blokken`).not.toBeNull();

      expect(
        contrast(text as string, surface as string),
      ).toBeGreaterThanOrEqual(4.5);
    });

    it('holder 4,5:1 mot amber-tinten bannerne maler bak teksten', () => {
      const text = readVar(tokens, TOKEN);
      const warning = readVar(tokens, 'warning');
      const bg = readVar(tokens, 'bg');
      expect(warning, '--warning mangler i blokken').not.toBeNull();
      expect(bg, '--bg mangler i blokken').not.toBeNull();

      const fill = amberTint(bg as string, warning as string);
      expect(contrast(text as string, fill)).toBeGreaterThanOrEqual(4.5);
    });
  });

  it('dekor-tokenet --warning står urørt — kanter og fyll skal fortsatt være amber', () => {
    expect(readVar(ROOT, 'warning')).toBe('#d89b3a');
  });
});
