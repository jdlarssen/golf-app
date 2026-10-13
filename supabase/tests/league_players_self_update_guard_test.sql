-- supabase/tests/league_players_self_update_guard_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- league_players.league_id and user_id are fixed (#2567, migration 0208).
--
-- The policy «league_players self mark accepted» lets a player update their own
-- pending row as long as the result is their own accepted row. It never pinned
-- league_id, so a pending invite could be moved into any league and accepted
-- in one PATCH. 0208's league branch on the game_players guard would widen
-- that, so 0208 also adds guard_league_players_self_update: only the service
-- role and global admins may change league_id or user_id.
--
--   1  a player moves their own pending row into another league     → 42501
--   1b …and the row is still in its league and still pending
--   2  a player accepts their own row (accepted_at only)            → 1 row
--   2b …also when the payload repeats the unchanged league_id/user_id → 1 row
--   3  a club admin moves a row between two leagues of their club   → 42501
--   4  a global admin moves a row                                   → 1 row
--   5  the service role moves a row                                 → 1 row
--   6  the guard is not client-executable
--
-- Red without the guard: 1, 1b and 3 (RLS lets both moves through).
-- Each case that writes runs in its own savepoint and is rolled back.
-- Every probe and its check are separate statements (#1910).
-- Depends on 0208. Run via: supabase test db (see supabase/tests/README.md)
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

\ir fixtures/rls_helpers.psql

-- ── Scenario-local fixtures (lp_ = league players) ────────────────────────────
create or replace function torny_rls.lp_pending()    returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-256700000101'::uuid $$;
create or replace function torny_rls.lp_member()     returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-256700000102'::uuid $$;
create or replace function torny_rls.lp_club_admin() returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-256700000103'::uuid $$;
create or replace function torny_rls.lp_club()       returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-256700000111'::uuid $$;
create or replace function torny_rls.lp_league_p1()  returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-256700000121'::uuid $$;
create or replace function torny_rls.lp_league_p2()  returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-256700000122'::uuid $$;
create or replace function torny_rls.lp_league_c1()  returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-256700000123'::uuid $$;
create or replace function torny_rls.lp_league_c2()  returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-256700000124'::uuid $$;

-- lp_rows(sql): runs one statement as the current role and returns the number
-- of rows it touched, so an allowed update is checked, not just survived.
create or replace function torny_rls.lp_rows(p_sql text) returns int
  language plpgsql as $$
  declare v_rows int;
  begin
    execute p_sql;
    get diagnostics v_rows = row_count;
    return v_rows;
  end;
$$;

grant execute on all functions in schema torny_rls to authenticated, anon, service_role;

-- ── Seed ──────────────────────────────────────────────────────────────────────
-- seed_active_game() gives admin_id (a global admin). The three actors below
-- are new.
select torny_rls.as_service();
select torny_rls.seed_active_game();

insert into auth.users (id, instance_id, aud, role, email)
select uid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
       'rls-' || uid::text || '@example.test'
  from unnest(array[torny_rls.lp_pending(), torny_rls.lp_member(), torny_rls.lp_club_admin()]) as uid;

insert into public.users (id, email, name, is_admin) values
  (torny_rls.lp_pending(),    'rls-lp-pending@example.test',    'LP Pending',    false),
  (torny_rls.lp_member(),     'rls-lp-member@example.test',     'LP Member',     false),
  (torny_rls.lp_club_admin(), 'rls-lp-club-admin@example.test', 'LP Club Admin', false)
on conflict (id) do update
  set email = excluded.email, name = excluded.name, is_admin = excluded.is_admin;

insert into public.groups (id, name, created_by) values (torny_rls.lp_club(), 'LP Club', torny_rls.lp_club_admin());
insert into public.group_members (group_id, user_id, role) values
  (torny_rls.lp_club(), torny_rls.lp_club_admin(), 'owner'),
  (torny_rls.lp_club(), torny_rls.lp_member(),     'member');

insert into public.leagues (id, name, season_start, season_end, standings_model, course_scope, status, created_by, group_id) values
  (torny_rls.lp_league_p1(), 'LP League P1', current_date, current_date + 30, 'total', 'multi_course', 'active', torny_rls.admin_id(),      null),
  (torny_rls.lp_league_p2(), 'LP League P2', current_date, current_date + 30, 'total', 'multi_course', 'active', torny_rls.admin_id(),      null),
  (torny_rls.lp_league_c1(), 'LP Club C1',   current_date, current_date + 30, 'total', 'multi_course', 'active', torny_rls.lp_club_admin(), torny_rls.lp_club()),
  (torny_rls.lp_league_c2(), 'LP Club C2',   current_date, current_date + 30, 'total', 'multi_course', 'active', torny_rls.lp_club_admin(), torny_rls.lp_club());

-- A pending invite (addLeaguePlayers writes accepted_at null) and an accepted
-- club league member.
insert into public.league_players (league_id, user_id, accepted_at) values
  (torny_rls.lp_league_p1(), torny_rls.lp_pending(), null),
  (torny_rls.lp_league_c1(), torny_rls.lp_member(),  now());

-- ═════════════════════════════════════════════════════════════════════════════
-- A player cannot move their own row
-- ═════════════════════════════════════════════════════════════════════════════

-- 1 ─ move the pending row into P2 and accept it in the same PATCH.
savepoint case_1;
select torny_rls.as_user(torny_rls.lp_pending());
select throws_like(
  $$ update public.league_players
        set league_id = torny_rls.lp_league_p2(), accepted_at = now()
      where league_id = torny_rls.lp_league_p1() and user_id = torny_rls.lp_pending() $$,
  '%cannot be changed%',
  'case 1: a player CANNOT move their pending league row into another league');
select torny_rls.as_service();
select is(
  (select array[league_id::text, coalesce(accepted_at::text, 'pending')]
     from public.league_players where user_id = torny_rls.lp_pending()),
  array[torny_rls.lp_league_p1()::text, 'pending'],
  'case 1b: the row is still in its own league and still pending');
rollback to savepoint case_1;

-- 2 ─ accepting the own row still works (the app's own accept).
savepoint case_2;
select torny_rls.as_user(torny_rls.lp_pending());
select is(
  torny_rls.lp_rows($$ update public.league_players set accepted_at = now()
                        where league_id = torny_rls.lp_league_p1() and user_id = torny_rls.lp_pending() $$),
  1,
  'case 2: a player CAN accept their own pending row');
rollback to savepoint case_2;

-- 2b ─ the same, with the unchanged keys repeated in the payload.
savepoint case_2b;
select torny_rls.as_user(torny_rls.lp_pending());
select is(
  torny_rls.lp_rows($$ update public.league_players
                          set league_id = torny_rls.lp_league_p1(), user_id = torny_rls.lp_pending(), accepted_at = now()
                        where league_id = torny_rls.lp_league_p1() and user_id = torny_rls.lp_pending() $$),
  1,
  'case 2b: accepting still works when the payload repeats the unchanged league_id and user_id');
rollback to savepoint case_2b;

-- ═════════════════════════════════════════════════════════════════════════════
-- A club admin cannot move a row either (RLS would allow C1 → C2)
-- ═════════════════════════════════════════════════════════════════════════════

-- 3
savepoint case_3;
select torny_rls.as_user(torny_rls.lp_club_admin());
select throws_like(
  $$ update public.league_players set league_id = torny_rls.lp_league_c2()
      where league_id = torny_rls.lp_league_c1() and user_id = torny_rls.lp_member() $$,
  '%cannot be changed%',
  'case 3: a club admin CANNOT move a row between two leagues of the club');
rollback to savepoint case_3;

-- ═════════════════════════════════════════════════════════════════════════════
-- A global admin and the service role can
-- ═════════════════════════════════════════════════════════════════════════════

-- 4
savepoint case_4;
select torny_rls.as_user(torny_rls.admin_id());
select is(
  torny_rls.lp_rows($$ update public.league_players set league_id = torny_rls.lp_league_p2()
                        where league_id = torny_rls.lp_league_p1() and user_id = torny_rls.lp_pending() $$),
  1,
  'case 4: a global admin CAN move a row');
rollback to savepoint case_4;

-- 5
savepoint case_5;
select torny_rls.as_service();
select is(
  torny_rls.lp_rows($$ update public.league_players set league_id = torny_rls.lp_league_p2()
                        where league_id = torny_rls.lp_league_p1() and user_id = torny_rls.lp_pending() $$),
  1,
  'case 5: the service role CAN move a row');
rollback to savepoint case_5;

-- 6
select ok(not has_function_privilege('anon', 'public.guard_league_players_self_update()', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.guard_league_players_self_update()', 'EXECUTE'),
  'case 6: guard_league_players_self_update is not client-executable');

select * from finish();
rollback;
