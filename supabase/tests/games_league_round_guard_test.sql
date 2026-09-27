-- supabase/tests/games_league_round_guard_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- games.league_round_id is server-owned (#2207, migration 0186).
--
-- The league standings count finished games per round with the service role.
-- The flight start checks window, membership, marker and one counted flight on
-- the server and inserts through the admin client, so no client needs to set
-- the link itself.
--
--   1. a non-admin PATCHes league_round_id on their own game       → 42501
--   2. a non-admin inserts a game with league_round_id             → 42501
--   3. the link is unchanged after 1 (checked as the service role)
--   4. a global admin sets it                                      → ok
--   5. the service role inserts a flight game with it              → ok
--   6. the club owner deletes the round (ON DELETE SET NULL)       → ok
--   7. …and the game's link is cleared
--
-- Every probe and its check are separate statements (#1910).
-- Depends on 0186. Run via: supabase test db (see supabase/tests/README.md)
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

\ir fixtures/rls_helpers.psql

-- ── Scenario-local fixtures (lr_ = league round) ──────────────────────────────
create or replace function torny_rls.lr_club()   returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-220700000101'::uuid $$;
create or replace function torny_rls.lr_league() returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-220700000102'::uuid $$;
create or replace function torny_rls.lr_round()  returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-220700000103'::uuid $$;
create or replace function torny_rls.lr_game()   returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-220700000111'::uuid $$;
create or replace function torny_rls.lr_flight() returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-220700000112'::uuid $$;

-- security definer: reads past RLS.
create or replace function torny_rls.lr_round_of(p_game uuid) returns uuid
  language sql security definer set search_path = '' as $$
    select league_round_id from public.games where id = p_game;
$$;

grant execute on all functions in schema torny_rls to authenticated, anon, service_role;

-- ── Seed ──────────────────────────────────────────────────────────────────────
-- flightmate_id owns the club and so runs the club league; active_id is a
-- plain player with a game of their own.
select torny_rls.as_service();
select torny_rls.seed_active_game();

insert into public.groups (id, name, created_by) values (torny_rls.lr_club(), 'LR Club', torny_rls.flightmate_id());
insert into public.group_members (group_id, user_id, role) values (torny_rls.lr_club(), torny_rls.flightmate_id(), 'owner');

insert into public.leagues (id, name, season_start, season_end, standings_model, course_scope, status, created_by, group_id)
  values (torny_rls.lr_league(), 'LR League', current_date, current_date + 30, 'total', 'multi_course', 'active', torny_rls.flightmate_id(), torny_rls.lr_club());
insert into public.league_rounds (id, league_id, label, sequence, opens_at, closes_at, original_closes_at)
  values (torny_rls.lr_round(), torny_rls.lr_league(), 'Runde 1', 1, now() - interval '1 day', now() + interval '1 day', now() + interval '1 day');

insert into public.games (id, name, course_id, tee_box_id, status, game_mode, created_by) values
  (torny_rls.lr_game(), 'LR own game', torny_rls.course_id(), torny_rls.tee_box_id(), 'draft', 'solo_strokeplay', torny_rls.active_id());

-- ═════════════════════════════════════════════════════════════════════════════
-- A player cannot set the link
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.active_id());

select throws_ok(
  $$ update public.games set league_round_id = torny_rls.lr_round() where id = torny_rls.lr_game() $$,
  '42501', null,
  'a player CANNOT link their own game to a league round (direct PATCH)'
);

select throws_ok(
  $$ insert into public.games (name, course_id, tee_box_id, status, game_mode, created_by, league_round_id)
     values ('LR hand-made flight', torny_rls.course_id(), torny_rls.tee_box_id(), 'scheduled', 'solo_strokeplay', torny_rls.active_id(), torny_rls.lr_round()) $$,
  '42501', null,
  'a player CANNOT insert a game already linked to a league round'
);

select torny_rls.as_service();

select is(torny_rls.lr_round_of(torny_rls.lr_game()), null::uuid,
  'the refused PATCH left the game unlinked');

-- ═════════════════════════════════════════════════════════════════════════════
-- Admin and the service role can
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.admin_id());

select lives_ok(
  $$ update public.games set league_round_id = torny_rls.lr_round() where id = torny_rls.lr_game() $$,
  'a global admin CAN set the link'
);

select torny_rls.as_service();

select lives_ok(
  $$ insert into public.games (id, name, course_id, tee_box_id, status, game_mode, created_by, league_round_id)
     values (torny_rls.lr_flight(), 'LR flight', torny_rls.course_id(), torny_rls.tee_box_id(), 'scheduled', 'solo_strokeplay', torny_rls.active_id(), torny_rls.lr_round()) $$,
  'the service role CAN insert a flight game with the link (the flight start)'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- Deleting the round clears the link (ON DELETE SET NULL)
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.flightmate_id());

select lives_ok(
  $$ delete from public.league_rounds where id = torny_rls.lr_round() $$,
  'the club owner CAN delete the round; the SET NULL cascade passes the trigger'
);

select torny_rls.as_service();

select is(torny_rls.lr_round_of(torny_rls.lr_flight()), null::uuid,
  'the cascade cleared league_round_id on the flight game');

select * from finish();
rollback;
