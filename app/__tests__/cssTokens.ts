import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Delte lesere for `app/globals.css` i Type A-token-tester.
 *
 * Kontrastkravene til paletten er rene matematiske egenskaper ved
 * tokenverdiene, ikke ved rendret UI — testene leser derfor CSS-en som tekst,
 * plukker ut tokenene og regner WCAG-kontrast. Første bruker var
 * `focus-ring-contrast.test.ts` (#1386); `warning-text-contrast.test.ts` (#1388)
 * er den andre. Helperne bor her så regelen fortsatt har ett hjem
 * (AGENTS.md felle 4) og ingen test kopierer parseren.
 */

export const CSS = readFileSync(
  path.resolve(__dirname, '../globals.css'),
  'utf8',
  // Kommentarene ut først — prosa med krøllparenteser ville ellers ødelagt
  // brace-matchingen under.
).replace(/\/\*[\s\S]*?\*\//g, '');

/** Innholdet i regelblokken som starter med `selector` (inkl. `{`). */
export function block(selector: string): string {
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

/**
 * Verdien til `--name` i `scope`. Ett tokens verdi kan peke på et annet i
 * samme blokk (`--focus-ring-strong: var(--bg-tint)`) — da følges pekeren, slik
 * nettleseren gjør, så tokenet beholder ett hjem (AGENTS.md felle 4).
 */
export function readVar(scope: string, name: string): string | null {
  const hit = new RegExp(`--${name}:\\s*([^;]+);`).exec(scope);
  if (!hit) return null;
  const value = hit[1].trim();
  const ref = /^var\(\s*--([\w-]+)\s*\)$/.exec(value);
  return ref ? readVar(scope, ref[1]) : value;
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

/** WCAG-kontrast mellom forgrunnen (ring eller tekst) og flaten under. */
export function contrast(foreground: string, surface: string): number {
  const bg = parseColor(surface);
  const drawn = composite(parseColor(foreground), bg);
  const [hi, lo] = [luminance(drawn), luminance(bg)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Brace-dybden på posisjon `at`: 0 = toppnivå, 1 = inne i én regelblokk. */
export function depthAt(at: number): number {
  let depth = 0;
  for (let i = 0; i < at; i++) {
    if (CSS[i] === '{') depth++;
    else if (CSS[i] === '}') depth--;
  }
  return depth;
}

export const ROOT = block(':root {');
export const DARK_MEDIA = block(":root:not([data-theme='light']) {");
export const DARK_ATTR = block("[data-theme='klubbhus-natt'] {");
