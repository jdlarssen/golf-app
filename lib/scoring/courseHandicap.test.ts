import { describe, it, expect } from 'vitest';
import { calculateCourseHandicap, applyAllowance } from './courseHandicap';

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
