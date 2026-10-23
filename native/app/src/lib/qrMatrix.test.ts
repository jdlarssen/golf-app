// #2627: QR-matrisen bak koden på bag-taggen og arket. Type A.
//
// Det som må bevises, er at koden kan leses, ikke bare at den tegnes: matrisen
// males til en pikselbuffer slik taggen tegner den (krem flate med 4 modulers
// stille sone, skog utenfor flaten, avrundede hjørner som klipper flaten), og
// en ekte dekoder (`jsqr`) skal lese nøyaktig samme adresse tilbake.
import jsQR from 'jsqr';
import { QR_QUIET_ZONE, qrMatrix, qrPath, type QrMatrix } from './qrMatrix';

// Koden er 8 tegn fra `^[0-9a-z]{8}$` (0077), så adressen er 45 tegn.
const URL = 'https://tornygolf.no/venner/legg-til/abcd1234';

const CREAM = [236, 229, 210] as const; // onStrongWarm
const FOREST = [27, 67, 50] as const; // surfaceStrong (lys)

/**
 * Taggens flate som piksler: `scale` px per modul, stille sone innenfor flaten,
 * `frame` moduler skog rundt, og hjørnene klippet med taggens radius (10 pt på
 * en flate på 54 pt).
 */
function paintTag(matrix: QrMatrix, { scale = 4, frame = 6, radiusPt = 10, flatPt = 54 } = {}) {
  const flat = (matrix.size + QR_QUIET_ZONE * 2) * scale;
  const side = flat + frame * scale * 2;
  const radius = (radiusPt / flatPt) * flat;
  const data = new Uint8ClampedArray(side * side * 4);
  for (let py = 0; py < side; py++) {
    for (let px = 0; px < side; px++) {
      const fx = px - frame * scale;
      const fy = py - frame * scale;
      let color: readonly number[] = FOREST;
      if (fx >= 0 && fy >= 0 && fx < flat && fy < flat && insideRounded(fx, fy, flat, radius)) {
        const mx = Math.floor(fx / scale) - QR_QUIET_ZONE;
        const my = Math.floor(fy / scale) - QR_QUIET_ZONE;
        const inCode = mx >= 0 && my >= 0 && mx < matrix.size && my < matrix.size;
        color = inCode && matrix.dark(mx, my) ? FOREST : CREAM;
      }
      const i = (py * side + px) * 4;
      data[i] = color[0];
      data[i + 1] = color[1];
      data[i + 2] = color[2];
      data[i + 3] = 255;
    }
  }
  return { data, side };
}

function insideRounded(x: number, y: number, size: number, r: number): boolean {
  const cx = x < r ? r : x > size - r ? size - r : x;
  const cy = y < r ? r : y > size - r ? size - r : y;
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

describe('qrMatrix', () => {
  it('gir versjon 3 (29 × 29) for venne-adressen', () => {
    expect(URL).toHaveLength(45);
    expect(qrMatrix(URL).size).toBe(29);
  });

  it('kan leses tilbake av en dekoder, også med skog rundt og klippede hjørner', () => {
    const { data, side } = paintTag(qrMatrix(URL));
    expect(jsQR(data, side, side)?.data).toBe(URL);
  });
});

describe('qrPath', () => {
  it('tegner ett kvadrat per mørk modul', () => {
    const matrix = qrMatrix('abcd1234');
    expect(matrix.size).toBe(21);

    let dark = 0;
    for (let y = 0; y < matrix.size; y++) {
      for (let x = 0; x < matrix.size; x++) if (matrix.dark(x, y)) dark += 1;
    }
    const d = qrPath(matrix, 2);
    expect(d.match(/h/g)).toHaveLength(dark);
    expect(d.match(/M/g)).toHaveLength(dark);
    // Første modul er øverst til venstre i finner-mønsteret, i cellens skala.
    expect(d.startsWith('M0 0h2v2H0z')).toBe(true);
  });
});
