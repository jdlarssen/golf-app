-- 0071_games_creator_rls.sql
-- #427 (#22 Fase 1): let any logged-in user create + run + finish their OWN game.
--
-- Mirrors the #366 courses pattern: real RLS insert/update-own policies instead
-- of routing non-admin writes through the service-role client (getAdminClient).
-- All policies below are PERMISSIVE → they OR with the existing admin / self /
-- is_in_game policies from 0002/0003/0024/0043, so admin and player flows are
-- untouched. Additive + permissive → safe to apply before the code deploys.
--
-- Ownership anchor: games.created_by = auth.uid(). game_players and
-- game_side_winners gate on a subquery against their parent game's created_by
-- (same shape as #366's course_holes/tee_boxes → courses subquery).

-- ── games ──────────────────────────────────────────────────────────────────

-- A non-playing creator must be able to SELECT their own game (they aren't a
-- participant, so the existing "games select if participant or admin" won't
-- match). Separate permissive policy OR-ed with the existing one.
create policy "games select own created"
  on public.games for select
  to authenticated
  using (created_by = auth.uid());

create policy "games creator insert"
  on public.games for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "games creator update"
  on public.games for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy "games creator delete"
  on public.games for delete
  to authenticated
  using (created_by = auth.uid());

-- ── game_players ─────────────────────────────────────────────────────────────

create policy "game_players creator insert"
  on public.game_players for insert
  to authenticated
  with check (exists (
    select 1 from public.games g
    where g.id = game_players.game_id
      and g.created_by = auth.uid()
  ));

create policy "game_players creator update"
  on public.game_players for update
  to authenticated
  using (exists (
    select 1 from public.games g
    where g.id = game_players.game_id
      and g.created_by = auth.uid()
  ))
  with check (exists (
    select 1 from public.games g
    where g.id = game_players.game_id
      and g.created_by = auth.uid()
  ));

create policy "game_players creator delete"
  on public.game_players for delete
  to authenticated
  using (exists (
    select 1 from public.games g
    where g.id = game_players.game_id
      and g.created_by = auth.uid()
  ));

-- ── game_side_winners ────────────────────────────────────────────────────────

create policy "game_side_winners creator all"
  on public.game_side_winners for all
  to authenticated
  using (exists (
    select 1 from public.games g
    where g.id = game_side_winners.game_id
      and g.created_by = auth.uid()
  ))
  with check (exists (
    select 1 from public.games g
    where g.id = game_side_winners.game_id
      and g.created_by = auth.uid()
  ));

-- ── incomplete_profiles_for_ids RPC ──────────────────────────────────────────
--
-- The publish-gate (createGameInternal) and startScheduledGame's pending-defense
-- need to know which roster members still have an incomplete profile
-- (profile_completed_at IS NULL). Under request-scoped RLS a creator can't read
-- OTHER users' rows, so a direct read would silently return nothing → the gate
-- would no-op (the #366 pending-read trap). This SECURITY DEFINER helper bypasses
-- RLS for a tightly-scoped read: it returns ONLY incomplete rows, ONLY for the
-- exact ids the caller already supplies (UUIDs aren't enumerable). Keeps the
-- now-public create action free of the service-role client entirely.
create or replace function public.incomplete_profiles_for_ids(p_user_ids uuid[])
  returns table(id uuid, email text)
  language sql
  security definer
  stable
  set search_path = ''
  as $$
    select u.id, u.email
    from public.users u
    where u.id = any(p_user_ids)
      and u.profile_completed_at is null;
  $$;

-- Lock execution to signed-in users only. Supabase's default privileges grant
-- EXECUTE to both `anon` and `authenticated` on every new function in `public`,
-- which would let `anon` probe arbitrary UUIDs for profile-completion + emails
-- via the auto-exposed /rest/v1/rpc endpoint. Revoke the public + anon grants,
-- keep authenticated.
revoke all on function public.incomplete_profiles_for_ids(uuid[]) from public;
revoke execute on function public.incomplete_profiles_for_ids(uuid[]) from anon;
grant execute on function public.incomplete_profiles_for_ids(uuid[]) to authenticated;
