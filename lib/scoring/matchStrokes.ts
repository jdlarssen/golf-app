// The strokes one player spreads over SI in the match play formats with one
// ball per player: singles, four-ball and Round Robin — the one home of the
// rule (AGENTS.md trap 4). The engines, the hole page, the scorecard and the
// app all read it (the views via `matchStrokeHandicap` in
// `lib/scoring/allocatedStrokes.ts`).
//
// NGF vedlegg C s. 76: the player with the lowest playing handicap plays off
// zero, and the others get the difference. NGF s. 8 (changes 2024): in team
// matches the percentage goes on the difference, not on each player.

import { roundHalfUp } from './courseHandicap';
import type { GameModeConfig } from './modes/types';

/**
 * True when the match gives the strokes from the difference to the lowest
 * (`match_strokes: 'difference'`). Stamped on NEW singles (owner-ordered audit
 * 2026-11-20), four-ball and Round Robin matches (#2997) at creation, never
 * added to an existing game: a match created before keeps each player's own
 * strokes, so a finished match is never recalculated.
 */
export function usesMatchDifference(config: GameModeConfig): boolean {
  return (
    (config.kind === 'singles_matchplay' ||
      config.kind === 'fourball_matchplay' ||
      config.kind === 'round_robin') &&
    config.match_strokes === 'difference'
  );
}

/**
 * The handicap the player spreads over SI.
 *
 * - With the flag: `round((basis − lowest) × pct / 100)`. The lowest gets 0.
 *   C/2 example 2 at 90 %: 10, 18, 27 and 39 give 0, 7, 15 and 26. A plus
 *   handicap gives no strokes back: it is the lowest and plays off 0.
 * - Without the flag (a match created before): the player's own share,
 *   `round(basis × pct / 100)`.
 *
 * `basis` and `lowestInMatch` are what the format takes its percentage of: the
 * unrounded course handicap in four-ball and Round Robin when the start froze
 * it (`strokeBasis`, F16), the frozen playing handicap in singles (at 100 %).
 * `lowestInMatch` is the lowest of every player in the match, the player's
 * own included. One rounding, 0.5 up (`roundHalfUp`).
 */
export function matchDifferenceStrokes(
  config: GameModeConfig,
  basis: number,
  lowestInMatch: number,
  allowancePct: number,
): number {
  const handicap = usesMatchDifference(config)
    ? basis - Math.min(basis, lowestInMatch)
    : basis;
  return roundHalfUp((handicap * allowancePct) / 100);
}
