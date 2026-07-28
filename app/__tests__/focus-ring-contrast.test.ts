import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Type A (#1386) — kravet til tastaturfokus-ringen er en ren matematisk
 * egenskap ved tokenverdiene, ikke ved rendret UI. Testen leser
 * `app/globals.css` som tekst, plukker ut `--focus-ring` og hver foreldre-flate
 * ringen kan tegnes mot, og regner WCAG-kontrast.
 *
 * WCAG 2.2 SC 1.4.11 (Non-text Contrast, AA) krever 3:1 for grafiske
 * indikatorer som fokusmarkering. `outline-offset` er positiv, så ringen
 * tegnes på FORELDRE-flaten — derfor er det disse tokenene som er
 * bakgrunnen, ikke elementets egen fyll.
 *
 * Regelen har ett hjem (AGENTS.md felle 4): globals.css. Testen låser den der.
 */

const CSS = readFileSync(
  path.resolve(__dirname, '../globals.css'),
  'utf8',
  // Kommentarene ut først — prosa med krøllparenteser ville ellers ødelagt
  // brace-matchingen under.
).replace(/\/\*[\s\S]*?\*\//g, '');

/** Innholdet i regelblokken som starter med `selector` (inkl. `{`). */
function block(selector: string): string {
  const at = CSS.indexOf(selector);
  if (at === -1) throw new Error(`Fant ikke «${selector}» i globals.css`);
  const open = at + selector.length - 1;
  let depth = 0;
  for (let i = open; i < CSS.length; i++) {
    if (CSS[i] === '{') depth++;
    else if (CSS[i] === '}' && --depth === 0) return CSS.slice(open + 1, i);
  }
  throw new Error(`Blokken «${selector}» lukkes aldri`);
}

function readVar(scope: string, name: string): string | null {
  const hit = new RegExp(`--${name}:\\s*([^;]+);`).exec(scope);
  return hit ? hit[1].trim() : null;
}

type Rgba = { r: number; g: number; b: number; a: number };

function parseColor(value: string): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const fn =
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(
      value,
    );
  if (fn) {
    return {
      r: Number(fn[1]),
      g: Number(fn[2]),
      b: Number(fn[3]),
      a: fn[4] === undefined ? 1 : Number(fn[4]),
    };
  }
  throw new Error(`Ukjent fargeformat: «${value}»`);
}

/** source-over-kompositt av en (evt. gjennomsiktig) farge på en ugjennomsiktig flate. */
function composite(fg: Rgba, bg: Rgba): Rgba {
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  };
}

/** WCAG relativ luminans (sRGB). */
function luminance({ r, g, b }: Rgba): number {
  const lin = (channel: number) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(ring: string, surface: string): number {
  const bg = parseColor(surface);
  const drawn = composite(parseColor(ring), bg);
  const [hi, lo] = [luminance(drawn), luminance(bg)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const ROOT = block(':root {');
const DARK_MEDIA = block(":root:not([data-theme='light']) {");
const DARK_ATTR = block("[data-theme='klubbhus-natt'] {");

/**
 * Hver flate et fokuserbart element faktisk kan sitte på. `--primary` /
 * `--surface-strong` står bevisst ikke i lista: ingen fokuserbare elementer
 * ligger på en slik container (verifisert #1386), og med positiv outline-offset
 * er elementets egen fyll uansett irrelevant.
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

describe('fokus-ring (#1386)', () => {
  it('er definert i :root, ikke bare i dark-blokkene', () => {
    expect(readVar(ROOT, 'focus-ring')).not.toBeNull();
  });

  it('har identisk verdi i begge dark-blokkene', () => {
    const media = readVar(DARK_MEDIA, 'focus-ring');
    expect(media).not.toBeNull();
    expect(readVar(DARK_ATTR, 'focus-ring')).toBe(media);
  });

  // Lag-rekkefølge slår spesifisitet: havner :focus-visible-regelen inne i en
  // @layer, taper den mot Tailwinds focus:outline-none-utilities i
  // @layer utilities — og fiksen ser riktig ut i diffen uten å virke.
  it('tegnes av regler som ligger ulaget på toppnivå', () => {
    const found: number[] = [];
    for (let at = CSS.indexOf(':focus-visible'); at !== -1; ) {
      found.push(at);
      at = CSS.indexOf(':focus-visible', at + 1);
    }
    expect(found.length).toBeGreaterThan(0);
    for (const at of found) {
      const depth = [...CSS.slice(0, at)].reduce(
        (d, c) => (c === '{' ? d + 1 : c === '}' ? d - 1 : d),
        0,
      );
      expect(depth).toBe(0);
    }
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
  });
});
