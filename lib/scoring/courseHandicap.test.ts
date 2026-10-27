import { describe, it, expect } from 'vitest';
import {
  calculateCourseHandicap,
  applyAllowance,
  displayCourseHandicap,
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

describe('displayCourseHandicap', () => {
  // The pre-start game-home info card needs a CH to show before the game is
  // auto-started (which freezes game_players.course_handicap). This helper
  // must produce the EXACT same number startScheduledGame freezes: it composes
  // calculateCourseHandicap + applyAllowance in the same order, so the display
  // value and the later frozen value never disagree.
  it('matches the calculate + applyAllowance pipeline used at start', () => {
    const raw = calculateCourseHandicap({
      hcpIndex: 26.8,
      slope: 130,
      courseRating: 70,
      par: 70,
    });
    const frozen = applyAllowance(raw, 85);
    expect(
      displayCourseHandicap({
        hcpIndex: 26.8,
        slope: 130,
        courseRating: 70,
        par: 70,
        allowancePct: 85,
      }),
    ).toBe(frozen);
  });

  it('100% allowance equals the unadjusted course handicap', () => {
    expect(
      displayCourseHandicap({
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
    expect(displayCourseHandicap({ ...input, maxStrokes: 32 })).toBe(applyAllowance(54, 75, 32));
    expect(displayCourseHandicap({ ...input, maxStrokes: 32 })).toBe(32);
    expect(displayCourseHandicap(input)).toBe(41);
  });

  it('returns null when the tee rating is missing', () => {
    expect(
      displayCourseHandicap({
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
      displayCourseHandicap({
        hcpIndex: Number.NaN,
        slope: 130,
        courseRating: 70,
        par: 70,
        allowancePct: 100,
      }),
    ).toBeNull();
  });
});
