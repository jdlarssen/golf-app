-- supabase/tests/league_simulator_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Simulator leagues (#2638 Del 1, migration 0212).
--
-- CHECK on the settings columns:
--   1  leagues.sim_settings that is not a JSON object               → 23514
--   2  leagues.sim_settings longer than 2 000 characters             → 23514
--   3  league_rounds.sim_settings that is not a JSON object          → 23514
-- Lock on leagues (guard_leagues_locked_fields):
--   4  the club admin changes is_simulator and scoring in draft      → 1 row
--   5  the club admin changes is_simulator on an active league       → 42501
--   6  the club admin changes scoring on an active league            → 42501
--   7  a global admin changes scoring on an active league they run   → 42501
--   8  the club admin sets an active league back to draft            → 42501
--   9  the server (no JWT) changes scoring on an active league       → 1 row
-- The default settings are not locked, but stay the organiser's:
--  10  the club admin changes leagues.sim_settings on an active league → 1 row
--  11  a club member who is not admin tries the same                 → 0 rows (RLS)
-- Round lock (guard_league_rounds_sim_settings_lock):
--  12  the club admin overrides a round nobody has started            → 1 row
--  13  the club admin cannot see the flight another player started    → 0 games
--  14  …and cannot change that round's sim_settings                   → 42501
--  15  the same after the flight was delivered (finished)             → 42501
--  16  other columns of a started round still change (label)          → 1 row
--  17  the server (the start core's freeze) writes a started round    → 1 row
--  18  the guards are not client-executable
-- Trackman's option set (sim_settings_valid, 0213):
--  19  an unknown option code                                         → 23514
--  20  an unknown key (the old free-text «tees»)                        → 23514
--  21  a value that is not a string                                     → 23514
--  22  a round override: Auto - Tour Pro with a gimme distance           → 23514
--  23  Manual with gimme Not applicable                                  → 23514
--  24  the full Trackman default is accepted                             → 1 row
--  25  a round override with putting alone (gimme from the default)      → 1 row
-- The frozen default (0214):
--  26  the organiser writes sim_frozen_default on a round                → 42501
--  27  the organiser inserts a round with sim_frozen_default             → 42501
--  28  the server (the start core) writes sim_frozen_default             → 1 row
--  29  a default change after the start leaves the started round as it was
--  30  sim_frozen_default with an unknown code                           → 23514
--
-- Red without 0212: every case (the columns do not exist). With 0212 minus the
-- guards: 5–8, 14 and 15. Without 0213: 19–23. Without 0214: every case (the
-- column does not exist); with the 0212 guard body: 26 and 27.
-- Each case that writes runs in its own savepoint and is rolled back.
-- Every probe and its check are separate statements (#1910).
-- Depends on 0212, 0213 and 0214. Run via: supabase test db (see supabase/tests/README.md)
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(30);

\ir fixtures/rls_helpers.psql

-- ── Scenario-local fixtures (ls_ = league simulator) ──────────────────────────
create or replace function torny_rls.ls_club_admin() returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-263800000101'::uuid $$;
create or replace function torny_rls.ls_player()     returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-263800000102'::uuid $$;
create or replace function torny_rls.ls_member()     returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-263800000103'::uuid $$;
create or replace function torny_rls.ls_club()       returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-263800000111'::uuid $$;
create or replace function torny_rls.ls_draft()      returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-263800000121'::uuid $$;
create or replace function torny_rls.ls_active()     returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-263800000122'::uuid $$;
create or replace function torny_rls.ls_standalone() returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-263800000123'::uuid $$;
create or replace function torny_rls.ls_r_started()  returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-263800000131'::uuid $$;
create or replace function torny_rls.ls_r_open()     returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-263800000132'::uuid $$;
create or replace function torny_rls.ls_r_done()     returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-263800000133'::uuid $$;
create or replace function torny_rls.ls_g_started()  returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-263800000141'::uuid $$;
create or replace function torny_rls.ls_g_done()     returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-263800000142'::uuid $$;
create or replace function torny_rls.ls_r_new()      returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-263800000134'::uuid $$;

-- ls_rows(sql): runs one statement as the current role and returns the number
-- of rows it touched, so an allowed update is checked, not just survived.
create or replace function torny_rls.ls_rows(p_sql text) returns int
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
-- seed_active_game() gives admin_id (a global admin), a course and a tee box.
select torny_rls.as_service();
select torny_rls.seed_active_game();

insert into auth.users (id, instance_id, aud, role, email)
select uid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
       'rls-' || uid::text || '@example.test'
  from unnest(array[torny_rls.ls_club_admin(), torny_rls.ls_player(), torny_rls.ls_member()]) as uid;

insert into public.users (id, email, name, is_admin) values
  (torny_rls.ls_club_admin(), 'rls-ls-club-admin@example.test', 'LS Club Admin', false),
  (torny_rls.ls_player(),     'rls-ls-player@example.test',     'LS Player',     false),
  (torny_rls.ls_member(),     'rls-ls-member@example.test',     'LS Member',     false)
on conflict (id) do update
  set email = excluded.email, name = excluded.name, is_admin = excluded.is_admin;

insert into public.groups (id, name, created_by) values (torny_rls.ls_club(), 'LS Club', torny_rls.ls_club_admin());
insert into public.group_members (group_id, user_id, role) values
  (torny_rls.ls_club(), torny_rls.ls_club_admin(), 'owner'),
  (torny_rls.ls_club(), torny_rls.ls_player(),     'member'),
  (torny_rls.ls_club(), torny_rls.ls_member(),     'member');

insert into public.leagues
  (id, name, season_start, season_end, standings_model, course_scope, course_id, tee_box_id,
   status, created_by, group_id, is_simulator, sim_settings) values
  (torny_rls.ls_draft(),      'LS Draft',      current_date, current_date + 90, 'total',  'single_course_single_tee',
   torny_rls.course_id(), torny_rls.tee_box_id(), 'draft',  torny_rls.ls_club_admin(), torny_rls.ls_club(), false, null),
  (torny_rls.ls_active(),     'LS Active',     current_date, current_date + 90, 'total',  'single_course_single_tee',
   torny_rls.course_id(), torny_rls.tee_box_id(), 'active', torny_rls.ls_club_admin(), torny_rls.ls_club(), true,
   '{"green_stimp": "10", "wind": "CALM"}'::jsonb),
  (torny_rls.ls_standalone(), 'LS Standalone', current_date, current_date + 90, 'total',  'single_course_single_tee',
   torny_rls.course_id(), torny_rls.tee_box_id(), 'active', torny_rls.admin_id(),     null,                true, null);

insert into public.league_players (league_id, user_id, accepted_at) values
  (torny_rls.ls_active(), torny_rls.ls_club_admin(), now()),
  (torny_rls.ls_active(), torny_rls.ls_player(),     now());

insert into public.league_rounds
  (id, league_id, sequence, label, course_id, tee_box_id, opens_at, closes_at, original_closes_at) values
  (torny_rls.ls_r_started(), torny_rls.ls_active(), 1, 'Runde 1', torny_rls.course_id(), torny_rls.tee_box_id(),
   now() - interval '1 day', now() + interval '13 days', now() + interval '13 days'),
  (torny_rls.ls_r_open(),    torny_rls.ls_active(), 2, 'Runde 2', torny_rls.course_id(), torny_rls.tee_box_id(),
   now() - interval '1 day', now() + interval '13 days', now() + interval '13 days'),
  (torny_rls.ls_r_done(),    torny_rls.ls_active(), 3, 'Runde 3', torny_rls.course_id(), torny_rls.tee_box_id(),
   now() - interval '1 day', now() + interval '13 days', now() + interval '13 days');

-- The started round was frozen at its first start: the default was stimp 10.
update public.league_rounds set sim_frozen_default = '{"green_stimp": "10", "wind": "CALM"}'::jsonb
 where id = torny_rls.ls_r_started();

-- Flights another player (not the organiser) started: one in play, one
-- delivered. The organiser is in neither, so games RLS hides both from them.
insert into public.games (id, name, course_id, tee_box_id, status, game_mode, created_by, started_at, league_round_id) values
  (torny_rls.ls_g_started(), 'LS Flight', torny_rls.course_id(), torny_rls.tee_box_id(), 'active',
   'stableford', torny_rls.ls_player(), now(), torny_rls.ls_r_started()),
  (torny_rls.ls_g_done(),    'LS Flight', torny_rls.course_id(), torny_rls.tee_box_id(), 'finished',
   'stableford', torny_rls.ls_player(), now(), torny_rls.ls_r_done());
insert into public.game_players (game_id, user_id) values
  (torny_rls.ls_g_started(), torny_rls.ls_player()),
  (torny_rls.ls_g_done(),    torny_rls.ls_player());

-- ═════════════════════════════════════════════════════════════════════════════
-- CHECK on the settings columns
-- ═════════════════════════════════════════════════════════════════════════════

-- 1
savepoint case_1;
select throws_ok(
  $$ update public.leagues set sim_settings = '"CALM"'::jsonb where id = torny_rls.ls_draft() $$,
  '23514', null,
  'case 1: leagues.sim_settings must be a JSON object');
rollback to savepoint case_1;

-- 2
savepoint case_2;
select throws_ok(
  $$ update public.leagues set sim_settings = jsonb_build_object('other', repeat('x', 2001)) where id = torny_rls.ls_draft() $$,
  '23514', 'new row for relation "leagues" violates check constraint "leagues_sim_settings_check"',
  'case 2: leagues.sim_settings over 2 000 characters is refused');
rollback to savepoint case_2;

-- 3
savepoint case_3;
select throws_ok(
  $$ update public.league_rounds set sim_settings = '["11"]'::jsonb where id = torny_rls.ls_r_open() $$,
  '23514', null,
  'case 3: league_rounds.sim_settings must be a JSON object');
rollback to savepoint case_3;

-- ═════════════════════════════════════════════════════════════════════════════
-- scoring and is_simulator lock when the league leaves draft
-- ═════════════════════════════════════════════════════════════════════════════

-- 4
savepoint case_4;
select torny_rls.as_user(torny_rls.ls_club_admin());
select is(
  torny_rls.ls_rows($$ update public.leagues set is_simulator = true, scoring = 'gross'
                        where id = torny_rls.ls_draft() $$),
  1,
  'case 4: the organiser CAN change is_simulator and scoring while the league is a draft');
rollback to savepoint case_4;

-- 5
savepoint case_5;
select torny_rls.as_user(torny_rls.ls_club_admin());
select throws_like(
  $$ update public.leagues set is_simulator = false where id = torny_rls.ls_active() $$,
  '%locked once the league has started%',
  'case 5: the organiser CANNOT change is_simulator on an active league');
rollback to savepoint case_5;

-- 6
savepoint case_6;
select torny_rls.as_user(torny_rls.ls_club_admin());
select throws_like(
  $$ update public.leagues set scoring = 'gross' where id = torny_rls.ls_active() $$,
  '%locked once the league has started%',
  'case 6: the organiser CANNOT change scoring on an active league');
rollback to savepoint case_6;

-- 7
savepoint case_7;
select torny_rls.as_user(torny_rls.admin_id());
select throws_like(
  $$ update public.leagues set scoring = 'gross' where id = torny_rls.ls_standalone() $$,
  '%locked once the league has started%',
  'case 7: a global admin is not exempt: scoring stays locked on their active league');
rollback to savepoint case_7;

-- 8
savepoint case_8;
select torny_rls.as_user(torny_rls.ls_club_admin());
select throws_like(
  $$ update public.leagues set status = 'draft' where id = torny_rls.ls_active() $$,
  '%cannot go back to draft%',
  'case 8: an active league CANNOT go back to draft (that would reopen the lock)');
rollback to savepoint case_8;

-- 9 ─ as_service() clears the JWT claims, so auth.uid() is null.
savepoint case_9;
select torny_rls.as_service();
select is(
  torny_rls.ls_rows($$ update public.leagues set scoring = 'gross' where id = torny_rls.ls_active() $$),
  1,
  'case 9: a caller with no JWT (the server) CAN change scoring on an active league');
rollback to savepoint case_9;

-- ═════════════════════════════════════════════════════════════════════════════
-- The league default is not locked, and stays the organiser's
-- ═════════════════════════════════════════════════════════════════════════════

-- 10
savepoint case_10;
select torny_rls.as_user(torny_rls.ls_club_admin());
select is(
  torny_rls.ls_rows($$ update public.leagues set sim_settings = '{"green_stimp": "11"}'::jsonb
                        where id = torny_rls.ls_active() $$),
  1,
  'case 10: the organiser CAN change the default settings of an active league');
rollback to savepoint case_10;

-- 11
savepoint case_11;
select torny_rls.as_user(torny_rls.ls_member());
select is(
  torny_rls.ls_rows($$ update public.leagues set sim_settings = '{"green_stimp": "6"}'::jsonb
                        where id = torny_rls.ls_active() $$),
  0,
  'case 11: a club member who is not admin CANNOT change the default settings (RLS)');
rollback to savepoint case_11;

-- ═════════════════════════════════════════════════════════════════════════════
-- A round locks when the first player starts it
-- ═════════════════════════════════════════════════════════════════════════════

-- 12
savepoint case_12;
select torny_rls.as_user(torny_rls.ls_club_admin());
select is(
  torny_rls.ls_rows($$ update public.league_rounds set sim_settings = '{"green_stimp": "12"}'::jsonb
                        where id = torny_rls.ls_r_open() $$),
  1,
  'case 12: the organiser CAN override a round nobody has started');
rollback to savepoint case_12;

-- 13
savepoint case_13;
select torny_rls.as_user(torny_rls.ls_club_admin());
select is(
  (select count(*)::int from public.games where league_round_id = torny_rls.ls_r_started()),
  0,
  'case 13: the organiser cannot see the flight another player started (games RLS)');
rollback to savepoint case_13;

-- 14
savepoint case_14;
select torny_rls.as_user(torny_rls.ls_club_admin());
select throws_like(
  $$ update public.league_rounds set sim_settings = '{"green_stimp": "12"}'::jsonb
      where id = torny_rls.ls_r_started() $$,
  '%locked once a player has started the round%',
  'case 14: the organiser CANNOT change the settings of a round another player started');
rollback to savepoint case_14;

-- 15
savepoint case_15;
select torny_rls.as_user(torny_rls.ls_club_admin());
select throws_like(
  $$ update public.league_rounds set sim_settings = '{"wind": "STORMY"}'::jsonb where id = torny_rls.ls_r_done() $$,
  '%locked once a player has started the round%',
  'case 15: the organiser CANNOT change the settings of a round with a delivered flight');
rollback to savepoint case_15;

-- 16
savepoint case_16;
select torny_rls.as_user(torny_rls.ls_club_admin());
select is(
  torny_rls.ls_rows($$ update public.league_rounds set label = 'Runde 1 (Trackman)'
                        where id = torny_rls.ls_r_started() $$),
  1,
  'case 16: other columns of a started round still change');
rollback to savepoint case_16;

-- 17
savepoint case_17;
select torny_rls.as_service();
select is(
  torny_rls.ls_rows($$ update public.league_rounds set sim_settings = '{"green_stimp": "10", "wind": "CALM"}'::jsonb
                        where id = torny_rls.ls_r_started() $$),
  1,
  'case 17: a caller with no JWT (the start core''s freeze) CAN write a started round');
rollback to savepoint case_17;

-- ═════════════════════════════════════════════════════════════════════════════
-- Trackman's option set and the gimme coupling (0213)
-- ═════════════════════════════════════════════════════════════════════════════

-- 19
savepoint case_19;
select throws_ok(
  $$ update public.leagues set sim_settings = '{"wind": "HURRICANE"}'::jsonb where id = torny_rls.ls_draft() $$,
  '23514', 'new row for relation "leagues" violates check constraint "leagues_sim_settings_options_check"',
  'case 19: an unknown option code is refused');
rollback to savepoint case_19;

-- 20
savepoint case_20;
select throws_ok(
  $$ update public.leagues set sim_settings = '{"tees": "Gul"}'::jsonb where id = torny_rls.ls_draft() $$,
  '23514', 'new row for relation "leagues" violates check constraint "leagues_sim_settings_options_check"',
  'case 20: an unknown key is refused');
rollback to savepoint case_20;

-- 21
savepoint case_21;
select throws_ok(
  $$ update public.leagues set sim_settings = '{"green_stimp": 10}'::jsonb where id = torny_rls.ls_draft() $$,
  '23514', 'new row for relation "leagues" violates check constraint "leagues_sim_settings_options_check"',
  'case 21: a value that is not a string is refused');
rollback to savepoint case_21;

-- 22
savepoint case_22;
select throws_ok(
  $$ update public.league_rounds set sim_settings = '{"putting": "AUTO_TOUR_PRO", "gimme": "FT4"}'::jsonb
      where id = torny_rls.ls_r_open() $$,
  '23514', 'new row for relation "league_rounds" violates check constraint "league_rounds_sim_settings_options_check"',
  'case 22: Auto - Tour Pro locks gimme, so a distance is refused');
rollback to savepoint case_22;

-- 23
savepoint case_23;
select throws_ok(
  $$ update public.leagues set sim_settings = '{"putting": "MANUAL", "gimme": "NOT_APPLICABLE"}'::jsonb
      where id = torny_rls.ls_draft() $$,
  '23514', 'new row for relation "leagues" violates check constraint "leagues_sim_settings_options_check"',
  'case 23: Manual putting needs a gimme distance');
rollback to savepoint case_23;

-- 24
savepoint case_24;
select is(
  torny_rls.ls_rows($$ update public.leagues set sim_settings =
      '{"pins": "MEDIUM", "putting": "AUTO_TOUR_PRO", "gimme": "NOT_APPLICABLE", "mulligans": "NO",
        "wind": "CALM", "fairway_firmness": "MEDIUM", "green_firmness": "MEDIUM", "green_stimp": "9"}'::jsonb
      where id = torny_rls.ls_draft() $$),
  1,
  'case 24: the full Trackman default is accepted');
rollback to savepoint case_24;

-- 25
savepoint case_25;
select is(
  torny_rls.ls_rows($$ update public.league_rounds set sim_settings = '{"putting": "AUTO_FIXED"}'::jsonb
                        where id = torny_rls.ls_r_open() $$),
  1,
  'case 25: a round override with putting alone is accepted (its gimme comes from the default)');
rollback to savepoint case_25;

-- ═════════════════════════════════════════════════════════════════════════════
-- The frozen default (0214): the server writes it, a later default leaves it
-- ═════════════════════════════════════════════════════════════════════════════

-- 26
savepoint case_26;
select torny_rls.as_user(torny_rls.ls_club_admin());
select throws_like(
  $$ update public.league_rounds set sim_frozen_default = '{"green_stimp": "13"}'::jsonb
      where id = torny_rls.ls_r_open() $$,
  '%set by the server only%',
  'case 26: the organiser CANNOT write sim_frozen_default');
rollback to savepoint case_26;

-- 27
savepoint case_27;
select torny_rls.as_user(torny_rls.ls_club_admin());
select throws_like(
  $$ insert into public.league_rounds
       (id, league_id, sequence, label, opens_at, closes_at, original_closes_at, sim_frozen_default)
     values (torny_rls.ls_r_new(), torny_rls.ls_active(), 4, 'Runde 4', now(), now() + interval '13 days',
             now() + interval '13 days', '{"green_stimp": "13"}'::jsonb) $$,
  '%set by the server only%',
  'case 27: the organiser CANNOT insert a round with a frozen default');
rollback to savepoint case_27;

-- 28
savepoint case_28;
select torny_rls.as_service();
select is(
  torny_rls.ls_rows($$ update public.league_rounds set sim_frozen_default = '{"green_stimp": "9"}'::jsonb
                        where id = torny_rls.ls_r_open() $$),
  1,
  'case 28: a caller with no JWT (the start core) CAN write sim_frozen_default');
rollback to savepoint case_28;

-- 29 ─ the organiser moves the default to stimp 11 after round 1 started.
savepoint case_29;
select torny_rls.as_user(torny_rls.ls_club_admin());
select torny_rls.ls_rows($$ update public.leagues set sim_settings = '{"green_stimp": "11", "wind": "CALM"}'::jsonb
                             where id = torny_rls.ls_active() $$);
select torny_rls.as_service();
select is(
  (select array[sim_frozen_default::text, coalesce(sim_settings::text, 'none')]
     from public.league_rounds where id = torny_rls.ls_r_started()),
  array['{"wind": "CALM", "green_stimp": "10"}', 'none'],
  'case 29: a default change after the start leaves the started round as it was');
rollback to savepoint case_29;

-- 30
savepoint case_30;
select throws_ok(
  $$ update public.league_rounds set sim_frozen_default = '{"green_stimp": "99"}'::jsonb where id = torny_rls.ls_r_open() $$,
  '23514', 'new row for relation "league_rounds" violates check constraint "league_rounds_sim_frozen_default_check"',
  'case 30: sim_frozen_default holds Trackman codes only');
rollback to savepoint case_30;

-- 18 (last: an assert outside every savepoint, like the other guard suites)
select ok(not has_function_privilege('anon', 'public.guard_leagues_locked_fields()', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.guard_leagues_locked_fields()', 'EXECUTE')
      and not has_function_privilege('anon', 'public.guard_league_rounds_sim_settings_lock()', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.guard_league_rounds_sim_settings_lock()', 'EXECUTE'),
  'case 18: the two guards are not client-executable');

select * from finish();
rollback;
