/**
 * maxHolesPlayed — game-wide holes-played count for leaderboard subtitles (#638).
 * The furthest-along player's number of scored holes. Used to render «Etter X
 * hull» instead of a hardcoded 18 when a round is ended early.
 */
export function maxHolesPlayed(
  rows: { user_id: string; hole_number: number; strokes: number | null }[],
): number {
  const byUser = new Map<string, number>();
  for (const r of rows) {
    if (r.strokes != null) byUser.set(r.user_id, (byUser.get(r.user_id) ?? 0) + 1);
  }
  return byUser.size ? Math.max(...byUser.values()) : 0;
}
