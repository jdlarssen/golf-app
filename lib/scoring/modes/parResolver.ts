import type { ScoringGender, ScoringHole } from './types';

/**
 * Velg riktig par-verdi for et hull basert på spillerens tee-gender.
 *
 * - Når `hole.parByGender` er satt: returnerer `parByGender[gender]`. Hvis
 *   `gender` er undefined, faller vi tilbake til `'mens'` (samme default
 *   som tee-rating-mønsteret på `tee_boxes`).
 * - Når `hole.parByGender` ikke er satt: returnerer `hole.par`. Holder
 *   eksisterende tester og fixtures som ikke bryr seg om per-kjønn-par
 *   grønne uten endring.
 *
 * #240.
 */
export function parFor(
  hole: ScoringHole,
  gender: ScoringGender | undefined,
): number {
  if (!hole.parByGender) return hole.par;
  return hole.parByGender[gender ?? 'mens'];
}
