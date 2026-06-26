import { describe, it, expect } from 'vitest';
import {
  computeSeasonStats,
  type SeasonRoundInput,
} from './seasonStats';
import { EMPTY_ACHIEVEMENTS, type Achievements } from './achievements';

const ach = (partial: Partial<Achievements> = {}): Achievements => ({
  ...EMPTY_ACHIEVEMENTS,
  ...partial,
});

const round = (
  year: number | null,
  completeBrutto: number | null,
  achievements: Achievements = ach(),
): SeasonRoundInput => ({ year, completeBrutto, achievements });

describe('computeSeasonStats — bucketing', () => {
  it('groups rounds by year, newest year first', () => {
    const out = computeSeasonStats([
      round(2024, 90),
      round(2026, 80),
      round(2025, 85),
    ]);
    expect(out.map((s) => s.year)).toEqual([2026, 2025, 2024]);
  });

  it('excludes undatable rounds (year == null)', () => {
    const out = computeSeasonStats([round(null, 80), round(2026, 75)]);
    expect(out).toHaveLength(1);
    expect(out[0].year).toBe(2026);
    expect(out[0].rounds).toBe(1);
  });

  it('returns an empty array for no rounds', () => {
    expect(computeSeasonStats([])).toEqual([]);
  });
});

describe('computeSeasonStats — rounds count vs gross average/best', () => {
  it('rounds counts every dated round; average/best only complete-18', () => {
    const out = computeSeasonStats([
      round(2026, 72), // complete
      round(2026, 80), // complete
      round(2026, null), // 9-hole / incomplete — counted in rounds, not in avg/best
    ]);
    expect(out[0].rounds).toBe(3);
    expect(out[0].grossAverage).toBe(76); // (72+80)/2
    expect(out[0].bestRound).toBe(72);
  });

  it('rounds the average to a whole number', () => {
    const out = computeSeasonStats([round(2026, 72), round(2026, 73)]);
    expect(out[0].grossAverage).toBe(73); // 72.5 → 73
  });

  it('null average/best when the year has no complete round', () => {
    const out = computeSeasonStats([round(2026, null), round(2026, null)]);
    expect(out[0].rounds).toBe(2);
    expect(out[0].grossAverage).toBeNull();
    expect(out[0].bestRound).toBeNull();
  });
});

describe('computeSeasonStats — achievements', () => {
  it('sums achievements per year (independent of complete-round status)', () => {
    const out = computeSeasonStats([
      round(2026, null, ach({ birdie: 2, snowman: 1 })),
      round(2026, 80, ach({ birdie: 1, eagle: 1, turkey: 1 })),
      round(2025, 90, ach({ birdie: 5 })),
    ]);
    const y2026 = out.find((s) => s.year === 2026)!;
    expect(y2026.achievements).toEqual(
      ach({ birdie: 3, eagle: 1, turkey: 1, snowman: 1 }),
    );
    const y2025 = out.find((s) => s.year === 2025)!;
    expect(y2025.achievements.birdie).toBe(5);
  });

  it('does not mutate the shared EMPTY_ACHIEVEMENTS constant', () => {
    computeSeasonStats([round(2026, 80, ach({ birdie: 1 }))]);
    expect(EMPTY_ACHIEVEMENTS).toEqual({
      holeInOne: 0,
      eagle: 0,
      birdie: 0,
      turkey: 0,
      snowman: 0,
    });
  });
});
