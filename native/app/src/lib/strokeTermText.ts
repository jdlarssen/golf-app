// Ordene for et slag mot par (#2251), ett hjem i appen: skinna på hullsiden
// viser dem på knappene, og oppsummeringen etter hull 18 (#2299) bruker dem i
// hullteksten. Hvilket ord et slag får, er den delte `strokeTerm`.
import type { StrokeTerm } from '../../../../lib/scorecard/scoreRail';

export const TERM_LABELS: Record<Exclude<StrokeTerm, 'over'>, string> = {
  albatross: 'Albatross',
  eagle: 'Eagle',
  birdie: 'Birdie',
  par: 'Par',
  bogey: 'Bogey',
  doubleBogey: 'Dobbeltbogey',
  tripleBogey: 'Trippelbogey',
};

/**
 * Det knappene viser (designet, #2385): «Dobbel» og «Trippel» får plass i en
 * tredel av skjermen. Skjermleseren får hele ordet (`TERM_LABELS`).
 */
export const SHORT_LABELS: Partial<Record<StrokeTerm, string>> = {
  doubleBogey: 'Dobbel',
  tripleBogey: 'Trippel',
};

/**
 * Ordet for en score: «Birdie», eller bare diffen («+4») forbi trippelbogey
 * (`over`). Skinna på hullsiden og lagtavlas «Ditt lag på hull N» (#2579).
 */
export function termText(term: StrokeTerm, overPar: number): string {
  return term === 'over' ? `+${overPar}` : TERM_LABELS[term];
}
