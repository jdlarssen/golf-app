/**
 * Plusshandicap-konvertering.
 *
 * Golf: en «plusshandicap» (bedre enn scratch) vises i Golfbox som «+1,5», men
 * lagres internt som et NEGATIVT tall (−1,5) fordi lavere index = bedre i
 * slag-tildelingen. UI-en jobber med en positiv «magnitude» + et plus-flagg
 * (så spilleren slipper å taste fortegn på mobil); disse helperne oversetter
 * begge veier mellom UI og lagret verdi.
 */

/** UI (magnitude ≥ 0 + plus-flagg) → lagret signert verdi. */
export function toSignedHcp(magnitude: number, isPlus: boolean): number {
  // Unngå −0 for en «pluss 0»-edge (scratch er bare 0).
  if (magnitude === 0) return 0;
  return isPlus ? -magnitude : magnitude;
}

/** Lagret signert verdi → UI (magnitude + plus-flagg). */
export function fromSignedHcp(signed: number): {
  magnitude: number;
  isPlus: boolean;
} {
  return { magnitude: Math.abs(signed), isPlus: signed < 0 };
}

/**
 * Golfbox-stil visning for live «Lagres som …»-bekreftelsen: «+1,5» for
 * plusshandicap, «12,4» ellers. Norsk desimalkomma.
 */
export function formatGolfboxHcp(magnitude: number, isPlus: boolean): string {
  const nb = String(magnitude).replace('.', ',');
  return isPlus && magnitude !== 0 ? `+${nb}` : nb;
}
