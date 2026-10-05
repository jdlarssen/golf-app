import { describe, it, expect } from 'vitest';
import { computeLeaderboard } from '@/lib/scoring';
import { buildStablefordContext } from '@/lib/scoring/context/buildStablefordContext';
import type { GameModeConfig } from '@/lib/scoring/modes/types';
import {
  computeLiveBoard,
  liveBoardStripAction,
  viewerStanding,
  withoutLatestHolePerPlayer,
  type LiveBoard,
  type LiveBoardGame,
  type LiveBoardPlayerRow,
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

  it('shows fewer dots when fewer than five holes are played', () => {
    const b = board({ players: [player('p')], scores: card('p', { 1: 4, 2: 5 }) });
    expect(b.rows[0].recent).toEqual(['par', 'over1']);
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

describe('withoutLatestHolePerPlayer', () => {
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
