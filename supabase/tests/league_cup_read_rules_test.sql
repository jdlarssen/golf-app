-- supabase/tests/league_cup_read_rules_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Who reads a league's links and a cup's rows (migration 0250).
--
-- A league's link columns
--   1     a participant reads the league's public columns             → 1 row
--   2–3   a participant selects join_code / spectate_token             → 42501
--   4     a player outside the league filters on join_code             → 42501
--   5     select * on leagues                                          → 42501
--   6     a global admin selects join_code through a user session      → 42501
--   7     the organiser's switch: update join_code, ask back id        → ok
--   8     the same update asking back join_code                        → 42501
--   9     anon selects join_code                                       → 42501
--   10    anon selects id                                              → ok (0 rows)
--   11–12 catalog: every other leagues column is SELECT-able for
--         authenticated and anon — a new column without a grant goes red here
--   13    catalog: join_code and spectate_token are not
--   14    the server (no JWT) reads the code
--
-- A cup and its rows. Each case counts [cups, participants, plans, side awards]
-- the caller sees among the three fixture cups.
--   15    a player in none of them                                     → 0 0 0 0
--   16    the organiser of the personal cup                            → its 1 1 1 1
--   17    a participant of the personal cup                            → its 1 1 1 1
--   18    a member of the club                                         → the club cup 1 1 1 0
--   19    a participant of the club cup who is not in the club         → the club cup 1 1 1 0
--   20    a player in a started match of a cup without a participant list → that cup 1 0 0 1
--   21    a player in a DRAFT match only                               → 0 0 0 0
--   22    a global admin                                               → all 3 2 2 2
--   23    anon                                                         → 0 0 0 0
--   24    the organiser creates a cup and gets its id back (RETURNING)
--   25    a participant cannot read another cup by its id
--
-- Red without 0250: 2–6, 8, 9, 13 (the columns were selectable), 15, 17–21
-- (personal cups and every child row were readable by all signed-in users),
-- 25.
-- Depends on 0250. Run via: supabase test db (see supabase/tests/README.md)
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(25);

\ir fixtures/rls_helpers.psql

-- ── Scenario-local fixtures (lc_ = league and cup) ───────────────────────────
create or replace function torny_rls.lc_league()      returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-025000000101'::uuid $$;
create or replace function torny_rls.lc_cup_solo()    returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-025000000201'::uuid $$;
create or replace function torny_rls.lc_cup_club()    returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-025000000202'::uuid $$;
create or replace function torny_rls.lc_cup_legacy()  returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-025000000203'::uuid $$;
create or replace function torny_rls.lc_game_started() returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-025000000301'::uuid $$;
create or replace function torny_rls.lc_game_draft()  returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-025000000302'::uuid $$;
create or replace function torny_rls.lc_cups() returns uuid[] language sql immutable as $$
  select array[torny_rls.lc_cup_solo(), torny_rls.lc_cup_club(), torny_rls.lc_cup_legacy()]
$$;

create or replace function torny_rls.lc_as_anon() returns void
  language plpgsql as $$
  begin
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', null, true);
  end;
$$;

-- lc_seen(): what the current role reads among the three fixture cups, as
-- [cups, participants, plans, side awards].
create or replace function torny_rls.lc_seen() returns int[]
  language sql as $$
  select array[
    (select count(*)::int from public.tournaments            where id            = any(torny_rls.lc_cups())),
    (select count(*)::int from public.tournament_participants where tournament_id = any(torny_rls.lc_cups())),
    (select count(*)::int from public.tournament_plans        where tournament_id = any(torny_rls.lc_cups())),
    (select count(*)::int from public.tournament_side_awards  where tournament_id = any(torny_rls.lc_cups()))
  ]
$$;

-- lc_cup_ids(): the fixture cups the current role reads.
create or replace function torny_rls.lc_cup_ids() returns uuid[]
  language sql as $$
  select coalesce(array_agg(id order by id), '{}')
    from public.tournaments where id = any(torny_rls.lc_cups())
$$;

grant execute on all functions in schema torny_rls to authenticated, anon, service_role;

-- ── Seed ─────────────────────────────────────────────────────────────────────
-- admin_id      a global admin; organiser of the league and of the legacy cup
-- active_id     in the league; organiser of the personal cup (not an admin)
-- submitted_id  participant of the personal cup
-- flightmate_id owner of the club; in a started match of the legacy cup
-- withdrawn_id  participant of the club cup, not in the club; in a DRAFT match
--               of the legacy cup
-- outsider_id   in nothing
select torny_rls.as_service();
select torny_rls.seed_active_game();
select torny_rls.seed_group_join();

insert into public.leagues (id, name, season_start, season_end, standings_model, course_scope, status, created_by, group_id, join_code, spectate_token) values
  (torny_rls.lc_league(), 'LC League', current_date, current_date + 30, 'total', 'multi_course', 'draft', torny_rls.admin_id(), null, 'lcrd2345', '00000000-0000-4000-a000-025000000999');
insert into public.league_players (league_id, user_id, accepted_at) values
  (torny_rls.lc_league(), torny_rls.active_id(), now());

insert into public.tournaments (id, name, team_1_name, team_2_name, status, created_by, group_id) values
  (torny_rls.lc_cup_solo(),   'LC Personal', 'Europa', 'USA', 'draft',  torny_rls.active_id(),     null),
  (torny_rls.lc_cup_club(),   'LC Club',     'Europa', 'USA', 'draft',  torny_rls.flightmate_id(), torny_rls.group_id()),
  (torny_rls.lc_cup_legacy(), 'LC Legacy',   'Europa', 'USA', 'active', torny_rls.admin_id(),      null);

insert into public.tournament_participants (tournament_id, user_id, team_number, is_captain) values
  (torny_rls.lc_cup_solo(), torny_rls.submitted_id(), 1, true),
  (torny_rls.lc_cup_club(), torny_rls.withdrawn_id(), 2, false);

insert into public.tournament_plans (tournament_id) values
  (torny_rls.lc_cup_solo()),
  (torny_rls.lc_cup_club());

insert into public.tournament_side_awards (tournament_id, kind, hole_number, points) values
  (torny_rls.lc_cup_solo(),   'ctp', 3, 1),
  (torny_rls.lc_cup_legacy(), 'ld',  5, 1);

insert into public.games (id, name, course_id, tee_box_id, status, game_mode, created_by, tournament_id) values
  (torny_rls.lc_game_started(), 'LC started', torny_rls.course_id(), torny_rls.tee_box_id(), 'scheduled', 'solo_strokeplay', torny_rls.admin_id(), torny_rls.lc_cup_legacy()),
  (torny_rls.lc_game_draft(),   'LC draft',   torny_rls.course_id(), torny_rls.tee_box_id(), 'draft',     'solo_strokeplay', torny_rls.admin_id(), torny_rls.lc_cup_legacy());

insert into public.game_players (game_id, user_id) values
  (torny_rls.lc_game_started(), torny_rls.flightmate_id()),
  (torny_rls.lc_game_draft(),   torny_rls.withdrawn_id());

-- ═════════════════════════════════════════════════════════════════════════════
-- A league's link columns
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.active_id());

-- 1
select is(
  (select count(*)::int from public.leagues where id = torny_rls.lc_league() and name = 'LC League'),
  1,
  'case 1: a participant reads the league''s public columns');

-- 2
select throws_ok(
  $$ select join_code from public.leagues where id = torny_rls.lc_league() $$,
  '42501', null,
  'case 2: a participant CANNOT select join_code');

-- 3
select throws_ok(
  $$ select spectate_token from public.leagues where id = torny_rls.lc_league() $$,
  '42501', null,
  'case 3: a participant CANNOT select spectate_token');

-- 4
select torny_rls.as_user(torny_rls.outsider_id());
select throws_ok(
  $$ select id from public.leagues where join_code = 'lcrd2345' $$,
  '42501', null,
  'case 4: a player outside the league CANNOT filter on join_code');

-- 5
select throws_ok(
  $$ select * from public.leagues where id = torny_rls.lc_league() $$,
  '42501', null,
  'case 5: select * on leagues is refused (it includes the link columns)');

-- 6
select torny_rls.as_user(torny_rls.admin_id());
select throws_ok(
  $$ select join_code from public.leagues where id = torny_rls.lc_league() $$,
  '42501', null,
  'case 6: not even a global admin selects join_code through a user session');

-- 7
savepoint case_7;
select lives_ok(
  $$ update public.leagues set join_code = 'wxyz6789' where id = torny_rls.lc_league() returning id $$,
  'case 7: the organiser changes the code and asks back id');
rollback to savepoint case_7;

-- 8
savepoint case_8;
select throws_ok(
  $$ update public.leagues set join_code = 'wxyz6789' where id = torny_rls.lc_league() returning join_code $$,
  '42501', null,
  'case 8: the same update asking back join_code is refused');
rollback to savepoint case_8;

-- 9
select torny_rls.lc_as_anon();
select throws_ok(
  $$ select join_code from public.leagues $$,
  '42501', null,
  'case 9: anon CANNOT select join_code');

-- 10
select is(
  (select count(*)::int from public.leagues where id = torny_rls.lc_league()),
  0,
  'case 10: anon selects id without an error and sees no league');

select torny_rls.as_service();

-- 11
select is(
  (select coalesce(array_agg(c.column_name::text order by c.column_name::text), '{}')
     from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'leagues'
      and c.column_name not in ('join_code', 'spectate_token')
      and not has_column_privilege('authenticated', 'public.leagues', c.column_name::text, 'select')),
  '{}'::text[],
  'case 11: every other leagues column is SELECT-able for authenticated');

-- 12
select is(
  (select coalesce(array_agg(c.column_name::text order by c.column_name::text), '{}')
     from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'leagues'
      and c.column_name not in ('join_code', 'spectate_token')
      and not has_column_privilege('anon', 'public.leagues', c.column_name::text, 'select')),
  '{}'::text[],
  'case 12: every other leagues column is SELECT-able for anon');

-- 13
select is(
  array[
    has_column_privilege('authenticated', 'public.leagues', 'join_code', 'select'),
    has_column_privilege('authenticated', 'public.leagues', 'spectate_token', 'select'),
    has_column_privilege('anon', 'public.leagues', 'join_code', 'select'),
    has_column_privilege('anon', 'public.leagues', 'spectate_token', 'select')
  ],
  array[false, false, false, false],
  'case 13: join_code and spectate_token are SELECT-able for neither role');

-- 14
select is(
  (select join_code from public.leagues where id = torny_rls.lc_league()),
  'lcrd2345',
  'case 14: the server reads the code');

-- ═════════════════════════════════════════════════════════════════════════════
-- A cup and its rows: [cups, participants, plans, side awards]
-- ═════════════════════════════════════════════════════════════════════════════

-- 15
select torny_rls.as_user(torny_rls.outsider_id());
select is(torny_rls.lc_seen(), array[0, 0, 0, 0],
  'case 15: a player in none of the cups reads nothing');

-- 16
select torny_rls.as_user(torny_rls.active_id());
select is(torny_rls.lc_seen(), array[1, 1, 1, 1],
  'case 16: the organiser of the personal cup reads it and its rows');

-- 17
select torny_rls.as_user(torny_rls.submitted_id());
select is(torny_rls.lc_seen(), array[1, 1, 1, 1],
  'case 17: a participant of the personal cup reads it and its rows, and no other cup');

-- 18
select torny_rls.as_user(torny_rls.flightmate_id());
select is(
  (select array[
     (select count(*)::int from public.tournaments             where id            = torny_rls.lc_cup_club()),
     (select count(*)::int from public.tournament_participants where tournament_id = torny_rls.lc_cup_club()),
     (select count(*)::int from public.tournament_plans        where tournament_id = torny_rls.lc_cup_club()),
     (select count(*)::int from public.tournaments             where id            = torny_rls.lc_cup_solo()),
     (select count(*)::int from public.tournament_participants where tournament_id = torny_rls.lc_cup_solo())
   ]),
  array[1, 1, 1, 0, 0],
  'case 18: a member of the club reads the club cup and its rows, not the personal cup');

-- 19
select torny_rls.as_user(torny_rls.withdrawn_id());
select is(torny_rls.lc_seen(), array[1, 1, 1, 0],
  'case 19: a participant of the club cup who is not in the club reads it and its rows');

-- 20
select torny_rls.as_user(torny_rls.flightmate_id());
select is(
  (select array[
     (select count(*)::int from public.tournaments            where id            = torny_rls.lc_cup_legacy()),
     (select count(*)::int from public.tournament_side_awards where tournament_id = torny_rls.lc_cup_legacy())
   ]),
  array[1, 1],
  'case 20: a player in a started match reads the cup and its side awards');

-- 21 ─ withdrawn_id is in a draft match of the legacy cup, nothing more there.
select torny_rls.as_user(torny_rls.withdrawn_id());
select is(
  (select array[
     (select count(*)::int from public.tournaments            where id            = torny_rls.lc_cup_legacy()),
     (select count(*)::int from public.tournament_side_awards where tournament_id = torny_rls.lc_cup_legacy())
   ]),
  array[0, 0],
  'case 21: a player in a draft match only reads nothing of the cup');

-- 22
select torny_rls.as_user(torny_rls.admin_id());
select is(torny_rls.lc_seen(), array[3, 2, 2, 2],
  'case 22: a global admin reads every cup and its rows');

-- 23
select torny_rls.lc_as_anon();
select is(torny_rls.lc_seen(), array[0, 0, 0, 0],
  'case 23: anon reads nothing');

-- 24
savepoint case_24;
select torny_rls.as_user(torny_rls.active_id());
select lives_ok(
  $$ insert into public.tournaments (name, team_1_name, team_2_name, status, created_by)
       values ('LC New', 'A', 'B', 'draft', torny_rls.active_id())
     returning id $$,
  'case 24: the organiser creates a cup and gets its id back');
rollback to savepoint case_24;

-- 25
select torny_rls.as_user(torny_rls.submitted_id());
select is(torny_rls.lc_cup_ids(), array[torny_rls.lc_cup_solo()],
  'case 25: a participant reads their own cup only, also when asking by id');

select * from finish();
rollback;
