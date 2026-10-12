import { describe, it, expect, vi } from 'vitest';
import type { LiveBoard, LiveBoardRow, LiveBoardUnit } from './liveBoard';
import {
  buildFollowView,
  followStorageKey,
  followSubtitle,
  forgetFollow,
  resolveFollowUserId,
  type FollowPlayerRow,
} from './followPlayer';

// Type A (#2286): following one player on the live link — which id the address
// gives, the lead over number two, the next hole, the flight and the stored
// choice. Ranks and totals come ready on the board (lib/leaderboard/liveBoard.ts).

function row(userId: string, o: Partial<LiveBoardRow> = {}): LiveBoardRow {
  return {
    userId,
    name: `Name ${userId}`,
    nickname: null,
    rank: 1,
    tied: false,
    total: 20,
    holesPlayed: 9,
    movement: null,
    recent: [],
    recentHoles: [],
    ...o,
  };
}

function board(rows: LiveBoardRow[], unit: LiveBoardUnit = 'points'): LiveBoard {
  return { unit, holesPlayed: 11, rows };
}

function player(userId: string, o: Partial<FollowPlayerRow> = {}): FollowPlayerRow {
  return {
    user_id: userId,
    flight_number: 1,
    submitted_at: null,
    withdrawn_at: null,
    tee_gender: 'mens',
    users: { name: `Name ${userId}`, nickname: null },
    ...o,
  };
}

// Par 4 everywhere; hole 12 is a par 5 from the ladies' tee.
const HOLES = Array.from({ length: 18 }, (_, i) => ({
  hole_number: i + 1,
  par_mens: 4,
  par_ladies: i + 1 === 12 ? 5 : 4,
  par_juniors: 4,
  stroke_index: i + 1,
}));

function scores(userId: string, holes: number[]) {
  return holes.map((h) => ({ user_id: userId, hole_number: h, strokes: 4 }));
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

function view(opts: {
  rows: LiveBoardRow[];
  userId: string;
  players?: FollowPlayerRow[];
  scoresRows?: ReturnType<typeof scores>;
  segment?: 'full' | 'front9' | 'back9';
  unit?: LiveBoardUnit;
}) {
  return buildFollowView({
    board: board(opts.rows, opts.unit),
    userId: opts.userId,
    players: opts.players ?? opts.rows.map((r) => player(r.userId)),
    holesRows: HOLES,
    scoresRows: opts.scoresRows ?? [],
    segment: opts.segment ?? 'full',
  });
}

describe('resolveFollowUserId', () => {
  it.each([
    ['a plain id', 'u1', 'u1'],
    ['a repeated parameter takes the first', ['u2', 'u3'], 'u2'],
    ['an empty value', '', null],
    ['no parameter', undefined, null],
    ['an empty list', [], null],
  ] as const)('%s', (_label, raw, expected) => {
    expect(resolveFollowUserId(raw as string | string[] | undefined)).toBe(expected);
  });
});

describe('buildFollowView — only a player on the board can be followed', () => {
  // The board has only players with a user who have not withdrawn.
  const rows = [row('a'), row('b', { rank: 2, total: 18 })];

  it.each([
    ['an unknown id', 'nope', [player('a'), player('b')]],
    ['a withdrawn player', 'w', [player('a'), player('b'), player('w', { withdrawn_at: '2026-10-12T10:00:00Z' })]],
    ['a player without a user', 'g', [player('a'), player('b'), player('g', { users: null })]],
  ])('%s gives null', (_label, userId, players) => {
    expect(view({ rows, userId, players })).toBeNull();
  });
});

describe('buildFollowView — the lead over number two (O6)', () => {
  it('a sole leader leads by the gap to number two', () => {
    const v = view({
      rows: [row('a', { total: 26, holesPlayed: 11 }), row('b', { rank: 2, total: 25, holesPlayed: 11 })],
      userId: 'a',
    });
    expect(v?.lead).toBe(1);
    expect(v?.standing).toMatchObject({ rank: 1, tied: false, gap: null });
  });

  it('no lead when number two has played a different number of holes', () => {
    const v = view({
      rows: [row('a', { total: 26, holesPlayed: 11 }), row('b', { rank: 2, total: 23, holesPlayed: 10 })],
      userId: 'a',
    });
    expect(v?.lead).toBeNull();
  });

  it('a shared lead has no lead number', () => {
    const v = view({
      rows: [
        row('a', { tied: true, total: 26 }),
        row('b', { tied: true, total: 26 }),
        row('c', { rank: 3, total: 20 }),
      ],
      userId: 'a',
    });
    expect(v?.lead).toBeNull();
    expect(v?.standing).toMatchObject({ rank: 1, tied: true });
  });

  it('equal totals split on countback: no line for either (gap 0)', () => {
    const rows = [row('a', { total: 26 }), row('b', { rank: 2, total: 26 })];
    expect(view({ rows, userId: 'a' })?.lead).toBeNull();
    const second = view({ rows, userId: 'b' });
    expect(second?.lead).toBeNull();
    expect(second?.standing.gap).toBe(0);
  });

  it('a shared second place: the lead is over all of them', () => {
    const rows = [
      row('a', { total: 28 }),
      row('b', { rank: 2, tied: true, total: 26 }),
      row('c', { rank: 2, tied: true, total: 26 }),
    ];
    expect(view({ rows, userId: 'a' })?.lead).toBe(2);

    const uneven = rows.map((r) => (r.userId === 'c' ? { ...r, holesPlayed: 8 } : r));
    expect(view({ rows: uneven, userId: 'a' })?.lead).toBeNull();
  });

  it('no lead when number two has not played a hole', () => {
    const v = view({
      rows: [row('a', { total: 3, holesPlayed: 1 }), row('b', { rank: 2, total: null, holesPlayed: 0 })],
      userId: 'a',
    });
    expect(v?.lead).toBeNull();
  });

  it('no lead without anyone behind', () => {
    expect(view({ rows: [row('a')], userId: 'a' })?.lead).toBeNull();
  });

  it('behind one leader: no lead, the standing carries the gap', () => {
    const v = view({
      rows: [row('a', { total: 26 }), row('b', { rank: 2, total: 24 })],
      userId: 'b',
    });
    expect(v?.lead).toBeNull();
    expect(v?.standing).toMatchObject({ rank: 2, gap: 2, leaderUserIds: ['a'] });
  });

  it('net to par compares across holes', () => {
    const v = view({
      rows: [row('a', { total: -2, holesPlayed: 9 }), row('b', { rank: 2, total: 1, holesPlayed: 14 })],
      userId: 'a',
      unit: 'toPar',
    });
    expect(v?.lead).toBe(3);
  });
});

describe('buildFollowView — the next hole', () => {
  const rows = [row('a')];

  it('takes the first hole without strokes, also after a skipped hole', () => {
    expect(view({ rows, userId: 'a', scoresRows: scores('a', [1, 2, 4]) })?.next).toEqual({
      kind: 'hole',
      holeNumber: 3,
      par: 4,
    });
  });

  it('a row without strokes is not a played hole', () => {
    const v = view({
      rows,
      userId: 'a',
      scoresRows: [...scores('a', [1]), { user_id: 'a', hole_number: 2, strokes: null as unknown as number }],
    });
    expect(v?.next).toEqual({ kind: 'hole', holeNumber: 2, par: 4 });
  });

  it('only counts the followed player’s own holes', () => {
    const v = view({
      rows: [row('a'), row('b', { rank: 2 })],
      userId: 'a',
      scoresRows: [...scores('a', [1, 2]), ...scores('b', range(1, 9))],
    });
    expect(v?.next).toEqual({ kind: 'hole', holeNumber: 3, par: 4 });
  });

  it('uses the ladies’ par for a player on the ladies’ tee', () => {
    const v = view({
      rows,
      userId: 'a',
      players: [player('a', { tee_gender: 'ladies' })],
      scoresRows: scores('a', range(1, 11)),
    });
    expect(v?.next).toEqual({ kind: 'hole', holeNumber: 12, par: 5 });
  });

  it.each([
    ['back9 starts at 10', 'back9', [10, 11], { kind: 'hole', holeNumber: 12, par: 4 }],
    ['front9 is done after 9', 'front9', range(1, 9), { kind: 'allPlayed' }],
    ['every hole of the round', 'full', range(1, 18), { kind: 'allPlayed' }],
  ] as const)('%s', (_label, segment, holes, expected) => {
    expect(view({ rows, userId: 'a', segment, scoresRows: scores('a', [...holes]) })?.next).toEqual(expected);
  });

  it('a submitted card wins, even with holes left', () => {
    const v = view({
      rows,
      userId: 'a',
      players: [player('a', { submitted_at: '2026-10-12T12:00:00Z' })],
      scoresRows: scores('a', range(1, 5)),
    });
    expect(v?.next).toEqual({ kind: 'submitted' });
  });

  it('no holes played yet', () => {
    expect(view({ rows, userId: 'a' })?.next).toEqual({ kind: 'notStarted' });
  });
});

describe('buildFollowView — the newest hole’s moment', () => {
  const hole = (holeNumber: number, gross: number, par = 4) => ({ holeNumber, gross, par, points: null, net: null });

  it.each([
    ['a birdie on the newest hole', [hole(10, 4), hole(11, 3)], 'birdie'],
    ['par on the newest hole, a birdie before it', [hole(10, 3), hole(11, 4)], null],
    ['no holes', [], null],
  ] as const)('%s', (_label, recentHoles, expected) => {
    expect(view({ rows: [row('a', { recentHoles: [...recentHoles] })], userId: 'a' })?.moment).toBe(expected);
  });
});

describe('buildFollowView — «Følg en annen» (O7)', () => {
  it('the flight in board order, the followed player first', () => {
    const rows = [row('d'), row('a', { rank: 2 }), row('c', { rank: 3 }), row('b', { rank: 4 })];
    const players = [
      player('a', { flight_number: 1 }),
      player('b', { flight_number: 1 }),
      player('c', { flight_number: 2 }),
      player('d', { flight_number: 2 }),
    ];
    expect(view({ rows, userId: 'c', players })?.others.map((o) => o.row.userId)).toEqual(['c', 'd']);
    expect(view({ rows, userId: 'b', players })?.others.map((o) => o.row.userId)).toEqual(['b', 'a']);
  });

  it('everyone on the board when the followed player has no flight', () => {
    const rows = [row('a'), row('b', { rank: 2 }), row('c', { rank: 3 })];
    const players = [
      player('a', { flight_number: 1 }),
      player('b', { flight_number: null }),
      player('c', { flight_number: 2 }),
    ];
    expect(view({ rows, userId: 'b', players })?.others.map((o) => o.row.userId)).toEqual(['b', 'a', 'c']);
  });

  it('never a player who is not on the board', () => {
    const rows = [row('a'), row('b', { rank: 2 })];
    const players = [player('a'), player('b'), player('w', { withdrawn_at: '2026-10-12T10:00:00Z' })];
    expect(view({ rows, userId: 'a', players })?.others.map((o) => o.row.userId)).toEqual(['a', 'b']);
  });

  it('a shared first name shows the full name on both buttons', () => {
    const rows = [
      row('a', { name: 'Anders Berg' }),
      row('b', { rank: 2, name: 'Anders Dahl' }),
      row('c', { rank: 3, name: 'Marte Lie' }),
    ];
    expect(view({ rows, userId: 'c' })?.others.map((o) => [o.row.userId, o.fullName])).toEqual([
      ['c', false],
      ['a', true],
      ['b', true],
    ]);

    const distinct = [row('a', { name: 'Anders Berg' }), row('b', { rank: 2, name: 'Marte Lie' })];
    expect(view({ rows: distinct, userId: 'a' })?.others.map((o) => o.fullName)).toEqual([false, false]);
  });

  it('a row without a name never asks for the full name', () => {
    const rows = [row('a', { name: null }), row('b', { rank: 2, name: null })];
    expect(view({ rows, userId: 'a' })?.others.map((o) => o.fullName)).toEqual([false, false]);
  });
});

describe('followSubtitle (O4)', () => {
  it.each([
    ['game and course', 'Lørdagsrunden', 'Byneset North', 'Lørdagsrunden · Byneset North'],
    ['an auto name that starts with the course', 'Byneset North 12. oktober', 'Byneset North', 'Byneset North 12. oktober'],
    ['no course', 'Lørdagsrunden', null, 'Lørdagsrunden'],
  ] as const)('%s', (_label, game, course, expected) => {
    expect(followSubtitle(game, course)).toBe(expected);
  });
});

describe('the stored choice', () => {
  it('has one key per live link', () => {
    expect(followStorageKey('tok123')).toBe('torny:folg:tok123');
  });

  it('forgetFollow removes the key', () => {
    const removeItem = vi.fn();
    forgetFollow('tok123', () => ({ removeItem }) as unknown as Storage);
    expect(removeItem).toHaveBeenCalledWith('torny:folg:tok123');
  });

  it('forgetFollow survives a storage that throws', () => {
    expect(() =>
      forgetFollow('tok123', () => {
        throw new Error('SecurityError');
      }),
    ).not.toThrow();
    expect(() =>
      forgetFollow('tok123', () => ({ removeItem: () => { throw new Error('blocked'); } }) as unknown as Storage),
    ).not.toThrow();
  });
});
