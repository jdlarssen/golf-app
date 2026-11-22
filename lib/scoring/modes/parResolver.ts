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

/**
 * A tee value read from a row (`game_players.tee_gender`, the app bundle's
 * string) as a `ScoringGender`, or `undefined` when it is none of the three —
 * `parFor` then uses men's par. Lets every call site resolve a player's own
 * par through `parFor` (audit 2026-11-20).
 */
export function asScoringGender(tee: string | null | undefined): ScoringGender | undefined {
  return tee === 'mens' || tee === 'ladies' || tee === 'juniors' ? tee : undefined;
}
