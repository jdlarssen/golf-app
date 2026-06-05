-- 0073_block_withdrawn_score_writes.sql
-- WD defense-in-depth (#387): a withdrawn player (game_players.withdrawn_at set)
-- must not be able to write new scores. #386 froze them out of the ranking and
-- locked score-entry client-side; the submit/scorecard routes get server-side
-- gates in the app layer. This migration closes the score-WRITE loophole at the
-- database, where it can't be bypassed by a direct API call.
--
-- Two layers (the sync worker — lib/sync/syncWorker.ts — drives the choice):
--   1) upsert_score_if_newer guard. The sync worker treats an RPC *error* as
--      "retry forever" (item stays queued, re-fired every 30s/online/focus) but
--      `error == null && was_applied == false` as "consumed" (queue item
--      deleted). So for a withdrawn target the RPC returns a graceful no-op
--      (was_applied = false) WITHOUT attempting a write — the offline queue
--      drains cleanly instead of looping on the RLS reject below.
--   2) RLS WITH CHECK on scores INSERT/UPDATE. Mirrors the existing
--      submitted_at-frozen guard, extending `submitted_at is not null` to
--      `(submitted_at is not null or withdrawn_at is not null)`. Blocks any
--      *direct* (non-RPC) write to a withdrawn player's scores.
--
-- The layers don't collide: the RPC guard returns before any write, so the RLS
-- WITH CHECK is never evaluated via the RPC for a withdrawn target. A direct
-- write hits the RLS reject (the intended block; there's no sync queue for
-- direct writes, so no retry loop).
--
-- Existing scores are preserved (neither layer touches stored rows). Un-withdraw
-- (angre → withdrawn_at = null) resumes writes immediately. Backward-compatible:
-- only withdrawn players are affected, and the old client always writes via the
-- RPC — safe to apply before or after the code deploy.

-- ── Layer 1: RPC guard ──────────────────────────────────────────────────────
-- Conditional score upsert: keep the row whose client_updated_at is newest.
-- Returns the final stored row (which may be the row that was already there,
-- if the caller's client_updated_at is older). For a withdrawn target it
-- returns a no-op without writing (see header).
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
  v_has_existing boolean;
  v_withdrawn boolean;
begin
  select * into v_existing
    from public.scores
   where scores.game_id = p_game_id
     and scores.user_id = p_user_id
     and scores.hole_number = p_hole_number;
  -- Capture existence now: the withdrawn EXISTS below would otherwise clobber
  -- the implicit `found` flag the original insert-branch relied on.
  v_has_existing := found;

  -- WD (#387) guard: a withdrawn player's scores are frozen. Return a graceful
  -- no-op so the sync queue drains instead of looping on the RLS reject.
  select exists(
    select 1 from public.game_players gp
     where gp.game_id = p_game_id
       and gp.user_id = p_user_id
       and gp.withdrawn_at is not null
  ) into v_withdrawn;

  if v_withdrawn then
    if v_has_existing then
      game_id := v_existing.game_id;
      user_id := v_existing.user_id;
      hole_number := v_existing.hole_number;
      strokes := v_existing.strokes;
      entered_by := v_existing.entered_by;
      client_updated_at := v_existing.client_updated_at;
      updated_at := v_existing.updated_at;
    else
      game_id := p_game_id;
      user_id := p_user_id;
      hole_number := p_hole_number;
      strokes := p_strokes;
      entered_by := p_entered_by;
      client_updated_at := p_client_updated_at;
      updated_at := null;
    end if;
    was_applied := false;
    return next;
    return;
  end if;

  if not v_has_existing then
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

-- ── Layer 2: RLS WITH CHECK ─────────────────────────────────────────────────
-- Recreate the two write policies with the withdrawn condition added to the
-- existing submitted_at-frozen subquery. Verified against live pg_policies —
-- these match 0002 verbatim aside from the added `or gp.withdrawn_at is not null`.
drop policy if exists "scores insert by flight" on public.scores;
create policy "scores insert by flight" on public.scores
  for insert with check (
    public.is_admin()
    or (
      exists(select 1 from public.games g where g.id = public.scores.game_id and g.status = 'active')
      and entered_by = auth.uid()
      and (user_id = auth.uid() or public.same_flight(public.scores.game_id, public.scores.user_id))
      and not exists(
        select 1 from public.game_players gp
        where gp.game_id = public.scores.game_id
          and gp.user_id = public.scores.user_id
          and (gp.submitted_at is not null or gp.withdrawn_at is not null)
      )
    )
  );

drop policy if exists "scores update by flight" on public.scores;
create policy "scores update by flight" on public.scores
  for update using (
    public.is_admin()
    or (
      exists(select 1 from public.games g where g.id = public.scores.game_id and g.status = 'active')
      and (user_id = auth.uid() or public.same_flight(public.scores.game_id, public.scores.user_id))
      and not exists(
        select 1 from public.game_players gp
        where gp.game_id = public.scores.game_id
          and gp.user_id = public.scores.user_id
          and (gp.submitted_at is not null or gp.withdrawn_at is not null)
      )
    )
  ) with check (entered_by = auth.uid() or public.is_admin());
