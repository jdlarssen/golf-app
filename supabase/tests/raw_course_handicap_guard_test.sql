-- supabase/tests/raw_course_handicap_guard_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0258 (#2997, rule-book review F16/F25): the start freezes
-- game_players.raw_course_handicap next to full_course_handicap, and a
-- signed-in non-admin changes it only while the round is scheduled (a league
-- flight starts with the player's own client). Same two checks as 0254, read
-- in full_course_handicap_guard_test.sql. Every case is a direct request, past
-- the screens.
--
--    1  a player does not set their own value in a round in progress → 42501
--    2  a creator does not change it in a finished round             → 42501
--    3  a creator does not insert a roster row with a value          → 42501
--    4  the start freezes it with the creator's client while scheduled
--    5  the service role writes it in a round in progress
--
-- Run via:  supabase test db   (see supabase/tests/README.md)
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

\ir fixtures/rls_helpers.psql

-- ── Fixtures ─────────────────────────────────────────────────────────────────
-- Rounds created by active_id, a plain player, with active_id and the
-- flightmate on the roster, already frozen like a started round.
select torny_rls.as_service();
select torny_rls.seed_active_game();

create or replace function torny_rls.rch_scheduled() returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-0000000007b1'::uuid $$;
create or replace function torny_rls.rch_active()    returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-0000000007b2'::uuid $$;
create or replace function torny_rls.rch_finished()  returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-0000000007b3'::uuid $$;

insert into public.games (id, name, course_id, tee_box_id, status, game_mode, created_by, started_at) values
  (torny_rls.rch_scheduled(), 'RCH scheduled', torny_rls.course_id(), torny_rls.tee_box_id(), 'scheduled', 'stableford', torny_rls.active_id(), null),
  (torny_rls.rch_active(),    'RCH active',    torny_rls.course_id(), torny_rls.tee_box_id(), 'active',    'stableford', torny_rls.active_id(), now()),
  (torny_rls.rch_finished(),  'RCH finished',  torny_rls.course_id(), torny_rls.tee_box_id(), 'finished',  'stableford', torny_rls.active_id(), now());

insert into public.game_players (game_id, user_id, team_number, flight_number, course_handicap, full_course_handicap, raw_course_handicap)
  select g, u, 1, 1, 21, 21, 20.907
    from unnest(array[torny_rls.rch_active(), torny_rls.rch_finished()]) g,
         unnest(array[torny_rls.active_id(), torny_rls.flightmate_id()]) u;
insert into public.game_players (game_id, user_id, team_number, flight_number)
  select torny_rls.rch_scheduled(), u, 1, 1
    from unnest(array[torny_rls.active_id(), torny_rls.flightmate_id()]) u;

-- rows_of(sql): rows touched, or -1 when the database refused with 42501.
create or replace function torny_rls.rch_rows_of(p_sql text) returns int
  language plpgsql
  as $$
  declare v_rows int;
  begin
    execute p_sql;
    get diagnostics v_rows = row_count;
    return v_rows;
  exception
    when insufficient_privilege then return -1;
  end;
  $$;

grant execute on all functions in schema torny_rls to authenticated, anon, service_role;

-- ── After the start: fixed ───────────────────────────────────────────────────
select torny_rls.as_user(torny_rls.flightmate_id());
select is(
  torny_rls.rch_rows_of(format(
    'update public.game_players set raw_course_handicap = 30.5 where game_id = %L and user_id = %L',
    torny_rls.rch_active(), torny_rls.flightmate_id())),
  -1, 'a player does not set their own raw course handicap in a round in progress'
);

select torny_rls.as_user(torny_rls.active_id());
select is(
  torny_rls.rch_rows_of(format(
    'update public.game_players set raw_course_handicap = 30.5 where game_id = %L and user_id = %L',
    torny_rls.rch_finished(), torny_rls.flightmate_id())),
  -1, 'a creator does not change the raw course handicap in a finished round'
);

-- submitted_id shares the seed game with active_id, so the invite gate (0208)
-- lets the row through and the refusal comes from 0258.
select throws_ok(
  format($q$insert into public.game_players (game_id, user_id, team_number, flight_number, raw_course_handicap)
            values (%L, %L, 1, 1, 20.907)$q$,
         torny_rls.rch_scheduled(), torny_rls.submitted_id()),
  '42501', null,
  'a creator does not insert a roster row with a raw course handicap'
);

-- ── While scheduled: the start (creator's client) ───────────────────────────
-- active_id created the round, as a league flight's starter creates the flight.
select is(
  torny_rls.rch_rows_of(format(
    'update public.game_players set course_handicap = 21, full_course_handicap = 21, raw_course_handicap = 20.907 where game_id = %L and user_id = %L',
    torny_rls.rch_scheduled(), torny_rls.flightmate_id())),
  1, 'the start freezes the raw course handicap with the creator''s client while the round is scheduled'
);

-- ── The service role ─────────────────────────────────────────────────────────
select torny_rls.as_service();
select is(
  torny_rls.rch_rows_of(format(
    'update public.game_players set raw_course_handicap = 22.1 where game_id = %L and user_id = %L',
    torny_rls.rch_active(), torny_rls.flightmate_id())),
  1, 'the service role writes the raw course handicap in a round in progress (the recompute)'
);

select * from finish();
rollback;
