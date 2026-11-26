export interface CourseHandicapInput {
  hcpIndex: number;
  slope: number;
  courseRating: number;
  par: number;
}

/**
 * The unrounded course handicap: `hcpIndex × slope / 113 + (CR − par)`.
 *
 * #2924: WHS rule 6.2a (interpretation 6.2a/1) takes the handicap allowance of
 * this number, not of the rounded course handicap, so the percentage is
 * rounded once. `playingHandicapFromRaw` is the step that follows.
 */
export function rawCourseHandicap(input: CourseHandicapInput): number {
  return input.hcpIndex * (input.slope / 113) + (input.courseRating - input.par);
}

/**
 * #2939 (F3): what `roundHalfUp` adds before `Math.round`. See there.
 */
export const ROUNDING_EPSILON = 1e-9;

/**
 * Rounds to the nearest integer with 0.5 up (WHS 6.2a), also when the float
 * lands just under an exact half (45 × 0.7 is 31.499999999999996).
 *
 * #2939 (F3): the inputs are an index and a course rating with one decimal and
 * whole numbers for slope, par and percent, so the exact value is a fraction
 * with denominator 113 000 at most. When it is not a half, it lies at least
 * 1 / 226 000 ≈ 4.4e-6 from one. The float error is around 1e-14, so adding
 * 1e-9 lifts a lost half back up and moves nothing else.
 *
 * A negative half rounds toward zero as before (−2.5 gives −2, F10).
 */
export function roundHalfUp(x: number): number {
  return Math.round(x + ROUNDING_EPSILON);
}

export function calculateCourseHandicap(input: CourseHandicapInput): number {
  return roundHalfUp(rawCourseHandicap(input));
}

/**
 * The playing handicap from the unrounded course handicap: the percentage,
 * one rounding, then the cap (#2924, WHS 6.2a).
 *
 * #2660: a league can cap the strokes after the percentage (75 % of a 54
 * course handicap is 40.5, and a cap of 32 makes it 32). `null` = no cap. A
 * plus handicap (negative) and 0 are never moved by the cap.
 */
export function playingHandicapFromRaw(
  rawCourseHandicap: number,
  percent: number,
  maxStrokes: number | null = null,
): number {
  const allowed = roundHalfUp((rawCourseHandicap * percent) / 100);
  return maxStrokes === null ? allowed : Math.min(allowed, maxStrokes);
}

/**
 * The percentage of an already ROUNDED course handicap, then the cap.
 *
 * Used where only the frozen integer is at hand: the formats that take their
 * own percentage in `mode_config` at compute time (four-ball matchplay, Round
 * Robin, `allocatedStrokes`). Rounding twice there is the known deviation from
 * WHS 6.2a; #2924 step 2 is where it gets the unrounded value. For the game's
 * general allowance use `playingHandicapFromRaw` / `playingHandicap`.
 */
export function applyAllowance(
  courseHandicap: number,
  percent: number,
  maxStrokes: number | null = null,
): number {
  const allowed = roundHalfUp((courseHandicap * percent) / 100);
  return maxStrokes === null ? allowed : Math.min(allowed, maxStrokes);
}

export interface PlayingHandicapInput {
  hcpIndex: number;
  slope: number | null;
  courseRating: number | null;
  par: number | null;
  allowancePct: number;
  /** #2660: `games.hcp_max_strokes`; null or absent = no cap. */
  maxStrokes?: number | null;
}

/**
 * The playing handicap `startScheduledGame` freezes into
 * `game_players.course_handicap`, also for surfaces that need it *before* the
 * freeze (the pre-start game-home info card, the app ticket, the wizard
 * example).
 *
 * It composes the exact pipeline the freeze uses (`rawCourseHandicap` →
 * `playingHandicapFromRaw`), so the value shown here is identical to the one
 * that lands in the DB at start — no formula fork, no drift.
 *
 * Returns `null` when the inputs can't yield a CH (missing tee rating-set or a
 * non-finite hcp index), letting call-sites fall back to «—».
 */
export function playingHandicap(input: PlayingHandicapInput): number | null {
  if (!Number.isFinite(input.hcpIndex)) return null;
  if (input.slope === null || input.courseRating === null || input.par === null) {
    return null;
  }
  const raw = rawCourseHandicap({
    hcpIndex: input.hcpIndex,
    slope: input.slope,
    courseRating: input.courseRating,
    par: input.par,
  });
  return playingHandicapFromRaw(raw, input.allowancePct, input.maxStrokes ?? null);
}
