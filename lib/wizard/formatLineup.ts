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
 *     otherwise teams. Teams one short (#2569) are their own line-up: Florida
 *     with 11 is «2 lag à 4 og ett à 3» (`scrambleTeamsLineup`).
 *  4. Wolf is one against the rest, Skins is a pot, everything else is
 *     everyone on their own.
 *
 * Callers pass a count the format fits (`fitsPlayerCount`). Pure logic, no UI
 * dependencies — the native app can read it later.
 */

import type { GameMode } from '@/lib/scoring/modes/types';
import { isMatchplayMode } from '@/lib/games/matchplaySides';
import {
  allowedTeamSizes,
  splitIntoTeams,
  teamSizesThatFit,
} from '@/lib/games/teamFormatLimits';

export type FormatLineup =
  | { kind: 'sides'; perSide: number }
  | { kind: 'teams'; teams: number; size: number }
  /** #2569: `full` teams of `size` and `short` teams of `size − 1`. */
  | { kind: 'unevenTeams'; full: number; size: number; short: number }
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
    return scrambleTeamsLineup(mode, count, sizes[0]);
  }

  if (mode === 'wolf') return { kind: 'wolf', opponents: count - 1 };
  if (mode === 'skins') return { kind: 'pot', players: count };
  return { kind: 'solo', players: count };
}

/**
 * How `count` players line up at one scramble team size (#2569): teams one
 * short where the count does not divide (`splitIntoTeams`), else two sides or
 * teams. The format cards and the step 4 subtitle both read it. Callers pass
 * a size that fits the count.
 */
export function scrambleTeamsLineup(mode: GameMode, count: number, size: number): FormatLineup {
  const split = splitIntoTeams(count, size, allowedTeamSizes(mode, size)) ?? [];
  const short = split.filter((teamSize) => teamSize < size).length;
  if (short > 0) return { kind: 'unevenTeams', full: split.length - short, size, short };
  return split.length === 2
    ? { kind: 'sides', perSide: size }
    : { kind: 'teams', teams: split.length, size };
}

/** The keys under `wizard.formatGrid.lineup` the line-up text reads. */
export type LineupTextKey =
  | 'sides'
  | 'teams'
  | 'unevenTeams'
  | 'teamSizesTwo'
  | 'teamSizesRange'
  | 'wolf'
  | 'players';

/** A translator scoped to `wizard.formatGrid.lineup`. */
export type LineupTranslator = (key: LineupTextKey, values: Record<string, number>) => string;

/**
 * The line-up as text: «2 mot 2», «3 lag à 2», «2 eller 4 per lag». The
 * wizard reads it through `useLineupText`; the format helper on /spillformater
 * (#2328) calls it on the server, so the two always say the same.
 */
export function formatLineupText(t: LineupTranslator, lineup: FormatLineup): string {
  switch (lineup.kind) {
    case 'sides':
      return t('sides', { count: lineup.perSide });
    case 'teams':
      return t('teams', { teams: lineup.teams, size: lineup.size });
    case 'unevenTeams':
      return t('unevenTeams', {
        full: lineup.full,
        size: lineup.size,
        short: lineup.short,
        shortSize: lineup.size - 1,
      });
    case 'teamSizes':
      if (lineup.sizes.length === 2) {
        return t('teamSizesTwo', { first: lineup.sizes[0], second: lineup.sizes[1] });
      }
      return t('teamSizesRange', {
        min: Math.min(...lineup.sizes),
        max: Math.max(...lineup.sizes),
      });
    case 'wolf':
      return t('wolf', { opponents: lineup.opponents });
    case 'pot':
    case 'solo':
      return t('players', { count: lineup.players });
  }
}
