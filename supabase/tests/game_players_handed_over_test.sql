-- supabase/tests/game_players_handed_over_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- The handover in a simulator league (#2814, migration 0233).
--
-- The one who keeps the flight's cards hands them over; the server stamps
-- game_players.handed_over_at, and only a handed-over card is approved when it
-- is delivered unchanged. The database holds the line
-- (guard_game_players_handed_over):
--
--   1. the player stamps their own card as handed over               → 42501
--   2. the flight's creator stamps a flightmate's card                 → 42501
--   3. …and the card is still not handed over
--   4. the service role stamps it (the handover)                      → ok
--   5. a delivered handed-over card that goes back to not delivered
--      (sent back or reopened) is no longer handed over
--   6. a player may clear it (that only removes the automatic approval) → ok
--
-- Every probe and its check are separate statements (#1910).
-- Depends on 0233. Run via: supabase test db (see supabase/tests/README.md)
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

\ir fixtures/rls_helpers.psql

-- ── Scenario-local fixtures (ho_ = handed over) ───────────────────────────────
create or replace function torny_rls.ho_league() returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-281400000101'::uuid $$;
create or replace function torny_rls.ho_round()  returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-281400000103'::uuid $$;
create or replace function torny_rls.ho_flight() returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-281400000111'::uuid $$;

-- security definer: reads past RLS.
create or replace function torny_rls.ho_handed_over_of(p_game uuid, p_user uuid) returns timestamptz
  language sql security definer set search_path = '' as $$
    select handed_over_at from public.game_players where game_id = p_game and user_id = p_user;
$$;

grant execute on all functions in schema torny_rls to authenticated, anon, service_role;

-- ── Seed ──────────────────────────────────────────────────────────────────────
-- active_id started the flight with flightmate_id and kept both cards.
select torny_rls.as_service();
select torny_rls.seed_active_game();

insert into public.leagues
  (id, name, season_start, season_end, standings_model, course_scope, course_id, tee_box_id,
   status, created_by, is_simulator) values
  (torny_rls.ho_league(), 'HO Sim', current_date, current_date + 90, 'total', 'single_course_single_tee',
   torny_rls.course_id(), torny_rls.tee_box_id(), 'active', torny_rls.admin_id(), true);

insert into public.league_players (league_id, user_id, accepted_at) values
  (torny_rls.ho_league(), torny_rls.active_id(),     now()),
  (torny_rls.ho_league(), torny_rls.flightmate_id(), now());

insert into public.league_rounds
  (id, league_id, sequence, label, course_id, tee_box_id, opens_at, closes_at, original_closes_at) values
  (torny_rls.ho_round(), torny_rls.ho_league(), 1, 'Runde 1', torny_rls.course_id(), torny_rls.tee_box_id(),
   now() - interval '1 day', now() + interval '6 days', now() + interval '6 days');

insert into public.games
  (id, name, course_id, tee_box_id, status, game_mode, created_by, started_at, league_round_id, require_peer_approval) values
  (torny_rls.ho_flight(), 'HO Sim – Runde', torny_rls.course_id(), torny_rls.tee_box_id(), 'active',
   'solo_strokeplay', torny_rls.active_id(), now(), torny_rls.ho_round(), true);

insert into public.game_players (game_id, user_id, team_number, flight_number) values
  (torny_rls.ho_flight(), torny_rls.active_id(),     null, null),
  (torny_rls.ho_flight(), torny_rls.flightmate_id(), null, null);

-- ═════════════════════════════════════════════════════════════════════════════
-- Only the server stamps the handover
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.flightmate_id());

select throws_ok(
  $$ update public.game_players set handed_over_at = now()
      where game_id = torny_rls.ho_flight() and user_id = torny_rls.flightmate_id() $$,
  '42501', null,
  'a player CANNOT stamp their own card as handed over (direct PATCH)'
);

select torny_rls.as_user(torny_rls.active_id());

select throws_ok(
  $$ update public.game_players set handed_over_at = now()
      where game_id = torny_rls.ho_flight() and user_id = torny_rls.flightmate_id() $$,
  '42501', null,
  'the flight''s creator CANNOT stamp a flightmate''s card as handed over'
);

select torny_rls.as_service();

select is(
  torny_rls.ho_handed_over_of(torny_rls.ho_flight(), torny_rls.flightmate_id()),
  null::timestamptz,
  'the refused PATCHes left the card not handed over'
);

select lives_ok(
  $$ update public.game_players set marker_user_id = torny_rls.active_id(), handed_over_at = now()
      where game_id = torny_rls.ho_flight() and user_id = torny_rls.flightmate_id() $$,
  'the service role CAN stamp the handover'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- Sent back or reopened: no longer handed over
-- ═════════════════════════════════════════════════════════════════════════════
update public.game_players set submitted_at = now()
 where game_id = torny_rls.ho_flight() and user_id = torny_rls.flightmate_id();
update public.game_players set submitted_at = null, rejection_reason = 'hull 5'
 where game_id = torny_rls.ho_flight() and user_id = torny_rls.flightmate_id();

select is(
  torny_rls.ho_handed_over_of(torny_rls.ho_flight(), torny_rls.flightmate_id()),
  null::timestamptz,
  'a delivered handed-over card that goes back to not delivered is no longer handed over'
);

-- A player may clear it: that only takes away the automatic approval.
update public.game_players set handed_over_at = now()
 where game_id = torny_rls.ho_flight() and user_id = torny_rls.flightmate_id();
select torny_rls.as_user(torny_rls.flightmate_id());

select lives_ok(
  $$ update public.game_players set handed_over_at = null
      where game_id = torny_rls.ho_flight() and user_id = torny_rls.flightmate_id() $$,
  'a player MAY clear the handover on their own card'
);

select * from finish();
rollback;
