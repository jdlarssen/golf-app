/**
 * formatLineup — how n players line up in a format, for the dot figure and the
 * «2 mot 2» line on the wizard's format cards (#2260).
 *
 * The rules apply in order:
 *  1. The matchplay family meets as two sides: one each in singles, else two.
 *  2. Best ball and patsome play in pairs: one pair is a team, two pairs meet
 *     as sides, three or more are teams.
 *  3. The scramble family reads `teamSizesThatFit`: more than one size is a
 *     choice («2 eller 4 per lag»), one size with two teams is two sides,
 *     otherwise teams.
 *  4. Wolf is one against the rest, Skins is a pot, everything else is
 *     everyone on their own.
 *
 * Callers pass a count the format fits (`fitsPlayerCount`). Pure logic, no UI
 * dependencies — the native app can read it later.
 */

import type { GameMode } from '@/lib/scoring/modes/types';
import { isMatchplayMode } from '@/lib/games/matchplaySides';
import { teamSizesThatFit } from '@/lib/games/teamFormatLimits';

export type FormatLineup =
  | { kind: 'sides'; perSide: number }
  | { kind: 'teams'; teams: number; size: number }
  | { kind: 'teamSizes'; sizes: number[] }
  | { kind: 'wolf'; opponents: number }
  | { kind: 'pot'; players: number }
  | { kind: 'solo'; players: number };

export function formatLineup(mode: GameMode, count: number): FormatLineup {
  if (isMatchplayMode(mode)) {
    return { kind: 'sides', perSide: mode === 'singles_matchplay' ? 1 : 2 };
  }

  if (mode === 'best_ball' || mode === 'patsome') {
    const teams = Math.floor(count / 2);
    return teams === 2 ? { kind: 'sides', perSide: 2 } : { kind: 'teams', teams, size: 2 };
  }

  if (
    mode === 'texas_scramble' ||
    mode === 'ambrose' ||
    mode === 'florida_scramble' ||
    mode === 'shamble'
  ) {
    const sizes = teamSizesThatFit(mode, count);
    if (sizes.length !== 1) return { kind: 'teamSizes', sizes };
    const [size] = sizes;
    const teams = count / size;
    return teams === 2 ? { kind: 'sides', perSide: size } : { kind: 'teams', teams, size };
  }

  if (mode === 'wolf') return { kind: 'wolf', opponents: count - 1 };
  if (mode === 'skins') return { kind: 'pot', players: count };
  return { kind: 'solo', players: count };
}
