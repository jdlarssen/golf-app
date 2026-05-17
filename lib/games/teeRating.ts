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
 */
export function getRatingForGender(
  tee: TeeBoxRatings,
  gender: TeeGender,
): Rating | null {
  const slope = tee[`slope_${gender}`];
  const cr = tee[`course_rating_${gender}`];
  const par = tee[`par_total_${gender}`];
  if (slope === null || cr === null || par === null) return null;
  return { slope, courseRating: Number(cr), par };
}
