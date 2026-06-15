import { describe, it, expect } from 'vitest';
import { maxHolesPlayed } from './holesPlayed';

type Row = { user_id: string; hole_number: number; strokes: number | null };

describe('maxHolesPlayed', () => {
  it('returns 0 for empty input', () => {
    expect(maxHolesPlayed([])).toBe(0);
  });

  it('returns 0 when all strokes are null', () => {
    const rows: Row[] = [
      { user_id: 'u1', hole_number: 1, strokes: null },
      { user_id: 'u1', hole_number: 2, strokes: null },
    ];
    expect(maxHolesPlayed(rows)).toBe(0);
  });

  it('returns hole count for a single player', () => {
    const rows: Row[] = [
      { user_id: 'u1', hole_number: 1, strokes: 4 },
      { user_id: 'u1', hole_number: 2, strokes: 3 },
    ];
    expect(maxHolesPlayed(rows)).toBe(2);
  });

  it('returns max across two players with different counts', () => {
    const rows: Row[] = [
      { user_id: 'u1', hole_number: 1, strokes: 4 },
      { user_id: 'u1', hole_number: 2, strokes: 5 },
      { user_id: 'u1', hole_number: 3, strokes: 3 },
      { user_id: 'u2', hole_number: 1, strokes: 4 },
      { user_id: 'u2', hole_number: 2, strokes: 4 },
      { user_id: 'u2', hole_number: 3, strokes: 4 },
      { user_id: 'u2', hole_number: 4, strokes: 4 },
      { user_id: 'u2', hole_number: 5, strokes: 4 },
    ];
    expect(maxHolesPlayed(rows)).toBe(5);
  });

  it('ignores rows with null strokes', () => {
    const rows: Row[] = [
      { user_id: 'u1', hole_number: 1, strokes: 4 },
      { user_id: 'u1', hole_number: 2, strokes: null },
      { user_id: 'u2', hole_number: 1, strokes: 4 },
      { user_id: 'u2', hole_number: 2, strokes: 4 },
      { user_id: 'u2', hole_number: 3, strokes: null },
    ];
    // u1 has 1 scored, u2 has 2 scored
    expect(maxHolesPlayed(rows)).toBe(2);
  });

  it('returns 18 for a full 18-hole round', () => {
    const rows: Row[] = Array.from({ length: 18 }, (_, i) => ({
      user_id: 'u1',
      hole_number: i + 1,
      strokes: 4,
    }));
    expect(maxHolesPlayed(rows)).toBe(18);
  });

  it.each([
    [[{ user_id: 'u1', hole_number: 1, strokes: 5 }], 1],
    [
      [
        { user_id: 'u1', hole_number: 1, strokes: 5 },
        { user_id: 'u1', hole_number: 2, strokes: 4 },
        { user_id: 'u2', hole_number: 1, strokes: 3 },
      ],
      2,
    ],
  ] as const)(
    'parametrized: input %j → %i',
    (rows: readonly Row[], expected: number) => {
      expect(maxHolesPlayed([...rows])).toBe(expected);
    },
  );

  it('counts duplicate hole entries per player (no dedup by design)', () => {
    // Same player, same hole entered twice (e.g. correction scenario).
    // maxHolesPlayed counts rows, not distinct hole numbers.
    const rows: Row[] = [
      { user_id: 'u1', hole_number: 1, strokes: 4 },
      { user_id: 'u1', hole_number: 1, strokes: 5 }, // duplicate
    ];
    // 2 rows with strokes, so byUser.get('u1') = 2
    expect(maxHolesPlayed(rows)).toBe(2);
  });
});
