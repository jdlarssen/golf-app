// native/app/src/lib/qrMatrix.ts
// #2627: QR-koden på bag-taggen og arket — matrisen og SVG-stien, uten tegning.
//
// **Ren JS, ingen native modul.** `qrcode` er samme pakke som webben bruker
// (TV-skjermen og plakaten). Metro velger pakkens `browser`-inngang, og
// `create` trenger verken canvas eller fil: den gir bare modulene. Tegningen er
// `react-native-svg`, som appen har fra før.
//
// **Nivå L.** Adressen er 45 tegn (`/venner/legg-til/<8 tegn>`), og med
// feilretting L får den plass i versjon 3 (29 × 29). Koden vises på en skjerm
// og blir aldri skitten, så de store modulene er mer verdt enn
// feilrettingen når den er 54 pt stor på taggen.
import { create } from 'qrcode';

/** Lyse moduler rundt koden, som standarden krever (4). */
export const QR_QUIET_ZONE = 4;

export interface QrMatrix {
  /** Moduler per side, uten stille sone. */
  size: number;
  /** `true` for en mørk modul; x er kolonnen og y er raden. */
  dark: (x: number, y: number) => boolean;
}

export function qrMatrix(text: string): QrMatrix {
  const { modules } = create(text, { errorCorrectionLevel: 'L' });
  return { size: modules.size, dark: (x, y) => modules.get(y, x) === 1 };
}

/**
 * Hele koden som én SVG-sti: ett kvadrat per mørk modul, `cell` per modul,
 * med origo i koden (den stille sonen legger tegneren rundt). Én `Path` fylles
 * som én flate, så kantene mellom nabomoduler får ingen glipper.
 */
export function qrPath(matrix: QrMatrix, cell: number): string {
  let d = '';
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      if (matrix.dark(x, y)) d += `M${x * cell} ${y * cell}h${cell}v${cell}H${x * cell}z`;
    }
  }
  return d;
}
