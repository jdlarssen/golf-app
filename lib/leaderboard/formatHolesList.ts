/**
 * Format a list of hole numbers (1-18) into a compact, human-readable Norwegian
 * string. Consecutive holes collapse into ranges with en-dash; non-consecutive
 * holes are joined with commas; the two patterns combine.
 *
 *   formatHolesList([10, 11, 12, 13, 14, 15, 16, 17, 18]) → "hull 10–18"
 *   formatHolesList([4, 7, 12]) → "hull 4, 7, 12"
 *   formatHolesList([1, 2, 3, 7, 10, 11, 15]) → "hull 1–3, 7, 10–11, 15"
 *   formatHolesList([]) → ""
 *
 * Used inside the side-tournament per-team breakdown to summarize hole-wins.
 */
export function formatHolesList(holes: number[]): string {
  if (holes.length === 0) return '';

  // De-dupe and sort ascending
  const sorted = Array.from(new Set(holes)).sort((a, b) => a - b);

  // Group consecutive runs
  const runs: Array<[number, number]> = [];
  let runStart = sorted[0]!;
  let runEnd = sorted[0]!;
  for (let i = 1; i < sorted.length; i++) {
    const h = sorted[i]!;
    if (h === runEnd + 1) {
      runEnd = h;
    } else {
      runs.push([runStart, runEnd]);
      runStart = h;
      runEnd = h;
    }
  }
  runs.push([runStart, runEnd]);

  const parts = runs.map(([from, to]) =>
    from === to ? `${from}` : `${from}–${to}`,
  );

  return `hull ${parts.join(', ')}`;
}
