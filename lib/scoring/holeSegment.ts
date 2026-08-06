// Hole-segment filtering for splittet cup-dag (#1441).
//
// A match can be scored over the FULL round, the front 9 (hole numbers
// 1-9), or the back 9 (hole numbers 10-18) instead of always 18 holes.
// Deliberately not a generic hull-range: courses in the app are always
// 18 holes, and the only real use case is a front/back split (design doc
// D1). `games.hole_segment` mirrors this exact union at the DB layer
// (migration 0151), constrained to the matchplay duel formats via
// `isMatchplayFamily` (lib/scoring/modes/types.ts).
//
// Matchplay computes (singlesMatchplay, fourballMatchplay,
// foursomesMatchplay + the greensome/chapman/gruesome variants that share
// its core) derive "number of holes in scope" from the `ctx.holes` array a
// caller passes in rather than a hardcoded 18 (design doc D2). This helper
// is what a caller uses to build that segment-filtered hole list before it
// reaches the scoring layer — 18 holes in → identical behavior to today,
// 9 holes in → "AS"/mat-em/"Nup" scale to the 9-hole scope.

export type HoleSegment = 'full' | 'front9' | 'back9';

/**
 * Filters a hole list down to the holes in `segment`. Pure and
 * order-preserving — it filters in the order holes were supplied, it does
 * not sort. Callers that need holes in play order sort separately (e.g.
 * the matchplay `compute()` functions already sort by `number` before use).
 *
 *  - 'full'    → every hole, unfiltered (still a fresh array — no mutation
 *                of the input, no aliasing).
 *  - 'front9'  → hole numbers 1-9.
 *  - 'back9'   → hole numbers 10-18.
 */
export function holesForSegment<H extends { number: number }>(
  holes: readonly H[],
  segment: HoleSegment,
): H[] {
  switch (segment) {
    case 'full':
      return [...holes];
    case 'front9':
      return holes.filter((h) => h.number >= 1 && h.number <= 9);
    case 'back9':
      return holes.filter((h) => h.number >= 10 && h.number <= 18);
  }
}
