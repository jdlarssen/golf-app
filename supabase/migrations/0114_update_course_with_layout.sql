-- 0114: update_course_with_layout — atomic course editing (#846)
--
-- updateCourse rewrote a course in many non-transactional steps: UPDATE courses
-- → DELETE all course_holes → INSERT new holes → per-tee UPDATE/INSERT loop →
-- hard-delete unused tees → archive in-use tees. A failure mid-sequence left the
-- course inconsistent. Worst case: between the holes DELETE and INSERT the course
-- has ZERO holes — if the insert fails, leaderboards crash (#642-class) and the
-- course is broken. A compensating delete can't fix an edit (there's no parent to
-- drop to undo it); only a transaction rolls back to the prior state.
--
-- This function runs every write in one statement-block (one transaction): any
-- failure (DB error or CHECK violation) rolls the whole edit back.
--
-- SECURITY INVOKER (NOT definer): "trusted creator" is a TS email allowlist
-- (isTrustedCreator, #198) with no DB representation, so a definer function could
-- not authz that role without becoming a hole (trap #3 — direct PostgREST calls).
-- As invoker, RLS stays the authz layer for direct JWT calls: the courses/
-- course_holes/tee_boxes write policies are is_admin()-only (0092), so a non-admin
-- calling this directly via their JWT is blocked. The trusted-creator path goes
-- through the service-role client (TS-gated + ownership-checked in updateCourse),
-- exactly as the sequential writes did before.
--
-- The tee diff (which tees to update / insert / hard-delete / archive, split by a
-- games.tee_box_id FK lookup) stays in TS where it's tested; this function is a
-- dumb atomic executor that applies the pre-computed plan.
--
-- Column shapes verified against live prod schema (trap #1): course_holes has a
-- composite PK (course_id, hole_number) and no surrogate id; tee_boxes.course_
-- rating_* are numeric.

create or replace function public.update_course_with_layout(
  p_course_id uuid,
  p_name text,
  p_updated_by uuid,
  p_holes jsonb,
  p_tee_updates jsonb,
  p_tee_inserts jsonb,
  p_tee_hard_delete jsonb,  -- JSON array of tee-id strings (uniform jsonb avoids
  p_tee_archive jsonb       -- PostgREST uuid[]-coercion ambiguity from supabase-js)
) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.courses
    set name = p_name, updated_at = now(), updated_by = p_updated_by
    where id = p_course_id;

  -- Holes are delete-and-reinsert (no FK from games/scores into course_holes —
  -- scores key on hole_number int). Atomic now, so the 0-holes window is gone.
  delete from public.course_holes where course_id = p_course_id;
  insert into public.course_holes
    (course_id, hole_number, par_mens, par_ladies, par_juniors, stroke_index)
  select
    p_course_id, h.hole_number, h.par_mens, h.par_ladies, h.par_juniors, h.stroke_index
  from jsonb_to_recordset(p_holes) as h(
    hole_number int, par_mens int, par_ladies int, par_juniors int, stroke_index int
  );

  -- Existing tees: update in place by id. The `course_id` guard rejects a tee id
  -- from another course slipped into the payload (defense-in-depth).
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
    id uuid,
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
  )
  where t.id = u.id and t.course_id = p_course_id;

  -- New tees: insert with a generated id.
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

  -- Removed tees with no game references: hard delete. (coalesce so a null
  -- payload is treated as the empty list — a no-op, never a null-array error.)
  delete from public.tee_boxes
    where course_id = p_course_id
      and id in (
        select e::uuid
        from jsonb_array_elements_text(coalesce(p_tee_hard_delete, '[]'::jsonb)) e
      );

  -- Removed tees still referenced by a game: soft-archive to keep FK integrity.
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
  uuid, text, uuid, jsonb, jsonb, jsonb, jsonb, jsonb
) from public;
grant execute on function public.update_course_with_layout(
  uuid, text, uuid, jsonb, jsonb, jsonb, jsonb, jsonb
) to authenticated;
