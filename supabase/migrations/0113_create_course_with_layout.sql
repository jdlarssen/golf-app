-- 0113: create_course_with_layout — atomic course creation (#737)
--
-- createCourse previously inserted courses → course_holes → tee_boxes as three
-- sequential PostgREST inserts with NO rollback. A failure on either child
-- insert left an orphan `courses` row. Compensating delete (the #675 pattern)
-- does NOT work here: a non-admin creator has no DELETE policy on `courses`
-- (only "courses admin delete", 0092), so the cleanup delete is blocked by RLS
-- and the orphan persists. Per #737 scope 3, this is exactly the path that needs
-- a real transaction.
--
-- This SECURITY DEFINER RPC does all three inserts in one statement-block, i.e.
-- one transaction: any failure (DB error or CHECK violation) rolls the whole
-- thing back, so a half-built course can never be committed.
--
-- Authz: created_by is forced to auth.uid() inside the function — never client-
-- supplied (any logged-in user may create their own course, #366). The function
-- bypasses RLS (SECURITY DEFINER), but every table's CHECK constraints still
-- fire inside the transaction (par/stroke_index, tee_boxes.course_rating #817/
-- 0112), so an invalid payload aborts the txn and surfaces as an RPC error.
--
-- Column shapes verified against live prod schema (trap #1):
--   course_holes  — composite PK (course_id, hole_number); no surrogate id.
--   tee_boxes     — course_rating_* are numeric; id/created_at default-generated.

create or replace function public.create_course_with_layout(
  p_name text,
  p_holes jsonb,
  p_tees jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_course_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  insert into public.courses (name, created_by)
  values (p_name, v_uid)
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

-- Only logged-in users invoke this (the action gates on auth first); the
-- function self-enforces created_by = auth.uid(), so no broader grant is safe.
revoke all on function public.create_course_with_layout(text, jsonb, jsonb) from public;
grant execute on function public.create_course_with_layout(text, jsonb, jsonb) to authenticated;
