// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  buildRegisterRows,
  filterRegister,
  registerMatchesSearch,
  sortRegister,
  tallyRounds,
  type RegisterRow,
  type RegisterUser,
  type RoundRow,
} from './playerRegister';

// The server runs in UTC on Vercel; every date rule here must hold there.
const originalTz = process.env.TZ;
beforeAll(() => {
  process.env.TZ = 'UTC';
});
afterAll(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

function round(
  userId: string,
  teeOff: string | null,
  endedAt: string | null = null,
): RoundRow {
  return {
    user_id: userId,
    games: { scheduled_tee_off_at: teeOff, ended_at: endedAt },
  };
}

function user(id: string, over: Partial<RegisterUser> = {}): RegisterUser {
  return {
    id,
    name: `Spiller ${id}`,
    nickname: null,
    email: `${id}@example.com`,
    hcp_index: 10,
    is_admin: false,
    is_guest: false,
    created_at: '2026-01-01T10:00:00Z',
    ...over,
  };
}

function row(id: string, over: Partial<RegisterRow> = {}): RegisterRow {
  return {
    ...user(id),
    rounds: 0,
    lastPlayedAt: null,
    playedThisYear: false,
    lastPlayedLabel: null,
    ...over,
  };
}

describe('tallyRounds', () => {
  it('counts rounds per player and keeps the latest date', () => {
    const tally = tallyRounds([
      round('a', '2026-06-01T08:00:00Z'),
      round('a', '2026-07-01T08:00:00Z'),
      round('b', '2026-05-01T08:00:00Z'),
    ]);
    expect(tally.get('a')).toEqual({ rounds: 2, lastPlayedAt: '2026-07-01T08:00:00.000Z' });
    expect(tally.get('b')).toEqual({ rounds: 1, lastPlayedAt: '2026-05-01T08:00:00.000Z' });
    expect(tally.get('c')).toBeUndefined();
  });

  it('dates a round by tee-off before the end time', () => {
    const tally = tallyRounds([round('a', '2026-06-01T08:00:00Z', '2026-06-02T09:00:00Z')]);
    expect(tally.get('a')?.lastPlayedAt).toBe('2026-06-01T08:00:00.000Z');
  });

  it('falls back to the end time when no tee-off was scheduled', () => {
    const tally = tallyRounds([round('a', null, '2026-06-02T09:00:00Z')]);
    expect(tally.get('a')?.lastPlayedAt).toBe('2026-06-02T09:00:00.000Z');
  });

  it('counts an undated round without moving the date', () => {
    const tally = tallyRounds([
      round('a', null, null),
      round('a', '2026-06-01T08:00:00Z'),
      round('b', null, null),
    ]);
    expect(tally.get('a')).toEqual({ rounds: 2, lastPlayedAt: '2026-06-01T08:00:00.000Z' });
    expect(tally.get('b')).toEqual({ rounds: 1, lastPlayedAt: null });
  });

  it('is empty for no rows', () => {
    expect(tallyRounds([]).size).toBe(0);
  });
});

describe('buildRegisterRows', () => {
  const now = new Date('2026-10-29T10:00:00Z');
  const label = (iso: string | null, rounds = 1, locale: 'no' | 'en' = 'no') => {
    const tally = new Map([['a', { rounds, lastPlayedAt: iso }]]);
    return buildRegisterRows([user('a')], tally, now, locale, 'Spilte i dag')[0];
  };

  it('says «Spilte i dag» for the same Oslo day, even across the UTC date line', () => {
    // Oslo is UTC+1 after the DST switch on 25 Oct: 23:30 UTC on the 28th is 00:30 Oslo on the 29th.
    expect(label('2026-10-28T23:30:00Z').lastPlayedLabel).toBe('Spilte i dag');
  });

  it('shows day and month for an earlier day this year', () => {
    expect(label('2026-09-21T08:00:00Z').lastPlayedLabel).toBe('21. sep');
  });

  it('adds the year when the Oslo year differs', () => {
    expect(label('2025-06-12T08:00:00Z').lastPlayedLabel).toBe('12. jun 2025');
  });

  it('has no label without a date, and a player with only undated rounds is not "this year"', () => {
    const r = label(null, 3);
    expect(r.lastPlayedLabel).toBeNull();
    expect(r.rounds).toBe(3);
    expect(r.playedThisYear).toBe(false);
  });

  it('gives a player who never played zero rounds', () => {
    const r = buildRegisterRows([user('z')], new Map(), now, 'no', 'Spilte i dag')[0];
    expect(r).toMatchObject({ rounds: 0, lastPlayedAt: null, lastPlayedLabel: null, playedThisYear: false });
  });

  it('counts 31 Dec 23:30 UTC as the new Oslo year', () => {
    const nowJan = new Date('2027-03-01T10:00:00Z');
    const tally = new Map([['a', { rounds: 1, lastPlayedAt: '2026-12-31T23:30:00.000Z' }]]);
    const [r] = buildRegisterRows([user('a')], tally, nowJan, 'no', 'Spilte i dag');
    expect(r.playedThisYear).toBe(true);
    expect(r.lastPlayedLabel).toBe('1. jan');
  });

  it('keeps 31 Dec 22:30 UTC in the old year', () => {
    const nowJan = new Date('2027-03-01T10:00:00Z');
    const tally = new Map([['a', { rounds: 1, lastPlayedAt: '2026-12-31T22:30:00.000Z' }]]);
    const [r] = buildRegisterRows([user('a')], tally, nowJan, 'no', 'Spilte i dag');
    expect(r.playedThisYear).toBe(false);
  });
});

describe('sortRegister', () => {
  it('orders dated, then undated-only, then never-played, each as specified', () => {
    const rows = [
      row('never-old', { created_at: '2026-01-01T00:00:00Z' }),
      row('dated-old', { rounds: 1, lastPlayedAt: '2026-05-01T08:00:00.000Z' }),
      row('undated-new', { rounds: 2, created_at: '2026-03-01T00:00:00Z' }),
      row('never-new', { created_at: '2026-09-01T00:00:00Z' }),
      row('dated-new', { rounds: 4, lastPlayedAt: '2026-10-01T08:00:00.000Z' }),
      row('undated-old', { rounds: 1, created_at: '2026-02-01T00:00:00Z' }),
    ];
    expect(sortRegister(rows).map((r) => r.id)).toEqual([
      'dated-new',
      'dated-old',
      'undated-new',
      'undated-old',
      'never-new',
      'never-old',
    ]);
  });

  it('breaks ties by id so the order is stable', () => {
    const rows = [
      row('b', { rounds: 1, lastPlayedAt: '2026-05-01T08:00:00.000Z' }),
      row('a', { rounds: 1, lastPlayedAt: '2026-05-01T08:00:00.000Z' }),
    ];
    expect(sortRegister(rows).map((r) => r.id)).toEqual(['a', 'b']);
    expect(sortRegister([...rows].reverse()).map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('does not mutate its input', () => {
    const rows = [row('b'), row('a')];
    sortRegister(rows);
    expect(rows.map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('is empty for no rows', () => {
    expect(sortRegister([])).toEqual([]);
  });
});

describe('filterRegister', () => {
  const rows = [
    row('a', { playedThisYear: true }),
    row('b', { is_guest: true }),
    row('c', { is_guest: true, playedThisYear: true }),
  ];

  it.each([
    ['alle', ['a', 'b', 'c']],
    ['spilt-i-aar', ['a', 'c']],
    ['gjester', ['b', 'c']],
  ] as const)('filter %s', (filter, ids) => {
    expect(filterRegister(rows, filter).map((r) => r.id)).toEqual(ids);
  });
});

describe('registerMatchesSearch', () => {
  const r = row('a', {
    name: 'Kari Nordmann',
    nickname: 'Kosken',
    email: 'Kari.N@Example.com',
  });

  it.each([
    ['', true],
    ['   ', true],
    ['kari', true],
    ['  NORDMANN ', true],
    ['kosk', true],
    ['example.com', true],
    ['ola', false],
  ])('query %j → %s', (q, expected) => {
    expect(registerMatchesSearch(r, q)).toBe(expected);
  });

  it('handles a player without a name', () => {
    expect(registerMatchesSearch(row('a', { name: null, nickname: null }), 'a@example')).toBe(true);
  });
});
