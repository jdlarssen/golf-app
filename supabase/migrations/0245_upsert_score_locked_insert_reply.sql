-- 0245_upsert_score_locked_insert_reply.sql
-- upsert_score_if_newer answers a locked card the same way on both paths.
--
-- 0123 rebuilt the RPC for putts and dropped the 0102 "frozen" branch, so a
-- delivered or withdrawn player's card is now guarded by RLS alone. That is
-- right (RLS is the one home of the rule, and admins pass it), but the two
-- write paths answered differently:
--
--   UPDATE (row exists):  RLS filters the row away; `returning … into` leaves
--                         every OUT column NULL. The client reads that as
--                         'refused' (#2211) and settles on the first drain.
--   INSERT (first stroke): RLS raises 42501. The client retried that up to
--                         MAX_PERMANENT_ATTEMPTS times, showing a failed save,
--                         before it settled.
--
-- The INSERT branch now catches exactly that error (insufficient_privilege)
-- and returns the same all-NULL row. No rule is added or copied here: who may
-- write is still decided by the RLS policies only. Every other error (CHECK,
-- foreign key, unique race) still raises.
--
-- Same signature, body and settings as the live function (staging, read
-- 2026-11-20) apart from the exception block. Backward compatible: the web and
-- app clients already read the all-NULL row as 'refused'. Safe before or after
-- the code deploy.

create or replace function public.upsert_score_if_newer(
  p_game_id uuid,
  p_user_id uuid,
  p_hole_number int,
  p_strokes int,
  p_entered_by uuid,
  p_client_updated_at timestamptz,
  p_putts int default null
) returns table(
  game_id uuid,
  user_id uuid,
  hole_number int,
  strokes int,
  putts int,
  entered_by uuid,
  client_updated_at timestamptz,
  updated_at timestamptz,
  was_applied boolean
)
language plpgsql
security invoker  -- still gated by RLS on the underlying scores table
set search_path = ''
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
    begin
      insert into public.scores(
        game_id, user_id, hole_number, strokes, putts, entered_by, client_updated_at
      ) values (
        p_game_id, p_user_id, p_hole_number, p_strokes, p_putts, p_entered_by, p_client_updated_at
      )
      returning scores.game_id, scores.user_id, scores.hole_number, scores.strokes, scores.putts,
                scores.entered_by, scores.client_updated_at, scores.updated_at, true
      into game_id, user_id, hole_number, strokes, putts, entered_by,
           client_updated_at, updated_at, was_applied;
    exception when insufficient_privilege then
      -- RLS refused the first stroke (card delivered or withdrawn, round not
      -- active, or not the caller's to write). Answer like the UPDATE path.
      game_id := null;
      user_id := null;
      hole_number := null;
      strokes := null;
      putts := null;
      entered_by := null;
      client_updated_at := null;
      updated_at := null;
      was_applied := null;
    end;
    return next;
    return;
  end if;

  if p_client_updated_at > v_existing.client_updated_at then
    update public.scores
       set strokes = p_strokes,
           putts = p_putts,
           entered_by = p_entered_by,
           client_updated_at = p_client_updated_at,
           updated_at = now()
     where scores.game_id = p_game_id
       and scores.user_id = p_user_id
       and scores.hole_number = p_hole_number
    returning scores.game_id, scores.user_id, scores.hole_number, scores.strokes, scores.putts,
              scores.entered_by, scores.client_updated_at, scores.updated_at, true
    into game_id, user_id, hole_number, strokes, putts, entered_by,
         client_updated_at, updated_at, was_applied;
    return next;
    return;
  end if;

  -- Existing row is newer or equal — return it untouched.
  game_id := v_existing.game_id;
  user_id := v_existing.user_id;
  hole_number := v_existing.hole_number;
  strokes := v_existing.strokes;
  putts := v_existing.putts;
  entered_by := v_existing.entered_by;
  client_updated_at := v_existing.client_updated_at;
  updated_at := v_existing.updated_at;
  was_applied := false;
  return next;
end;
$$;
