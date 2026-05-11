-- Conditional score upsert: keep the row whose client_updated_at is newest.
-- Returns the final stored row (which may be the row that was already there,
-- if the caller's client_updated_at is older).
create or replace function public.upsert_score_if_newer(
  p_game_id uuid,
  p_user_id uuid,
  p_hole_number int,
  p_strokes int,
  p_entered_by uuid,
  p_client_updated_at timestamptz
) returns table(
  game_id uuid,
  user_id uuid,
  hole_number int,
  strokes int,
  entered_by uuid,
  client_updated_at timestamptz,
  updated_at timestamptz,
  was_applied boolean
)
language plpgsql
security invoker  -- still gated by RLS on the underlying scores table
as $$
declare
  v_existing public.scores%rowtype;
begin
  select * into v_existing
    from public.scores
   where scores.game_id = p_game_id
     and scores.user_id = p_user_id
     and scores.hole_number = p_hole_number;

  if not found then
    insert into public.scores(
      game_id, user_id, hole_number, strokes, entered_by, client_updated_at
    ) values (
      p_game_id, p_user_id, p_hole_number, p_strokes, p_entered_by, p_client_updated_at
    )
    returning scores.game_id, scores.user_id, scores.hole_number, scores.strokes,
              scores.entered_by, scores.client_updated_at, scores.updated_at, true
    into game_id, user_id, hole_number, strokes, entered_by,
         client_updated_at, updated_at, was_applied;
    return next;
    return;
  end if;

  if p_client_updated_at > v_existing.client_updated_at then
    update public.scores
       set strokes = p_strokes,
           entered_by = p_entered_by,
           client_updated_at = p_client_updated_at,
           updated_at = now()
     where scores.game_id = p_game_id
       and scores.user_id = p_user_id
       and scores.hole_number = p_hole_number
    returning scores.game_id, scores.user_id, scores.hole_number, scores.strokes,
              scores.entered_by, scores.client_updated_at, scores.updated_at, true
    into game_id, user_id, hole_number, strokes, entered_by,
         client_updated_at, updated_at, was_applied;
    return next;
    return;
  end if;

  -- Existing row is newer or equal — return it untouched.
  game_id := v_existing.game_id;
  user_id := v_existing.user_id;
  hole_number := v_existing.hole_number;
  strokes := v_existing.strokes;
  entered_by := v_existing.entered_by;
  client_updated_at := v_existing.client_updated_at;
  updated_at := v_existing.updated_at;
  was_applied := false;
  return next;
end;
$$;
