-- supabase/tests/league_cup_read_rules_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Who reads a league and a cup (migration 0250).
--
-- A league's link columns: not selectable through a user session
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
-- A cup and its rows: read by the people in the cup. Each case counts
-- [cups, participants, plans, side awards] the caller reads among the three
-- fixture cups.
--   15    a player in none of them                                     → 0 0 0 0
--   16    the organiser of the personal cup                            → its 1 1 1 1
--   17    a participant of the personal cup                            → its 1 1 1 1
--   18    a member of the club                                         → the club cup 1 1 1
--   19    a participant of the club cup who is not in the club         → the club cup 1 1 1 0
--   20    a player in a started match of a cup without a participant list → that cup and its side award
--   21    a player in a DRAFT match only                               → nothing of that cup
--   22    a global admin                                               → all 3 2 2 2
--   23    anon                                                         → 0 0 0 0
--   24    the organiser creates a cup and gets its id back (RETURNING)
--   25    a participant reads their own cup only, also when asking by id
--
-- A league and its rows: read by the people in the league. Each case counts
-- [leagues, participants, rounds] the caller reads among the two fixture
-- leagues.
--   26    a player in neither league                                   → 0 0 0
--   27    a participant of the league without a club                   → its 1 2 1
--   28    a member of the club                                         → the club league 1 1 1
--   29    a participant of the club league who is not in the club      → the club league 1 1 1
--   30    a global admin                                               → both 2 3 2
--   31    anon                                                         → 0 0 0
--   32    a club admin creates a club league and gets its id back (RETURNING)
--   33    a participant confirms their own participation               → 1 row
--
-- A plain member of the club, who neither created the club's league or cup
-- nor takes part in them (outsider_id, made a member for these two cases):
--   34    reads the club league, its participants and its rounds       → 1 1 1
--   35    reads the club cup, its participants and its plan            → 1 1 1 0
--   Outside the club the same player reads none of them: cases 15 and 26.
--
-- Depends on 0250. Run via: supabase test db (see supabase/tests/README.md)
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(35);

\ir fixtures/rls_helpers.psql

-- ── Scenario-local fixtures (lc_ = league and cup) ───────────────────────────
create or replace function torny_rls.lc_league()      returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-025000000101'::uuid $$;
create or replace function torny_rls.lc_league_club() returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-025000000102'::uuid $$;
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

-- lc_league_seen(): what the current role reads among the two fixture leagues,
-- as [leagues, participants, rounds].
create or replace function torny_rls.lc_league_seen() returns int[]
  language sql as $$
  select array[
    (select count(*)::int from public.leagues        where id        in (torny_rls.lc_league(), torny_rls.lc_league_club())),
    (select count(*)::int from public.league_players where league_id in (torny_rls.lc_league(), torny_rls.lc_league_club())),
    (select count(*)::int from public.league_rounds  where league_id in (torny_rls.lc_league(), torny_rls.lc_league_club()))
  ]
$$;

-- lc_rows(sql): runs one statement as the current role and returns the number
-- of rows it touched.
create or replace function torny_rls.lc_rows(p_sql text) returns int
  language plpgsql as $$
  declare v_rows int;
  begin
    execute p_sql;
    get diagnostics v_rows = row_count;
    return v_rows;
  end;
$$;

-- lc_cup_ids(): the fixture cups the current role reads.
create or replace function torny_rls.lc_cup_ids() returns uuid[]
  language sql as $$
  select coalesce(array_agg(id order by id), '{}')
    from public.tournaments where id = any(torny_rls.lc_cups())
$$;

grant execute on all functions in schema torny_rls to authenticated, anon, service_role;

-- ── Seed ─────────────────────────────────────────────────────────────────────
-- admin_id      a global admin; organiser of the league without a club and of
--               the legacy cup
-- active_id     in the league without a club; organiser of the personal cup
--               (not an admin)
-- submitted_id  in the league without a club, not yet confirmed; participant
--               of the personal cup
-- flightmate_id owner of the club and organiser of its league and its cup; in
--               a started match of the legacy cup
-- withdrawn_id  in the club league and the club cup, not in the club; in a
--               DRAFT match of the legacy cup
-- outsider_id   in nothing
select torny_rls.as_service();
select torny_rls.seed_active_game();
select torny_rls.seed_group_join();

insert into public.leagues (id, name, season_start, season_end, standings_model, course_scope, status, created_by, group_id, join_code, spectate_token) values
  (torny_rls.lc_league(),      'LC League',      current_date, current_date + 30, 'total', 'multi_course', 'draft', torny_rls.admin_id(),      null,                 'lcrd2345', '00000000-0000-4000-a000-025000000999'),
  (torny_rls.lc_league_club(), 'LC Club League', current_date, current_date + 30, 'total', 'multi_course', 'draft', torny_rls.flightmate_id(), torny_rls.group_id(), null,       null);
insert into public.league_players (league_id, user_id, accepted_at) values
  (torny_rls.lc_league(),      torny_rls.active_id(),    now()),
  (torny_rls.lc_league(),      torny_rls.submitted_id(), null),
  (torny_rls.lc_league_club(), torny_rls.withdrawn_id(), now());
insert into public.league_rounds (league_id, label, sequence, opens_at, closes_at, original_closes_at) values
  (torny_rls.lc_league(),      'Runde 1', 1, now() - interval '1 day', now() + interval '1 day', now() + interval '1 day'),
  (torny_rls.lc_league_club(), 'Runde 1', 1, now() - interval '1 day', now() + interval '1 day', now() + interval '1 day');

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

-- ═════════════════════════════════════════════════════════════════════════════
-- A league and its rows: [leagues, participants, rounds]
-- ═════════════════════════════════════════════════════════════════════════════

-- 26
select torny_rls.as_user(torny_rls.outsider_id());
select is(torny_rls.lc_league_seen(), array[0, 0, 0],
  'case 26: a player in neither league reads nothing');

-- 27
select torny_rls.as_user(torny_rls.active_id());
select is(torny_rls.lc_league_seen(), array[1, 2, 1],
  'case 27: a participant of the league without a club reads it, its participants and its rounds');

-- 28
select torny_rls.as_user(torny_rls.flightmate_id());
select is(torny_rls.lc_league_seen(), array[1, 1, 1],
  'case 28: a member of the club reads the club league and its rows, not the other league');

-- 29
select torny_rls.as_user(torny_rls.withdrawn_id());
select is(torny_rls.lc_league_seen(), array[1, 1, 1],
  'case 29: a participant of the club league who is not in the club reads it and its rows');

-- 30
select torny_rls.as_user(torny_rls.admin_id());
select is(torny_rls.lc_league_seen(), array[2, 3, 2],
  'case 30: a global admin reads both leagues and their rows');

-- 31
select torny_rls.lc_as_anon();
select is(torny_rls.lc_league_seen(), array[0, 0, 0],
  'case 31: anon reads nothing');

-- 32
savepoint case_32;
select torny_rls.as_user(torny_rls.flightmate_id());
select lives_ok(
  $$ insert into public.leagues (name, season_start, season_end, standings_model, course_scope, status, created_by, group_id)
       values ('LC New', current_date, current_date + 30, 'total', 'multi_course', 'draft', torny_rls.flightmate_id(), torny_rls.group_id())
     returning id $$,
  'case 32: a club admin creates a club league and gets its id back');
rollback to savepoint case_32;

-- 33
savepoint case_33;
select torny_rls.as_user(torny_rls.submitted_id());
select is(
  torny_rls.lc_rows($$ update public.league_players set accepted_at = now()
                        where league_id = torny_rls.lc_league() and user_id = torny_rls.submitted_id() and accepted_at is null $$),
  1,
  'case 33: a participant confirms their own participation');
rollback to savepoint case_33;

-- ═════════════════════════════════════════════════════════════════════════════
-- A plain member of the club: the membership alone opens the club's league and cup
-- ═════════════════════════════════════════════════════════════════════════════
-- outsider_id read nothing in cases 15 and 26. Here the same player is made a
-- plain member of the club: not its owner, not the creator of the league or
-- the cup, not a participant of either.
savepoint case_34;
select torny_rls.as_service();
insert into public.group_members (group_id, user_id, role)
  values (torny_rls.group_id(), torny_rls.outsider_id(), 'member');
select torny_rls.as_user(torny_rls.outsider_id());

-- 34
select is(torny_rls.lc_league_seen(), array[1, 1, 1],
  'case 34: a plain member of the club reads the club league, its participants and its rounds, and no other league');

-- 35
select is(torny_rls.lc_seen(), array[1, 1, 1, 0],
  'case 35: a plain member of the club reads the club cup, its participants and its plan, and no other cup');
rollback to savepoint case_34;

select torny_rls.as_service();

select * from finish();
rollback;
