import type { ScoringHole } from '../modes/types';

/** A `course_holes` row as the pages read it (`COURSE_HOLES_SELECT`). */
export interface CourseHoleRow {
  hole_number: number;
  par_mens: number;
  par_ladies: number;
  par_juniors: number;
  stroke_index: number;
}

/**
 * Course hole rows as the engines read them: `par_mens` as `par`, and par per
 * tee (`parByGender`), like `buildUniformContext`. The hole page and the
 * scorecard pass them to the stroke views, so a new match's par strokes
 * (#2941) are summed over the same par as the board.
 */
export function toScoringHoles(rows: readonly CourseHoleRow[] | null): ScoringHole[] {
  return (rows ?? []).map((h) => ({
    number: h.hole_number,
    par: h.par_mens,
    parByGender: {
      mens: h.par_mens,
      ladies: h.par_ladies,
      juniors: h.par_juniors,
    },
    strokeIndex: h.stroke_index,
  }));
}
