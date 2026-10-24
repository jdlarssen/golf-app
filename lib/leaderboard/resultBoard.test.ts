import { describe, it, expect } from 'vitest';
import { computeLeaderboard } from '@/lib/scoring';
import type {
  BestBallResult,
  ScoringContext,
  SoloStrokeplayPlayerLine,
  SoloStrokeplayResult,
  StablefordPlayerLine,
  StablefordSoloResult,
} from '@/lib/scoring/modes/types';
import {
  resultStanding,
  soloResultBoard,
  teamBoardMeasure,
  teamResultBoard,
  type TeamBoardResult,
} from './resultBoard';

// Type A (#2579): the finished board's numbers, read straight from the
// engine's result. Ranks, totals and the tie-break come from the engine and
// are tested there; this tests the order, the rows the board rules read, the
// row above and the strip's gap.

const players = ['a', 'b', 'c', 'd', 'e'].map((id) => ({
  user_id: id,
  users: { name: `Spiller ${id.toUpperCase()}`, nickname: id === 'b' ? 'Bee' : null },
}));

function sf(userId: string, totalPoints: number, rank: number, extra: Partial<StablefordPlayerLine> = {}): StablefordPlayerLine {
  return { userId, totalPoints, rank, holesPlayed: 18, tiedWith: [], decidedBy: null, ...extra };
}

const stableford: StablefordSoloResult = {
  kind: 'stableford',
  variant: 'solo',
  holes: [],
  // The engine's order, already ranked; d and e share fourth.
  players: [
    sf('a', 40, 1),
    sf('b', 36, 2, { decidedBy: 'total' }),
    sf('c', 36, 3, { decidedBy: 'back9' }),
    sf('d', 30, 4, { decidedBy: 'total', tiedWith: ['e'] }),
    sf('e', 30, 4, { tiedWith: ['d'] }),
  ],
};

function sp(userId: string, rank: number, extra: Partial<SoloStrokeplayPlayerLine>): SoloStrokeplayPlayerLine {
  return {
    userId,
    totalNetStrokes: 72,
    totalGrossStrokes: 80,
    holesPlayed: 18,
    netToPar: 0,
    rank,
    tiedWith: [],
    ...extra,
  };
}

describe('soloResultBoard — the rows of a finished solo board', () => {
  it('keeps the engine order and reads place, tie, number, decider and the row above', () => {
    const board = soloResultBoard(stableford, players);
    expect(board.unit).toBe('points');
    expect(board.holesPlayed).toBe(18);
    expect(
      board.rows.map((r) => [r.userId, r.rank, r.tied, r.total, r.decidedBy, r.above]),
    ).toEqual([
      ['a', 1, false, 40, null, null],
      ['b', 2, false, 36, 'total', 'a'],
      ['c', 3, false, 36, 'back9', 'b'],
      ['d', 4, true, 30, 'total', 'c'],
      ['e', 4, true, 30, null, 'd'],
    ]);
  });

  it('carries the name and nickname from the player rows', () => {
    const b = soloResultBoard(stableford, players).rows[1];
    expect([b.name, b.nickname]).toEqual(['Spiller B', 'Bee']);
  });

  it('does not sort the engine output again', () => {
    const shuffled = { ...stableford, players: [...stableford.players].reverse() };
    expect(soloResultBoard(shuffled, players).rows.map((r) => r.userId)).toEqual(['e', 'd', 'c', 'b', 'a']);
  });

  it.each([
    ['net_to_par', 'toPar', -3],
    ['net_total', 'net', 69],
  ] as const)('strokeplay ranked on %s shows %s', (ranking, unit, total) => {
    const result: SoloStrokeplayResult = {
      kind: 'solo_strokeplay',
      ranking,
      holes: [],
      players: [sp('a', 1, { totalNetStrokes: 69, netToPar: -3 })],
    };
    const board = soloResultBoard(result, players);
    expect(board.unit).toBe(unit);
    expect(board.rows[0].total).toBe(total);
  });

  it('has no number for a player without a hole', () => {
    const result: SoloStrokeplayResult = {
      kind: 'solo_strokeplay',
      ranking: 'net_total',
      holes: [],
      players: [sp('a', 1, {}), sp('b', 2, { holesPlayed: 0, totalNetStrokes: 0, netToPar: null })],
    };
    const board = soloResultBoard(result, players);
    expect(board.rows.map((r) => r.total)).toEqual([72, null]);
  });
});

describe('resultStanding — the strip «3. plass · 4 bak Marte»', () => {
  const board = soloResultBoard(stableford, players);
  const byUser = (r: { userId: string }) => r.userId;

  it('gives the place and the gap to the lead', () => {
    expect(resultStanding(board, byUser, 'c')).toEqual({ rank: 3, tied: false, leaders: ['a'], gap: 4 });
  });

  it('has no gap for the leader', () => {
    expect(resultStanding(board, byUser, 'a')).toEqual({ rank: 1, tied: false, leaders: ['a'], gap: null });
  });

  it('is null for a viewer who is not on the board', () => {
    expect(resultStanding(board, byUser, 'organizer')).toBeNull();
  });

  it('names every leader on a shared lead', () => {
    const shared = soloResultBoard(
      { ...stableford, players: [sf('a', 40, 1, { tiedWith: ['b'] }), sf('b', 40, 1, { tiedWith: ['a'] }), sf('c', 38, 3, { decidedBy: 'total' })] },
      players,
    );
    expect(resultStanding(shared, byUser, 'c')).toEqual({ rank: 3, tied: false, leaders: ['a', 'b'], gap: 2 });
  });

  it('gives only the place when a net-strokes round has different holes played', () => {
    const result: SoloStrokeplayResult = {
      kind: 'solo_strokeplay',
      ranking: 'net_total',
      holes: [],
      players: [sp('a', 1, { totalNetStrokes: 70 }), sp('b', 2, { holesPlayed: 17, totalNetStrokes: 68, decidedBy: 'total' })],
    };
    expect(resultStanding(soloResultBoard(result, players), byUser, 'b')?.gap).toBeNull();
  });
});

// Two teams of two on three par-4 holes: team 1 played holes 1–2, team 2 only
// hole 1. Hole 3 has no strokes, so team stableford's 0 points there must not
// count as a played hole.
function teamCtx(
  game_mode: ScoringContext['game']['game_mode'],
  mode_config: ScoringContext['game']['mode_config'],
): ScoringContext {
  const holesPlayed: Record<string, number[]> = { p1: [1, 2], p2: [1, 2], p3: [1], p4: [1] };
  return {
    game: { id: 'g', game_mode, mode_config },
    players: ['p1', 'p2', 'p3', 'p4'].map((userId, i) => ({
      userId,
      teamNumber: i < 2 ? 1 : 2,
      flightNumber: 1,
      courseHandicap: 0,
    })),
    holes: [1, 2, 3].map((number) => ({ number, par: 4, strokeIndex: number })),
    scores: Object.entries(holesPlayed).flatMap(([userId, holes]) =>
      holes.map((holeNumber) => ({ userId, holeNumber, gross: 4 })),
    ),
  };
}

describe('teamBoardMeasure — N and the comparison unit per team format', () => {
  it.each([
    ['texas_scramble', teamCtx('texas_scramble', { kind: 'texas_scramble', team_size: 2, teams_count: 2, team_handicap_pct: 25 }), 'net'],
    ['best_ball', teamCtx('best_ball', { kind: 'best_ball', team_size: 2, teams_count: 2 }), 'net'],
    [
      'shamble',
      teamCtx('shamble', {
        kind: 'shamble',
        team_size: 4,
        teams_count: 2,
        shamble_variant: 'shamble',
        shamble_count: 2,
        shamble_scoring: 'net',
      }),
      'net',
    ],
    ['team stableford', teamCtx('stableford', { kind: 'stableford', team_size: 2, points_table: 'standard' }), 'points'],
  ] as const)('%s', (_name, ctx, unit) => {
    const measure = teamBoardMeasure(computeLeaderboard(ctx) as TeamBoardResult);
    expect([measure.unit, measure.holesPlayed(1), measure.holesPlayed(2)]).toEqual([unit, 2, 1]);
  });
});

describe('teamResultBoard — the rows of a finished team board', () => {
  const teamName = (n: number) => `Lag ${n}`;

  it('sorts on place, then team number (best ball comes in team order)', () => {
    const line = (teamNumber: number, total: number, rank: number) => ({
      teamNumber,
      playerIds: [`t${teamNumber}a`, `t${teamNumber}b`],
      holes: Array.from({ length: 18 }, (_, i) => ({
        holeNumber: i + 1,
        par: 4,
        strokeIndex: i + 1,
        teamNet: 4,
        contributorIds: [],
        players: [],
      })),
      total,
      missingHoles: [],
      toPar: null,
      rank,
      tiedWith: [],
      decidedBy: rank === 1 ? null : ('total' as const),
    });
    const result: BestBallResult = {
      kind: 'best_ball',
      ranking: 'net_total',
      teams: [line(1, 74, 3), line(2, 70, 1), line(3, 72, 2), line(4, 74, 3)],
    };
    const board = teamResultBoard(result, teamName);
    expect(board.rows.map((r) => [r.teamNumber, r.rank, r.tied, r.above])).toEqual([
      [2, 1, false, null],
      [3, 2, false, 2],
      [1, 3, true, 3],
      [4, 3, true, 1],
    ]);
    expect(board.rows[0]).toMatchObject({ name: 'Lag 2', memberIds: ['t2a', 't2b'], total: 70 });
  });

  it('carries the team handicap where the result has it (the texas family)', () => {
    // Team 1 has course handicaps 20 and 12: 25 % of 32 is a team handicap of 8.
    const context = teamCtx('texas_scramble', { kind: 'texas_scramble', team_size: 2, teams_count: 2, team_handicap_pct: 25 });
    const texas = computeLeaderboard({
      ...context,
      players: context.players.map((p) => ({ ...p, courseHandicap: p.userId === 'p1' ? 20 : p.userId === 'p2' ? 12 : 0 })),
    }) as TeamBoardResult;
    const bb = computeLeaderboard(teamCtx('best_ball', { kind: 'best_ball', team_size: 2, teams_count: 2 })) as TeamBoardResult;
    expect(Object.fromEntries(teamResultBoard(texas, teamName).rows.map((r) => [r.teamNumber, r.teamHandicap]))).toEqual({
      1: 8,
      2: 0,
    });
    expect(teamResultBoard(bb, teamName).rows.map((r) => r.teamHandicap)).toEqual([null, null]);
  });

  it('reads N, total and unit from the engine, and gives the strip its gap', () => {
    const result = computeLeaderboard(
      teamCtx('stableford', { kind: 'stableford', team_size: 2, points_table: 'standard' }),
    ) as TeamBoardResult;
    const board = teamResultBoard(result, teamName);
    expect(board.unit).toBe('points');
    expect(board.holesPlayed).toBe(2);
    expect(board.rows.map((r) => [r.teamNumber, r.total, r.holesPlayed])).toEqual([
      [1, 4, 2],
      [2, 2, 1],
    ]);
    // Different N: only the place.
    expect(resultStanding(board, (r) => r.teamNumber, 2)).toEqual({ rank: 2, tied: false, leaders: [1], gap: null });
  });
});

// #2625 part 2: a team stableford game stamped `ranking: 'net_to_par'` shows
// points against par pace, and its gap compares across a different number of
// holes.
describe('teamResultBoard — a net-to-par team stableford game (#2625)', () => {
  it('unit pointsToPar, the total is the team’s points against par pace, and the gap is there across holes', () => {
    const card = (userId: string, gross: number[]) => gross.map((g, i) => ({ userId, holeNumber: i + 1, gross: g }));
    // Team 1 +5 after 3 holes (11 points), team 2 +1 after 6 (13). Par 4.
    const ctx: ScoringContext = {
      game: {
        id: 'g',
        game_mode: 'stableford',
        mode_config: { kind: 'stableford', team_size: 2, points_table: 'standard', ranking: 'net_to_par' },
      },
      players: ['p1', 'p2', 'p3', 'p4'].map((userId, i) => ({
        userId,
        teamNumber: i < 2 ? 1 : 2,
        flightNumber: i < 2 ? 1 : 2,
        courseHandicap: 0,
      })),
      holes: Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4, strokeIndex: i + 1 })),
      scores: [...card('p1', [2, 2, 3]), ...card('p3', [3, 4, 4, 4, 4, 4])],
    };
    const board = teamResultBoard(computeLeaderboard(ctx) as TeamBoardResult, (n) => `Lag ${n}`);
    expect(board.unit).toBe('pointsToPar');
    expect(board.rows.map((r) => [r.teamNumber, r.rank, r.total, r.holesPlayed])).toEqual([
      [1, 1, 5, 3],
      [2, 2, 1, 6],
    ]);
    expect(resultStanding(board, (r) => r.teamNumber, 2)?.gap).toBe(4);
  });
});

// #2625: a team strokeplay game stamped `ranking: 'net_to_par'` shows the
// number it is ranked on, and its gap compares across a different number of
// holes («thru»), like the solo board's net to par (#2253).
describe('teamResultBoard — a net-to-par team game (#2625)', () => {
  const teamName = (n: number) => `Lag ${n}`;
  const card = (userId: string, gross: number[]) => gross.map((g, i) => ({ userId, holeNumber: i + 1, gross: g }));
  function issueCtx(
    game_mode: ScoringContext['game']['game_mode'],
    mode_config: ScoringContext['game']['mode_config'],
    scores: ScoringContext['scores'],
  ): ScoringContext {
    return {
      game: { id: 'g', game_mode, mode_config: { ...mode_config, ranking: 'net_to_par' } as typeof mode_config },
      players: ['p1', 'p2', 'p3', 'p4'].map((userId, i) => ({
        userId,
        teamNumber: i < 2 ? 1 : 2,
        flightNumber: i < 2 ? 1 : 2,
        courseHandicap: 0,
      })),
      holes: Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4, strokeIndex: i + 1 })),
      scores,
    };
  }
  // The issue's example: Lag 1 −5 after 3 holes, Lag 2 −7 after 6.
  const oneBall = [...card('p1', [2, 2, 3]), ...card('p3', [3, 3, 3, 3, 3, 2])];
  it.each([
    ['texas_scramble', issueCtx('texas_scramble', { kind: 'texas_scramble', team_size: 2, teams_count: 2, team_handicap_pct: 0 }, oneBall)],
    ['best_ball', issueCtx('best_ball', { kind: 'best_ball', team_size: 2, teams_count: 2 }, oneBall)],
    [
      'shamble',
      issueCtx(
        'shamble',
        { kind: 'shamble', team_size: 4, teams_count: 2, shamble_variant: 'shamble', shamble_count: 2, shamble_scoring: 'net' },
        [
          ...card('p1', [3, 3, 3]),
          ...card('p2', [3, 3, 4]),
          ...card('p3', [3, 3, 3, 3, 3, 3]),
          ...card('p4', [4, 4, 4, 4, 4, 3]),
        ],
      ),
    ],
  ] as const)('%s: unit toPar, the total is the team’s to par, and the gap is there across holes', (_name, ctx) => {
    const board = teamResultBoard(computeLeaderboard(ctx) as TeamBoardResult, teamName);
    expect(board.unit).toBe('toPar');
    expect(board.rows.map((r) => [r.teamNumber, r.rank, r.total, r.holesPlayed])).toEqual([
      [2, 1, -7, 6],
      [1, 2, -5, 3],
    ]);
    expect(resultStanding(board, (r) => r.teamNumber, 1)?.gap).toBe(2);
  });
});
