// Stableford-scoring per Tørny-spec: standard poeng-tabell etter netto-score.
//
// Standard-tabellen er den vanligste internasjonalt og brukes som default
// for solo-stableford. Modifikatorer (modified, stableford-quota etc) kan
// legges på som egne `points_table`-varianter senere.

export interface StablefordPointsInput {
  par: number;
  /** Netto strokes (gross minus extra strokes fra handicap-fordelingen). Null = hull ikke spilt. */
  netStrokes: number | null;
}

/**
 * Konverterer ett hull-resultat til stableford-poeng etter standard-tabellen:
 *   diff (netto − par)    poeng
 *   ≤ −3 (double eagle+)    5
 *   −2 (eagle)              4
 *   −1 (birdie)             3
 *    0 (par)                2
 *   +1 (bogey)              1
 *   ≥ +2 (double-bogey+)    0
 *
 * Null netStrokes (hull ikke spilt) returnerer 0 — samme behandling som
 * "pick up" eller blank på papir-scorekortet.
 */
export function computeStablefordPoints(input: StablefordPointsInput): number {
  if (input.netStrokes === null) return 0;
  const diff = input.netStrokes - input.par;
  if (diff <= -3) return 5;
  if (diff === -2) return 4;
  if (diff === -1) return 3;
  if (diff === 0) return 2;
  if (diff === 1) return 1;
  return 0;
}
