export type ScoreShape =
  | 'none'
  | 'circle'
  | 'double-circle'
  | 'square'
  | 'double-square';

export function scoreShape(score: number | null, par: number): ScoreShape {
  if (score === null) return 'none';
  const diff = score - par;
  if (diff <= -2) return 'double-circle';
  if (diff === -1) return 'circle';
  if (diff === 0) return 'none';
  if (diff === 1) return 'square';
  return 'double-square';
}
