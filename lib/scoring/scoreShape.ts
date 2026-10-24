export type ScoreShape =
  | 'none'
  | 'circle'
  | 'double-circle'
  | 'square'
  | 'double-square';

/**
 * The shape a score gets against par: one circle for a birdie, two for an
 * eagle or better, one square for a bogey and two for a double bogey or worse.
 * Never more than two (#2635, the owner: «Maks to»).
 */
export function scoreShape(score: number | null, par: number): ScoreShape {
  if (score === null) return 'none';
  const diff = score - par;
  if (diff <= -2) return 'double-circle';
  if (diff === -1) return 'circle';
  if (diff === 0) return 'none';
  if (diff === 1) return 'square';
  return 'double-square';
}
