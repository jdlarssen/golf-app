type FinishRosterRow = { submitted_at: string | null; withdrawn_at: string | null };

/**
 * Who the finish flow counts (#2284). Withdrawn players are out of the ranking
 * entirely: they are never missing a delivery and never a side-tournament
 * winner candidate.
 *
 * The web finish pages read this. The rule also stands in two places that
 * cannot import it: `endGameCore` skips withdrawn rows in its gate loop, and
 * the app's `buildFinishPlan` (native/app/src/lib/endGamePlan.ts) filters
 * `withdrawnAt === null`. The winner half is enforced by the database
 * (migration 0193_side_winner_must_be_active), so a stale list cannot save a
 * withdrawn winner either.
 *
 * Generic over the row so each page keeps its own columns (`users`,
 * `flight_number`, …) without mapping.
 */
export function finishRoster<T extends FinishRosterRow>(
  rows: readonly T[],
): { active: T[]; missing: T[] } {
  // Not withdrawn: the winner candidates.
  const active = rows.filter((row) => !row.withdrawn_at);
  // Active and not delivered: who the «mangler levering» notice lists.
  const missing = active.filter((row) => !row.submitted_at);
  return { active, missing };
}
