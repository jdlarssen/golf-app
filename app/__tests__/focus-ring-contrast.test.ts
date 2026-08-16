import { describe, it, expect } from 'vitest';
import {
  CSS,
  contrast,
  depthAt,
  readVar,
  ROOT,
  DARK_MEDIA,
  DARK_ATTR,
} from './cssTokens';

/**
 * Type A (#1386) — kravet til tastaturfokus-ringen er en ren matematisk
 * egenskap ved tokenverdiene, ikke ved rendret UI. Testen leser
 * `app/globals.css` som tekst (via de delte leserne i `cssTokens.ts`), plukker
 * ut `--focus-ring` og hver foreldre-flate ringen kan tegnes mot, og regner
 * WCAG-kontrast.
 *
 * WCAG 2.2 SC 1.4.11 (Non-text Contrast, AA) krever 3:1 for grafiske
 * indikatorer som fokusmarkering. `outline-offset` er positiv, så ringen
 * tegnes på FORELDRE-flaten — derfor er det disse tokenene som er
 * bakgrunnen, ikke elementets egen fyll.
 *
 * Regelen har ett hjem (AGENTS.md felle 4): globals.css. Testen låser den der.
 */

/**
 * Hver flate hovedringen kan bli tegnet på. `--primary` står ikke i lista:
 * deep forest opptrer bare som elementets EGEN fyll (knapper, accent-tiles), og
 * med positiv outline-offset havner ringen utenfor det fyllet, på flaten under.
 *
 * `--surface-strong` er derimot en container-flate med fokuserbare barn
 * (OnboardingBanner har lukkeknappen sin oppå den), og den er bit-identisk med
 * lys-modus-ringen. Den har derfor sin egen ring — se STRONG-testen under.
 */
const SURFACES = [
  'bg',
  'surface',
  'surface-2',
  'primary-soft',
  'border',
  'admin-bg',
  'admin-salutation-top',
  'admin-salutation-bottom',
  'leader-fill-top',
  'leader-fill-bottom',
  'skel-base',
] as const;

/**
 * Deklarasjonene som faktisk tegner eller justerer ringen. Lag-rekkefølge slår
 * spesifisitet: havner en av dem inne i en @layer, taper den mot Tailwinds
 * `focus:outline-none`-utilities i `@layer utilities` — og fiksen ser riktig ut
 * i diffen uten å virke. Dybde 1 = deklarasjonen står i en ulaget toppnivå-regel.
 *
 * Vakten er scopet til disse tre, ikke til enhver `:focus-visible` i fila: en
 * framtidig `@media (forced-colors: active)`-gjennomgang skal kunne neste sine
 * egne regler uten å gjøre testen rød.
 */
const RING_DECLARATIONS = [
  'outline: 2px solid var(--focus-ring);',
  'outline-offset: -2px;',
  '--focus-ring: var(--focus-ring-strong);',
] as const;

describe('fokus-ring (#1386)', () => {
  describe.each(['focus-ring', 'focus-ring-strong'])('--%s', (token) => {
    it('er definert i :root, ikke bare i dark-blokkene', () => {
      expect(readVar(ROOT, token)).not.toBeNull();
    });

    it('har identisk verdi i begge dark-blokkene', () => {
      const media = readVar(DARK_MEDIA, token);
      expect(media).not.toBeNull();
      expect(readVar(DARK_ATTR, token)).toBe(media);
    });
  });

  it.each(RING_DECLARATIONS)('«%s» står ulaget på toppnivå', (decl) => {
    const at = CSS.indexOf(decl);
    expect(at, `fant ikke «${decl}» i globals.css`).toBeGreaterThan(-1);
    expect(CSS.indexOf(decl, at + 1), 'deklarasjonen står flere steder').toBe(
      -1,
    );
    expect(depthAt(at)).toBe(1);
  });

  describe.each([
    ['lys', ROOT],
    ['mørk', DARK_ATTR],
  ])('%s modus', (_mode, tokens) => {
    it.each(SURFACES)('holder 3:1 mot --%s', (surface) => {
      const ring = readVar(tokens, 'focus-ring');
      expect(ring, '--focus-ring mangler i blokken').not.toBeNull();
      const value = readVar(tokens, surface);
      expect(value, `--${surface} mangler i blokken`).not.toBeNull();

      expect(contrast(ring as string, value as string)).toBeGreaterThanOrEqual(
        3,
      );
    });

    it('holder 3:1 mot --surface-strong med sin egen ring', () => {
      const ring = readVar(tokens, 'focus-ring-strong');
      expect(ring, '--focus-ring-strong mangler i blokken').not.toBeNull();
      const value = readVar(tokens, 'surface-strong');
      expect(value, '--surface-strong mangler i blokken').not.toBeNull();

      expect(contrast(ring as string, value as string)).toBeGreaterThanOrEqual(
        3,
      );
    });
  });
});
