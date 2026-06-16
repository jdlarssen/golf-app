export interface CourseHandicapInput {
  hcpIndex: number;
  slope: number;
  courseRating: number;
  par: number;
}

export function calculateCourseHandicap(input: CourseHandicapInput): number {
  const raw = input.hcpIndex * (input.slope / 113) + (input.courseRating - input.par);
  return Math.round(raw);
}

export function applyAllowance(courseHandicap: number, percent: number): number {
  return Math.round(courseHandicap * (percent / 100));
}

export interface DisplayCourseHandicapInput {
  hcpIndex: number;
  slope: number | null;
  courseRating: number | null;
  par: number | null;
  allowancePct: number;
}

/**
 * Display-only course handicap for surfaces that need a CH *before*
 * `startScheduledGame` has frozen `game_players.course_handicap` (e.g. the
 * pre-start game-home info card, which would otherwise show «—» right after
 * an auto-start whose cache hasn't been invalidated yet).
 *
 * It composes the exact same pipeline the freeze uses
 * (`calculateCourseHandicap` → `applyAllowance`), so the value shown here is
 * guaranteed identical to the one that lands in the DB at start — no formula
 * fork, no drift.
 *
 * Returns `null` when the inputs can't yield a CH (missing tee rating-set or a
 * non-finite hcp index), letting call-sites fall back to «—».
 */
export function displayCourseHandicap(
  input: DisplayCourseHandicapInput,
): number | null {
  if (!Number.isFinite(input.hcpIndex)) return null;
  if (input.slope === null || input.courseRating === null || input.par === null) {
    return null;
  }
  const raw = calculateCourseHandicap({
    hcpIndex: input.hcpIndex,
    slope: input.slope,
    courseRating: input.courseRating,
    par: input.par,
  });
  return applyAllowance(raw, input.allowancePct);
}
