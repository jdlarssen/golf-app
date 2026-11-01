import { supportsWithdrawal, type GameMode } from '../scoring/modes/types';

/**
 * When a player's withdrawal from a game is the soft kind, which they can also
 * undo (#386): while the game is active, in a format that knows withdrawals. One
 * home for the rule, so the server's answer and the button on the web and in the
 * app cannot disagree. A button shown outside it can only end in `game_locked`.
 *
 * Pure, and imported by the native app by relative path.
 */
export function softWithdrawOpen(game: { status: string; gameMode: string }): boolean {
  return game.status === 'active' && supportsWithdrawal(game.gameMode as GameMode);
}
