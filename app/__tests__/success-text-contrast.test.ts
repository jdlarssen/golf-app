import { describe, it, expect } from 'vitest';
import {
  contrast,
  readVar,
  tintOver,
  ROOT,
  DARK_MEDIA,
  DARK_ATTR,
} from './cssTokens';

/**
 * Type A (#1686) — tredje verset av --accent-text (#1374) og --warning-text
 * (#1388). `--success` er en DEKOR-farge (sage kant/fyll) og målte 4,15:1 mot
 * --primary-soft, 4,16:1 mot --surface-2 og 4,4997:1 mot --bg som tekst — under
 * WCAG AA på tre av fire flater den faktisk lander på. `--success-text` er
 * tekst-varianten, og denne testen låser at den er lesbar.
 *
 * WCAG 2.2 SC 1.4.3 (Contrast Minimum, AA) krever 4,5:1 for brødtekst.
 * Flatesettet er bredere enn warning-testens med vilje: --primary-soft er
 * success-bannerets eget fyll (`components/ui/Banner.tsx`) og verstefallet her,
 * og --admin-bg bærer seks av de tretten forekomstene.
 */

const TOKEN = 'success-text';

/** bg-success/10 er det eneste sage-tintede fyllet suksess-tekst står på. */
const TINT_ALPHA = 0.1;

describe('--success-text (#1686)', () => {
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
    it.each(['bg', 'surface', 'surface-2', 'primary-soft', 'admin-bg'])(
      'holder 4,5:1 mot --%s',
      (name) => {
        const text = readVar(tokens, TOKEN);
        expect(text, '--success-text mangler i blokken').not.toBeNull();
        const surface = readVar(tokens, name);
        expect(surface, `--${name} mangler i blokken`).not.toBeNull();

        expect(
          contrast(text as string, surface as string),
        ).toBeGreaterThanOrEqual(4.5);
      },
    );

    it('holder 4,5:1 mot bg-success/10-fyllet pill-ene maler bak teksten', () => {
      const text = readVar(tokens, TOKEN);
      const success = readVar(tokens, 'success');
      const bg = readVar(tokens, 'bg');
      expect(success, '--success mangler i blokken').not.toBeNull();
      expect(bg, '--bg mangler i blokken').not.toBeNull();

      const fill = tintOver(bg as string, success as string, TINT_ALPHA);
      expect(contrast(text as string, fill)).toBeGreaterThanOrEqual(4.5);
    });
  });

  it('dekor-tokenet --success står urørt — kanter og fyll skal fortsatt være sage', () => {
    expect(readVar(ROOT, 'success')).toBe('#4a7c59');
  });
});
