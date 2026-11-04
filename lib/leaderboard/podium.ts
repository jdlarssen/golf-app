// The top of a finished board (#2756): who stands where, and with which number.
//
// Pure code like `resultBoard.ts`: no React, no translations. The app's result
// sentence and medals read it. The number comes from the same field as the
// format's own row, never from `buildShareCardData`, whose card counts against
// par: the sentence would say −10 over a row saying 62 netto. No sorting here:
// the rows stand in the engine's order.

import { isLeagueFieldAlone } from '@/lib/games/finishedResultBadge';
import { boardUnit } from '@/lib/leaderboard/liveBoard';
import { soloResultBoard, teamResultBoard } from '@/lib/leaderboard/resultBoard';
import { teamDisplayUnit } from '@/lib/leaderboard/teamLiveBoard';
import type { ModeResult } from '@/lib/scoring/modes/types';

export type PodiumPlace = 1 | 2 | 3;

export type PodiumTier = 'champagne' | 'silver' | 'bronze';

/**
 * Narrows the wide `rank: number` to the medallion's 1|2|3. On a top three the
 * rank is always ≤ 3 at runtime (rank = first tied index + 1), so the clamp
 * down to 3 is purely defensive.
 */
export function podiumPlace(rank: number): PodiumPlace {
  if (rank <= 1) return 1;
  if (rank === 2) return 2;
  return 3;
}

/** The medal's tier follows the actual place (a shared rank gives the same tier). */
export const PLACE_TIER: Record<PodiumPlace, PodiumTier> = {
  1: 'champagne',
  2: 'silver',
  3: 'bronze',
};

/**
 * The medal on a finished board's row: silver and bronze from the place. First
 * place keeps the board's own gold disc, and a board without places has none.
 */
export function medalRank(rank: number, showRank: boolean): 2 | 3 | null {
  if (!showRank) return null;
  return rank === 2 || rank === 3 ? rank : null;
}

/** What the number counts. `holes` is holes won (round robin). */
export type PodiumUnit = 'points' | 'net' | 'gross' | 'toPar' | 'skins' | 'holes';

export type PodiumRow = {
  rank: number;
  /** Another row shares this rank. */
  tied: boolean;
  /** One id for a player, the members for a team. */
  memberIds: string[];
  /** The team's number; `null` for a player. */
  teamNumber: number | null;
  /** In `unit`; `null` for a competitor without a hole. */
  total: number | null;
  unit: PodiumUnit;
};

export type Podium = {
  /** At most three. */
  rows: PodiumRow[];
  /** Every row on first place, also past the third row. */
  winners: PodiumRow[];
};

type Line = Omit<PodiumRow, 'tied'>;

const player = (userId: string, rank: number, total: number, unit: PodiumUnit): Line => ({
  rank,
  memberIds: [userId],
  teamNumber: null,
  total,
  unit,
});

/** The format's lines in the engine's order, or `null` when it has no places. */
function linesOf(result: ModeResult): Line[] | null {
  switch (result.kind) {
    case 'singles_matchplay':
    case 'fourball_matchplay':
    case 'foursomes_matchplay':
      return null;

    case 'solo_strokeplay': {
      const unit = boardUnit(result);
      return soloResultBoard(result, []).rows.map((row) => ({
        rank: row.rank,
        memberIds: [row.userId],
        teamNumber: null,
        total: row.total,
        unit,
      }));
    }

    case 'stableford':
      if (result.variant === 'solo') {
        return soloResultBoard(result, []).rows.map((row) => ({
          rank: row.rank,
          memberIds: [row.userId],
          teamNumber: null,
          total: row.total,
          unit: 'points',
        }));
      }
      return teamLines(result);

    case 'texas_scramble':
    case 'best_ball':
    case 'shamble':
      return teamLines(result);

    case 'patsome':
      return result.teams.map((team) => ({
        rank: team.rank,
        memberIds: team.playerIds,
        teamNumber: team.teamNumber,
        total: team.totalPoints,
        unit: 'points',
      }));

    case 'wolf':
    case 'nines':
      return result.players.map((p) => player(p.userId, p.rank, p.totalPoints, 'points'));

    case 'bingo_bango_bongo':
      return result.players.map((p) => player(p.userId, p.rank, p.totalPoints, 'points'));

    case 'round_robin':
      return result.players.map((p) => player(p.userId, p.rank, p.totalHoleWins, 'holes'));

    case 'acey_deucey':
      return result.players.map((p) => player(p.userId, p.rank, p.total, 'points'));

    case 'skins':
      return result.players.map((p) => player(p.userId, p.rank, p.totalSkins, 'skins'));

    case 'nassau':
      return result.players.map((p) => player(p.userId, p.rank, p.units, 'points'));

    default: {
      const _exhaustive: never = result;
      throw new Error(`Unhandled ModeResult kind: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

function teamLines(result: Parameters<typeof teamResultBoard>[0]): Line[] {
  const unit = teamDisplayUnit(result);
  return teamResultBoard(result, () => '').rows.map((row) => ({
    rank: row.rank,
    memberIds: row.memberIds,
    teamNumber: row.teamNumber,
    total: row.total,
    unit,
  }));
}

/**
 * The top of the board, or `null` when the game has none to show: the match
 * play family, an empty field, a league round played alone (#2712) and a game
 * nobody won anything in.
 */
export function podiumFor(
  result: ModeResult,
  opts: { leagueFlight?: boolean } = {},
): Podium | null {
  const lines = linesOf(result);
  if (lines === null || lines.length === 0) return null;
  // Everyone on zero of something you win (no skin taken, no bingo, every Nassau
  // section halved): nobody won. Par on a to-par board is a real score.
  if (lines.every((line) => line.total === 0 && line.unit !== 'toPar')) return null;
  if (isLeagueFieldAlone(opts.leagueFlight ?? false, lines.length)) return null;
  const counts = new Map<number, number>();
  for (const line of lines) counts.set(line.rank, (counts.get(line.rank) ?? 0) + 1);
  const rows = lines.map((line): PodiumRow => ({ ...line, tied: (counts.get(line.rank) ?? 0) > 1 }));
  return {
    rows: rows.slice(0, 3),
    winners: rows.filter((row) => row.rank === rows[0].rank),
  };
}
