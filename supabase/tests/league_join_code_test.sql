-- supabase/tests/league_join_code_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- leagues.join_code, the shareable join link (#2662, migration 0221).
--
-- The column has no RLS of its own: the organiser writes it through «leagues
-- admin or club-admin update» (0092), and the join writes league_players with
-- the service role behind evaluateLeagueJoin. These cases show that a player
-- cannot do either by hand (#440 hostile-PATCH rig).
--
--   1  a code in upper case is refused (CHECK)                          → 23514
--   2  a code of 6 characters is refused (CHECK)                        → 23514
--   3  two leagues cannot share a code (unique index)                   → 23505
--   4  a participant PATCHes the league's join_code                     → 0 rows
--   4b …and the code is unchanged
--   5  a player who is not in the league PATCHes join_code to null      → 0 rows
--   6  a participant INSERTs themselves into another league             → 42501
--   7  the organiser (global admin) changes the code on an ACTIVE league → 1 row
--      (guard_leagues_locked_fields leaves join_code alone)
--   8  the server (no JWT) adds a player to league_players              → 1 row
--
-- Red without 0221: every case (the column does not exist). Without the CHECK:
-- 1 and 2. Without the unique index: 3.
-- Each case that writes runs in its own savepoint and is rolled back, except
-- the last (see case 8).
-- Depends on 0221. Run via: supabase test db (see supabase/tests/README.md)
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

\ir fixtures/rls_helpers.psql

-- ── Scenario-local fixtures (jc_ = join code) ─────────────────────────────────
create or replace function torny_rls.jc_draft()  returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-266200000121'::uuid $$;
create or replace function torny_rls.jc_active() returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-266200000122'::uuid $$;

-- jc_rows(sql): runs one statement as the current role and returns the number
-- of rows it touched, so a refused update shows as 0 and an allowed one as 1.
create or replace function torny_rls.jc_rows(p_sql text) returns int
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
-- seed_active_game() gives admin_id (a global admin), active_id (a plain
-- player, the participant here) and outsider_id (a plain player in no league).
select torny_rls.as_service();
select torny_rls.seed_active_game();

insert into public.leagues (id, name, season_start, season_end, standings_model, course_scope, status, created_by, group_id, join_code) values
  (torny_rls.jc_draft(),  'JC Draft',  current_date, current_date + 30, 'total', 'multi_course', 'draft',  torny_rls.admin_id(), null, 'abcd2345'),
  (torny_rls.jc_active(), 'JC Active', current_date, current_date + 30, 'total', 'multi_course', 'active', torny_rls.admin_id(), null, null);

insert into public.league_players (league_id, user_id, accepted_at) values
  (torny_rls.jc_draft(), torny_rls.active_id(), now());

-- ═════════════════════════════════════════════════════════════════════════════
-- The shape of the code
-- ═════════════════════════════════════════════════════════════════════════════

-- 1
savepoint case_1;
select throws_ok(
  $$ update public.leagues set join_code = 'ABCD2345' where id = torny_rls.jc_draft() $$,
  '23514', 'new row for relation "leagues" violates check constraint "leagues_join_code_format"',
  'case 1: a join_code in upper case is refused');
rollback to savepoint case_1;

-- 2
savepoint case_2;
select throws_ok(
  $$ update public.leagues set join_code = 'abc234' where id = torny_rls.jc_draft() $$,
  '23514', 'new row for relation "leagues" violates check constraint "leagues_join_code_format"',
  'case 2: a join_code of 6 characters is refused');
rollback to savepoint case_2;

-- 3
savepoint case_3;
select throws_ok(
  $$ update public.leagues set join_code = 'abcd2345' where id = torny_rls.jc_active() $$,
  '23505', null,
  'case 3: two leagues cannot share a join_code');
rollback to savepoint case_3;

-- ═════════════════════════════════════════════════════════════════════════════
-- A player cannot write the code or join by hand
-- ═════════════════════════════════════════════════════════════════════════════

-- 4 ─ the participant tries to point the link at a code of their own.
savepoint case_4;
select torny_rls.as_user(torny_rls.active_id());
select is(
  torny_rls.jc_rows($$ update public.leagues set join_code = 'zzzz9999' where id = torny_rls.jc_draft() $$),
  0,
  'case 4: a participant CANNOT change the league''s join_code');
select torny_rls.as_service();
select is(
  (select join_code from public.leagues where id = torny_rls.jc_draft()),
  'abcd2345',
  'case 4b: the join_code is unchanged');
rollback to savepoint case_4;

-- 5 ─ a player outside the league tries to turn the link off.
savepoint case_5;
select torny_rls.as_user(torny_rls.outsider_id());
select is(
  torny_rls.jc_rows($$ update public.leagues set join_code = null where id = torny_rls.jc_draft() $$),
  0,
  'case 5: a player outside the league CANNOT turn the link off');
rollback to savepoint case_5;

-- 6 ─ the participant skips the link and writes their own row in another league.
savepoint case_6;
select torny_rls.as_user(torny_rls.active_id());
select throws_ok(
  $$ insert into public.league_players (league_id, user_id, accepted_at)
       values (torny_rls.jc_active(), torny_rls.active_id(), now()) $$,
  '42501', null,
  'case 6: a player CANNOT insert themselves into league_players');
rollback to savepoint case_6;

-- ═════════════════════════════════════════════════════════════════════════════
-- The organiser and the server can
-- ═════════════════════════════════════════════════════════════════════════════

-- 7 ─ the link can be turned on after the start (setLeagueJoinLink).
savepoint case_7;
select torny_rls.as_user(torny_rls.admin_id());
select is(
  torny_rls.jc_rows($$ update public.leagues set join_code = 'wxyz6789' where id = torny_rls.jc_active() $$),
  1,
  'case 7: the organiser CAN set the join_code on an active league');
rollback to savepoint case_7;

-- 8 ─ as_service() clears the JWT claims: the path joinLeagueByCode takes.
--     Last, and outside a savepoint on purpose: pgTAP keeps its test counter in
--     a row the first assert creates, and every case above rolled it back. An
--     assert outside a savepoint writes it for finish() (the self-update guard
--     test ends the same way). The final rollback removes the row.
select torny_rls.as_service();
select is(
  torny_rls.jc_rows($$ insert into public.league_players (league_id, user_id, accepted_at)
                         values (torny_rls.jc_active(), torny_rls.outsider_id(), now()) $$),
  1,
  'case 8: the server CAN add a player to league_players');

select * from finish();
rollback;
