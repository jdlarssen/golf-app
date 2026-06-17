/**
 * Strokes awarded on a single hole for a player with the given course handicap.
 * Negative handicaps return negative strokes (added to gross).
 */
export function strokesForHole(courseHandicap: number, strokeIndex: number): number {
  if (courseHandicap === 0) return 0;

  if (courseHandicap > 0) {
    const base = Math.floor(courseHandicap / 18);
    const extra = strokeIndex <= (courseHandicap % 18) ? 1 : 0;
    return base + extra;
  }

  // Plus golfer: give back strokes from highest SI down (mirrors positive branch).
  // e.g. -20 → base=1 on all 18, extra -1 on the 2 hardest (SI 17-18) = -20 total.
  const abs = Math.abs(courseHandicap);
  const base = Math.floor(abs / 18);
  const remainder = abs % 18;
  const extra = remainder > 0 && strokeIndex >= (18 - remainder + 1) ? 1 : 0;
  const strokes = base + extra;
  return strokes === 0 ? 0 : -strokes;
}

export function allStrokeAllocations(courseHandicap: number): Record<number, number> {
  const result: Record<number, number> = {};
  for (let si = 1; si <= 18; si++) {
    result[si] = strokesForHole(courseHandicap, si);
  }
  return result;
}
