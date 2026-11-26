import { describe, it, expect } from 'vitest';
import {
  calculateCourseHandicap,
  rawCourseHandicap,
  applyAllowance,
  playingHandicapFromRaw,
  playingHandicap,
  strokeBasis,
} from './courseHandicap';

describe('calculateCourseHandicap', () => {
  it('matches Byneset Nord tee 57 example: 26.8 → 31', () => {
    expect(calculateCourseHandicap({ hcpIndex: 26.8, slope: 130, courseRating: 70, par: 70 })).toBe(31);
  });

  it('returns 0 for scratch on a standard course', () => {
    expect(calculateCourseHandicap({ hcpIndex: 0, slope: 113, courseRating: 72, par: 72 })).toBe(0);
  });

  it('handles plus golfers (negative HCP)', () => {
    expect(calculateCourseHandicap({ hcpIndex: -2, slope: 113, courseRating: 72, par: 72 })).toBe(-2);
  });

  it('applies course rating - par offset', () => {
    expect(calculateCourseHandicap({ hcpIndex: 10, slope: 113, courseRating: 70, par: 72 })).toBe(8);
  });

  it('uses half-away-from-zero rounding (round(2.5) === 3)', () => {
    // Raw value: 2.5 * (113/113) + (72 - 72) = 2.5 exactly.
    // Math.round rounds .5 away from zero (3), distinguishing from banker's rounding (2).
    expect(calculateCourseHandicap({ hcpIndex: 2.5, slope: 113, courseRating: 72, par: 72 })).toBe(3);
  });
});

describe('applyAllowance', () => {
  it('100% leaves unchanged', () => {
    expect(applyAllowance(31, 100)).toBe(31);
  });
  it('85% fourball', () => {
    expect(applyAllowance(31, 85)).toBe(26);
  });
  it('0% gives zero', () => {
    expect(applyAllowance(31, 0)).toBe(0);
  });
});

// #2660: a league can cap the strokes. The cap comes after the percentage
// (the owner: hcp 36 gives 27 strokes at 75 %, hcp 54 gives 32, not 40.5).
describe('applyAllowance with a stroke cap', () => {
  it.each([
    ['20 × 75 % under the cap', 20, 75, 32, 15],
    ['36 × 75 % = 27, under the cap', 36, 75, 32, 27],
    ['43 × 75 % = 32.25 → 32, right at the cap', 43, 75, 32, 32],
    ['54 × 75 % = 40.5 → 41, capped to 32', 54, 75, 32, 32],
    ['the cap applies after the percentage, also at 100 %', 40, 100, 32, 32],
    ['the smallest cap', 10, 100, 1, 1],
    ['0 strokes stays 0', 0, 75, 32, 0],
    ['a plus handicap is not touched by the cap', -3, 75, 32, -2],
  ])('%s', (_label, ch, pct, cap, expected) => {
    expect(applyAllowance(ch, pct, cap)).toBe(expected);
  });

  it('null means no cap', () => {
    expect(applyAllowance(54, 75, null)).toBe(41);
  });
});

describe('rawCourseHandicap', () => {
  it('is the unrounded course handicap', () => {
    // 8.6 × 125 / 113 + (71 − 71) = 9.5133…
    expect(rawCourseHandicap({ hcpIndex: 8.6, slope: 125, courseRating: 71, par: 71 })).toBeCloseTo(9.5133, 4);
    // 12.1 × 125 / 113 + (70 − 72) = 11.3850…
    expect(rawCourseHandicap({ hcpIndex: 12.1, slope: 125, courseRating: 70, par: 72 })).toBeCloseTo(11.385, 3);
  });

  it('calculateCourseHandicap is the rounded raw value', () => {
    const input = { hcpIndex: 26.8, slope: 130, courseRating: 70, par: 70 };
    expect(calculateCourseHandicap(input)).toBe(Math.round(rawCourseHandicap(input)));
  });
});

// #2924: WHS rule 6.2a (interpretation 6.2a/1) — the percentage is taken of
// the UNROUNDED course handicap and rounded once. The old pipeline rounded the
// course handicap first and then the percentage of that integer.
describe('playingHandicap rounds once (#2924, WHS 6.2a)', () => {
  it.each([
    // label, index, slope, CR, par, pct, double-rounded (old), rule
    ['rulebook example 8.6 at 85 %: 8.086 → 8', 8.6, 125, 71, 71, 85, 9, 8],
    ['rulebook example 10.3 at 85 %: 9.685 → 10', 10.3, 125, 71, 71, 85, 9, 10],
    ['12.3 at 90 %: 10.446 → 10', 12.3, 125, 70, 72, 90, 11, 10],
    ['12.1 at 75 % (league): 8.539 → 9', 12.1, 125, 70, 72, 75, 8, 9],
  ])('%s', (_label, hcpIndex, slope, courseRating, par, pct, doubleRounded, expected) => {
    const tee = { hcpIndex, slope, courseRating, par };
    expect(playingHandicap({ ...tee, allowancePct: pct })).toBe(expected);
    // Locks the difference: the old two-step pipeline gives another number.
    expect(applyAllowance(calculateCourseHandicap(tee), pct)).toBe(doubleRounded);
    expect(doubleRounded).not.toBe(expected);
  });

  it('100 % equals calculateCourseHandicap for every index 0.0–54.0 on three tees', () => {
    const tees = [
      { slope: 113, courseRating: 72, par: 72 },
      { slope: 125, courseRating: 71, par: 71 },
      { slope: 130, courseRating: 70, par: 70 },
    ];
    let checked = 0;
    for (const tee of tees) {
      for (let tenths = 0; tenths <= 540; tenths++) {
        const hcpIndex = tenths / 10;
        expect(playingHandicap({ hcpIndex, ...tee, allowancePct: 100 })).toBe(
          calculateCourseHandicap({ hcpIndex, ...tee }),
        );
        checked++;
      }
    }
    expect(checked).toBe(3 * 541);
  });
});

describe('playingHandicapFromRaw: the cap comes after the one rounding (#2660, #2924)', () => {
  it.each([
    ['54 × 75 % = 40.5 → 41, capped to 32', 54, 75, 32, 32],
    ['43.3 × 75 % = 32.475 → 32 (one rounding)', 43.3, 75, 32, 32],
    ['36 × 75 % = 27, under the cap', 36, 75, 32, 27],
    ['the cap applies also at 100 %', 40, 100, 32, 32],
    ['0 strokes stays 0', 0, 75, 32, 0],
    ['a plus handicap is not touched by the cap', -3, 75, 32, -2],
  ])('%s', (_label, raw, pct, cap, expected) => {
    expect(playingHandicapFromRaw(raw, pct, cap)).toBe(expected);
  });

  it('null means no cap', () => {
    expect(playingHandicapFromRaw(54, 75, null)).toBe(41);
  });
});

describe('playingHandicap', () => {
  // The pre-start surfaces (game home, the app ticket, the wizard example)
  // must show the EXACT number startScheduledGame freezes: the freeze uses
  // rawCourseHandicap → playingHandicapFromRaw, and so does this helper.
  it('matches the raw → playingHandicapFromRaw pipeline used at start', () => {
    const tee = { hcpIndex: 26.8, slope: 130, courseRating: 70, par: 70 };
    expect(playingHandicap({ ...tee, allowancePct: 85 })).toBe(
      playingHandicapFromRaw(rawCourseHandicap(tee), 85, null),
    );
  });

  it('100% allowance equals the unadjusted course handicap', () => {
    expect(
      playingHandicap({
        hcpIndex: 26.8,
        slope: 130,
        courseRating: 70,
        par: 70,
        allowancePct: 100,
      }),
    ).toBe(31);
  });

  it('#2660: applies the stroke cap the same way the freeze does', () => {
    const input = { hcpIndex: 54, slope: 113, courseRating: 72, par: 72, allowancePct: 75 };
    expect(playingHandicap({ ...input, maxStrokes: 32 })).toBe(32);
    expect(playingHandicap(input)).toBe(41);
  });

  it('#2924: the cap after one rounding — 43.3 at 75 % gives 32, not via 43', () => {
    expect(
      playingHandicap({ hcpIndex: 43.3, slope: 113, courseRating: 72, par: 72, allowancePct: 75, maxStrokes: 32 }),
    ).toBe(32);
  });

  it('returns null when the tee rating is missing', () => {
    expect(
      playingHandicap({
        hcpIndex: 26.8,
        slope: null,
        courseRating: 70,
        par: 70,
        allowancePct: 100,
      }),
    ).toBeNull();
  });

  it('returns null when hcp index is not a finite number', () => {
    expect(
      playingHandicap({
        hcpIndex: Number.NaN,
        slope: 130,
        courseRating: 70,
        par: 70,
        allowancePct: 100,
      }),
    ).toBeNull();
  });
});

// #2939 (F3): NGF 6.2a (s. 55) rounds 0,5 up. A number that is exactly a half
// in decimal can land just under it in floating point (45 × 0,7 is
// 31,499999999999996), so the rounding must not lose it.
describe('0,5 rounds up also when the float lands just under (#2939, F3)', () => {
  it('index 45,0 on 113/72,0/72 at 70 % gives 32', () => {
    expect(
      playingHandicap({ hcpIndex: 45.0, slope: 113, courseRating: 72.0, par: 72, allowancePct: 70 }),
    ).toBe(32);
  });

  it('applyAllowance(45, 70) gives 32', () => {
    expect(applyAllowance(45, 70)).toBe(32);
  });

  // The exact answer in integers: round half up of n / d (d > 0) is
  // floor((2n + d) / (2d)). The rounding goes toward +∞, so −2,5 gives −2
  // as before (F10).
  const roundHalfUpExact = (n: number, d: number): number => Math.floor((2 * n + d) / (2 * d));

  // Index −10,0 to 54,0 in tenths, the four tees from the rule-book review.
  const TENTHS = Array.from({ length: 641 }, (_, i) => i - 100);
  const TEES = [
    { slope: 113, courseRating: 72.0, par: 72 },
    { slope: 125, courseRating: 71.0, par: 71 },
    { slope: 130, courseRating: 70.0, par: 70 },
    { slope: 125, courseRating: 70.0, par: 72 },
  ];

  it('calculateCourseHandicap matches the exact answer for every index, slope 55–155 and five tee offsets', () => {
    let mismatches = 0;
    let checked = 0;
    // CR − par in tenths: −2,0, −0,7, 0, +1,3, +3,5.
    for (const offsetTenths of [-20, -7, 0, 13, 35]) {
      for (let slope = 55; slope <= 155; slope++) {
        for (const tenths of TENTHS) {
          // raw = tenths/10 × slope/113 + offsetTenths/10 = (tenths·slope + offsetTenths·113) / 1130
          const exact = roundHalfUpExact(tenths * slope + offsetTenths * 113, 1130);
          const got = calculateCourseHandicap({
            hcpIndex: tenths / 10,
            slope,
            courseRating: (720 + offsetTenths) / 10,
            par: 72,
          });
          if (got !== exact) mismatches++;
          checked++;
        }
      }
    }
    expect(checked).toBe(5 * 101 * 641);
    expect(mismatches).toBe(0);
  });

  it('playingHandicap matches the exact answer for every index, the four tees and 0–100 %', () => {
    let mismatches = 0;
    let checked = 0;
    for (const tee of TEES) {
      const offsetTenths = Math.round(tee.courseRating * 10) - tee.par * 10;
      for (const tenths of TENTHS) {
        const numerator = tenths * tee.slope + offsetTenths * 113;
        for (let pct = 0; pct <= 100; pct++) {
          const exact = roundHalfUpExact(numerator * pct, 1130 * 100);
          const got = playingHandicap({ hcpIndex: tenths / 10, ...tee, allowancePct: pct });
          if (got !== exact) mismatches++;
          checked++;
        }
      }
    }
    expect(checked).toBe(4 * 641 * 101);
    expect(mismatches).toBe(0);
  });

  it('applyAllowance matches the exact answer for course handicap −10 to 72 and 0–100 %', () => {
    let mismatches = 0;
    let checked = 0;
    for (let ch = -10; ch <= 72; ch++) {
      for (let pct = 0; pct <= 100; pct++) {
        if (applyAllowance(ch, pct) !== roundHalfUpExact(ch * pct, 100)) mismatches++;
        checked++;
      }
    }
    expect(checked).toBe(83 * 101);
    expect(mismatches).toBe(0);
  });
});

describe('strokeBasis: the unrounded course handicap when it is frozen (#2997, F16/F25)', () => {
  it('is the unrounded value when the start froze it', () => {
    expect(strokeBasis(21, 20.907)).toBe(20.907);
  });

  it('is the integer when the round was started before the column existed', () => {
    expect(strokeBasis(21, null)).toBe(21);
    expect(strokeBasis(21, undefined)).toBe(21);
  });

  it('keeps a plus handicap and 0 as they are', () => {
    expect(strokeBasis(-4, -3.6)).toBe(-3.6);
    expect(strokeBasis(0, 0)).toBe(0);
  });
});
