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
    const groups = groupFinishedByMonth([
      fg('a', '2026-06-12T10:00:00Z'),
      fg('b', '2026-06-03T10:00:00Z'),
      fg('c', '2026-05-20T10:00:00Z'),
    ]);

    expect(groups.map((g) => g.key)).toEqual(['2026-06', '2026-05']);
    expect(groups[0].games.map((g) => g.id)).toEqual(['a', 'b']);
    expect(groups[1].games.map((g) => g.id)).toEqual(['c']);
  });

  it('labels months via formatMonthLongNb («juni 2026»)', () => {
    const [group] = groupFinishedByMonth([fg('a', '2026-06-12T10:00:00Z')]);
    expect(group.label).toBe('juni 2026');
  });

  it('collects null-dated games in a trailing «Uten dato» bucket', () => {
    const groups = groupFinishedByMonth([
      fg('a', '2026-06-12T10:00:00Z'),
      fg('b', null),
      fg('c', null),
    ]);

    expect(groups.map((g) => g.key)).toEqual(['2026-06', 'no-date']);
    const last = groups[groups.length - 1];
    expect(last.label).toBe('Uten dato');
    expect(last.games.map((g) => g.id)).toEqual(['b', 'c']);
  });

  it('returns an empty array when there are no games', () => {
    expect(groupFinishedByMonth([])).toEqual([]);
  });
});
