-- 0223_courses_nine_holes.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- #2484: a 9-hole course played twice is typed in once, with both indices.
--
--   1. courses.nine_holes — true for a 9-hole course played twice. The course
--      still has 18 rows in course_holes: holes 10–18 copy the par of 1–9 and
--      carry the second round's stroke index (lib/courses/nineHoles.ts expands
--      the nine). Scoring, scorecards and the app read the 18 rows as before;
--      the flag only tells the form, the course page and the wizard to show
--      one nine with two index rows.
--   2. create_course_with_layout and update_course_with_layout take
--      p_nine_holes. The old signatures are dropped in the same migration so
--      PostgREST never sees two overloads. Grants are restated (DROP loses
--      them): create stays authenticated-only (0113 + #1121's anon revoke),
--      update stays authenticated (0114).
--   3. The hole count is locked once the course is used in a round
--      (games.course_id, any status: switching rewrites par 10–18).
--      update_course_with_layout raises 'nine_holes_locked'; updateCourse
--      turns that into ?error=hole_count_locked. The function is SECURITY
--      INVOKER and only admins pass the courses write policy (0092); an admin
--      reads every game, so the games lookup sees them all.
--
-- Direction (what does OLD code do with this applied?): old code calls the RPCs
-- without p_nine_holes, and the default false keeps every call working; no
-- course is flagged. NEW code without this migration fails: PostgREST answers
-- 404 on the unknown argument, so this must reach prod BEFORE the code.

alter table public.courses
  add column nine_holes boolean not null default false;

comment on column public.courses.nine_holes is
  '9-hullsbane som spilles to ganger (#2484). Hull 10–18 i course_holes er kopier av 1–9 med andre runders indeks.';

-- ── create_course_with_layout ────────────────────────────────────────────────
drop function public.create_course_with_layout(text, jsonb, jsonb);

create function public.create_course_with_layout(
  p_name text,
  p_holes jsonb,
  p_tees jsonb,
  p_nine_holes boolean default false
)
  returns uuid
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_course_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  insert into public.courses (name, created_by, nine_holes)
  values (p_name, v_uid, coalesce(p_nine_holes, false))
  returning id into v_course_id;

  insert into public.course_holes
    (course_id, hole_number, par_mens, par_ladies, par_juniors, stroke_index)
  select
    v_course_id, h.hole_number, h.par_mens, h.par_ladies, h.par_juniors, h.stroke_index
  from jsonb_to_recordset(p_holes) as h(
    hole_number int,
    par_mens int,
    par_ladies int,
    par_juniors int,
    stroke_index int
  );

  insert into public.tee_boxes
    (course_id, name, length_meters,
     slope_mens, course_rating_mens, par_total_mens,
     slope_ladies, course_rating_ladies, par_total_ladies,
     slope_juniors, course_rating_juniors, par_total_juniors)
  select
    v_course_id, t.name, t.length_meters,
    t.slope_mens, t.course_rating_mens, t.par_total_mens,
    t.slope_ladies, t.course_rating_ladies, t.par_total_ladies,
    t.slope_juniors, t.course_rating_juniors, t.par_total_juniors
  from jsonb_to_recordset(p_tees) as t(
    name text,
    length_meters int,
    slope_mens int,
    course_rating_mens numeric,
    par_total_mens int,
    slope_ladies int,
    course_rating_ladies numeric,
    par_total_ladies int,
    slope_juniors int,
    course_rating_juniors numeric,
    par_total_juniors int
  );

  return v_course_id;
end;
$$;

revoke all on function public.create_course_with_layout(text, jsonb, jsonb, boolean) from public;
revoke execute on function public.create_course_with_layout(text, jsonb, jsonb, boolean) from anon;
grant execute on function public.create_course_with_layout(text, jsonb, jsonb, boolean) to authenticated;

-- ── update_course_with_layout ────────────────────────────────────────────────
drop function public.update_course_with_layout(uuid, text, uuid, jsonb, jsonb, jsonb, jsonb, jsonb);

create function public.update_course_with_layout(
  p_course_id uuid,
  p_name text,
  p_updated_by uuid,
  p_holes jsonb,
  p_tee_updates jsonb,
  p_tee_inserts jsonb,
  p_tee_hard_delete jsonb,
  p_tee_archive jsonb,
  p_nine_holes boolean default false
)
  returns void
  language plpgsql
  set search_path to 'public'
as $$
begin
  if coalesce(p_nine_holes, false) is distinct from
       (select c.nine_holes from public.courses c where c.id = p_course_id)
     and exists (select 1 from public.games g where g.course_id = p_course_id) then
    raise exception 'nine_holes_locked';
  end if;

  update public.courses
    set name = p_name,
        nine_holes = coalesce(p_nine_holes, false),
        updated_at = now(),
        updated_by = p_updated_by
    where id = p_course_id;

  delete from public.course_holes where course_id = p_course_id;
  insert into public.course_holes
    (course_id, hole_number, par_mens, par_ladies, par_juniors, stroke_index)
  select
    p_course_id, h.hole_number, h.par_mens, h.par_ladies, h.par_juniors, h.stroke_index
  from jsonb_to_recordset(p_holes) as h(
    hole_number int, par_mens int, par_ladies int, par_juniors int, stroke_index int
  );

  update public.tee_boxes t set
    name = u.name,
    length_meters = u.length_meters,
    slope_mens = u.slope_mens,
    course_rating_mens = u.course_rating_mens,
    par_total_mens = u.par_total_mens,
    slope_ladies = u.slope_ladies,
    course_rating_ladies = u.course_rating_ladies,
    par_total_ladies = u.par_total_ladies,
    slope_juniors = u.slope_juniors,
    course_rating_juniors = u.course_rating_juniors,
    par_total_juniors = u.par_total_juniors
  from jsonb_to_recordset(p_tee_updates) as u(
    id uuid, name text, length_meters int,
    slope_mens int, course_rating_mens numeric, par_total_mens int,
    slope_ladies int, course_rating_ladies numeric, par_total_ladies int,
    slope_juniors int, course_rating_juniors numeric, par_total_juniors int
  )
  where t.id = u.id and t.course_id = p_course_id;

  insert into public.tee_boxes
    (course_id, name, length_meters,
     slope_mens, course_rating_mens, par_total_mens,
     slope_ladies, course_rating_ladies, par_total_ladies,
     slope_juniors, course_rating_juniors, par_total_juniors)
  select
    p_course_id, i.name, i.length_meters,
    i.slope_mens, i.course_rating_mens, i.par_total_mens,
    i.slope_ladies, i.course_rating_ladies, i.par_total_ladies,
    i.slope_juniors, i.course_rating_juniors, i.par_total_juniors
  from jsonb_to_recordset(p_tee_inserts) as i(
    name text, length_meters int,
    slope_mens int, course_rating_mens numeric, par_total_mens int,
    slope_ladies int, course_rating_ladies numeric, par_total_ladies int,
    slope_juniors int, course_rating_juniors numeric, par_total_juniors int
  );

  delete from public.tee_boxes
    where course_id = p_course_id
      and id in (
        select e::uuid
        from jsonb_array_elements_text(coalesce(p_tee_hard_delete, '[]'::jsonb)) e
      );

  update public.tee_boxes
    set archived_at = now()
    where course_id = p_course_id
      and id in (
        select e::uuid
        from jsonb_array_elements_text(coalesce(p_tee_archive, '[]'::jsonb)) e
      );
end;
$$;

revoke all on function public.update_course_with_layout(
  uuid, text, uuid, jsonb, jsonb, jsonb, jsonb, jsonb, boolean
) from public;
grant execute on function public.update_course_with_layout(
  uuid, text, uuid, jsonb, jsonb, jsonb, jsonb, jsonb, boolean
) to authenticated;
