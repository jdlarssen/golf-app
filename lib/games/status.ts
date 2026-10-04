/**
 * Canonical game-lifecycle status types for Tørny.
 *
 * Status semantics:
 *  - 'draft'     The organiser has created the game but not yet published it.
 *                Only the organiser and global admins see it, also when other
 *                players are on its list (#2445): RLS for the logged-in client
 *                (migration 0202_hidden_drafts), and a `status === 'draft'`
 *                check on every service-client door players reach.
 *  - 'scheduled' Game is published and visible to invited players,
 *                but the round has not started yet (tee-off is in the future).
 *  - 'active'    The round is in progress. Players can enter scores.
 *  - 'finished'  Admin has ended the game. Leaderboard is public and
 *                no further score changes are accepted.
 */
export type GameStatus = 'draft' | 'scheduled' | 'active' | 'finished';

/**
 * Norwegian display labels for each game status, suitable for UI badges
 * and status chips throughout the app.
 */
export const STATUS_LABELS: Record<GameStatus, string> = {
  draft: 'Utkast',
  scheduled: 'Planlagt',
  active: 'Pågår',
  finished: 'Avsluttet',
};

/**
 * Is the roster closed to invitations? True once the round has started
 * (`active`) or ended (`finished`). Invitations — and resending one — only
 * apply before start (#182, #2212): the invite doors refuse with
 * `game_locked`, and a pending invitation redeemed at login after the start
 * gives no roster spot.
 */
export function isRosterLocked(status: string): boolean {
  return status === 'active' || status === 'finished';
}
