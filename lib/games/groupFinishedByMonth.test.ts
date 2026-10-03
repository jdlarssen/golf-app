// Force UTC as host timezone, as on Vercel, so the Oslo-midnight cases below
// would fall in the wrong month with local date getters (#2339).
process.env.TZ = 'UTC';

import { describe, it, expect } from 'vitest';
import { groupFinishedByMonth } from './groupFinishedByMonth';
import type { FinishedGame } from './getFinishedGamesForUser';

// The grouping only reads `id` and `ended_at`; the mode fields are irrelevant
// to bucketing, so the fixture stubs them via an unknown-cast.
function fg(id: string, ended_at: string | null): FinishedGame {
  return {
    id,
    name: `Game ${id}`,
    ended_at,
    game_mode: 'solo_strokeplay',
    mode_config: {},
    courses: null,
  } as unknown as FinishedGame;
}

describe('groupFinishedByMonth', () => {
  it('buckets by month in first-seen (newest-first) order', () => {
    // As getFinishedGamesForUser returns: already sorted newest `ended_at` first.
    const groups = groupFinishedByMonth(
      [
        fg('a', '2026-06-12T10:00:00Z'),
        fg('b', '2026-06-03T10:00:00Z'),
        fg('c', '2026-05-20T10:00:00Z'),
      ],
      'no',
      'Uten dato',
    );

    expect(groups.map((g) => g.key)).toEqual(['2026-06', '2026-05']);
    expect(groups[0].games.map((g) => g.id)).toEqual(['a', 'b']);
    expect(groups[1].games.map((g) => g.id)).toEqual(['c']);
  });

  it('labels months locale-aware («juni 2026» / "June 2026")', () => {
    const [no] = groupFinishedByMonth(
      [fg('a', '2026-06-12T10:00:00Z')],
      'no',
      'Uten dato',
    );
    expect(no.label).toBe('juni 2026');
    const [en] = groupFinishedByMonth(
      [fg('a', '2026-06-12T10:00:00Z')],
      'en',
      'No date',
    );
    expect(en.label).toBe('June 2026');
  });

  it('uses the supplied label for the trailing dateless bucket', () => {
    const groups = groupFinishedByMonth(
      [fg('a', '2026-06-12T10:00:00Z'), fg('b', null), fg('c', null)],
      'no',
      'Uten dato',
    );

    expect(groups.map((g) => g.key)).toEqual(['2026-06', 'no-date']);
    const last = groups[groups.length - 1];
    expect(last.label).toBe('Uten dato');
    expect(last.games.map((g) => g.id)).toEqual(['b', 'c']);
  });

  it('returns an empty array when there are no games', () => {
    expect(groupFinishedByMonth([], 'no', 'Uten dato')).toEqual([]);
  });

  // #2339: a round that ends just after midnight Oslo belongs to the Oslo
  // month, also on a UTC server.
  it.each([
    ['2026-06-30T22:30:00Z', 'no', '2026-07', 'juli 2026'],
    ['2026-06-30T22:30:00Z', 'en', '2026-07', 'July 2026'],
    ['2026-12-31T23:30:00Z', 'no', '2027-01', 'januar 2027'],
  ] as const)('puts %s (%s) in the Oslo month %s', (endedAt, locale, key, label) => {
    const [group] = groupFinishedByMonth([fg('a', endedAt)], locale, 'Uten dato');
    expect(group.key).toBe(key);
    expect(group.label).toBe(label);
  });
});
