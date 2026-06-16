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
