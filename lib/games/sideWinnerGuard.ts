// Import-pure on purpose (no imports, no 'server-only'): the app imports this
// file relatively (native/app/src/data/endGame.ts), like lib/supabase/affectedRows.

/**
 * The message migration 0193 raises when a side-tournament winner is withdrawn
 * or not a player in the game (#2284). The trigger
 * `game_side_winners_active_winner_guard` is the rule; this token is how both
 * clients recognise it.
 */
export const SIDE_WINNER_NOT_ACTIVE = 'side_winner_not_active';

/**
 * Did the winner write fail because a winner is no longer an active player?
 * Matches the trigger's exact shape, P0001 plus the token, so another raise or
 * an RLS denial (42501) keeps its own error path.
 */
export function isSideWinnerNotActive(
  err: { code?: string; message?: string } | null | undefined,
): boolean {
  return err?.code === 'P0001' && err.message === SIDE_WINNER_NOT_ACTIVE;
}
