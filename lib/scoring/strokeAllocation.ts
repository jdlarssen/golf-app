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

  // Plus golfer: hand back strokes from highest SI down.
  const abs = Math.abs(courseHandicap);
  const threshold = 18 - abs + 1;
  return strokeIndex >= threshold ? -1 : 0;
}

export function allStrokeAllocations(courseHandicap: number): Record<number, number> {
  const result: Record<number, number> = {};
  for (let si = 1; si <= 18; si++) {
    result[si] = strokesForHole(courseHandicap, si);
  }
  return result;
}
