import { describe, it, expect } from 'vitest';
import type { LiveBoardRow } from './liveBoard';
import type { CourseHoleRow } from '@/lib/supabase/queryFragments';
import {
  TV_FEED_MAX,
  TV_ROWS_PER_PAGE,
  buildTvFeed,
  tvPageCount,
  tvPageRows,
  type TvFeedPlayer,
  type TvFeedScore,
} from './tvBoard';

// Type A (#2275): the big screen's own logic — pages of five and «Siste nytt».
// Ranks, totals and movement come from computeLiveBoard and are tested there.

function row(userId: string, overrides: Partial<LiveBoardRow> = {}): LiveBoardRow {
  return {
    userId,
    name: `Spiller ${userId}`,
    nickname: null,
    rank: 2,
    tied: false,
    total: 10,
    holesPlayed: 3,
    movement: 0,
    recent: [],
    recentHoles: [],
    ...overrides,
  };
}

function rows(count: number): LiveBoardRow[] {
  return Array.from({ length: count }, (_, i) => row(`u${i + 1}`, { rank: i + 1 }));
}

/** Holes 1–18; hole 5 is par 5 for men and par 4 for ladies. */
const HOLES: CourseHoleRow[] = Array.from({ length: 18 }, (_, i) => ({
  hole_number: i + 1,
  par_mens: i + 1 === 5 ? 5 : 4,
  par_ladies: 4,
  par_juniors: 4,
  stroke_index: i + 1,
}));

function player(userId: string, overrides: Partial<TvFeedPlayer> = {}): TvFeedPlayer {
  return { user_id: userId, tee_gender: 'mens', flight_number: null, submitted_at: null, ...overrides };
}

/** A minute past 13:00 UTC on a fixed day — ordering only, never compared with now. */
const at = (minute: number) => `2026-10-12T13:${String(minute).padStart(2, '0')}:00+00:00`;

function score(userId: string, hole: number, strokes: number | null, minute: number): TvFeedScore {
  return { user_id: userId, hole_number: hole, strokes, updated_at: at(minute) };
}

const recentHole = (holeNumber: number) => ({ holeNumber, gross: 4, par: 4, points: 2, net: null });

describe('tvPageCount / tvPageRows', () => {
  it.each([
    [0, 1, [0]],
    [1, 1, [1]],
    [5, 1, [5]],
    [6, 2, [5, 1]],
    [14, 3, [5, 5, 4]],
  ])('%i rows → %i pages of %j', (count, pages, sizes) => {
    const all = rows(count);
    expect(tvPageCount(count)).toBe(pages);
    expect(sizes.map((_, i) => tvPageRows(all, i).length)).toEqual(sizes);
  });

  it('the 14-row board pages in order, five at a time', () => {
    const all = rows(14);
    expect(tvPageRows(all, 1).map((r) => r.userId)).toEqual(['u6', 'u7', 'u8', 'u9', 'u10']);
    expect(TV_ROWS_PER_PAGE).toBe(5);
  });

  it('an index left over after the board shrank wraps around instead of showing an empty page', () => {
    // On page 3 of 14 rows; a refresh brings 6 rows (2 pages): index 2 → page 1.
    expect(tvPageRows(rows(6), 2).map((r) => r.userId)).toEqual(['u1', 'u2', 'u3', 'u4', 'u5']);
    expect(tvPageRows(rows(6), 3).map((r) => r.userId)).toEqual(['u6']);
  });
});

describe('buildTvFeed', () => {
  const feed = (opts: {
    rows: LiveBoardRow[];
    players?: TvFeedPlayer[];
    scoresRows?: TvFeedScore[];
  }) =>
    buildTvFeed({
      rows: opts.rows,
      players: opts.players ?? opts.rows.map((r) => player(r.userId)),
      holesRows: HOLES,
      scoresRows: opts.scoresRows ?? [],
    });

  it('a player alone on first place who moved up took the lead on the hole just played', () => {
    const events = feed({
      rows: [
        row('marte', { rank: 1, movement: 1, recentHoles: [recentHole(10), recentHole(11)] }),
        row('jonas', { rank: 2, movement: -1 }),
      ],
      scoresRows: [score('marte', 10, 4, 1), score('marte', 11, 4, 7), score('jonas', 11, 4, 9)],
    });

    expect(events).toEqual([{ kind: 'lead', userId: 'marte', hole: 11, at: at(7) }]);
  });

  it('the lead names the hole the player played last, also when a shotgun group wraps to hole 1', () => {
    // Started on 17: played 17, 18, 1 — the last hole is 1, not 18.
    const events = feed({
      rows: [
        row('marte', {
          rank: 1,
          movement: 2,
          recentHoles: [recentHole(17), recentHole(18), recentHole(1)],
        }),
      ],
      scoresRows: [score('marte', 17, 4, 1), score('marte', 18, 4, 2), score('marte', 1, 4, 3)],
    });

    expect(events).toEqual([{ kind: 'lead', userId: 'marte', hole: 1, at: at(3) }]);
  });

  it.each([
    ['a shared first place', { rank: 1, tied: true, movement: 1 }, { rank: 1, tied: true, movement: 1 }],
    ['no movement', { rank: 1, movement: 0 }, { rank: 2 }],
    ['movement not shown yet', { rank: 1, movement: null }, { rank: 2 }],
  ] as const)('no lead event on %s', (_, a, b) => {
    const events = feed({
      rows: [
        row('marte', { ...a, recentHoles: [recentHole(10), recentHole(11)] }),
        row('jonas', { ...b, recentHoles: [recentHole(11)] }),
      ],
      scoresRows: [score('marte', 11, 4, 7), score('jonas', 11, 4, 8)],
    });

    expect(events).toEqual([]);
  });

  it.each([
    [3, 'birdie'],
    [2, 'eagle'],
    [1, 'holeInOne'],
  ] as const)('%i strokes on a par 4 is one %s event', (strokes, kind) => {
    const events = feed({
      rows: [row('anders')],
      scoresRows: [score('anders', 10, strokes, 5)],
    });

    expect(events).toEqual([{ kind, userId: 'anders', hole: 10, at: at(5) }]);
  });

  it('two strokes on a par 5 is an albatross, its own event', () => {
    const events = feed({ rows: [row('anders')], scoresRows: [score('anders', 5, 2, 5)] });

    expect(events).toEqual([{ kind: 'albatross', userId: 'anders', hole: 5, at: at(5) }]);
  });

  it("a lady's birdie is measured against the ladies' par", () => {
    // Hole 5: par 5 for men, par 4 for ladies. Three strokes: eagle for him, birdie for her.
    const events = feed({
      rows: [row('kari'), row('ola')],
      players: [player('kari', { tee_gender: 'ladies' }), player('ola', { tee_gender: 'mens' })],
      scoresRows: [score('kari', 5, 3, 4), score('ola', 5, 3, 3)],
    });

    expect(events).toEqual([
      { kind: 'birdie', userId: 'kari', hole: 5, at: at(4) },
      { kind: 'eagle', userId: 'ola', hole: 5, at: at(3) },
    ]);
  });

  it('skips holes without strokes and players who are not on the board (withdrawn)', () => {
    const events = feed({
      rows: [row('anders')],
      players: [player('anders'), player('trukket')],
      scoresRows: [score('anders', 10, null, 5), score('trukket', 10, 3, 6)],
    });

    expect(events).toEqual([]);
  });

  it('a flight is done when everyone on the board in it has handed in; the time is the last one', () => {
    const events = feed({
      rows: [row('a'), row('b'), row('c')],
      players: [
        player('a', { flight_number: 3, submitted_at: at(10) }),
        player('b', { flight_number: 3, submitted_at: at(12) }),
        player('c', { flight_number: 4, submitted_at: at(11) }),
        // Withdrawn: not on the board, so flight 4 is done with c alone.
        player('trukket', { flight_number: 4 }),
      ],
    });

    expect(events).toEqual([
      { kind: 'flightDone', flight: 3, at: at(12) },
      { kind: 'flightDone', flight: 4, at: at(11) },
    ]);
  });

  it('no flight event while one player is missing, or without a flight number', () => {
    const events = feed({
      rows: [row('a'), row('b'), row('c')],
      players: [
        player('a', { flight_number: 3, submitted_at: at(10) }),
        player('b', { flight_number: 3, submitted_at: null }),
        player('c', { flight_number: null, submitted_at: at(11) }),
      ],
    });

    expect(events).toEqual([]);
  });

  it('newest first; on the same time the lead, then under par from the highest hole, then flights', () => {
    const events = feed({
      rows: [
        row('marte', { rank: 1, movement: 1, recentHoles: [recentHole(11)] }),
        row('anders'),
        row('jonas'),
      ],
      players: [
        player('marte'),
        player('anders', { flight_number: 2, submitted_at: at(20) }),
        player('jonas'),
      ],
      scoresRows: [
        score('marte', 11, 4, 20),
        score('anders', 9, 3, 20),
        score('jonas', 12, 3, 20),
        score('jonas', 2, 3, 1),
      ],
    });

    expect(events.map((e) => e.kind)).toEqual(['lead', 'birdie', 'birdie', 'flightDone']);
    expect(events[1]).toMatchObject({ userId: 'jonas', hole: 12 });
    expect(events[2]).toMatchObject({ userId: 'anders', hole: 9 });
  });

  it('keeps the four newest events', () => {
    const events = feed({
      rows: [row('anders')],
      scoresRows: [1, 2, 3, 4, 5, 6].map((hole) => score('anders', hole, 3, hole)),
    });

    expect(TV_FEED_MAX).toBe(4);
    expect(events.map((e) => ('hole' in e ? e.hole : null))).toEqual([6, 5, 4, 3]);
  });
});
