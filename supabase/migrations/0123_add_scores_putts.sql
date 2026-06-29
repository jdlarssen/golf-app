-- 0123_add_scores_putts.sql
--
-- Feature #939: optional per-hole putt count alongside the stroke score.
--
-- Adds a nullable `putts` column to `scores` and threads it through the
-- `upsert_score_if_newer` LWW RPC so putts sync exactly like strokes do.
--
-- Design notes:
--   • putts is decoupled from strokes (no `putts <= strokes` CHECK) — putts may
--     be entered before or after the stroke, and coupling would create
--     ordering bugs. Range 0..10 is generous (realistic max ~6).
--   • The RPC gains `p_putts int default null` APPENDED with a default, so the
--     new function is backward-compatible: code that still calls the RPC with
--     the original 6 named args resolves fine (p_putts defaults to null). This
--     decouples the prod migration from the code deploy — the new RPC can be
--     applied to prod before the putts-aware client ships.
--   • Because adding a parameter is a NEW signature (not an in-place replace),
--     the old 6-arg function is dropped first to avoid an ambiguous PostgREST
--     overload when a 6-named-arg call could match both functions.
--   • putts inherits the existing `scores` row-RLS (SELECT/INSERT/UPDATE) and
--     the 0109 client_updated_at guard — no new column-level policy is needed.
--
-- ⚠ Apply to staging first, verify, then prod (per CLAUDE.md DB discipline).

-- 1) Nullable putts column with a generous sanity bound.
alter table public.scores
  add column if not exists putts int check (putts is null or putts between 0 and 10);

-- 2) Replace the LWW upsert RPC with a putts-aware version.
drop function if exists public.upsert_score_if_newer(uuid, uuid, int, int, uuid, timestamptz);

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
      game_id, user_id, hole_number, strokes, putts, entered_by, client_updated_at
    ) values (
      p_game_id, p_user_id, p_hole_number, p_strokes, p_putts, p_entered_by, p_client_updated_at
    )
    returning scores.game_id, scores.user_id, scores.hole_number, scores.strokes, scores.putts,
              scores.entered_by, scores.client_updated_at, scores.updated_at, true
    into game_id, user_id, hole_number, strokes, putts, entered_by,
         client_updated_at, updated_at, was_applied;
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
