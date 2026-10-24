/**
 * #2625: Satori's font parser (the opentype.js inside `next/og`) applies a
 * composite glyph's 2×2 component matrix transposed. It reads the four values
 * in file order (a, b, c, d) and computes x' = a·x + b·y, y' = c·x + d·y, where
 * TrueType means x' = a·x + c·y, y' = b·x + d·y. A rotated component then turns
 * the wrong way. Fraunces builds its «+» from a minus and the same minus turned
 * 90°, so every upright «+3» on a share card drew a minus with a loose stroke
 * under the next digit.
 *
 * Swapping b and c in the font's bytes makes Satori's reading land where the
 * font means it to. The byte length and every table offset stay the same. A
 * font whose tables do not parse as expected comes back as fetched.
 */

// Component flags (TrueType `glyf`, composite glyph description).
const ARG_1_AND_2_ARE_WORDS = 0x0001;
const WE_HAVE_A_SCALE = 0x0008;
const MORE_COMPONENTS = 0x0020;
const WE_HAVE_AN_X_AND_Y_SCALE = 0x0040;
const WE_HAVE_A_TWO_BY_TWO = 0x0080;

function tableOffsets(view: DataView): Map<string, number> {
  const offsets = new Map<string, number>();
  const numTables = view.getUint16(4);
  for (let i = 0; i < numTables; i++) {
    const record = 12 + 16 * i;
    const tag = String.fromCharCode(
      view.getUint8(record),
      view.getUint8(record + 1),
      view.getUint8(record + 2),
      view.getUint8(record + 3),
    );
    offsets.set(tag, view.getUint32(record + 8));
  }
  return offsets;
}

export function fixComponentMatrices(font: ArrayBuffer): ArrayBuffer {
  try {
    const fixed = font.slice(0);
    const view = new DataView(fixed);
    const tables = tableOffsets(view);
    const head = tables.get('head');
    const maxp = tables.get('maxp');
    const loca = tables.get('loca');
    const glyf = tables.get('glyf');
    if (head === undefined || maxp === undefined || loca === undefined || glyf === undefined) {
      return font;
    }
    const locFormat = view.getInt16(head + 50);
    if (locFormat !== 0 && locFormat !== 1) return font;
    const glyphStart = (g: number) =>
      glyf + (locFormat === 1 ? view.getUint32(loca + 4 * g) : view.getUint16(loca + 2 * g) * 2);
    const numGlyphs = view.getUint16(maxp + 4);
    for (let g = 0; g < numGlyphs; g++) {
      const start = glyphStart(g);
      const end = glyphStart(g + 1);
      if (end < start || end > view.byteLength) return font;
      // Empty, or simple (contour count ≥ 0): nothing to turn.
      if (end - start < 10 || view.getInt16(start) >= 0) continue;
      let p = start + 10;
      for (;;) {
        if (p + 4 > end) return font;
        const flags = view.getUint16(p);
        p += 4 + (flags & ARG_1_AND_2_ARE_WORDS ? 4 : 2);
        if (flags & WE_HAVE_A_SCALE) p += 2;
        else if (flags & WE_HAVE_AN_X_AND_Y_SCALE) p += 4;
        else if (flags & WE_HAVE_A_TWO_BY_TWO) {
          if (p + 8 > end) return font;
          const b = view.getInt16(p + 2);
          view.setInt16(p + 2, view.getInt16(p + 4));
          view.setInt16(p + 4, b);
          p += 8;
        }
        if (!(flags & MORE_COMPONENTS)) break;
      }
    }
    return fixed;
  } catch {
    // A read past the end (RangeError): not the font this expects.
    return font;
  }
}
