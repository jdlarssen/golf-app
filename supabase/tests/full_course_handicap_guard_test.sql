-- supabase/tests/full_course_handicap_guard_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0254 (owner-ordered audit 20.11, finding F1): the start freezes
-- game_players.full_course_handicap, and a signed-in non-admin changes it only
-- while the round is scheduled (a league flight starts with the player's own
-- client). Every case is a direct request, past the screens.
--
--    1  a player does not set their own value in a round in progress → 42501
--    2  a creator does not set another player's value in progress    → 42501
--    3  a creator does not change it in a finished round             → 42501
--    4  a player does not clear their own value in progress          → 42501
--    5  a creator does not insert a roster row with a value          → 42501
--    6  the start freezes it with the creator's client while scheduled
--       (a league flight's starter creates the flight game)
--    7  a player writes their own value while scheduled (allowed: the start
--       overwrites every roster row)
--    8  another rostered player does not write someone else's row, also
--       while scheduled (the peer guard, 0191)                      → 42501
--    9  the service role writes it in a finished round (the backfill)
--
-- Run via:  supabase test db   (see supabase/tests/README.md)
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

\ir fixtures/rls_helpers.psql

-- ── Fixtures ─────────────────────────────────────────────────────────────────
-- Rounds created by active_id, a plain player, with active_id and the
-- flightmate on the roster, already frozen at 31 like a started round.
select torny_rls.as_service();
select torny_rls.seed_active_game();

create or replace function torny_rls.fch_scheduled() returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-0000000007a1'::uuid $$;
create or replace function torny_rls.fch_active()    returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-0000000007a2'::uuid $$;
create or replace function torny_rls.fch_finished()  returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-0000000007a3'::uuid $$;

insert into public.games (id, name, course_id, tee_box_id, status, game_mode, created_by, started_at) values
  (torny_rls.fch_scheduled(), 'FCH scheduled', torny_rls.course_id(), torny_rls.tee_box_id(), 'scheduled', 'stableford', torny_rls.active_id(), null),
  (torny_rls.fch_active(),    'FCH active',    torny_rls.course_id(), torny_rls.tee_box_id(), 'active',    'stableford', torny_rls.active_id(), now()),
  (torny_rls.fch_finished(),  'FCH finished',  torny_rls.course_id(), torny_rls.tee_box_id(), 'finished',  'stableford', torny_rls.active_id(), now());

insert into public.game_players (game_id, user_id, team_number, flight_number, course_handicap, full_course_handicap)
  select g, u, 1, 1, 23, 31
    from unnest(array[torny_rls.fch_active(), torny_rls.fch_finished()]) g,
         unnest(array[torny_rls.active_id(), torny_rls.flightmate_id()]) u;
insert into public.game_players (game_id, user_id, team_number, flight_number)
  select torny_rls.fch_scheduled(), u, 1, 1
    from unnest(array[torny_rls.active_id(), torny_rls.flightmate_id()]) u;

-- rows_of(sql): rows touched, or -1 when the database refused with 42501.
create or replace function torny_rls.fch_rows_of(p_sql text) returns int
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
  torny_rls.fch_rows_of(format(
    'update public.game_players set full_course_handicap = 40 where game_id = %L and user_id = %L',
    torny_rls.fch_active(), torny_rls.flightmate_id())),
  -1, 'a player does not set their own full course handicap in a round in progress'
);

select torny_rls.as_user(torny_rls.active_id());
select is(
  torny_rls.fch_rows_of(format(
    'update public.game_players set full_course_handicap = 40 where game_id = %L and user_id = %L',
    torny_rls.fch_active(), torny_rls.flightmate_id())),
  -1, 'a creator does not set another player''s full course handicap in a round in progress'
);
select is(
  torny_rls.fch_rows_of(format(
    'update public.game_players set full_course_handicap = 40 where game_id = %L and user_id = %L',
    torny_rls.fch_finished(), torny_rls.flightmate_id())),
  -1, 'a creator does not change the full course handicap in a finished round'
);
select is(
  torny_rls.fch_rows_of(format(
    'update public.game_players set full_course_handicap = null where game_id = %L and user_id = %L',
    torny_rls.fch_active(), torny_rls.active_id())),
  -1, 'a player does not clear their own full course handicap in a round in progress'
);

-- submitted_id shares the seed game with active_id, so the invite gate (0208)
-- lets the row through and the refusal comes from 0254.
select throws_ok(
  format($q$insert into public.game_players (game_id, user_id, team_number, flight_number, full_course_handicap)
            values (%L, %L, 1, 1, 31)$q$,
         torny_rls.fch_scheduled(), torny_rls.submitted_id()),
  '42501', null,
  'a creator does not insert a roster row with a full course handicap'
);

-- ── While scheduled: the start (creator's client) and the own row ───────────
-- active_id created the round, as a league flight's starter creates the flight.
select is(
  torny_rls.fch_rows_of(format(
    'update public.game_players set course_handicap = 23, full_course_handicap = 31 where game_id = %L and user_id = %L',
    torny_rls.fch_scheduled(), torny_rls.flightmate_id())),
  1, 'the start freezes the full course handicap with the creator''s client while the round is scheduled'
);

select torny_rls.as_user(torny_rls.flightmate_id());
select is(
  torny_rls.fch_rows_of(format(
    'update public.game_players set full_course_handicap = 40 where game_id = %L and user_id = %L',
    torny_rls.fch_scheduled(), torny_rls.flightmate_id())),
  1, 'a player writes their own full course handicap while the round is scheduled (the start overwrites it)'
);
select is(
  torny_rls.fch_rows_of(format(
    'update public.game_players set full_course_handicap = 40 where game_id = %L and user_id = %L',
    torny_rls.fch_scheduled(), torny_rls.active_id())),
  -1, 'another rostered player does not write someone else''s full course handicap, also while scheduled'
);

-- ── The service role: the backfill ───────────────────────────────────────────
select torny_rls.as_service();
select is(
  torny_rls.fch_rows_of(format(
    'update public.game_players set full_course_handicap = 30 where game_id = %L and user_id = %L',
    torny_rls.fch_finished(), torny_rls.flightmate_id())),
  1, 'the service role writes the full course handicap in a finished round'
);

select * from finish();
rollback;
