-- 0224: the tee colour through the course RPCs (#2486)
--
-- 0206 added tee_boxes.color (#2277), but create_course_with_layout and
-- update_course_with_layout read the tee rows with jsonb_to_recordset and named
-- columns only, so a `color` in the payload was dropped without a word. Both
-- functions are replaced with their 0223 bodies (#2484, p_nine_holes kept)
-- unchanged except for `color`: one more column in each recordset, in both tee
-- inserts and in the update set. tee_boxes_color_check (0206) still fires
-- inside the transaction, so a colour outside the palette aborts the whole
-- create or edit.
--
-- The signatures are 0223's, so `create or replace` keeps every grant and
-- setting: create stays SECURITY DEFINER with search_path = public and without
-- execute for anon (#1121); update stays SECURITY INVOKER, so RLS is still its
-- authz layer.
--
-- Direction: old code with this applied sends no `color`, and the recordset
-- reads it as null, which is what every tee has today. New code without this
-- migration sends `color` and the 0223 functions drop it, so no colour is
-- saved but nothing fails. Apply it before the code all the same, so colours
-- are kept from the first deploy.

create or replace function public.create_course_with_layout(
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
    (course_id, name, color, length_meters,
     slope_mens, course_rating_mens, par_total_mens,
     slope_ladies, course_rating_ladies, par_total_ladies,
     slope_juniors, course_rating_juniors, par_total_juniors)
  select
    v_course_id, t.name, t.color, t.length_meters,
    t.slope_mens, t.course_rating_mens, t.par_total_mens,
    t.slope_ladies, t.course_rating_ladies, t.par_total_ladies,
    t.slope_juniors, t.course_rating_juniors, t.par_total_juniors
  from jsonb_to_recordset(p_tees) as t(
    name text,
    color text,
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

create or replace function public.update_course_with_layout(
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
    color = u.color,
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
    id uuid, name text, color text, length_meters int,
    slope_mens int, course_rating_mens numeric, par_total_mens int,
    slope_ladies int, course_rating_ladies numeric, par_total_ladies int,
    slope_juniors int, course_rating_juniors numeric, par_total_juniors int
  )
  where t.id = u.id and t.course_id = p_course_id;

  insert into public.tee_boxes
    (course_id, name, color, length_meters,
     slope_mens, course_rating_mens, par_total_mens,
     slope_ladies, course_rating_ladies, par_total_ladies,
     slope_juniors, course_rating_juniors, par_total_juniors)
  select
    p_course_id, i.name, i.color, i.length_meters,
    i.slope_mens, i.course_rating_mens, i.par_total_mens,
    i.slope_ladies, i.course_rating_ladies, i.par_total_ladies,
    i.slope_juniors, i.course_rating_juniors, i.par_total_juniors
  from jsonb_to_recordset(p_tee_inserts) as i(
    name text, color text, length_meters int,
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
