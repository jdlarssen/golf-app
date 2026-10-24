import { describe, it, expect } from 'vitest';
import { computeLeaderboard } from '@/lib/scoring';
import { buildStablefordContext } from '@/lib/scoring/context/buildStablefordContext';
import type {
  GameModeConfig,
  SoloStrokeplayResult,
  StablefordSoloResult,
} from '@/lib/scoring/modes/types';
import {
  boardUnit,
  comparableGap,
  computeLiveBoard,
  liveBoardStripAction,
  viewerStanding,
  withoutLatestHolePerPlayer,
  type LiveBoard,
  type LiveBoardGame,
  type LiveBoardPlayerRow,
  type LiveBoardRow,
  type LiveBoardUnit,
} from './liveBoard';

// Type A (#2253): the live board's own logic — movement since the previous
// hole, the last five holes, the gap to the lead and when there is no board.
// Ranks and totals come from the scoring engine and are tested there.

const STABLEFORD: GameModeConfig = { kind: 'stableford', team_size: 1, points_table: 'standard' };
const STROKEPLAY = { kind: 'solo_strokeplay', team_size: 1 } as GameModeConfig;
const STROKEPLAY_TO_PAR = {
  kind: 'solo_strokeplay',
  team_size: 1,
  ranking: 'net_to_par',
} as GameModeConfig;

function game(overrides: Partial<LiveBoardGame> = {}): LiveBoardGame {
  return {
    game_mode: 'stableford',
    mode_config: STABLEFORD,
    status: 'active',
    score_visibility: 'live',
    ...overrides,
  };
}

function player(
  id: string,
  opts: { withdrawn?: boolean; courseHandicap?: number } = {},
): LiveBoardPlayerRow {
  return {
    user_id: id,
    team_number: 0,
    course_handicap: opts.courseHandicap ?? 0,
    tee_gender: 'mens',
    withdrawn_at: opts.withdrawn ? '2026-06-01T10:00:00Z' : null,
    users: { name: `Name ${id}`, nickname: null },
  };
}

const HOLES = Array.from({ length: 18 }, (_, i) => ({
  hole_number: i + 1,
  par_mens: 4,
  par_ladies: 4,
  par_juniors: 4,
  stroke_index: i + 1,
}));

/** Gross per hole number (CH 0, par 4) → score rows. */
function card(userId: string, grossByHole: Record<number, number>) {
  return Object.entries(grossByHole).map(([hole, strokes]) => ({
    user_id: userId,
    hole_number: Number(hole),
    strokes,
  }));
}

function board(opts: {
  game?: LiveBoardGame;
  players: LiveBoardPlayerRow[];
  scores: ReturnType<typeof card>;
}): LiveBoard {
  const result = computeLiveBoard({
    gameId: 'g1',
    game: opts.game ?? game(),
    players: opts.players,
    holesRows: HOLES,
    scoresRows: opts.scores,
  });
  expect(result).not.toBeNull();
  return result!;
}

// Stableford, par 4, CH 0: par = 2 points, bogey 1, birdie 3, double 0.
// After hole 2: a 4, c 3, b 2, d 0 → a 1st, c 2nd, b 3rd, d 4th.
// Hole 3: a double (0), b birdie (3), c bogey (1), d par (2).
// After hole 3: b 5, a 4, c 4, d 2 → b 1st, a and c share 2nd, d 4th.
const climb = {
  players: ['a', 'b', 'c', 'd'].map((id) => player(id)),
  scores: [
    ...card('a', { 1: 4, 2: 4, 3: 6 }),
    ...card('b', { 1: 5, 2: 5, 3: 3 }),
    ...card('c', { 1: 4, 2: 5, 3: 5 }),
    ...card('d', { 1: 6, 2: 6, 3: 4 }),
  ],
};

describe('computeLiveBoard — movement since the previous hole', () => {
  it('b climbs 2, a falls 1, c and d stay', () => {
    const b = board(climb);
    expect(b.rows.map((r) => [r.userId, r.rank, r.tied, r.movement])).toEqual([
      ['b', 1, false, 2],
      ['a', 2, true, -1],
      ['c', 2, true, 0],
      ['d', 4, false, 0],
    ]);
  });

  it('movement is null under two played holes', () => {
    // one: a birdie on hole 1 (3 points). two: two bogeys (2 points), and led
    // before its latest hole (1 point against 0).
    const b = board({
      players: [player('one'), player('two')],
      scores: [...card('one', { 1: 3 }), ...card('two', { 1: 5, 2: 5 })],
    });
    expect(Object.fromEntries(b.rows.map((r) => [r.userId, r.movement]))).toEqual({
      one: null,
      two: -1,
    });
  });

  it('minHolesForMovement 1 shows movement from the first hole (the demo, #2281)', () => {
    // Before hole 1 both have 0 points and share 1st. Hole 1: lead a birdie (3
    // points), second a par (2) → lead stays 1st (0), second falls to 2nd (−1).
    const result = computeLiveBoard({
      gameId: 'g1',
      game: game(),
      players: [player('lead'), player('second')],
      holesRows: HOLES,
      scoresRows: [...card('lead', { 1: 3 }), ...card('second', { 1: 4 })],
      minHolesForMovement: 1,
    });
    expect(Object.fromEntries(result!.rows.map((r) => [r.userId, r.movement]))).toEqual({
      lead: 0,
      second: -1,
    });
  });
});

describe('computeLiveBoard — the last five holes', () => {
  it('takes the five latest played holes, oldest first, skipping an empty hole', () => {
    const b = board({
      players: [player('p')],
      scores: card('p', { 1: 3, 2: 4, 3: 5, 5: 6, 6: 4, 7: 3 }),
    });
    expect(b.rows[0].recent).toEqual(['par', 'over1', 'over2', 'par', 'under']);
  });

  it('a shotgun group (#2286): the last five in the order played, not by hole number', () => {
    const b = board({
      game: game({ start_type: 'shotgun', hole_segment: 'full' }),
      players: [player('p')],
      scores: card('p', { 14: 4, 15: 4, 16: 5, 17: 3, 18: 4, 1: 6 }),
    });
    expect(b.rows[0].recentHoles.map((h) => h.holeNumber)).toEqual([15, 16, 17, 18, 1]);
    expect(b.rows[0].recent).toEqual(['par', 'over1', 'under', 'par', 'over2']);
  });

  it('shows fewer dots when fewer than five holes are played', () => {
    const b = board({ players: [player('p')], scores: card('p', { 1: 4, 2: 5 }) });
    expect(b.rows[0].recent).toEqual(['par', 'over1']);
  });

  it('recentHoles (#2286): the same five holes with strokes, the player’s own par and points or net', () => {
    // Hole 7 is a par 5 from the ladies' tee; everything else is par 4.
    const holes = HOLES.map((h) => (h.hole_number === 7 ? { ...h, par_ladies: 5 } : h));
    const lady: LiveBoardPlayerRow = { ...player('p'), tee_gender: 'ladies' };
    const scores = card('p', { 1: 3, 2: 4, 3: 5, 5: 6, 6: 4, 7: 4 });

    const stableford = computeLiveBoard({
      gameId: 'g1',
      game: game(),
      players: [lady],
      holesRows: holes,
      scoresRows: scores,
    })!;
    expect(stableford.rows[0].recentHoles).toEqual([
      { holeNumber: 2, gross: 4, par: 4, points: 2, net: null },
      { holeNumber: 3, gross: 5, par: 4, points: 1, net: null },
      { holeNumber: 5, gross: 6, par: 4, points: 0, net: null },
      { holeNumber: 6, gross: 4, par: 4, points: 2, net: null },
      { holeNumber: 7, gross: 4, par: 5, points: 3, net: null },
    ]);
    // The dots are the colour of the same holes: the ladies' birdie on 7 is under par.
    expect(stableford.rows[0].recent).toEqual(['par', 'over1', 'over2', 'par', 'under']);

    const strokeplay = computeLiveBoard({
      gameId: 'g1',
      game: game({ game_mode: 'solo_strokeplay', mode_config: STROKEPLAY }),
      players: [{ ...lady, course_handicap: 18 }],
      holesRows: holes,
      scoresRows: scores,
    })!;
    expect(strokeplay.rows[0].recentHoles.map((h) => [h.holeNumber, h.gross, h.net, h.points])).toEqual([
      [2, 4, 3, null],
      [3, 5, 4, null],
      [5, 6, 5, null],
      [6, 4, 3, null],
      [7, 4, 3, null],
    ]);
  });
});

describe('computeLiveBoard — units and order', () => {
  it('rows keep the engine order', () => {
    const result = computeLeaderboard(
      buildStablefordContext({
        gameId: 'g1',
        gameMode: 'stableford',
        modeConfig: STABLEFORD,
        players: climb.players,
        holesRows: HOLES,
        scoresRows: climb.scores,
      }),
    );
    expect(board(climb).rows.map((r) => r.userId)).toEqual(
      result.kind === 'stableford' && result.variant === 'solo'
        ? result.players.map((p) => p.userId)
        : [],
    );
  });

  it('stableford counts points; the board shows the furthest-along player’s holes', () => {
    const b = board(climb);
    expect(b.unit).toBe('points');
    expect(b.holesPlayed).toBe(3);
    expect(b.rows.map((r) => r.total)).toEqual([5, 4, 4, 2]);
  });

  it('modified stableford counts points too', () => {
    // Modified table: par 0, bogey −1, birdie +2.
    const b = board({
      game: game({
        game_mode: 'modified_stableford',
        mode_config: { kind: 'modified_stableford', team_size: 1, points_table: 'modified' },
      }),
      players: [player('p')],
      scores: card('p', { 1: 3, 2: 5 }),
    });
    expect(b.unit).toBe('points');
    expect(b.rows[0].total).toBe(1);
  });

  it('strokeplay with the flag shows net to par; without it net strokes', () => {
    const players = [player('p')];
    const scores = card('p', { 1: 5, 2: 3, 3: 5 });
    const toPar = board({
      game: game({ game_mode: 'solo_strokeplay', mode_config: STROKEPLAY_TO_PAR }),
      players,
      scores,
    });
    expect([toPar.unit, toPar.rows[0].total]).toEqual(['toPar', 1]);

    const net = board({
      game: game({ game_mode: 'solo_strokeplay', mode_config: STROKEPLAY }),
      players,
      scores,
    });
    expect([net.unit, net.rows[0].total]).toEqual(['net', 13]);
  });

  it('stableford with the flag shows points against par pace and ranks on it (#2625)', () => {
    // The issue's shape for points: A +5 after 3 holes (11 points), B +1
    // after 6 (13). Par 4 everywhere.
    const players = [player('A'), player('B')];
    const scores = [...card('A', { 1: 2, 2: 2, 3: 3 }), ...card('B', { 1: 3, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4 })];
    const pace = board({
      game: game({ mode_config: { ...STABLEFORD, ranking: 'net_to_par' } as GameModeConfig }),
      players,
      scores,
    });
    expect(pace.unit).toBe('pointsToPar');
    expect(pace.rows.map((r) => [r.userId, r.rank, r.total])).toEqual([
      ['A', 1, 5],
      ['B', 2, 1],
    ]);
    expect(viewerStanding(pace, 'B')?.gap).toBe(4);

    const points = board({ players, scores });
    expect(points.unit).toBe('points');
    expect(points.rows.map((r) => [r.userId, r.total])).toEqual([
      ['B', 13],
      ['A', 11],
    ]);
  });

  it('a player without holes has no total and no movement (a scheduled game)', () => {
    const b = board({
      game: game({ status: 'scheduled' }),
      players: [player('a'), player('b')],
      scores: [],
    });
    expect(b.holesPlayed).toBe(0);
    expect(b.rows.map((r) => [r.rank, r.total, r.movement, r.recent])).toEqual([
      [1, null, null, []],
      [1, null, null, []],
    ]);
  });
});

// #2579: the unit has one home, read by the live board and the finished board.
describe('boardUnit — what the number column counts', () => {
  it.each<[StablefordSoloResult | SoloStrokeplayResult, LiveBoardUnit]>([
    [{ kind: 'stableford', variant: 'solo', ranking: 'net_total', players: [], holes: [] }, 'points'],
    [{ kind: 'stableford', variant: 'solo', ranking: 'net_to_par', players: [], holes: [] }, 'pointsToPar'],
    [{ kind: 'solo_strokeplay', ranking: 'net_to_par', players: [], holes: [] }, 'toPar'],
    [{ kind: 'solo_strokeplay', ranking: 'net_total', players: [], holes: [] }, 'net'],
  ])('%o → %s', (result, unit) => {
    expect(boardUnit(result)).toBe(unit);
  });
});

describe('computeLiveBoard — no board', () => {
  const base = { players: climb.players, holesRows: HOLES, scoresRows: climb.scores, gameId: 'g1' };

  it.each<[string, Partial<LiveBoardGame>]>([
    ['another format', { game_mode: 'best_ball', mode_config: { kind: 'best_ball', team_size: 2, teams_count: 2 } }],
    ['team stableford', { mode_config: { kind: 'stableford', team_size: 2, points_table: 'standard' } }],
    ['a finished game', { status: 'finished' }],
    ['a reveal game in play', { score_visibility: 'reveal' }],
    ['a scheduled reveal game', { score_visibility: 'reveal', status: 'scheduled' }],
  ])('%s → null', (_label, overrides) => {
    expect(computeLiveBoard({ ...base, game: game(overrides) })).toBeNull();
  });
});

describe('computeLiveBoard — a withdrawn player', () => {
  it('is not on the board, and does not count for its holes played', () => {
    const b = board({
      players: [...climb.players, player('w', { withdrawn: true })],
      scores: [...climb.scores, ...card('w', { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4 })],
    });
    expect(b.rows.map((r) => r.userId)).not.toContain('w');
    expect(b.holesPlayed).toBe(3);
    expect(viewerStanding(b, 'w')).toBeNull();
  });
});

describe('viewerStanding — the gap to the lead', () => {
  it('points on the same holes: points behind the leader', () => {
    const b = board(climb);
    expect(viewerStanding(b, 'a')).toEqual({
      rank: 2,
      tied: true,
      fieldSize: 4,
      total: 4,
      holesPlayed: 3,
      leaderUserIds: ['b'],
      gap: 1,
    });
    expect(viewerStanding(b, 'd')?.gap).toBe(3);
  });

  it('points on a different number of holes: no gap', () => {
    const b = board({
      players: [player('lead'), player('behind')],
      scores: [...card('lead', { 1: 3, 2: 3, 3: 4 }), ...card('behind', { 1: 4, 2: 4 })],
    });
    expect(viewerStanding(b, 'behind')?.gap).toBeNull();
  });

  it('the leader, and a player on a shared lead, have no gap', () => {
    const b = board(climb);
    expect(viewerStanding(b, 'b')?.gap).toBeNull();

    const shared = board({
      players: [player('x'), player('y'), player('z')],
      scores: [...card('x', { 1: 4, 2: 4 }), ...card('y', { 1: 4, 2: 4 }), ...card('z', { 1: 5, 2: 5 })],
    });
    expect(viewerStanding(shared, 'x')).toMatchObject({ rank: 1, tied: true, gap: null });
    expect(viewerStanding(shared, 'z')).toMatchObject({ leaderUserIds: ['x', 'y'], gap: 2 });
  });

  it('net to par compares across holes played («thru»)', () => {
    // early: −1 after 9 holes (leads). late: +1 after 14 holes.
    const early = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [i + 1, i === 2 ? 3 : 4]));
    const late = Object.fromEntries(
      Array.from({ length: 14 }, (_, i) => [i + 1, i === 1 || i === 6 ? 5 : i === 10 ? 3 : 4]),
    );
    const b = board({
      game: game({ game_mode: 'solo_strokeplay', mode_config: STROKEPLAY_TO_PAR }),
      players: [player('late'), player('early')],
      scores: [...card('early', early), ...card('late', late)],
    });
    expect(b.rows.map((r) => [r.userId, r.total])).toEqual([
      ['early', -1],
      ['late', 1],
    ]);
    expect(viewerStanding(b, 'late')?.gap).toBe(2);
  });

  it('net strokes only compare on the same number of holes', () => {
    const strokeplay = game({ game_mode: 'solo_strokeplay', mode_config: STROKEPLAY });
    const same = board({
      game: strokeplay,
      players: [player('x'), player('y')],
      scores: [...card('x', { 1: 4, 2: 4 }), ...card('y', { 1: 5, 2: 6 })],
    });
    expect(viewerStanding(same, 'y')?.gap).toBe(3);

    const uneven = board({
      game: strokeplay,
      players: [player('x'), player('y')],
      scores: [...card('x', { 1: 4, 2: 4, 3: 4 }), ...card('y', { 1: 5, 2: 6 })],
    });
    expect(viewerStanding(uneven, 'y')?.gap).toBeNull();
  });
});

describe('comparableGap (#2286) — the one rule for comparing two rows', () => {
  const row = (total: number | null, holesPlayed: number): LiveBoardRow => ({
    userId: 'x',
    name: null,
    nickname: null,
    rank: 1,
    tied: false,
    total,
    holesPlayed,
    movement: null,
    recent: [],
    recentHoles: [],
  });

  it.each([
    ['points on the same holes', 'points', row(26, 11), row(25, 11), 1],
    ['points on different holes', 'points', row(26, 11), row(23, 10), null],
    ['net strokes on the same holes', 'net', row(72, 18), row(74, 18), 2],
    ['net strokes on different holes', 'net', row(40, 10), row(36, 9), null],
    ['net to par across holes («thru»)', 'toPar', row(-1, 9), row(1, 14), 2],
    ['points against par pace across holes (#2625)', 'pointsToPar', row(3, 9), row(1, 14), 2],
    ['a row without a total', 'points', row(null, 0), row(25, 11), null],
  ] as const)('%s', (_label, unit, a, b, expected) => {
    expect(comparableGap(unit, a, b)).toBe(expected);
    expect(comparableGap(unit, b, a)).toBe(expected);
  });
});

describe('withoutLatestHolePerPlayer', () => {
  it('in a shotgun (#2286) the latest hole is the last one in the order played', () => {
    const rows = card('p', { 17: 4, 18: 4, 1: 4 });
    expect(withoutLatestHolePerPlayer(rows, 'full', 'shotgun').map((r) => r.hole_number)).toEqual([17, 18]);
    // First tee: the highest hole number is the latest (`card` lists holes in number order).
    expect(withoutLatestHolePerPlayer(rows).map((r) => r.hole_number)).toEqual([1, 17]);
  });

  it('drops each player’s highest played hole and keeps empty rows', () => {
    const rows = [
      { user_id: 'a', hole_number: 1, strokes: 4 },
      { user_id: 'a', hole_number: 3, strokes: 5 },
      { user_id: 'a', hole_number: 4, strokes: null },
      { user_id: 'b', hole_number: 2, strokes: 4 },
    ];
    expect(withoutLatestHolePerPlayer(rows)).toEqual([
      { user_id: 'a', hole_number: 1, strokes: 4 },
      { user_id: 'a', hole_number: 4, strokes: null },
    ]);
  });
});

describe('liveBoardStripAction — the strip’s button', () => {
  const playing = { submitted_at: null, approved_at: null, withdrawn_at: null };
  const base = {
    gameId: 'g1',
    status: 'active' as const,
    holeSegment: 'full' as const,
    requirePeerApproval: false,
    viewer: playing,
    viewerScores: card('me', { 1: 4, 2: 5, 3: null as unknown as number, 4: 4 }),
  };

  it('points to the first hole without strokes', () => {
    expect(liveBoardStripAction(base)).toEqual({
      kind: 'hole',
      holeNumber: 3,
      href: '/games/g1/holes/3',
    });
  });

  it('points to «Lever scorekort» when every hole in the segment is filled', () => {
    const allFront = card('me', Object.fromEntries(Array.from({ length: 9 }, (_, i) => [i + 1, 4])));
    expect(
      liveBoardStripAction({ ...base, holeSegment: 'front9', viewerScores: allFront }),
    ).toEqual({ kind: 'submit', href: '/games/g1/submit' });
  });

  it('has no button after delivery, also while waiting for approval', () => {
    const submitted = { ...playing, submitted_at: '2026-06-01T12:00:00Z' };
    expect(liveBoardStripAction({ ...base, viewer: submitted })).toEqual({ kind: 'none' });
    expect(
      liveBoardStripAction({ ...base, viewer: submitted, requirePeerApproval: true }),
    ).toEqual({ kind: 'none' });
  });

  it.each([
    ['an organizer who does not play', { viewer: undefined }],
    ['a withdrawn player', { viewer: { ...playing, withdrawn_at: '2026-06-01T12:00:00Z' } }],
    ['a scheduled game', { status: 'scheduled' as const }],
  ])('no strip for %s', (_label, overrides) => {
    expect(liveBoardStripAction({ ...base, ...overrides })).toBeNull();
  });
});

describe('liveBoardStripAction — a shotgun group (#2286)', () => {
  it('points on from the hole the group started on', () => {
    expect(
      liveBoardStripAction({
        gameId: 'g1',
        status: 'active',
        holeSegment: 'full',
        startType: 'shotgun',
        requirePeerApproval: false,
        viewer: { submitted_at: null, approved_at: null, withdrawn_at: null },
        viewerScores: card('me', { 10: 4, 11: 5 }),
      }),
    ).toEqual({ kind: 'hole', holeNumber: 12, href: '/games/g1/holes/12' });
  });
});
