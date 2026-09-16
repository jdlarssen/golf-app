-- supabase/tests/game_players_delete_cup_rls_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- RLS integration test: the two DELETE policies on game_players keep cup
-- matches (games.tournament_id is not null) out of reach (#1937, migration 0178).
--
-- A deleted row in a cup match before start silently breaks the match: the side
-- is short a player and auto-start blocks forever (#1814). The legitimate paths
-- (cup withdrawal, swapCupMatchPlayer) run on the service role.
--
--   BLOCKED (0 rows, row survives):
--     1. player deletes own row, cup match 'scheduled'   ("self withdraw pre active")
--     2. player deletes own row, cup match 'draft'
--     3. organizer (games.created_by) deletes a player's row in a cup match
--                                                         ("creator delete")
--   UNCHANGED (row deleted):
--     4. player deletes own row, plain game 'scheduled'
--     5. creator deletes a player's row, plain game
--     6. creator deletes a player's row in a league round (league_round_id set,
--        tournament_id null)
--     7. global admin deletes a row in a cup match       (is_admin() branch)
--   Negative control:
--     8. service role deletes a row in a cup match       (RLS bypassed — proves
--        swapCupMatchPlayer still works and 1–3 are real enforcement)
--
-- Every probe and its row-exists check are SEPARATE statements: a check in the
-- same statement as the write reads the pre-write snapshot (#1910).
--
-- Run via:  supabase test db   (see supabase/tests/README.md)
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

\ir fixtures/rls_helpers.psql

-- ── Scenario-local fixtures (dc_ = delete cup) ────────────────────────────────
create or replace function torny_rls.dc_tournament() returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-193700000001'::uuid $$;
create or replace function torny_rls.dc_league()     returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-193700000002'::uuid $$;
create or replace function torny_rls.dc_round()      returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-193700000003'::uuid $$;
create or replace function torny_rls.dc_cup_scheduled() returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-193700000011'::uuid $$;
create or replace function torny_rls.dc_cup_draft()     returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-193700000012'::uuid $$;
create or replace function torny_rls.dc_plain()         returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-193700000013'::uuid $$;
create or replace function torny_rls.dc_league_game()   returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-193700000014'::uuid $$;

-- dc_try_delete(game, target): the current impersonated user deletes target's
-- row. Returns the affected row count (RLS denial = 0 rows, no error).
create or replace function torny_rls.dc_try_delete(p_game uuid, p_target uuid) returns int
  language plpgsql as $$
  declare v_rows int;
  begin
    delete from public.game_players where game_id = p_game and user_id = p_target;
    get diagnostics v_rows = row_count;
    return v_rows;
  exception when insufficient_privilege then return 0;
  end;
$$;

-- security definer: the check reads past RLS, so a row the caller can no longer
-- see (they left the game) is not mistaken for a deleted one.
create or replace function torny_rls.dc_row_exists(p_game uuid, p_target uuid) returns boolean
  language sql security definer set search_path = '' as $$
    select exists(select 1 from public.game_players where game_id = p_game and user_id = p_target);
$$;

grant execute on all functions in schema torny_rls to authenticated, anon, service_role;

-- ── Seed ──────────────────────────────────────────────────────────────────────
-- Main rig: users (admin_id is global admin; active_id, flightmate_id,
-- submitted_id are plain users), course, tee box. flightmate_id (non-admin)
-- organizes everything below, so the admin branch never masks the creator branch.
select torny_rls.as_service();
select torny_rls.seed_active_game();

insert into public.tournaments (id, name, team_1_name, team_2_name, status, created_by)
  values (torny_rls.dc_tournament(), 'DC Cup', 'Europa', 'USA', 'active', torny_rls.flightmate_id());

insert into public.leagues (id, name, season_start, season_end, standings_model, course_scope, status, created_by)
  values (torny_rls.dc_league(), 'DC League', current_date, current_date + 30, 'total', 'multi_course', 'active', torny_rls.flightmate_id());
insert into public.league_rounds (id, league_id, label, sequence, opens_at, closes_at, original_closes_at)
  values (torny_rls.dc_round(), torny_rls.dc_league(), 'Runde 1', 1, now() - interval '1 day', now() + interval '1 day', now() + interval '1 day');

insert into public.games (id, name, course_id, tee_box_id, status, game_mode, created_by, tournament_id, league_round_id) values
  (torny_rls.dc_cup_scheduled(), 'DC Cup scheduled', torny_rls.course_id(), torny_rls.tee_box_id(), 'scheduled', 'solo_strokeplay', torny_rls.flightmate_id(), torny_rls.dc_tournament(), null),
  (torny_rls.dc_cup_draft(),     'DC Cup draft',     torny_rls.course_id(), torny_rls.tee_box_id(), 'draft',     'solo_strokeplay', torny_rls.flightmate_id(), torny_rls.dc_tournament(), null),
  (torny_rls.dc_plain(),         'DC Plain',         torny_rls.course_id(), torny_rls.tee_box_id(), 'scheduled', 'solo_strokeplay', torny_rls.flightmate_id(), null, null),
  (torny_rls.dc_league_game(),   'DC League round',  torny_rls.course_id(), torny_rls.tee_box_id(), 'scheduled', 'solo_strokeplay', torny_rls.flightmate_id(), null, torny_rls.dc_round());

insert into public.game_players (game_id, user_id) values
  (torny_rls.dc_cup_scheduled(), torny_rls.active_id()),
  (torny_rls.dc_cup_scheduled(), torny_rls.submitted_id()),
  (torny_rls.dc_cup_draft(),     torny_rls.active_id()),
  (torny_rls.dc_plain(),         torny_rls.active_id()),
  (torny_rls.dc_plain(),         torny_rls.submitted_id()),
  (torny_rls.dc_league_game(),   torny_rls.submitted_id());

-- ═════════════════════════════════════════════════════════════════════════════
-- BLOCKED — cup matches before start
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.active_id());

select is(torny_rls.dc_try_delete(torny_rls.dc_cup_scheduled(), torny_rls.active_id()), 0,
  '#1937: player CANNOT delete own row in a scheduled cup match (direct DELETE)');
select ok(torny_rls.dc_row_exists(torny_rls.dc_cup_scheduled(), torny_rls.active_id()),
  '#1937: the player''s row in the scheduled cup match survives');

select is(torny_rls.dc_try_delete(torny_rls.dc_cup_draft(), torny_rls.active_id()), 0,
  '#1937: player CANNOT delete own row in a draft cup match');
select ok(torny_rls.dc_row_exists(torny_rls.dc_cup_draft(), torny_rls.active_id()),
  '#1937: the player''s row in the draft cup match survives');

select torny_rls.as_user(torny_rls.flightmate_id());

select is(torny_rls.dc_try_delete(torny_rls.dc_cup_scheduled(), torny_rls.submitted_id()), 0,
  '#1937: cup organizer (games.created_by) CANNOT delete a player''s row in a cup match');
select ok(torny_rls.dc_row_exists(torny_rls.dc_cup_scheduled(), torny_rls.submitted_id()),
  '#1937: the row the organizer tried to delete survives');

-- ═════════════════════════════════════════════════════════════════════════════
-- UNCHANGED — plain games and league rounds
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.active_id());

select is(torny_rls.dc_try_delete(torny_rls.dc_plain(), torny_rls.active_id()), 1,
  'player CAN still delete own row in a scheduled plain game');
select ok(not torny_rls.dc_row_exists(torny_rls.dc_plain(), torny_rls.active_id()),
  'the player''s row in the plain game is gone');

select torny_rls.as_user(torny_rls.flightmate_id());

select is(torny_rls.dc_try_delete(torny_rls.dc_plain(), torny_rls.submitted_id()), 1,
  'creator CAN still delete a player''s row in a plain game');
select ok(not torny_rls.dc_row_exists(torny_rls.dc_plain(), torny_rls.submitted_id()),
  'the row the creator deleted in the plain game is gone');

select is(torny_rls.dc_try_delete(torny_rls.dc_league_game(), torny_rls.submitted_id()), 1,
  'creator CAN still delete a player''s row in a league round (tournament_id null)');
select ok(not torny_rls.dc_row_exists(torny_rls.dc_league_game(), torny_rls.submitted_id()),
  'the row the creator deleted in the league round is gone');

-- ═════════════════════════════════════════════════════════════════════════════
-- Admin and service role
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.admin_id());

select is(torny_rls.dc_try_delete(torny_rls.dc_cup_scheduled(), torny_rls.submitted_id()), 1,
  'global admin CAN delete a row in a cup match (is_admin branch untouched)');
select ok(not torny_rls.dc_row_exists(torny_rls.dc_cup_scheduled(), torny_rls.submitted_id()),
  'the row the admin deleted in the cup match is gone');

select torny_rls.as_service();

select is(torny_rls.dc_try_delete(torny_rls.dc_cup_draft(), torny_rls.active_id()), 1,
  'service role CAN delete a row in a cup match (swapCupMatchPlayer path, RLS bypassed)');
select ok(not torny_rls.dc_row_exists(torny_rls.dc_cup_draft(), torny_rls.active_id()),
  'the row the service role deleted in the cup match is gone');

select * from finish();
rollback;
