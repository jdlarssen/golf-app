export type ScoreTone = 'unset' | 'under' | 'par' | 'over1' | 'over2';

export function scoreTone(score: number | null, par: number): ScoreTone {
  if (score === null) return 'unset';
  if (score < par) return 'under';
  if (score === par) return 'par';
  if (score === par + 1) return 'over1';
  return 'over2';
}

export function deltaLabel(score: number | null, par: number): string {
  if (score === null) return '—';
  if (score === par) return 'E';
  const diff = score - par;
  return diff > 0 ? `+${diff}` : String(diff);
}
