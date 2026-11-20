-- 0250_league_and_cup_read_rules.sql
-- Who reads a league's links and a cup's rows gets one home: the database.
--
-- The rules (owner decision, audit 2026-11-20):
--   1. A league's two link columns, join_code and spectate_token, are not
--      selectable through a user session. The server reads them with the
--      service role, behind the gate of the page that shows them
--      (lib/league/joinLink.ts, lib/league/spectate.ts, getLigaSnapshot).
--      Same move as users.email in 0186.
--   2. A cup is read by the people in it: a participant, a player in one of
--      its matches, the organiser, the cup's club and a global admin.
--   3. A cup's participants, plan and side awards follow the cup: whoever may
--      read the cup reads them, nobody else.
--
-- The link-shared pages (/cup/[id], /cup/bli-med/[shortId], /liga/bli-med/[code],
-- the public embed) read with the service role behind their own gates, as
-- before. Nothing here changes what they show.
--
-- A NEW column on public.leagues needs its own `grant select (column)`, or the
-- app cannot see it: supabase/tests/league_cup_read_rules_test.sql goes red for
-- a column that is neither granted nor one of the two link columns.
-- UPDATE/INSERT grants are untouched. Writing a column does not need SELECT on
-- it, but a RETURNING or a WHERE on a column does: ask back `id`, never `*`.
--
-- Order: deploy the code first, then apply this. The code in this change works
-- against both the old and the new rules. The code before it reads the two
-- link columns with the organiser's own session and would fail on rule 1.

-- ── 1. Link columns on public.leagues ───────────────────────────────────────
revoke select on table public.leagues from anon, authenticated;

grant select (
  id,
  name,
  season_start,
  season_end,
  format,
  scoring,
  standings_model,
  missed_round_policy,
  penalty_kind,
  penalty_fixed_over_par,
  course_scope,
  course_id,
  tee_box_id,
  status,
  created_by,
  created_at,
  started_at,
  finished_at,
  group_id,
  best_n_count,
  is_simulator,
  sim_settings,
  hcp_allowance_pct,
  hcp_max_strokes
) on table public.leagues to anon, authenticated;

-- ── 2. Helpers ──────────────────────────────────────────────────────────────
-- Is the caller in this cup? Either on the cup's participant list, or a player
-- in one of its matches (a cup from before 0155 has no participant list). A
-- draft match does not count: a draft is the organiser's alone (0202).
create or replace function public.is_tournament_participant(p_tournament_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists(
      select 1 from public.tournament_participants tp
      where tp.tournament_id = p_tournament_id
        and tp.user_id = auth.uid()
    )
    or exists(
      select 1
      from public.games g
      join public.game_players gp on gp.game_id = g.id
      where g.tournament_id = p_tournament_id
        and gp.user_id = auth.uid()
        and g.status <> 'draft'
    );
$$;

revoke all on function public.is_tournament_participant(uuid) from public, anon;
grant execute on function public.is_tournament_participant(uuid) to authenticated, service_role;

-- May the caller read this cup? The one rule the cup's own rows and its child
-- rows share. The select policy on public.tournaments spells the same rule out
-- on the row itself, so an INSERT ... RETURNING sees the row it just wrote.
create or replace function public.can_view_tournament(p_tournament_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists(
      select 1 from public.tournaments t
      where t.id = p_tournament_id
        and (
          public.is_admin()
          or (t.group_id is not null and public.is_group_member(t.group_id))
          or (t.group_id is null and t.created_by = auth.uid())
        )
    )
    or public.is_tournament_participant(p_tournament_id);
$$;

revoke all on function public.can_view_tournament(uuid) from public, anon;
grant execute on function public.can_view_tournament(uuid) to authenticated, service_role;

-- ── 3. public.tournaments: read by the people in the cup ────────────────────
drop policy if exists "tournaments select scoped" on public.tournaments;

create policy "tournaments select scoped" on public.tournaments
  for select to authenticated
  using (
    public.is_admin()
    or (group_id is not null and public.is_group_member(group_id))
    or (group_id is null and created_by = (select auth.uid()))
    or public.is_tournament_participant(id)
  );

-- ── 4. The cup's child rows follow the cup ──────────────────────────────────
drop policy if exists tournament_participants_select_authenticated on public.tournament_participants;

create policy tournament_participants_select_scoped on public.tournament_participants
  for select to authenticated
  using (public.can_view_tournament(tournament_id));

drop policy if exists tournament_plans_select_authenticated on public.tournament_plans;

create policy tournament_plans_select_scoped on public.tournament_plans
  for select to authenticated
  using (public.can_view_tournament(tournament_id));

drop policy if exists tournament_side_awards_select_authenticated on public.tournament_side_awards;

create policy tournament_side_awards_select_scoped on public.tournament_side_awards
  for select to authenticated
  using (public.can_view_tournament(tournament_id));
