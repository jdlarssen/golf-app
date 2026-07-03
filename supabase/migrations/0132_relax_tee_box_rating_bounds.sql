-- 0132_relax_tee_box_rating_bounds.sql
--
-- Relaxes the upper sanity bounds on tee_boxes slope + course_rating so real
-- published Norwegian course data can be entered.
--
-- Bakgrunn: bane-skjemaet avviste ekte tall fra Miklagard (DAMER: slope 157,
-- CR 81,9). Grensene var:
--   * slope 55–155  — WHS-taket er 155, men enkelte baner har publisert eldre,
--                     ukappede ratinger like over (Miklagard: 157).
--   * course_rating 50–80 — 80 hadde ingen WHS-basis; damer fra lange tee-er
--                     passerer rutinemessig 80 (Miklagard: 81,9).
--
-- Nye bounds (fornuftsvakt mot tastefeil, ikke WHS-konformitet):
--   * slope         55–165
--   * course_rating 50–90
--
-- Speiler SLOPE_MIN/MAX + CR_MIN/MAX i lib/courses/coursePayload.ts og
-- max-attributtene i CourseForm.tsx (trap #4: én regel, fire hjem). Enighet
-- verifiseres av lib/courses/teeRatingDbCheck.test.ts.
--
-- Widening only — ingen eksisterende rad kan bryte en romsligere CHECK, så
-- ingen data-scrub trengs.

alter table public.tee_boxes
  drop constraint if exists tee_boxes_slope_mens_check,
  drop constraint if exists tee_boxes_slope_ladies_check,
  drop constraint if exists tee_boxes_slope_juniors_check,
  drop constraint if exists tee_boxes_course_rating_mens_check,
  drop constraint if exists tee_boxes_course_rating_ladies_check,
  drop constraint if exists tee_boxes_course_rating_juniors_check;

alter table public.tee_boxes
  add constraint tee_boxes_slope_mens_check
    check (slope_mens    is null or (slope_mens    >= 55 and slope_mens    <= 165)),
  add constraint tee_boxes_slope_ladies_check
    check (slope_ladies  is null or (slope_ladies  >= 55 and slope_ladies  <= 165)),
  add constraint tee_boxes_slope_juniors_check
    check (slope_juniors is null or (slope_juniors >= 55 and slope_juniors <= 165)),
  add constraint tee_boxes_course_rating_mens_check
    check (course_rating_mens    is null or (course_rating_mens    >= 50 and course_rating_mens    <= 90)),
  add constraint tee_boxes_course_rating_ladies_check
    check (course_rating_ladies  is null or (course_rating_ladies  >= 50 and course_rating_ladies  <= 90)),
  add constraint tee_boxes_course_rating_juniors_check
    check (course_rating_juniors is null or (course_rating_juniors >= 50 and course_rating_juniors <= 90));
