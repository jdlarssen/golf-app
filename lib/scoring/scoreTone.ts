export type ScoreTone = 'unset' | 'under' | 'par' | 'over1' | 'over2';

export function scoreTone(score: number | null, par: number): ScoreTone {
  if (score === null) return 'unset';
  if (score < par) return 'under';
  if (score === par) return 'par';
  if (score === par + 1) return 'over1';
  return 'over2';
}

/**
 * A to-par difference as the label the leaderboard tables, the hole drilldown
 * and the CSV export show: `null` (nothing to compare) → «—», 0 → «E», over
 * par → «+3», under par → «-2» with a hyphen-minus. The live board, podium and
 * share card use U+2212 instead (`lib/leaderboard/vsPar.ts`).
 */
export function formatVsPar(diff: number | null): string {
  if (diff === null) return '—';
  if (diff === 0) return 'E';
  return diff > 0 ? `+${diff}` : String(diff);
}
