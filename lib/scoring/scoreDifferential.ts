import { strokesForHole } from './strokeAllocation';

export type DifferentialHole = { strokes: number | null; par: number; strokeIndex: number };

export type DifferentialInput = {
  holes: DifferentialHole[]; // expect 18 holes with non-null strokes for a valid result
  courseHandicap: number | null;
  slope: number | null;
  courseRating: number | null;
};

/**
 * WHS score differential (1-decimal), or null when the round can't produce a valid one.
 *
 * A valid result requires:
 *  - exactly 18 holes, each with a non-null strokes value
 *  - courseHandicap, slope, and courseRating all non-null
 *
 * Formula per hole:
 *   received_i = strokesForHole(courseHandicap, strokeIndex_i)
 *   cap_i      = par_i + min(2 + received_i, 5) (net double bogey, at most par + 5)
 *   adj_i      = min(strokes_i, cap_i)          (adjusted hole score)
 *
 * AGS = Σ adj_i  (i = 1..18)
 * differential = round1( (113 / slope) × (AGS − courseRating) )
 *
 * #2939 (F2): NGF 3.1b (s. 31) caps the hole at par + 5 when the course
 * handicap is over 54 and the player gets 4 or more strokes on it. At 54 and
 * below a hole gets 3 strokes at most, so `min` never moves the cap there.
 *
 * Differentials may be negative (plus-handicap player or easy course) — never clamped.
 */
export function computeScoreDifferential(input: DifferentialInput): number | null {
  const { holes, courseHandicap, slope, courseRating } = input;

  // Guard: all metadata must be present
  if (courseHandicap === null || slope === null || courseRating === null) {
    return null;
  }

  // Guard: must be a complete 18-hole round with all strokes entered
  if (holes.length !== 18) {
    return null;
  }
  for (const hole of holes) {
    if (hole.strokes === null) {
      return null;
    }
  }

  // Compute Adjusted Gross Score with per-hole net-double-bogey caps
  let ags = 0;
  for (const hole of holes) {
    const received = strokesForHole(courseHandicap, hole.strokeIndex);
    const cap = hole.par + Math.min(2 + received, 5);
    const adj = Math.min(hole.strokes as number, cap);
    ags += adj;
  }

  // WHS differential formula
  const raw = (113 / slope) * (ags - courseRating);
  return Math.round(raw * 10) / 10;
}
