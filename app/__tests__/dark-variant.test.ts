import { describe, it, expect } from 'vitest';
import { CSS, depthAt } from './cssTokens';

/**
 * Type A (#2240) — `dark:`-utilitiene må slå inn under nøyaktig de samme
 * vilkårene som dark-tokenene i `app/globals.css`. Ellers bytter flatene til
 * klubbhus-natt mens `dark:text-bg` o.l. blir stående på lys-verdien — primær-
 * knappen fikk hvit tekst på salvie (2,64:1) når telefonen sto i mørk modus og
 * temaet sto på «auto» (ingen `data-theme` på <html>).
 *
 * Testen leser CSS-en som tekst, plukker ut grenene i `@custom-variant dark`
 * (media-spørring + selektor) og sammenligner dem med vilkårene til de to
 * dark-token-blokkene. Varianten speiler blokkene; blokkene er fasiten.
 */

type Branch = { media: string | null; selector: string };

/** Indeksen til parentesen/klammen som lukker den som åpner på `open`. */
function closing(text: string, open: number): number {
  const [o, c] = text[open] === '(' ? ['(', ')'] : ['{', '}'];
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === o) depth++;
    else if (text[i] === c && --depth === 0) return i;
  }
  throw new Error(`«${text[open]}» på ${open} lukkes aldri`);
}

/** Grenene i en variant-kropp: hver `@slot` med media-spørringen og selektoren over seg. */
function walk(body: string, media: string | null, out: Branch[]): void {
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    if (body[i] === ';') {
      if (body.slice(start, i).trim() === '@slot') out.push({ media, selector: '&' });
      start = i + 1;
    } else if (body[i] === '{') {
      const prelude = body.slice(start, i).trim();
      const end = closing(body, i);
      const inner = body.slice(i + 1, end);
      if (prelude.startsWith('@media')) {
        walk(inner, prelude.slice('@media'.length).trim(), out);
      } else if (inner.trim() === '@slot;') {
        out.push({ media, selector: prelude });
      } else {
        throw new Error(`Uventet gren i dark-varianten: «${prelude}»`);
      }
      i = end;
      start = end + 1;
    }
  }
}

/** Grenene i `@custom-variant dark`, både kort form `(…);` og blokkform `{…}`. */
function darkVariantBranches(): Branch[] {
  const hit = /@custom-variant\s+dark\s*([({])/.exec(CSS);
  if (!hit) throw new Error('Fant ikke «@custom-variant dark» i globals.css');
  const open = hit.index + hit[0].length - 1;
  const body = CSS.slice(open + 1, closing(CSS, open));
  if (hit[1] === '(') return [{ media: null, selector: body.trim() }];
  const out: Branch[] = [];
  walk(body, null, out);
  return out;
}

/** Selektorlista i `&:where(…)`, sortert — eller rå-selektoren om den ikke har den formen. */
function whereList(selector: string): string[] | string {
  const hit = /^&:where\(([\s\S]*)\)$/.exec(selector);
  if (!hit) return selector;
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  const inner = hit[1];
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === '(' || inner[i] === '[') depth++;
    else if (inner[i] === ')' || inner[i] === ']') depth--;
    else if (inner[i] === ',' && depth === 0) {
      parts.push(inner.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(inner.slice(start).trim());
  return parts.sort();
}

/** Selektoren/at-regelen rett foran klammen på `open`. */
function preludeBefore(open: number): string {
  const from =
    Math.max(
      CSS.lastIndexOf('}', open - 1),
      CSS.lastIndexOf('{', open - 1),
      CSS.lastIndexOf(';', open - 1),
    ) + 1;
  return CSS.slice(from, open).trim();
}

/** Klammen som åpner regelblokken posisjon `at` står inne i. */
function enclosingOpen(at: number): number {
  let depth = 0;
  for (let i = at - 1; i >= 0; i--) {
    if (CSS[i] === '}') depth++;
    else if (CSS[i] === '{' && depth-- === 0) return i;
  }
  throw new Error(`Posisjon ${at} står ikke inne i noen blokk`);
}

// Vilkårene dark-tokenene faktisk bruker, lest ut av globals.css.
const MEDIA_ROOT = ":root:not([data-theme='light'])";
const mediaRootAt = CSS.indexOf(`${MEDIA_ROOT} {`);
const ATTR_ANCHOR = "[data-theme='klubbhus-natt'] {";
const attrOpen = CSS.indexOf(ATTR_ANCHOR) + ATTR_ANCHOR.length - 1;

describe('dark:-varianten følger dark-tokenene (#2240)', () => {
  it('dark-token-blokkene står der testen leser vilkårene fra', () => {
    expect(mediaRootAt, `fant ikke «${MEDIA_ROOT} {»`).toBeGreaterThan(-1);
    expect(depthAt(mediaRootAt)).toBe(1);
    expect(preludeBefore(enclosingOpen(mediaRootAt))).toBe(
      '@media (prefers-color-scheme: dark)',
    );
    expect(depthAt(attrOpen), 'attributt-blokken skal stå på toppnivå').toBe(0);
  });

  it('fyrer under nøyaktig de to vilkårene token-blokkene bruker', () => {
    const media = preludeBefore(enclosingOpen(mediaRootAt))
      .slice('@media'.length)
      .trim();
    const attrSelectors = preludeBefore(attrOpen)
      .split(',')
      .map((s) => s.trim());
    const withDescendants = (selectors: string[]) =>
      selectors.flatMap((s) => [s, `${s} *`]).sort();

    const actual = darkVariantBranches()
      .map(({ media: m, selector }) => ({
        media: m,
        where: whereList(selector),
      }))
      .sort((a, b) => String(a.media).localeCompare(String(b.media)));

    // `&:where(…)` holder spesifisiteten på 0, så `dark:x` ikke veier mer enn
    // basis-utilityen. Selve elementet og alle etterkommere, som token-blokkene.
    expect(actual).toEqual(
      [
        { media, where: withDescendants([MEDIA_ROOT]) },
        { media: null, where: withDescendants(attrSelectors) },
      ].sort((a, b) => String(a.media).localeCompare(String(b.media))),
    );
  });
});
