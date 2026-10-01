// Force the host timezone to UTC, as on the Vercel server: every day boundary
// below has to come from the Oslo calendar, not from local getters (#648).
process.env.TZ = 'UTC';

import { describe, it, expect } from 'vitest';
import {
  buildTerminEntries,
  capacityState,
  filterTermin,
  groupTerminByDate,
  parseTerminFilter,
  terminTimeNote,
  type GameSeats,
  type TerminEntry,
} from './terminliste';
import type {
  DiscoverableClubGame,
  DiscoverableFriendGame,
  DiscoverableOpenGame,
} from './getDiscoverableGames';
import type { GameModeConfig } from '@/lib/scoring/modes/types';

/**
 * Type A — the terminliste's pure rules (#2258): which button a row gets, how
 * rows are sorted and grouped into Oslo days, the filter chips, the capacity
 * line and the note under the clock.
 */

const STABLEFORD: GameModeConfig = { kind: 'stableford', team_size: 1, points_table: 'standard' };

function open(over: Partial<DiscoverableOpenGame> = {}): DiscoverableOpenGame {
  return {
    id: 'o1',
    name: 'Åpen runde',
    short_id: 'open0001',
    scheduled_tee_off_at: '2026-10-03T07:20:00Z',
    course_name: 'Byneset North',
    registration_mode: 'open',
    game_mode: 'stableford',
    mode_config: STABLEFORD,
    hole_segment: 'full',
    ...over,
  };
}

function club(over: Partial<DiscoverableClubGame> = {}): DiscoverableClubGame {
  return {
    id: 'c1',
    name: 'Klubbmesterskapet',
    short_id: 'club0001',
    scheduled_tee_off_at: '2026-10-03T07:20:00Z',
    course_name: 'Byneset North',
    registration_mode: 'invite_only',
    group_name: 'Byneset GK',
    game_mode: 'stableford',
    mode_config: STABLEFORD,
    hole_segment: 'full',
    ...over,
  };
}

function friend(over: Partial<DiscoverableFriendGame> = {}): DiscoverableFriendGame {
  return {
    id: 'f1',
    name: 'Fredagsrunden',
    short_id: 'frnd0001',
    scheduled_tee_off_at: '2026-10-03T07:20:00Z',
    course_name: 'Byneset South',
    registration_mode: 'manual_approval',
    joinMode: 'request',
    game_mode: 'stableford',
    mode_config: STABLEFORD,
    hole_segment: 'full',
    ...over,
  };
}

const NO_SEATS = new Map<string, GameSeats>();

function entry(over: Partial<TerminEntry> = {}): TerminEntry {
  return { ...buildTerminEntries({ openGames: [open()] }, NO_SEATS)[0], ...over };
}

// Thursday 1 Oct 2026, 12:00 Oslo (CEST).
const NOW = new Date('2026-10-01T10:00:00Z');

describe('buildTerminEntries — the button rule', () => {
  it('club rounds are always direct, whatever the registration mode (#442)', () => {
    const [e] = buildTerminEntries(
      { clubGames: [club({ registration_mode: 'manual_approval' })] },
      NO_SEATS,
    );
    expect(e).toMatchObject({ source: 'club', cta: 'direct' });
  });

  it("friends' rounds follow joinMode", () => {
    const entries = buildTerminEntries(
      {
        friendGames: [
          friend({ id: 'f1', joinMode: 'direct' }),
          friend({ id: 'f2', joinMode: 'request' }),
        ],
      },
      NO_SEATS,
    );
    expect(entries.map((e) => [e.id, e.source, e.cta])).toEqual([
      ['f1', 'friend', 'direct'],
      ['f2', 'friend', 'request'],
    ]);
  });

  it('open rounds ask for a seat under manual_approval, else sign up directly', () => {
    const entries = buildTerminEntries(
      {
        openGames: [
          open({ id: 'o1', registration_mode: 'open' }),
          open({ id: 'o2', registration_mode: 'manual_approval' }),
        ],
      },
      NO_SEATS,
    );
    expect(entries.map((e) => [e.id, e.source, e.cta])).toEqual([
      ['o1', 'open', 'direct'],
      ['o2', 'open', 'request'],
    ]);
  });

  it('one row per game: club beats friend beats open', () => {
    const entries = buildTerminEntries(
      {
        clubGames: [club({ id: 'g1' })],
        friendGames: [friend({ id: 'g1' }), friend({ id: 'g2' })],
        openGames: [open({ id: 'g1' }), open({ id: 'g2' }), open({ id: 'g3' })],
      },
      NO_SEATS,
    );
    expect(entries.map((e) => [e.id, e.source])).toEqual([
      ['g1', 'club'],
      ['g2', 'friend'],
      ['g3', 'open'],
    ]);
  });

  it('an empty feed gives no rows', () => {
    expect(buildTerminEntries({}, NO_SEATS)).toEqual([]);
  });
});

describe('buildTerminEntries — capacity and full', () => {
  it('a capped round carries its capacity; the rest carry null', () => {
    const seats = new Map<string, GameSeats>([['o1', { kind: 'capped', cap: 12, held: 7 }]]);
    const entries = buildTerminEntries(
      { openGames: [open({ id: 'o1' }), open({ id: 'o2' })] },
      seats,
    );
    expect(entries.map((e) => [e.id, e.capacity, e.full])).toEqual([
      ['o1', { cap: 12, held: 7 }, false],
      ['o2', null, false],
    ]);
  });

  it('a capped round with no free seat is full (held past the cap too)', () => {
    const seats = new Map<string, GameSeats>([
      ['o1', { kind: 'capped', cap: 12, held: 12 }],
      ['o2', { kind: 'capped', cap: 16, held: 18 }],
    ]);
    const entries = buildTerminEntries(
      { openGames: [open({ id: 'o1' }), open({ id: 'o2' })] },
      seats,
    );
    expect(entries.map((e) => e.full)).toEqual([true, true]);
  });

  it('a matchplay round is full only when both sides are, and has no capacity line', () => {
    const seats = new Map<string, GameSeats>([
      ['m1', { kind: 'matchplay', full: true }],
      ['m2', { kind: 'matchplay', full: false }],
    ]);
    const entries = buildTerminEntries(
      { openGames: [open({ id: 'm1' }), open({ id: 'm2' })] },
      seats,
    );
    expect(entries.map((e) => [e.id, e.capacity, e.full])).toEqual([
      ['m1', null, true],
      ['m2', null, false],
    ]);
  });
});

describe('groupTerminByDate', () => {
  it('no rows → no groups', () => {
    expect(groupTerminByDate([], NOW)).toEqual([]);
  });

  it('groups by Oslo day: 23:30 UTC lands on the next Oslo day', () => {
    const groups = groupTerminByDate(
      [
        entry({ id: 'a', scheduled_tee_off_at: '2026-10-02T21:30:00Z' }), // Fri 23:30 Oslo
        entry({ id: 'b', scheduled_tee_off_at: '2026-10-02T23:30:00Z' }), // Sat 01:30 Oslo
      ],
      NOW,
    );
    expect(groups.map((g) => [g.key, g.entries.map((e) => e.id)])).toEqual([
      ['2026-10-02', ['a']],
      ['2026-10-03', ['b']],
    ]);
  });

  it('sorts on tee-off, then name', () => {
    const groups = groupTerminByDate(
      [
        entry({ id: 'late', name: 'A', scheduled_tee_off_at: '2026-10-03T11:00:00Z' }),
        entry({ id: 'b', name: 'Bravo', scheduled_tee_off_at: '2026-10-03T07:20:00Z' }),
        entry({ id: 'a', name: 'Alfa', scheduled_tee_off_at: '2026-10-03T07:20:00Z' }),
      ],
      NOW,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].entries.map((e) => e.id)).toEqual(['a', 'b', 'late']);
  });

  it('labels today, tomorrow and every later day; a passed day has no label and comes first', () => {
    const groups = groupTerminByDate(
      [
        entry({ id: 'd11', scheduled_tee_off_at: '2026-10-12T15:30:00Z' }),
        entry({ id: 'd2', scheduled_tee_off_at: '2026-10-03T07:20:00Z' }),
        entry({ id: 'd1', scheduled_tee_off_at: '2026-10-02T07:20:00Z' }),
        entry({ id: 'd0', scheduled_tee_off_at: '2026-10-01T16:00:00Z' }),
        entry({ id: 'past', scheduled_tee_off_at: '2026-09-29T07:20:00Z' }),
      ],
      NOW,
    );
    expect(groups.map((g) => [g.key, g.kind === 'day' ? g.label : 'undated'])).toEqual([
      ['2026-09-29', null],
      ['2026-10-01', { kind: 'today' }],
      ['2026-10-02', { kind: 'tomorrow' }],
      ['2026-10-03', { kind: 'days', days: 2 }],
      ['2026-10-12', { kind: 'days', days: 11 }],
    ]);
  });

  it('rounds without a time (or with an unreadable one) come last in their own group', () => {
    const groups = groupTerminByDate(
      [
        entry({ id: 'none', name: 'B', scheduled_tee_off_at: null }),
        entry({ id: 'bad', name: 'A', scheduled_tee_off_at: 'not a date' }),
        entry({ id: 'dated', scheduled_tee_off_at: '2026-10-03T07:20:00Z' }),
      ],
      NOW,
    );
    expect(groups.map((g) => [g.kind, g.entries.map((e) => e.id)])).toEqual([
      ['day', ['dated']],
      ['undated', ['bad', 'none']],
    ]);
  });

  it('a day group keeps a tee-off of that day to format the heading from', () => {
    const [g] = groupTerminByDate(
      [entry({ scheduled_tee_off_at: '2026-10-03T07:20:00Z' })],
      NOW,
    );
    expect(g.kind === 'day' && g.teeOff).toBe('2026-10-03T07:20:00Z');
  });
});

describe('parseTerminFilter', () => {
  it.each([
    ['helg', 'helg'],
    ['klubb', 'klubb'],
    ['alle', 'alle'],
    ['tull', 'alle'],
    ['', 'alle'],
    [undefined, 'alle'],
    [null, 'alle'],
  ] as const)('%j → %s', (raw, expected) => {
    expect(parseTerminFilter(raw)).toBe(expected);
  });
});

describe('filterTermin', () => {
  const rows = [
    entry({ id: 'fri', source: 'open', scheduled_tee_off_at: '2026-10-02T10:00:00Z' }),
    entry({ id: 'sat', source: 'open', scheduled_tee_off_at: '2026-10-03T10:00:00Z' }),
    entry({ id: 'sun-club', source: 'club', scheduled_tee_off_at: '2026-10-04T10:00:00Z' }),
    entry({ id: 'next-club', source: 'club', scheduled_tee_off_at: '2026-10-10T10:00:00Z' }),
    entry({ id: 'undated-club', source: 'club', scheduled_tee_off_at: null }),
  ];

  it('«Alle» keeps everything', () => {
    expect(filterTermin(rows, 'alle', NOW)).toEqual(rows);
  });

  it('«Denne helga» keeps the coming Saturday and Sunday in Oslo', () => {
    expect(filterTermin(rows, 'helg', NOW).map((e) => e.id)).toEqual(['sat', 'sun-club']);
  });

  it('«Denne helga» on a Sunday keeps only today', () => {
    const sunday = new Date('2026-10-04T08:00:00Z');
    expect(filterTermin(rows, 'helg', sunday).map((e) => e.id)).toEqual(['sun-club']);
  });

  it('«Klubben min» keeps the club rounds, dated or not', () => {
    expect(filterTermin(rows, 'klubb', NOW).map((e) => e.id)).toEqual([
      'sun-club',
      'next-club',
      'undated-club',
    ]);
  });
});

describe('capacityState', () => {
  it('7 of 12 taken → 5 free, 58 % filled, normal', () => {
    const s = capacityState({ cap: 12, held: 7 });
    expect(s.free).toBe(5);
    expect(s.fillRatio).toBeCloseTo(0.58, 2);
    expect(s.tone).toBe('normal');
  });

  it('10 of 12 → 2 free, low', () => {
    expect(capacityState({ cap: 12, held: 10 })).toMatchObject({ free: 2, tone: 'low' });
  });

  it('11 of 12 → 1 free, low', () => {
    expect(capacityState({ cap: 12, held: 11 })).toMatchObject({ free: 1, tone: 'low' });
  });

  it('12 of 12 → 0 free, full, bar at 100 %', () => {
    expect(capacityState({ cap: 12, held: 12 })).toEqual({ free: 0, fillRatio: 1, tone: 'full' });
  });

  it('held past the cap is clamped: 0 free, bar at 100 %', () => {
    expect(capacityState({ cap: 16, held: 18 })).toEqual({ free: 0, fillRatio: 1, tone: 'full' });
  });

  it('no one yet → all free, empty bar', () => {
    expect(capacityState({ cap: 40, held: 0 })).toEqual({ free: 40, fillRatio: 0, tone: 'normal' });
  });

  it('a cap of 0 is full', () => {
    expect(capacityState({ cap: 0, held: 0 })).toEqual({ free: 0, fillRatio: 1, tone: 'full' });
  });
});

describe('terminTimeNote', () => {
  it('nine holes → «9 hull»', () => {
    expect(terminTimeNote({ hole_segment: 'front9' })).toBe('nine_holes');
    expect(terminTimeNote({ hole_segment: 'back9' })).toBe('nine_holes');
  });

  it('eighteen holes → nothing (start type arrives in PR 2)', () => {
    expect(terminTimeNote({ hole_segment: 'full' })).toBeNull();
  });
});
