import { describe, it, expect } from 'vitest';
import { isPubliclyEligible, type EligibilityCourseRow } from './publicCourses';

/**
 * Pure eligibility predicate for #1023 public course pages. "Admin-created"
 * stands in for "NGF-imported/curated" — no such marker exists in the schema
 * (contract Key Decisions). A course qualifies iff:
 *   - the creator is an admin user
 *   - it has ≥9 holes
 *   - it has ≥1 non-archived tee with a complete rating (slope+CR+par) for
 *     at least one gender
 */
function makeCourse(overrides: Partial<EligibilityCourseRow> = {}): EligibilityCourseRow {
  return {
    creatorIsAdmin: true,
    holeCount: 18,
    tees: [
      {
        archived_at: null,
        slope_mens: 120,
        course_rating_mens: 71.2,
        par_total_mens: 72,
        slope_ladies: null,
        course_rating_ladies: null,
        par_total_ladies: null,
        slope_juniors: null,
        course_rating_juniors: null,
        par_total_juniors: null,
      },
    ],
    ...overrides,
  };
}

describe('isPubliclyEligible', () => {
  it('qualifies an admin-created 18-hole course with one complete tee', () => {
    expect(isPubliclyEligible(makeCourse())).toBe(true);
  });

  it('qualifies a 9-hole course', () => {
    expect(isPubliclyEligible(makeCourse({ holeCount: 9 }))).toBe(true);
  });

  it('rejects a course created by a non-admin', () => {
    expect(isPubliclyEligible(makeCourse({ creatorIsAdmin: false }))).toBe(false);
  });

  it('rejects a course with fewer than 9 holes', () => {
    expect(isPubliclyEligible(makeCourse({ holeCount: 8 }))).toBe(false);
  });

  it('rejects a course with zero holes', () => {
    expect(isPubliclyEligible(makeCourse({ holeCount: 0 }))).toBe(false);
  });

  it('rejects a course whose only tee is archived', () => {
    expect(
      isPubliclyEligible(
        makeCourse({
          tees: [
            {
              archived_at: '2026-01-01T00:00:00Z',
              slope_mens: 120,
              course_rating_mens: 71.2,
              par_total_mens: 72,
              slope_ladies: null,
              course_rating_ladies: null,
              par_total_ladies: null,
              slope_juniors: null,
              course_rating_juniors: null,
              par_total_juniors: null,
            },
          ],
        }),
      ),
    ).toBe(false);
  });

  it('rejects a course with no tees', () => {
    expect(isPubliclyEligible(makeCourse({ tees: [] }))).toBe(false);
  });

  it('rejects a course where the only tee has an incomplete rating for every gender', () => {
    expect(
      isPubliclyEligible(
        makeCourse({
          tees: [
            {
              archived_at: null,
              slope_mens: 120,
              course_rating_mens: null,
              par_total_mens: 72,
              slope_ladies: null,
              course_rating_ladies: null,
              par_total_ladies: null,
              slope_juniors: null,
              course_rating_juniors: null,
              par_total_juniors: null,
            },
          ],
        }),
      ),
    ).toBe(false);
  });

  it('qualifies when only the ladies rating on a tee is complete', () => {
    expect(
      isPubliclyEligible(
        makeCourse({
          tees: [
            {
              archived_at: null,
              slope_mens: null,
              course_rating_mens: null,
              par_total_mens: null,
              slope_ladies: 118,
              course_rating_ladies: 70.1,
              par_total_ladies: 72,
              slope_juniors: null,
              course_rating_juniors: null,
              par_total_juniors: null,
            },
          ],
        }),
      ),
    ).toBe(true);
  });

  it('qualifies when an archived tee is incomplete but a second non-archived tee is complete', () => {
    expect(
      isPubliclyEligible(
        makeCourse({
          tees: [
            {
              archived_at: '2026-01-01T00:00:00Z',
              slope_mens: null,
              course_rating_mens: null,
              par_total_mens: null,
              slope_ladies: null,
              course_rating_ladies: null,
              par_total_ladies: null,
              slope_juniors: null,
              course_rating_juniors: null,
              par_total_juniors: null,
            },
            {
              archived_at: null,
              slope_mens: 120,
              course_rating_mens: 71.2,
              par_total_mens: 72,
              slope_ladies: null,
              course_rating_ladies: null,
              par_total_ladies: null,
              slope_juniors: null,
              course_rating_juniors: null,
              par_total_juniors: null,
            },
          ],
        }),
      ),
    ).toBe(true);
  });
});
