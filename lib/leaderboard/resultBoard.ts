// The finished board (#2579): the rows of a board whose game is over, read
// straight from the engine's result. `computeLiveBoard` answers `null` for a
// finished game (the web's podium is built on that), so the finished board
// gets its numbers here instead: place, shared place, the number, which
// tie-break step decided a row (`decidedBy`), the row above, and the strip's
// gap to the lead.
//
// Pure code like `liveBoard.ts`: no React, no translations. Each row carries
// `rank`, `tied`, `holesPlayed`, `name` and a key (userId or team number), so
// the rules in `boardRules.ts` read it without a copy.

import { boardUnit, gapToLead, type LiveBoardUnit } from '@/lib/leaderboard/liveBoard';
import type { BoardRowKey } from '@/lib/leaderboard/boardRules';
import { teamHolesPlayed } from '@/lib/leaderboard/holesColumn';
import type { TieDecider } from '@/lib/scoring/tiebreaker';
import type {
  BestBallResult,
  ShambleResult,
  SoloStrokeplayResult,
  StablefordSoloResult,
  StablefordTeamResult,
  TexasScrambleResult,
} from '@/lib/scoring/modes/types';

type PlayerNameRow = {
  user_id: string;
  users: { name: string | null; nickname: string | null } | null;
};

export type ResultBoardRow = {
  userId: string;
  /** Raw `users.name`; the component formats it. */
  name: string | null;
  nickname: string | null;
  rank: number;
  /** Another row shares this rank. */
  tied: boolean;
  /** In the board's unit; `null` for a player without a hole. */
  total: number | null;
  holesPlayed: number;
  decidedBy: TieDecider | null;
  /** The row directly above, which «Likt med X» names; `null` on the first row. */
  above: string | null;
};

export type ResultBoard<Row> = {
  unit: LiveBoardUnit;
  /** The furthest-along row's played holes («SLUTTRESULTAT · 18 HULL»). */
  holesPlayed: number;
  rows: Row[];
};

function rankCounts(rows: readonly { rank: number }[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const r of rows) counts.set(r.rank, (counts.get(r.rank) ?? 0) + 1);
  return counts;
}

/** A finished solo board, in the engine's order (already ranked and stable). */
export function soloResultBoard(
  result: StablefordSoloResult | SoloStrokeplayResult,
  players: readonly PlayerNameRow[],
): ResultBoard<ResultBoardRow> {
  const unit = boardUnit(result);
  const lines =
    result.kind === 'stableford'
      ? result.players.map((p) => ({ ...p, total: unit === 'pointsToPar' ? p.toPar : p.totalPoints }))
      : result.players.map((p) => ({ ...p, total: unit === 'toPar' ? p.netToPar : p.totalNetStrokes }));
  const userById = new Map(players.map((p) => [p.user_id, p.users]));
  const counts = rankCounts(lines);
  const rows = lines.map((l, i): ResultBoardRow => {
    const user = userById.get(l.userId) ?? null;
    return {
      userId: l.userId,
      name: user?.name ?? null,
      nickname: user?.nickname ?? null,
      rank: l.rank,
      tied: (counts.get(l.rank) ?? 0) > 1,
      total: l.holesPlayed > 0 ? l.total : null,
      holesPlayed: l.holesPlayed,
      decidedBy: l.decidedBy ?? null,
      above: i > 0 ? lines[i - 1].userId : null,
    };
  });
  return { unit, holesPlayed: Math.max(0, ...rows.map((r) => r.holesPlayed)), rows };
}

/** The team formats with a team board (#2579). */
export type TeamBoardResult = TexasScrambleResult | StablefordTeamResult | BestBallResult | ShambleResult;

/**
 * How a team format counts a team's played holes (N: «hull 11», the pill,
 * the gap) and the unit its gap compares in. The one home for N per team
 * format:
 *
 * - texas, ambrose, florida and best ball: `teamHolesPlayed`, net
 * - shamble: the holes the team has a counted score on, net
 * - team stableford: the hole rows where a player has strokes, points. A hole
 *   nobody has played also scores 0 points, so `teamPoints` cannot say it.
 *
 * #2625: a team strokeplay result ranked on net to par compares in `toPar`,
 * and a team stableford result ranked on it in `pointsToPar`; `comparableGap`
 * compares both across a different number of holes.
 */
export function teamBoardMeasure(result: TeamBoardResult): {
  unit: 'net' | 'points' | 'toPar' | 'pointsToPar';
  holesPlayed: (teamNumber: number) => number;
} {
  const find = <T extends { teamNumber: number }>(teams: readonly T[], n: number) =>
    teams.find((t) => t.teamNumber === n);
  switch (result.kind) {
    case 'texas_scramble':
      return { unit: strokeUnit(result), holesPlayed: (n) => teamPlayed(find(result.teams, n)) };
    case 'best_ball':
      return { unit: strokeUnit(result), holesPlayed: (n) => teamPlayed(find(result.teams, n)) };
    case 'shamble':
      return { unit: strokeUnit(result), holesPlayed: (n) => find(result.teams, n)?.holesCounted ?? 0 };
    case 'stableford':
      return {
        unit: result.ranking === 'net_to_par' ? 'pointsToPar' : 'points',
        holesPlayed: (n) =>
          find(result.teams, n)?.holes.filter((h) => h.players.some((p) => p.gross !== null)).length ?? 0,
      };
  }
}

/** #2625: the unit a team strokeplay result compares in, from the rule it ranked on. */
function strokeUnit(result: { ranking: 'net_to_par' | 'net_total' }): 'net' | 'toPar' {
  return result.ranking === 'net_to_par' ? 'toPar' : 'net';
}

function teamPlayed(team: { holes: readonly unknown[]; missingHoles: readonly number[] } | undefined): number {
  return team ? teamHolesPlayed(team) : 0;
}

export type TeamResultBoardRow = {
  teamNumber: number;
  /** «Lag 4», from the caller, so a sentence names the team like a player. */
  name: string;
  memberIds: string[];
  /** The team handicap where the result has one (the texas family), else `null`. */
  teamHandicap: number | null;
  rank: number;
  tied: boolean;
  /** In the board's unit (#2625: to par in a net-to-par game); `null` for a team without a played hole. */
  total: number | null;
  holesPlayed: number;
  decidedBy: TieDecider | null;
  /** The team directly above; `null` on the first row. */
  above: number | null;
};

/** The line's number in the board's unit: #2625 to par (or points against par pace) in a net-to-par game. */
function teamLines(result: TeamBoardResult) {
  const toPar = result.ranking === 'net_to_par';
  switch (result.kind) {
    case 'texas_scramble':
      return result.teams.map((t) => ({
        ...t,
        memberIds: t.members.map((m) => m.userId),
        total: toPar ? t.toPar : (t.totalNet as number | null),
        teamHandicap: t.teamHandicap as number | null,
      }));
    case 'best_ball':
      return result.teams.map((t) => ({
        ...t,
        memberIds: t.playerIds,
        total: toPar ? t.toPar : (t.total as number | null),
        teamHandicap: null,
      }));
    case 'shamble':
      return result.teams.map((t) => ({
        ...t,
        memberIds: t.members,
        total: toPar ? t.toPar : (t.totalScore as number | null),
        teamHandicap: null,
      }));
    case 'stableford':
      return result.teams.map((t) => ({
        ...t,
        memberIds: t.playerIds,
        total: toPar ? t.toPar : (t.totalPoints as number | null),
        teamHandicap: null,
      }));
  }
}

/**
 * A finished team board, in place order with the team number second (best
 * ball's engine returns team-number order).
 */
export function teamResultBoard(
  result: TeamBoardResult,
  teamName: (teamNumber: number) => string,
): ResultBoard<TeamResultBoardRow> {
  const lines = [...teamLines(result)].sort((a, b) => a.rank - b.rank || a.teamNumber - b.teamNumber);
  const counts = rankCounts(lines);
  const { unit, holesPlayed } = teamBoardMeasure(result);
  const rows = lines.map((l, i): TeamResultBoardRow => {
    const played = holesPlayed(l.teamNumber);
    return {
      teamNumber: l.teamNumber,
      name: teamName(l.teamNumber),
      memberIds: l.memberIds,
      teamHandicap: l.teamHandicap,
      rank: l.rank,
      tied: (counts.get(l.rank) ?? 0) > 1,
      total: played > 0 ? l.total : null,
      holesPlayed: played,
      decidedBy: l.decidedBy ?? null,
      above: i > 0 ? lines[i - 1].teamNumber : null,
    };
  });
  return { unit, holesPlayed: Math.max(0, ...rows.map((r) => r.holesPlayed)), rows };
}

export type ResultStanding<Key extends BoardRowKey> = {
  rank: number;
  tied: boolean;
  /** Everyone on rank 1 (more than one on a shared lead). */
  leaders: Key[];
  /** Behind the lead via `gapToLead`; `null` when leading or not comparable. */
  gap: number | null;
};

/** Where the viewer (or their team) stands on a finished board, or `null` when not on it. */
export function resultStanding<Row extends { rank: number; tied: boolean; total: number | null; holesPlayed: number }, Key extends BoardRowKey>(
  board: ResultBoard<Row>,
  keyOf: (row: Row) => Key,
  key: Key,
): ResultStanding<Key> | null {
  const me = board.rows.find((r) => keyOf(r) === key);
  if (!me) return null;
  const leaders = board.rows.filter((r) => r.rank === 1);
  return {
    rank: me.rank,
    tied: me.tied,
    leaders: leaders.map(keyOf),
    gap: gapToLead(board.unit, me, leaders),
  };
}
