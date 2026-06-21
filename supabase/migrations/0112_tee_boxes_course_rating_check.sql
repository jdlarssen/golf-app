-- 0112_tee_boxes_course_rating_check.sql
--
-- Legger til CHECK-constraints på tee_boxes.course_rating_{mens,ladies,juniors}
-- for å speile de eksisterende slope_*_check og par_total_*_check.
--
-- Bakgrunn: course_rating-kolonnene mangler DB CHECK (bekreftet på staging:
-- INSERT med course_rating_mens=999 ga 201 og persisterte). Validatoren
-- lib/courses/coursePayload.ts (parseGenderRating, CR_MIN=50/CR_MAX=80)
-- klipper out-of-range til null i UI-flyten, men direkte PostgREST-writes
-- bypass validatoren. AGENTS.md-felle #4: "a rule has one home."
--
-- Reachability: Enhver innlogget bruker kan opprette baner (0070 RLS) og
-- sette inn tee-bokser på dem, så dette er ikke admin-gated.
--
-- Impact: calculateCourseHandicap bruker courseRating - par direkte.
-- CR=999 vs par≈72 forskyver banehandicap med ~+927 for alle spillere i
-- et spill på den tee-en.
--
-- Grensene 50–80 speiler coursePayload.ts CR_MIN/CR_MAX (trap #4 agreement).
--
-- Scrubbing (steg 1 nedenfor):
--   ALTER TABLE feilet hvis det finnes tee_boxes-rader med out-of-range CR.
--   UPDATE-setningen nedenfor nullstiller disse til NULL.
--   Bør gi 0 rader på prod (test-raden på staging ble ryddet etter QA-sweep).
--   Owner bør bekrefte at UPDATE ga 0 rader i logg.

-- 1. Scrub out-of-range course_rating-verdier (sett til NULL).
update public.tee_boxes
set
  course_rating_mens    = case when course_rating_mens    < 50 or course_rating_mens    > 80 then null else course_rating_mens    end,
  course_rating_ladies  = case when course_rating_ladies  < 50 or course_rating_ladies  > 80 then null else course_rating_ladies  end,
  course_rating_juniors = case when course_rating_juniors < 50 or course_rating_juniors > 80 then null else course_rating_juniors end
where
  (course_rating_mens    is not null and (course_rating_mens    < 50 or course_rating_mens    > 80))
  or (course_rating_ladies  is not null and (course_rating_ladies  < 50 or course_rating_ladies  > 80))
  or (course_rating_juniors is not null and (course_rating_juniors < 50 or course_rating_juniors > 80));

-- 2. Legg til CHECK-constraints parallelt med slope_*_check og par_total_*_check.
alter table public.tee_boxes
  add constraint tee_boxes_course_rating_mens_check
    check (course_rating_mens    is null or (course_rating_mens    >= 50 and course_rating_mens    <= 80)),
  add constraint tee_boxes_course_rating_ladies_check
    check (course_rating_ladies  is null or (course_rating_ladies  >= 50 and course_rating_ladies  <= 80)),
  add constraint tee_boxes_course_rating_juniors_check
    check (course_rating_juniors is null or (course_rating_juniors >= 50 and course_rating_juniors <= 80));
