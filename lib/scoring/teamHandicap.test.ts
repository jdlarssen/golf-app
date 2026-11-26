import { describe, it, expect } from 'vitest';
import { scrambleTeamHandicap, sideHandicap } from './teamHandicap';
import { ambroseDefaultPct } from './modes/ambrose';

// `team_handicap_pct` is stored as a percentage of the SUM, worked out for
// `mode_config.team_size` (#2009, #2566): 80 % of the average at 4 players is
// 20 % of the sum. A team of 3 (#2569) keeps the organiser's «percent of the
// average», so its sum percentage is scaled by configured / actual size.

describe('scrambleTeamHandicap — full team (regression: unchanged expression)', () => {
  it.each([
    // combined, sumPct, size → round(combined × sumPct / 100)
    { combined: 100, sumPct: 20, size: 4, expected: 20 },
    { combined: 100, sumPct: 10, size: 4, expected: 10 },
    { combined: 60, sumPct: 25, size: 2, expected: 15 },
    { combined: 30, sumPct: 100, size: 3, expected: 30 },
    { combined: 77, sumPct: 12.5, size: 4, expected: 10 }, // 9.625 → 10
    { combined: 0, sumPct: 20, size: 4, expected: 0 },
  ])('$size players, $sumPct % of sum, CH sum $combined → $expected', (c) => {
    expect(scrambleTeamHandicap(c.combined, c.sumPct, c.size, c.size)).toBe(c.expected);
  });

  it('is bit-identical to the old inline expression for any full team', () => {
    for (let combined = 0; combined <= 160; combined += 7) {
      for (const pct of [0, 10, 12.5, 15, 20, 25, 33.3, 100]) {
        for (const size of [2, 3, 4]) {
          expect(scrambleTeamHandicap(combined, pct, size, size)).toBe(
            Math.round((combined * pct) / 100),
          );
        }
      }
    }
  });
});

describe('scrambleTeamHandicap — short team keeps the percent of the average', () => {
  it('4-player game, 80 % of average (stored 20): team of 4 on 10/20/30/40 → 20', () => {
    expect(scrambleTeamHandicap(100, 20, 4, 4)).toBe(20);
  });

  it('4-player game, 80 % of average (stored 20): team of 3 on 10/20/30 → 16 (average 20 × 0.8)', () => {
    expect(scrambleTeamHandicap(60, 20, 4, 3)).toBe(16);
  });

  it('Ambrose default at 4 (12.5 %): team of 3 gets exactly the Ambrose rule for 3', () => {
    // 12.5 % of sum at 4 = 50 % of average = ambroseDefaultPct(3) of the sum (16.67 %).
    const combined = 66;
    expect(scrambleTeamHandicap(combined, ambroseDefaultPct(4), 4, 3)).toBe(
      Math.round((combined * ambroseDefaultPct(3)) / 100),
    );
    expect(scrambleTeamHandicap(combined, ambroseDefaultPct(4), 4, 3)).toBe(11);
  });

  it('3-player game, team of 2: 100 % of average is the average × 1', () => {
    // stored 33.33 % of sum at 3 = 100 % of average; team of 2 on 12/18 → 15
    expect(scrambleTeamHandicap(30, 100 / 3, 3, 2)).toBe(15);
  });

  it('Texas NGF 10 % of sum at 4 is NOT swapped for the 3-player table: stays 40 % of average', () => {
    // 40 % of average 20 = 8, not NGF's 15 % of sum (9)
    expect(scrambleTeamHandicap(60, 10, 4, 3)).toBe(8);
  });

  it('0 % stays 0 (gross mode) for a short team', () => {
    expect(scrambleTeamHandicap(60, 0, 4, 3)).toBe(0);
  });
});

describe('scrambleTeamHandicap — defensive input', () => {
  it('an empty team (0 actual players) gives 0 rather than NaN/Infinity', () => {
    expect(scrambleTeamHandicap(0, 20, 4, 0)).toBe(0);
  });

  it('falls back to the plain expression when the configured size is missing/invalid', () => {
    expect(scrambleTeamHandicap(60, 20, 0, 3)).toBe(12);
  });
});

// #2997 (F16/F25): a team's handicap is taken of the unrounded course
// handicaps when the start froze them for every player, and rounded once at
// the end (NGF 6.2a, avklaring 6.2a/1, s. 55). A team with an integer only
// keeps today's rule.
describe('sideHandicap — unrounded when every player has the frozen value (#2997)', () => {
  const p = (courseHandicap: number, rawCourseHandicap?: number | null) => ({
    courseHandicap,
    rawCourseHandicap,
  });

  it('sums the unrounded values without rounding: 9,513 + 11,394', () => {
    expect(sideHandicap('sum', [p(10, 9.513), p(11, 11.394)])).toBeCloseTo(20.907, 9);
  });

  it('takes 60/40 of the unrounded values without rounding: 8,4 and 14,4 give 10,8', () => {
    expect(sideHandicap('sixtyForty', [p(8, 8.4), p(14, 14.4)])).toBeCloseTo(10.8, 9);
  });

  it('rounds 60/40 of the integers when a player has no frozen value (today)', () => {
    // 0,6 × 8 + 0,4 × 14 = 10,4 → 10, as before the column.
    expect(sideHandicap('sixtyForty', [p(8, 8.4), p(14, null)])).toBe(10);
    expect(sideHandicap('sixtyForty', [p(8), p(14)])).toBe(10);
  });

  it('sums the integers when a player has no frozen value (today)', () => {
    expect(sideHandicap('sum', [p(10, 9.513), p(11)])).toBe(21);
  });

  it('is 0 for an empty team, and takes 60/40 over the lowest and highest of a draft team', () => {
    expect(sideHandicap('sum', [])).toBe(0);
    expect(sideHandicap('sixtyForty', [])).toBe(0);
    expect(sideHandicap('sixtyForty', [p(10), p(30), p(20)])).toBe(18);
  });

  it('keeps a plus handicap negative', () => {
    expect(sideHandicap('sum', [p(-4, -4.2), p(16, 16.1)])).toBeCloseTo(11.9, 9);
  });
});

describe('scrambleTeamHandicap on the unrounded sum (#2997, F25)', () => {
  // Texas, two players at 25 %: 9,6 and 11,5 are frozen as 10 and 12. The
  // integers give 25 % of 22 = 5,5 → 6; the rule gives 25 % of 21,1 = 5,275 → 5.
  it('gives the rule’s number for a pair where the integer and the unrounded differ', () => {
    const team = [{ courseHandicap: 10, rawCourseHandicap: 9.6 }, { courseHandicap: 12, rawCourseHandicap: 11.5 }];
    expect(scrambleTeamHandicap(sideHandicap('sum', team), 25, 2, 2)).toBe(5);
    expect(scrambleTeamHandicap(22, 25, 2, 2)).toBe(6);
  });
});
