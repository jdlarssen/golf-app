import { isSoloFormat, type GameMode } from '@/lib/scoring/modes/types';
import type { ResultSummary } from '@/lib/scoring/resultSummary';
import { leagueFlightHasNoPlace } from '@/lib/games/finishedResultBadge';

/**
 * How you and a friend did against each other (#2381): the badge on each
 * shared round («Du foran», «Kari foran», «På lag», «Likt») and the «Mot
 * hverandre» record on the app's friend page.
 *
 * Read from the stored `game_players.result_summary` (#572), never recomputed.
 * Team members inherit their team's rank there, so two players on one team
 * look level without the team check, which therefore comes first.
 *
 * Pure and I/O-free (Type A). The read lives in `getSharedRounds.ts`.
 */

export type RoundBadge = 'you_ahead' | 'them_ahead' | 'same_team' | 'tied';

/** One player's row in a shared game. */
export type RoundSide = { teamNumber: number | null; summary: ResultSummary | null };

export type HeadToHeadRecord = {
  /** Rounds against each other: ahead either way, or level. */
  played: number;
  youAhead: number;
  themAhead: number;
  tied: number;
};

/** Lower is better; equal is level. */
function byRank(mine: number, theirs: number): RoundBadge {
  if (mine === theirs) return 'tied';
  return mine < theirs ? 'you_ahead' : 'them_ahead';
}

/**
 * The badge for one shared round, or `null` when the round says nothing about
 * the two of you against each other.
 *
 * - Same team: a team format (not `isSoloFormat`, so Wolf and Round Robin
 *   rotation slots never count) where both carry the same `team_number`. In
 *   matchplay fourball and foursomes the side is the team number.
 * - A league flight has no place (`leagueFlightHasNoPlace`, #2850).
 * - Placement and skins by rank; matchplay by outcome.
 * - A missing result on either side, or two shapes, gives `null`.
 */
export function roundBadge(input: {
  gameMode: GameMode;
  teamSize: number;
  leagueFlight: boolean;
  me: RoundSide;
  them: RoundSide;
}): RoundBadge | null {
  const { gameMode, teamSize, leagueFlight, me, them } = input;
  if (
    !isSoloFormat(gameMode, teamSize) &&
    me.teamNumber !== null &&
    me.teamNumber === them.teamNumber
  ) {
    return 'same_team';
  }
  if (leagueFlightHasNoPlace(leagueFlight)) return null;

  const a = me.summary;
  const b = them.summary;
  if (a === null || b === null) return null;
  if (a.kind === 'placement' && b.kind === 'placement') return byRank(a.rank, b.rank);
  if (a.kind === 'skins' && b.kind === 'skins') return byRank(a.rank, b.rank);
  if (a.kind === 'matchplay' && b.kind === 'matchplay') {
    if (a.outcome === 'win' && b.outcome === 'loss') return 'you_ahead';
    if (a.outcome === 'loss' && b.outcome === 'win') return 'them_ahead';
    if (a.outcome === 'tie' && b.outcome === 'tie') return 'tied';
    return null;
  }
  return null;
}

/**
 * The record over the badges. A level round counts as played but gives
 * neither of you the point; same-team and unplaced rounds are left out.
 */
export function headToHeadRecord(badges: readonly (RoundBadge | null)[]): HeadToHeadRecord {
  let youAhead = 0;
  let themAhead = 0;
  let tied = 0;
  for (const badge of badges) {
    if (badge === 'you_ahead') youAhead++;
    else if (badge === 'them_ahead') themAhead++;
    else if (badge === 'tied') tied++;
  }
  return { played: youAhead + themAhead + tied, youAhead, themAhead, tied };
}
