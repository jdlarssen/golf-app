export type ScoreShape =
  | 'none'
  | 'circle'
  | 'double-circle'
  | 'triple-circle'
  | 'square'
  | 'double-square'
  | 'triple-square'
  | 'quadruple-square';

export function scoreShape(score: number | null, par: number): ScoreShape {
  if (score === null) return 'none';
  const diff = score - par;
  if (diff <= -3) return 'triple-circle';
  if (diff === -2) return 'double-circle';
  if (diff === -1) return 'circle';
  if (diff === 0) return 'none';
  if (diff === 1) return 'square';
  if (diff === 2) return 'double-square';
  if (diff === 3) return 'triple-square';
  return 'quadruple-square';
}
