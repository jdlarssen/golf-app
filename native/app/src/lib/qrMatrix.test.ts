// #2627: QR-matrisen bak koden på bag-taggen og arket. Type A.
//
// Det som må bevises, er at koden kan leses, ikke bare at den tegnes: matrisen
// males til en pikselbuffer slik appen tegner den, med Tørny-merket i midten
// (feltet blanket, merkets flate mørk), og en ekte dekoder (`jsqr`) skal lese
// nøyaktig samme adresse tilbake. Begge størrelsene: taggen (krem flate på
// 54 pt, skog utenfor, avrundede hjørner som klipper flaten) og arket (hvit
// flate på 240 pt), i pikslene en iPhone @3x tegner.
import jsQR from 'jsqr';
import { create } from 'qrcode';
import { QR_QUIET_ZONE, qrMatrix, qrPath, type QrMatrix } from './qrMatrix';

// Koden er 8 tegn fra `^[0-9a-z]{8}$` (0077), så adressen er 45 tegn.
const URL = 'https://tornygolf.no/venner/legg-til/abcd1234';
// Bare bokstaver: ingen sifre å pakke tettere, så den tyngste koden.
const LETTERS_URL = 'https://tornygolf.no/venner/legg-til/abcdefgh';

type RGB = readonly [number, number, number];
const CREAM: RGB = [236, 229, 210]; // onStrongWarm
const FOREST: RGB = [27, 67, 50]; // surfaceStrong (lys)
const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];

interface Paint {
  /** Flatens side i enhetspiksler (pt × 3). */
  flatPx: number;
  radiusPx: number;
  paper: RGB;
  ink: RGB;
  /** Fargen utenfor flaten, og bredden i piksler. */
  outside: RGB;
  framePx: number;
}

const TAG: Paint = { flatPx: 54 * 3, radiusPx: 10 * 3, paper: CREAM, ink: FOREST, outside: FOREST, framePx: 30 };
const SHEET: Paint = { flatPx: 240 * 3, radiusPx: 16 * 3, paper: WHITE, ink: BLACK, outside: WHITE, framePx: 30 };

/**
 * Koden som piksler, slik `QrCode` tegner den: stille sone innenfor flaten,
 * merkefeltet blankt, og merkets flate (skog) i feltet med én modul luft rundt.
 */
function paint(matrix: QrMatrix, p: Paint) {
  const modules = matrix.size + QR_QUIET_ZONE * 2;
  const cell = p.flatPx / modules;
  const side = p.flatPx + p.framePx * 2;
  const data = new Uint8ClampedArray(side * side * 4);
  for (let py = 0; py < side; py++) {
    for (let px = 0; px < side; px++) {
      const fx = px - p.framePx;
      const fy = py - p.framePx;
      let color: RGB = p.outside;
      if (fx >= 0 && fy >= 0 && fx < p.flatPx && fy < p.flatPx && insideRounded(fx, fy, p.flatPx, p.radiusPx)) {
        const mx = Math.floor(fx / cell) - QR_QUIET_ZONE;
        const my = Math.floor(fy / cell) - QR_QUIET_ZONE;
        color = p.paper;
        if (inMark(matrix, mx, my)) color = FOREST;
        else if (mx >= 0 && my >= 0 && mx < matrix.size && my < matrix.size && matrix.dark(mx, my)) color = p.ink;
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

/** Merkets flate, der `matrix.mark` sier (samme sted som `QrCode` tegner det). */
function inMark({ mark }: QrMatrix, x: number, y: number): boolean {
  if (!mark) return false;
  return x >= mark.at && y >= mark.at && x < mark.at + mark.size && y < mark.at + mark.size;
}

function insideRounded(x: number, y: number, size: number, r: number): boolean {
  const cx = x < r ? r : x > size - r ? size - r : x;
  const cy = y < r ? r : y > size - r ? size - r : y;
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function decode(matrix: QrMatrix, p: Paint): string | undefined {
  const { data, side } = paint(matrix, p);
  return jsQR(data, side, side)?.data;
}

describe('qrMatrix', () => {
  it('gir versjon 5 (37 × 37) med nivå Q for alle venne-adresser, også den tyngste', () => {
    expect(URL).toHaveLength(45);
    expect(qrMatrix(URL).size).toBe(37);
    expect(qrMatrix(LETTERS_URL).size).toBe(37);
  });

  it('blanker et felt på 9 × 9 i midten for merket, uten å røre mønstrene', () => {
    const matrix = qrMatrix(URL);
    expect(matrix.logo).toEqual({ start: 14, span: 9 });
    // Merket ligger på hele moduler i feltet, med én modul luft på hver side.
    expect(matrix.mark).toEqual({ at: 15, size: 7 });

    // Ingen funksjonsmodul (finner, timing, justering, format) i feltet.
    const { modules } = create(URL, { errorCorrectionLevel: 'Q', version: 5 });
    for (let y = 14; y < 23; y++) {
      for (let x = 14; x < 23; x++) {
        expect(modules.isReserved(y, x)).toBeFalsy();
        expect(matrix.dark(x, y)).toBe(false);
      }
    }
    // Utenfor feltet er modulene urørt.
    expect(matrix.dark(0, 0)).toBe(true);
    expect(matrix.dark(13, 13)).toBe(modules.get(13, 13) === 1);
  });

  it.each([
    ['taggen', TAG],
    ['arket', SHEET],
  ])('kan leses tilbake av en dekoder på %s, med merket i midten', (_, p) => {
    expect(decode(qrMatrix(URL), p)).toBe(URL);
    expect(decode(qrMatrix(LETTERS_URL), p)).toBe(LETTERS_URL);
  });

  it('dropper merket når midten er et justeringsmønster (lang adresse), og koden leses likevel', () => {
    const long = 'https://golf-app-git-claude-2627-qr-kode-pa-0e58b7-jdlarssen-prosjekter.vercel.app/venner/legg-til/abcd1234';
    const matrix = qrMatrix(long);
    expect(matrix.size).toBeGreaterThanOrEqual(45);
    expect(matrix.logo).toBeNull();
    expect(matrix.mark).toBeNull();
    expect(decode(matrix, SHEET)).toBe(long);
  });
});

describe('qrPath', () => {
  it('tegner ett kvadrat per mørk modul, og ingenting i merkefeltet', () => {
    const matrix = qrMatrix(URL);

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
