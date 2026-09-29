/**
 * The season's handicap curve on the bag-tag (#2256): the points to draw and
 * the change since the season began («−2,6 denne sesongen»).
 *
 * The history comes from `handicap_history` (migration 0195), one row each
 * time the handicap changed. The season starts from the last value before the
 * year began, when there is one; otherwise from the first value this year.
 * With fewer than two points there is no curve, and the bag-tag keeps saying
 * when the handicap was last updated.
 *
 * The year is the caller's local year, like the rest of the bag-tag (Hermes
 * has no time zones; see `native/app/src/lib/roundHistory.ts`). Stored values
 * are signed (a plus handicap is negative), so the change is the plain
 * difference: going down is getting better, also across zero.
 *
 * Pure and I/O-free (Type A).
 */

export type HandicapHistoryPoint = {
  hcpIndex: number;
  /** ISO timestamp. */
  recordedAt: string;
};

export type HandicapTrend = {
  /** Oldest first: the value the season started from, then each change. */
  points: number[];
  /** Last point minus first, rounded to one decimal. */
  change: number;
};

export function seasonHandicapTrend(
  history: readonly HandicapHistoryPoint[],
  year: number,
): HandicapTrend | null {
  const dated = history
    .map((p) => ({ value: p.hcpIndex, at: new Date(p.recordedAt) }))
    .filter((p) => Number.isFinite(p.value) && !Number.isNaN(p.at.getTime()))
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  const before = dated.filter((p) => p.at.getFullYear() < year);
  const season = dated.filter((p) => p.at.getFullYear() === year);
  const start = before.length > 0 ? [before[before.length - 1]] : [];
  const points = [...start, ...season].map((p) => p.value);
  if (points.length < 2) return null;

  const change = Math.round((points[points.length - 1] - points[0]) * 10) / 10;
  // -0 reads as «−0,0»; a season that ends where it began is plain 0.
  return { points, change: change === 0 ? 0 : change };
}
