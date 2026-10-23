// native/app/src/lib/qrMatrix.ts
// #2627: QR-koden på bag-taggen og arket — matrisen og SVG-stien, uten tegning.
//
// **Ren JS, ingen native modul.** `qrcode` er samme pakke som webben bruker
// (TV-skjermen og plakaten). Metro velger pakkens `browser`-inngang, og
// `create` trenger verken canvas eller fil: den gir bare modulene. Tegningen er
// `react-native-svg`, som appen har fra før.
//
// **Tørny-merket i midten** (eierens ønske 23.10, «litt som snapchat har det
// spøkelset i midten»). Et felt på 9 × 9 moduler midt i koden står blankt, og
// merket tegnes i det med én modul lys kant rundt (`QrCode.tsx`). Det som
// skjules der, henter dekoderen tilbake med feilrettingen:
//
// - **Nivå Q, minst versjon 5** (37 × 37). Venne-adressen er 45 tegn, og med Q
//   og versjon 5 får hver kode samme versjon, også en kode uten sifre. Feltet
//   dekker 81 av 1369 moduler (5,9 %), og blokken som mister mest, mister 4 av
//   9 kodeord den kan rette. Resten er margin for et kamera ute på banen.
//   Modulen er 54 / 45 = 1,2 pt på taggen.
// - **Feltet rører aldri funksjonsmønstrene** (finner, timing, justering,
//   format): det kontrolleres for hver kode. En lang adresse (en preview-deploy)
//   gir versjon 7 eller høyere, der et justeringsmønster står midt i koden. Da
//   tegnes koden uten merke. Butikkbyggets adresse er tornygolf.no.
import { create } from 'qrcode';

/** Lyse moduler rundt koden, som standarden krever (4). */
export const QR_QUIET_ZONE = 4;
/** Minste versjon: gir alle venne-adresser på tornygolf.no samme størrelse. */
const MIN_VERSION = 5;
/** Feltet til merket, moduler per side, med én modul luft rundt merket. */
const LOGO_SPAN = 9;

export interface QrMatrix {
  /** Moduler per side, uten stille sone. */
  size: number;
  /** `true` for en mørk modul; x er kolonnen og y er raden. Alltid `false` i merkefeltet. */
  dark: (x: number, y: number) => boolean;
  /** Merkefeltet: første modul (rad og kolonne) og antall per side, eller `null` uten merke. */
  logo: { start: number; span: number } | null;
}

export function qrMatrix(text: string): QrMatrix {
  const auto = create(text, { errorCorrectionLevel: 'Q' });
  const { modules } =
    auto.version < MIN_VERSION ? create(text, { errorCorrectionLevel: 'Q', version: MIN_VERSION }) : auto;
  const size = modules.size;
  const start = (size - LOGO_SPAN) / 2;
  const logo = fieldIsFree(start) ? { start, span: LOGO_SPAN } : null;
  const inLogo = (x: number, y: number) =>
    logo !== null && x >= start && y >= start && x < start + LOGO_SPAN && y < start + LOGO_SPAN;
  return { size, dark: (x, y) => !inLogo(x, y) && modules.get(y, x) === 1, logo };

  function fieldIsFree(from: number): boolean {
    for (let y = from; y < from + LOGO_SPAN; y++) {
      for (let x = from; x < from + LOGO_SPAN; x++) if (modules.isReserved(y, x)) return false;
    }
    return true;
  }
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
