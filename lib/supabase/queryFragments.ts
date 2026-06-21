/**
 * Shared PostgREST `.select(...)` column fragments (#815).
 *
 * Two column-block strings were copy-pasted across ~13 files with no shared
 * constant: the `course_holes` per-gender-par projection and the `scores`
 * per-player projection. The per-gender-par split (`par_mens`/`_ladies`/
 * `_juniors`) once forced a one-commit edit across ~10 files — exactly the kind
 * of wide blast radius a single rename-point removes.
 *
 * NOTE: these are plain string fragments, not schema-derived. `.returns<Row>()`
 * at the call-site is still a manual cast — the durable type-safety fix is
 * `SupabaseClient<Database>` on the helper params, tracked separately (#672
 * follow-up). Keep the row types here in lock-step with the strings by hand.
 *
 * For prefixed variants (e.g. cup/liga snapshots selecting the FK column too),
 * concat via template literal: `` `course_id, ${COURSE_HOLES_SELECT}` ``.
 */

export const COURSE_HOLES_SELECT =
  'hole_number, par_mens, par_ladies, par_juniors, stroke_index' as const;

export const SCORES_SELECT = 'user_id, hole_number, strokes' as const;

export type CourseHoleRow = {
  hole_number: number;
  par_mens: number;
  par_ladies: number;
  par_juniors: number;
  stroke_index: number;
};

export type ScoreRow = {
  user_id: string;
  hole_number: number;
  strokes: number | null;
};
