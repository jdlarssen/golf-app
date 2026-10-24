// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { fixComponentMatrices } from './componentMatrices';

const F2DOT14 = 0x4000;

// Glyph 1: a simple glyph whose outline bytes happen to read like a matrix.
const SIMPLE = [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0x40, 0x00, 0xc0, 0x00];

// Glyph 2: a composite with four components, built like Fraunces' «+» at the end.
const COMPOSITE = [
  ...[0xff, 0xff, 0, 0, 0, 0, 0, 0, 0, 0], // numberOfContours −1, bbox
  // A: byte args (xy values, more components); glyph 0, dx 0, dy 0
  ...[0x00, 0x22, 0x00, 0x00, 0x00, 0x00],
  // B: word args, a scale (more); glyph 0, dx 0, dy 0, scale 0.5
  ...[0x00, 0x2b, 0x00, 0x00, 0, 0, 0, 0, 0x20, 0x00],
  // C: word args, an x and y scale (more); glyph 0, dx 0, dy 0, scales 1 and −1
  ...[0x00, 0x63, 0x00, 0x00, 0, 0, 0, 0, 0x40, 0x00, 0xc0, 0x00],
  // D: word args, a two-by-two, instructions follow; glyph 0, dx 1238, dy 142, [0 1 −1 0]
  ...[0x01, 0x83, 0x00, 0x00, 0x04, 0xd6, 0x00, 0x8e, 0x00, 0x00, 0x40, 0x00, 0xc0, 0x00, 0x00, 0x00],
  // The instructions: length 4, then bytes that read like a matrix
  ...[0x00, 0x04, 0x40, 0x00, 0xc0, 0x00],
];
/** Where in COMPOSITE: D's matrix, B's scale, C's scales, the instructions. */
const AT = { matrix: 46, scale: 24, xyScale: 34, instructions: 54 };

type Options = {
  longLoca?: boolean;
  /** `head.indexToLocFormat`, if not the one `longLoca` implies. */
  locFormat?: number;
  /** Tables to leave out. */
  omit?: string[];
  /** Extra tables, as a CFF font has. */
  extra?: [string, number[]][];
  /** Moves the end of the last glyph. */
  lastGlyphEnd?: number;
};

const u16 = (n: number) => [(n >>> 8) & 0xff, n & 0xff];
const u32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];

/**
 * The smallest font the fix reads: `head`, `maxp`, `loca` and `glyf`, with
 * glyph 0 empty (the component every composite points at), glyph 1 simple and
 * glyph 2 the composite. Returns the font and where glyph 2 starts in it.
 */
function buildFont(opts: Options = {}): { font: ArrayBuffer; glyph2: number } {
  const longLoca = opts.longLoca ?? false;
  const ends = [0, 0, SIMPLE.length, opts.lastGlyphEnd ?? SIMPLE.length + COMPOSITE.length];
  const loca = ends.flatMap((o) => (longLoca ? u32(o) : u16(o / 2)));
  const head = Array.from({ length: 54 }, () => 0);
  head.splice(50, 2, ...u16(opts.locFormat ?? (longLoca ? 1 : 0)));
  const all: [string, number[]][] = [
    ['head', head],
    ['maxp', [0, 0, 0x50, 0, ...u16(3)]],
    ['loca', loca],
    ['glyf', [...SIMPLE, ...COMPOSITE]],
    ...(opts.extra ?? []),
  ];
  const tables = all.filter(([tag]) => !(opts.omit ?? []).includes(tag));
  const sfnt = (opts.extra ?? []).some(([tag]) => tag === 'CFF ') ? [0x4f, 0x54, 0x54, 0x4f] : u32(0x00010000);
  const directory = [...sfnt, ...u16(tables.length), 0, 0, 0, 0, 0, 0];
  const body: number[] = [];
  let offset = 12 + 16 * tables.length;
  let glyf = 0;
  for (const [tag, data] of tables) {
    if (tag === 'glyf') glyf = offset;
    directory.push(...[...tag].map((c) => c.charCodeAt(0)), 0, 0, 0, 0, ...u32(offset), ...u32(data.length));
    body.push(...data);
    offset += data.length;
  }
  return { font: new Uint8Array([...directory, ...body]).buffer, glyph2: glyf + SIMPLE.length };
}

const values = (font: ArrayBuffer, at: number, count: number) => {
  const view = new DataView(font);
  return Array.from({ length: count }, (_, i) => view.getInt16(at + 2 * i) / F2DOT14);
};

type Point = { x: number; y: number };
/** How TrueType places a component point: x' = a·x + c·y, y' = b·x + d·y. */
const trueType = ([a, b, c, d]: number[], { x, y }: Point) => ({ x: a * x + c * y, y: b * x + d * y });
/** How Satori's opentype.js places it: x' = a·x + b·y, y' = c·x + d·y. */
const satori = ([a, b, c, d]: number[], { x, y }: Point) => ({ x: a * x + b * y, y: c * x + d * y });

describe('fixComponentMatrices (#2625)', () => {
  it("makes Satori turn a component the way the font means: the plus's second bar stands upright", () => {
    const { font, glyph2 } = buildFont();
    const fixed = fixComponentMatrices(font);
    const at = glyph2 + AT.matrix;
    // The minus's right end, on the bar: TrueType turns it straight up.
    const end = { x: 1000, y: 600 };
    expect(trueType(values(font, at, 4), end)).toEqual({ x: -600, y: 1000 });
    expect(satori(values(fixed, at, 4), end)).toEqual(trueType(values(font, at, 4), end));
    // Unfixed, Satori turned it down, under the next glyph.
    expect(satori(values(font, at, 4), end)).toEqual({ x: 600, y: -1000 });
  });

  it.each([
    ['short', false],
    ['long', true],
  ])('with a %s loca, swaps only the two-by-two\'s scale01 and scale10', (_label, longLoca) => {
    const { font, glyph2 } = buildFont({ longLoca });
    const fixed = fixComponentMatrices(font);
    expect(values(fixed, glyph2 + AT.matrix, 4)).toEqual([0, -1, 1, 0]);
    // Every other byte stays: the simple glyph, the byte and word args, the
    // scale, the x and y scale and the instructions after the last component.
    const before = new Uint8Array(font);
    const after = new Uint8Array(fixed);
    expect(after.length).toBe(before.length);
    const changed = [...after.keys()].filter((i) => after[i] !== before[i]);
    const b = glyph2 + AT.matrix + 2;
    const c = glyph2 + AT.matrix + 4;
    expect(changed.every((i) => i >= b && i < c + 2)).toBe(true);
    expect(changed.length).toBeGreaterThan(0);
    expect(values(fixed, glyph2 + AT.scale, 1)).toEqual([0.5]);
    expect(values(fixed, glyph2 + AT.xyScale, 2)).toEqual([1, -1]);
    expect(values(fixed, glyph2 + AT.instructions + 2, 2)).toEqual([1, -1]);
  });

  it('copies the font: the fetched buffer stays as it came', () => {
    const { font } = buildFont();
    const copy = new Uint8Array(font).slice();
    const fixed = fixComponentMatrices(font);
    expect(fixed).not.toBe(font);
    expect(new Uint8Array(font)).toEqual(copy);
  });

  it.each<[string, () => ArrayBuffer]>([
    ['too short to hold a table directory', () => new ArrayBuffer(1)],
    ['a CFF font, without loca and glyf', () => buildFont({ omit: ['loca', 'glyf'], extra: [['CFF ', [1, 0, 4, 2]]] }).font],
    ['no head', () => buildFont({ omit: ['head'] }).font],
    ['an unknown indexToLocFormat', () => buildFont({ locFormat: 2 }).font],
    ['a loca that points past the end', () => buildFont({ lastGlyphEnd: 4000 }).font],
    ['cut inside the last glyph', () => buildFont().font.slice(0, -8)],
  ])('hands back a font it cannot read as it came: %s', (_label, make) => {
    const font = make();
    const copy = new Uint8Array(font).slice();
    expect(fixComponentMatrices(font)).toBe(font);
    expect(new Uint8Array(font)).toEqual(copy);
  });
});
