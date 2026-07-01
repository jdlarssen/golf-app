import { describe, it, expect } from 'vitest';
import { buildCourseArrays, mapSideWinners } from './sideTournamentInput';
import type { SideWinnerRow } from '@/app/[locale]/games/[id]/leaderboard/leaderboardTypes';

// Dense 18-hole course fixture: par cycles 3/4/5, SI = hole number reversed
// enough to be non-trivial (SI = 19 - holeNumber → SI 1 on hole 18).
const dense = Array.from({ length: 18 }, (_, i) => ({
  holeNumber: i + 1,
  par: [3, 4, 5][i % 3],
  strokeIndex: 19 - (i + 1),
}));

describe('buildCourseArrays', () => {
  it('builds dense 18-element arrays indexed by hole-1', () => {
    const { coursePars, courseStrokeIndices, siByHole } = buildCourseArrays(dense);
    expect(coursePars).toHaveLength(18);
    expect(courseStrokeIndices).toHaveLength(18);
    // coursePars[0] is hole 1's par.
    expect(coursePars[0]).toBe(3);
    expect(coursePars[1]).toBe(4);
    expect(coursePars[2]).toBe(5);
    // courseStrokeIndices[17] is hole 18's SI (= 1 here).
    expect(courseStrokeIndices[17]).toBe(1);
    expect(siByHole.get(18)).toBe(1);
    expect(siByHole.size).toBe(18);
  });

  it('resolves by hole-number regardless of row order', () => {
    const shuffled = [dense[5], dense[0], dense[17], ...dense.slice(1, 5), ...dense.slice(6, 17)];
    const { coursePars, courseStrokeIndices } = buildCourseArrays(shuffled);
    // Same result as the sorted input — position in the array follows hole-number.
    expect(coursePars).toEqual(buildCourseArrays(dense).coursePars);
    expect(courseStrokeIndices).toEqual(buildCourseArrays(dense).courseStrokeIndices);
  });

  it('falls back to par 4 and SI = hole-number for missing holes', () => {
    // Drop hole 5 (index 4).
    const sparse = dense.filter((h) => h.holeNumber !== 5);
    const { coursePars, courseStrokeIndices, siByHole } = buildCourseArrays(sparse);
    expect(coursePars[4]).toBe(4); // par fallback
    expect(courseStrokeIndices[4]).toBe(5); // SI fallback = the hole's own number
    expect(siByHole.has(5)).toBe(false); // raw map leaves the gap (no baked fallback)
  });

  it('handles an empty course: all pars 4, SI = 1..18, empty map', () => {
    const { coursePars, courseStrokeIndices, siByHole } = buildCourseArrays([]);
    expect(coursePars).toEqual(new Array(18).fill(4));
    expect(courseStrokeIndices).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
    expect(siByHole.size).toBe(0);
  });
});

describe('mapSideWinners', () => {
  const row = (
    category: 'longest_drive' | 'closest_to_pin',
    position: number,
    winner: string | null,
  ): SideWinnerRow => ({ category, position, winner_user_id: winner });

  it('keeps only position 1 and 2 rows', () => {
    const rows = [
      row('longest_drive', 0, 'u0'),
      row('longest_drive', 1, 'u1'),
      row('closest_to_pin', 2, 'u2'),
      row('closest_to_pin', 3, 'u3'),
    ];
    const result = mapSideWinners(rows);
    expect(result).toHaveLength(2);
    expect(result.map((w) => w.position)).toEqual([1, 2]);
  });

  it('maps snake_case winner_user_id to camelCase winnerUserId', () => {
    expect(mapSideWinners([row('longest_drive', 1, 'user-abc')])).toEqual([
      { category: 'longest_drive', position: 1, winnerUserId: 'user-abc' },
    ]);
  });

  it('preserves a null winner', () => {
    expect(mapSideWinners([row('closest_to_pin', 2, null)])).toEqual([
      { category: 'closest_to_pin', position: 2, winnerUserId: null },
    ]);
  });

  it('returns an empty array for no qualifying rows', () => {
    expect(mapSideWinners([])).toEqual([]);
    expect(mapSideWinners([row('longest_drive', 0, 'u0')])).toEqual([]);
  });
});
