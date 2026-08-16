export type TeeGender = 'mens' | 'ladies' | 'juniors';

export type TeeBoxRatings = {
  slope_mens: number | null;
  course_rating_mens: number | null;
  par_total_mens: number | null;
  slope_ladies: number | null;
  course_rating_ladies: number | null;
  par_total_ladies: number | null;
  slope_juniors: number | null;
  course_rating_juniors: number | null;
  par_total_juniors: number | null;
};

export type Rating = { slope: number; courseRating: number; par: number };

/**
 * Resolve the (slope, course-rating, par) triple for a player's chosen
 * gender against a tee-box that may carry up to three independent rating
 * sets (mens/ladies/juniors). Returns `null` when the requested set is
 * incomplete — call-sites treat that as "this tee doesn't support that
 * gender" and surface an error.
 *
 * #1678: the guard is `== null`, not `=== null`, on purpose. `gender` is typed
 * as `TeeGender`, but the value arrives from the DB (`game_players.tee_gender`)
 * or a fixture, so a value outside the union reaches this function at runtime.
 * The lookup then yields `undefined`, `=== null` let that through, and callers
 * got a Rating with `undefined` slope/par — every downstream course-handicap
 * became NaN and was frozen into the row. `== null` catches both, so an unknown
 * gender takes the same "tee doesn't support that gender" path as a missing
 * rating-set: an error the user sees instead of a silent NaN.
 */
export function getRatingForGender(
  tee: TeeBoxRatings,
  gender: TeeGender,
): Rating | null {
  const slope = tee[`slope_${gender}`];
  const cr = tee[`course_rating_${gender}`];
  const par = tee[`par_total_${gender}`];
  if (slope == null || cr == null || par == null) return null;
  return { slope, courseRating: Number(cr), par };
}
