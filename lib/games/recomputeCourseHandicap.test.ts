import { describe, it, expect } from 'vitest';
import {
  planHandicapRecompute,
  type RecomputeGameRow,
} from './recomputeCourseHandicap';
import type { TeeBoxRatings } from './teeRating';

// A men's rating-set chosen so the course-handicap formula is trivial to
// assert: slope 113 and course_rating == par make
//   raw = hcpIndex * (113/113) + (par - par) = hcpIndex
// so course handicap == round(hcpIndex) before allowance.
const TEE: TeeBoxRatings = {
  slope_mens: 113,
  course_rating_mens: 72,
  par_total_mens: 72,
  slope_ladies: null,
  course_rating_ladies: null,
  par_total_ladies: null,
  slope_juniors: null,
  course_rating_juniors: null,
  par_total_juniors: null,
};

function activeRow(overrides: Partial<RecomputeGameRow> = {}): RecomputeGameRow {
  return {
    gameId: 'g-active',
    status: 'active',
    courseHandicap: 18,
    teeGender: 'mens',
    teeRatings: TEE,
    allowancePct: 100,
    ...overrides,
  };
}

describe('planHandicapRecompute (#1176)', () => {
  it('empty input → no updates', () => {
    expect(planHandicapRecompute([], 12)).toEqual([]);
  });

  it('active game with a frozen CH → one recomputed update', () => {
    // hcpIndex 12 on the trivial tee, 100% allowance → CH 12.
    expect(planHandicapRecompute([activeRow()], 12)).toEqual([
      { gameId: 'g-active', courseHandicap: 12 },
    ]);
  });

  it('applies the format allowance percentage', () => {
    // hcpIndex 20 → raw 20; 75% allowance → round(15) = 15.
    expect(
      planHandicapRecompute([activeRow({ allowancePct: 75 })], 20),
    ).toEqual([{ gameId: 'g-active', courseHandicap: 15 }]);
  });

  it.each([
    ['finished', 'finished' as const],
    ['scheduled', 'scheduled' as const],
    ['draft', 'draft' as const],
  ])('skips %s games (never rewrite non-active rounds)', (_label, status) => {
    expect(planHandicapRecompute([activeRow({ status })], 12)).toEqual([]);
  });

  it('skips active rows whose CH is not yet frozen (null)', () => {
    expect(
      planHandicapRecompute([activeRow({ courseHandicap: null })], 12),
    ).toEqual([]);
  });

  it('skips rows whose tee has no rating-set for the chosen gender', () => {
    // TEE only carries a men's set; a ladies player cannot be recomputed.
    expect(
      planHandicapRecompute([activeRow({ teeGender: 'ladies' })], 12),
    ).toEqual([]);
  });

  it('skips rows with a missing tee entirely', () => {
    expect(
      planHandicapRecompute([activeRow({ teeRatings: null })], 12),
    ).toEqual([]);
  });

  it.each([[NaN], [Infinity], [-Infinity]])(
    'non-finite hcp index (%p) → no updates (never write NaN)',
    (bad) => {
      expect(planHandicapRecompute([activeRow()], bad)).toEqual([]);
    },
  );

  it('mixed rows → only active + frozen + resolvable are updated', () => {
    const rows: RecomputeGameRow[] = [
      activeRow({ gameId: 'a1' }), // update
      activeRow({ gameId: 'finished-1', status: 'finished' }), // skip
      activeRow({ gameId: 'scheduled-1', status: 'scheduled' }), // skip
      activeRow({ gameId: 'a2-nullch', courseHandicap: null }), // skip
      activeRow({ gameId: 'a3-badtee', teeGender: 'juniors' }), // skip (no jr set)
      activeRow({ gameId: 'a4' }), // update
    ];
    expect(planHandicapRecompute(rows, 12)).toEqual([
      { gameId: 'a1', courseHandicap: 12 },
      { gameId: 'a4', courseHandicap: 12 },
    ]);
  });
});
