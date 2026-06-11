/**
 * Format a list of hole numbers (1-18) into a compact, human-readable string.
 * Consecutive holes collapse into ranges with en-dash; non-consecutive holes
 * are joined with commas; the two patterns combine.
 *
 *   formatHolesList([10, 11, 12, 13, 14, 15, 16, 17, 18], 'hull') → "hull 10–18"
 *   formatHolesList([4, 7, 12], 'hull') → "hull 4, 7, 12"
 *   formatHolesList([1, 2, 3, 7, 10, 11, 15], 'hull') → "hull 1–3, 7, 10–11, 15"
 *   formatHolesList([], 'hull') → ""
 *
 * The `holePrefix` parameter is caller-supplied so the string is locale-agnostic.
 * Pass the translated word («hull» in Norwegian, «holes» in English) from the
 * call-site. The Norwegian default is provided for backward compatibility with
 * any existing callers that have not yet been migrated.
 *
 * Used inside the side-tournament per-team breakdown to summarize hole-wins.
 */
export function formatHolesList(holes: number[], holePrefix = 'hull'): string {
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

  return `${holePrefix} ${parts.join(', ')}`;
}
