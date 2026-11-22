-- 0256: tee_boxes.par_total_* — one rule with the course form: 54–108.
--
-- Owner-ordered audit 2026-11-20. The par total of a tee is the sum of the
-- holes' par for that gender (parseCourseHolesAndTees derives it; nobody types
-- it). course_holes.par_* allows 3–6 per hole, and a stored course always has
-- 18 holes (a 9-hole course is stored as 18, #2484), so every sum lands in
-- 18 × 3 = 54 … 18 × 6 = 108. The CHECKs from 0029 said 60–80, so a par-3
-- course (54) passed the form and the database refused it with a generic
-- error. The bounds now live once in lib/courses/coursePayload.ts
-- (PAR_TOTAL_BOUNDS), and coursePayload.parTotal.test.ts locks this file to
-- them (AGENTS.md trap 4).
--
-- 0029 declared the checks inline, so Postgres named them
-- tee_boxes_par_total_<gender>_check. They are dropped and added again under
-- the same names, now written so the agreement test can read them.
--
-- Widening only: 54–108 contains 60–80, so no existing row can fail it. A null
-- still passes (a gender without a rating has no par total).
--
-- Prod order: BEFORE or AFTER the code, either works. Old code with the new
-- CHECK accepts par-3 courses one deploy early; new code with the old CHECK
-- refuses them as before (generic error), nothing else changes.

alter table public.tee_boxes
  drop constraint if exists tee_boxes_par_total_mens_check,
  drop constraint if exists tee_boxes_par_total_ladies_check,
  drop constraint if exists tee_boxes_par_total_juniors_check;

alter table public.tee_boxes
  add constraint tee_boxes_par_total_mens_check check (par_total_mens between 54 and 108),
  add constraint tee_boxes_par_total_ladies_check check (par_total_ladies between 54 and 108),
  add constraint tee_boxes_par_total_juniors_check check (par_total_juniors between 54 and 108);
