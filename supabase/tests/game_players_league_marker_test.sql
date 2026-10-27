-- supabase/tests/game_players_league_marker_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- The marker in a simulator league (#2661, migration 0220).
--
-- The player names a marker when they deliver; the server writes
-- game_players.marker_user_id, and the marker approves through the server. The
-- database lets nobody else do either (guard_game_players_league_marker):
--
--   1. the player PATCHes the marker on their own card               → 42501
--   2. the flight's creator PATCHes the marker on a flightmate's card → 42501
--   3. …and the marker is unchanged after 1 and 2
--   4. the service role writes the marker                             → ok
--   5. a flightmate approves the card in the simulator flight         → 42501
--   6. the flight's creator approves a flightmate's card there        → 42501
--   7. …and the card is still not approved
--   8. a flightmate approves in a REGULAR league flight               → ok
--   9. …and that card is approved
--  10. a global admin approves in the simulator flight                → ok
--  11. a global admin approves their OWN card there                    → 42501
--  12. the service role approves in the simulator flight              → ok
--
-- Every probe and its check are separate statements (#1910).
-- Depends on 0220. Run via: supabase test db (see supabase/tests/README.md)
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

\ir fixtures/rls_helpers.psql

-- ── Scenario-local fixtures (lm_ = league marker) ─────────────────────────────
create or replace function torny_rls.lm_sim_league() returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-266100000101'::uuid $$;
create or replace function torny_rls.lm_reg_league() returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-266100000102'::uuid $$;
create or replace function torny_rls.lm_sim_round()  returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-266100000103'::uuid $$;
create or replace function torny_rls.lm_reg_round()  returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-266100000104'::uuid $$;
create or replace function torny_rls.lm_sim_flight() returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-266100000111'::uuid $$;
create or replace function torny_rls.lm_reg_flight() returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-266100000112'::uuid $$;

-- security definer: reads past RLS.
create or replace function torny_rls.lm_marker_of(p_game uuid, p_user uuid) returns uuid
  language sql security definer set search_path = '' as $$
    select marker_user_id from public.game_players where game_id = p_game and user_id = p_user;
$$;
create or replace function torny_rls.lm_approved_of(p_game uuid, p_user uuid) returns timestamptz
  language sql security definer set search_path = '' as $$
    select approved_at from public.game_players where game_id = p_game and user_id = p_user;
$$;

grant execute on all functions in schema torny_rls to authenticated, anon, service_role;

-- ── Seed ──────────────────────────────────────────────────────────────────────
-- active_id started both flights (the game creator) with flightmate_id;
-- outsider_id is a member of the simulator league and the marker, not in the
-- flight. admin_id runs both leagues.
select torny_rls.as_service();
select torny_rls.seed_active_game();

insert into public.leagues
  (id, name, season_start, season_end, standings_model, course_scope, course_id, tee_box_id,
   status, created_by, is_simulator) values
  (torny_rls.lm_sim_league(), 'LM Sim', current_date, current_date + 90, 'total', 'single_course_single_tee',
   torny_rls.course_id(), torny_rls.tee_box_id(), 'active', torny_rls.admin_id(), true),
  (torny_rls.lm_reg_league(), 'LM Regular', current_date, current_date + 90, 'total', 'single_course_single_tee',
   torny_rls.course_id(), torny_rls.tee_box_id(), 'active', torny_rls.admin_id(), false);

insert into public.league_players (league_id, user_id, accepted_at) values
  (torny_rls.lm_sim_league(), torny_rls.active_id(),     now()),
  (torny_rls.lm_sim_league(), torny_rls.flightmate_id(), now()),
  (torny_rls.lm_sim_league(), torny_rls.outsider_id(),   now()),
  (torny_rls.lm_reg_league(), torny_rls.active_id(),     now()),
  (torny_rls.lm_reg_league(), torny_rls.flightmate_id(), now());

insert into public.league_rounds
  (id, league_id, sequence, label, course_id, tee_box_id, opens_at, closes_at, original_closes_at) values
  (torny_rls.lm_sim_round(), torny_rls.lm_sim_league(), 1, 'Runde 1', torny_rls.course_id(), torny_rls.tee_box_id(),
   now() - interval '1 day', now() + interval '6 days', now() + interval '6 days'),
  (torny_rls.lm_reg_round(), torny_rls.lm_reg_league(), 1, 'Runde 1', torny_rls.course_id(), torny_rls.tee_box_id(),
   now() - interval '1 day', now() + interval '6 days', now() + interval '6 days');

insert into public.games
  (id, name, course_id, tee_box_id, status, game_mode, created_by, started_at, league_round_id, require_peer_approval) values
  (torny_rls.lm_sim_flight(), 'LM Sim – Runde', torny_rls.course_id(), torny_rls.tee_box_id(), 'active',
   'solo_strokeplay', torny_rls.active_id(), now(), torny_rls.lm_sim_round(), true),
  (torny_rls.lm_reg_flight(), 'LM Regular – Runde', torny_rls.course_id(), torny_rls.tee_box_id(), 'active',
   'solo_strokeplay', torny_rls.active_id(), now(), torny_rls.lm_reg_round(), false);

-- Both cards in both flights are delivered (the service role, as the app route).
insert into public.game_players (game_id, user_id, team_number, flight_number, submitted_at) values
  (torny_rls.lm_sim_flight(), torny_rls.active_id(),     null, null, now()),
  (torny_rls.lm_sim_flight(), torny_rls.flightmate_id(), null, null, now()),
  (torny_rls.lm_sim_flight(), torny_rls.admin_id(),      null, null, now()),
  (torny_rls.lm_reg_flight(), torny_rls.active_id(),     null, null, now()),
  (torny_rls.lm_reg_flight(), torny_rls.flightmate_id(), null, null, now());

-- ═════════════════════════════════════════════════════════════════════════════
-- Only the server names the marker
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.active_id());

select throws_ok(
  $$ update public.game_players set marker_user_id = torny_rls.outsider_id()
      where game_id = torny_rls.lm_sim_flight() and user_id = torny_rls.active_id() $$,
  '42501', null,
  'a player CANNOT name the marker on their own card (direct PATCH)'
);

select throws_ok(
  $$ update public.game_players set marker_user_id = torny_rls.active_id()
      where game_id = torny_rls.lm_sim_flight() and user_id = torny_rls.flightmate_id() $$,
  '42501', null,
  'the flight''s creator CANNOT name the marker on a flightmate''s card'
);

select torny_rls.as_service();

select is(
  torny_rls.lm_marker_of(torny_rls.lm_sim_flight(), torny_rls.active_id()),
  null::uuid,
  'the refused PATCHes left no marker on the card'
);

select lives_ok(
  $$ update public.game_players set marker_user_id = torny_rls.outsider_id()
      where game_id = torny_rls.lm_sim_flight()
        and user_id in (torny_rls.active_id(), torny_rls.flightmate_id()) $$,
  'the service role CAN name the marker (the delivery)'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- In a simulator flight only the server approves
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.flightmate_id());

select throws_ok(
  $$ update public.game_players set approved_at = now(), approved_by_user_id = torny_rls.flightmate_id()
      where game_id = torny_rls.lm_sim_flight() and user_id = torny_rls.active_id() $$,
  '42501', null,
  'a flightmate CANNOT approve a card in a simulator-league flight'
);

select torny_rls.as_user(torny_rls.active_id());

select throws_ok(
  $$ update public.game_players set approved_at = now(), approved_by_user_id = torny_rls.active_id()
      where game_id = torny_rls.lm_sim_flight() and user_id = torny_rls.flightmate_id() $$,
  '42501', null,
  'the flight''s creator CANNOT approve a flightmate''s card in a simulator-league flight'
);

select torny_rls.as_service();

select is(
  torny_rls.lm_approved_of(torny_rls.lm_sim_flight(), torny_rls.active_id()),
  null::timestamptz,
  'the refused approvals left the card unapproved'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- A regular league flight is unchanged; admin and the service role pass
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.flightmate_id());

select lives_ok(
  $$ update public.game_players set approved_at = now(), approved_by_user_id = torny_rls.flightmate_id()
      where game_id = torny_rls.lm_reg_flight() and user_id = torny_rls.active_id() $$,
  'a flightmate CAN still approve in a regular league flight'
);

select torny_rls.as_service();

select isnt(
  torny_rls.lm_approved_of(torny_rls.lm_reg_flight(), torny_rls.active_id()),
  null::timestamptz,
  'the regular league flight''s card is approved'
);

select torny_rls.as_user(torny_rls.admin_id());

select lives_ok(
  $$ update public.game_players set approved_at = now(), approved_by_user_id = torny_rls.admin_id()
      where game_id = torny_rls.lm_sim_flight() and user_id = torny_rls.active_id() $$,
  'a global admin CAN approve in a simulator-league flight'
);

select throws_ok(
  $$ update public.game_players set approved_at = now(), approved_by_user_id = torny_rls.admin_id()
      where game_id = torny_rls.lm_sim_flight() and user_id = torny_rls.admin_id() $$,
  '42501', null,
  'a global admin CANNOT approve their own card in a simulator-league flight'
);

select torny_rls.as_service();

select lives_ok(
  $$ update public.game_players set approved_at = now(), approved_by_user_id = torny_rls.outsider_id()
      where game_id = torny_rls.lm_sim_flight() and user_id = torny_rls.flightmate_id() $$,
  'the service role CAN approve in a simulator-league flight (the marker''s approval)'
);

select * from finish();
rollback;
