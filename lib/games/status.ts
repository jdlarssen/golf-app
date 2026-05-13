/**
 * Canonical game-lifecycle status types for Tørny.
 *
 * Status semantics:
 *  - 'draft'     Admin has created the game but not yet published it.
 *                Players cannot see or join a draft game.
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
  active: 'Pågående',
  finished: 'Avsluttet',
};
