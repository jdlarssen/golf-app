/**
 * The line under «Hvem skal spille?» on step 4 (#2321): «Best ball · 4
 * spillere, 2 lag à 2». This returns what to say; the wizard translates it.
 *
 * The lineup comes from `formatLineup` (#2260), read for the target count:
 *  - two sides in the matchplay family → «1 mot 1» / «2 mot 2»
 *  - two sides elsewhere (best ball with four) → «2 lag à 2», as the artboard
 *  - teams → «4 lag à 2»; a choice of team sizes is settled by the chosen size
 *    when it divides the count, else only the count is shown
 *  - Wolf → «1 mot 3»; solo and pot formats → only the count
 * A target the format does not fit shows only the count. No target → only the
 * format name.
 */

import type { GameMode } from '@/lib/scoring/modes/types';
import { isMatchplayMode } from '@/lib/games/matchplaySides';
import { fitsPlayerCount } from '@/lib/wizard/fitsPlayerCount';
import { formatLineup } from '@/lib/wizard/formatLineup';

export type PickerLineup =
  | { kind: 'versus'; perSide: number }
  | { kind: 'teams'; teams: number; size: number }
  | { kind: 'wolf'; opponents: number };

export type PickerSubtitle =
  | { kind: 'formatOnly' }
  | { kind: 'players'; players: number }
  | { kind: 'lineup'; players: number; lineup: PickerLineup };

export function pickerSubtitle({
  gameMode,
  target,
  teamSize,
}: {
  gameMode: GameMode;
  target: number | null;
  teamSize: number;
}): PickerSubtitle {
  if (target === null) return { kind: 'formatOnly' };
  const players = target;
  if (!fitsPlayerCount(gameMode, target)) return { kind: 'players', players };

  const lineup = formatLineup(gameMode, target);
  switch (lineup.kind) {
    case 'sides':
      return isMatchplayMode(gameMode)
        ? { kind: 'lineup', players, lineup: { kind: 'versus', perSide: lineup.perSide } }
        : { kind: 'lineup', players, lineup: { kind: 'teams', teams: 2, size: lineup.perSide } };
    case 'teams':
      return { kind: 'lineup', players, lineup: { kind: 'teams', teams: lineup.teams, size: lineup.size } };
    case 'teamSizes':
      return lineup.sizes.includes(teamSize)
        ? { kind: 'lineup', players, lineup: { kind: 'teams', teams: target / teamSize, size: teamSize } }
        : { kind: 'players', players };
    case 'wolf':
      return { kind: 'lineup', players, lineup: { kind: 'wolf', opponents: lineup.opponents } };
    case 'pot':
    case 'solo':
      return { kind: 'players', players };
  }
}
