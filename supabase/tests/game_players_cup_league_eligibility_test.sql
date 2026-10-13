-- supabase/tests/game_players_cup_league_eligibility_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Cup and league branches of guard_game_players_invite_eligibility (#2567,
-- migration 0208).
--
-- Before 0208 a signed-in non-admin could only put friends, former co-players
-- and (in a club game) club members in a game. 0208 adds two narrow branches:
--
--   CUP: the game has a tournament_id, the caller manages that cup
--   (can_manage_tournament) and the user is in tournament_participants for
--   the same cup.
--     1  organiser of a personal cup adds a participant          → ok
--     2  same organiser, same cup game, a non-participant         → 42501
--     3  same organiser, own game without a cup, the participant  → 42501
--     4  organiser of cups A and B, game in A, participant of B   → 42501
--     5  derived match (source_game_id, same cup), participant    → ok
--     6  control: club cup, club admin adds a club member         → ok (club rule)
--     7  control: game without a cup, a friend of the creator     → ok (friend rule)
--
--   LEAGUE: the game has a league_round_id, the round's league is active and
--   both the caller and the user are in league_players for that league.
--     8  member A's flight, member B                              → ok
--     9  same flight, someone outside the league                  → 42501
--     10 same flight, a member of league B only                   → 42501
--     11 flight created by a non-member, member B                 → 42501
--     12 the league is not active (finished), member B            → 42501
--     13 member A's own game without a league round, member B     → 42501
--     14 member A's flight, a member who has not accepted yet       → ok
--        (locks today's rule: a pending row counts as membership, as the
--        not_member check in startLeagueRoundFlight does)
--
-- Red without 0208: cases 1, 5, 8 and 14 raise 42501, because the old trigger
-- only asks is_invite_eligible and none of those pairs is eligible. The rest
-- pass before and after 0208; they keep the new branches from growing. The
-- negative cases match the trigger's own message («not invite-eligible»), so
-- an RLS refusal or another guard's 42501 cannot pass for it.
--
-- Isolation (#2567, orchestrator decision 7): a row that goes in makes the
-- pair "co-players" for is_invite_eligible, so a later negative case could
-- pass on the OLD rule. Every case therefore runs in its own savepoint and is
-- rolled back. Each negative case uses users who share no game with the
-- caller, the cup organiser is never a player in the cup games, and every
-- case first asserts is_invite_eligible(caller, user, null) so a green result
-- never comes from the old rule.
--
-- Every probe and its check are separate statements (#1910).
-- Depends on 0208. Run via: supabase test db (see supabase/tests/README.md)
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(29);

\ir fixtures/rls_helpers.psql

-- ── Scenario-local fixtures (ce_ = cup eligibility, le_ = league eligibility) ─
create or replace function torny_rls.ce_org()         returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-256700000001'::uuid $$;
create or replace function torny_rls.ce_part()        returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-256700000002'::uuid $$;
create or replace function torny_rls.ce_nonpart()     returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-256700000003'::uuid $$;
create or replace function torny_rls.ce_part_b()      returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-256700000004'::uuid $$;
create or replace function torny_rls.ce_club_admin()  returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-256700000005'::uuid $$;
create or replace function torny_rls.ce_club_member() returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-256700000006'::uuid $$;
create or replace function torny_rls.ce_friend()      returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-256700000007'::uuid $$;
create or replace function torny_rls.le_a()           returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-256700000011'::uuid $$;
create or replace function torny_rls.le_b()           returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-256700000012'::uuid $$;
create or replace function torny_rls.le_out()         returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-256700000013'::uuid $$;
create or replace function torny_rls.le_other()       returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-256700000014'::uuid $$;
create or replace function torny_rls.le_x()           returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-256700000015'::uuid $$;
create or replace function torny_rls.le_pending()     returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-256700000016'::uuid $$;

create or replace function torny_rls.ce_club()        returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-256700000021'::uuid $$;
create or replace function torny_rls.ce_cup_a()       returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-256700000022'::uuid $$;
create or replace function torny_rls.ce_cup_b()       returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-256700000023'::uuid $$;
create or replace function torny_rls.ce_club_cup()    returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-256700000024'::uuid $$;
create or replace function torny_rls.ce_game_a()      returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-256700000031'::uuid $$;
create or replace function torny_rls.ce_game_a_derived() returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-256700000032'::uuid $$;
create or replace function torny_rls.ce_game_plain()  returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-256700000033'::uuid $$;
create or replace function torny_rls.ce_club_game()   returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-256700000034'::uuid $$;

create or replace function torny_rls.le_league_a()    returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-256700000041'::uuid $$;
create or replace function torny_rls.le_league_b()    returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-256700000042'::uuid $$;
create or replace function torny_rls.le_round_a()     returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-256700000043'::uuid $$;
create or replace function torny_rls.le_round_b()     returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-256700000044'::uuid $$;
create or replace function torny_rls.le_flight_a()    returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-256700000051'::uuid $$;
create or replace function torny_rls.le_flight_x()    returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-256700000052'::uuid $$;
create or replace function torny_rls.le_plain_a()     returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-256700000053'::uuid $$;

grant execute on all functions in schema torny_rls to authenticated, anon, service_role;

-- ── Seed ──────────────────────────────────────────────────────────────────────
-- seed_active_game() gives the course and tee. Its cast shares one game, so
-- none of them is used below: every actor here is new and plays in nothing.
select torny_rls.as_service();
select torny_rls.seed_active_game();

insert into auth.users (id, instance_id, aud, role, email)
select uid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
       'rls-' || uid::text || '@example.test'
  from unnest(array[
    torny_rls.ce_org(), torny_rls.ce_part(), torny_rls.ce_nonpart(), torny_rls.ce_part_b(),
    torny_rls.ce_club_admin(), torny_rls.ce_club_member(), torny_rls.ce_friend(),
    torny_rls.le_a(), torny_rls.le_b(), torny_rls.le_out(), torny_rls.le_other(), torny_rls.le_x(), torny_rls.le_pending()
  ]) as uid;

-- The on_auth_user_created trigger has made the public.users rows; stamp the
-- names and make sure nobody is an admin.
insert into public.users (id, email, name, is_admin) values
  (torny_rls.ce_org(),         'rls-ce-org@example.test',         'CE Organiser',   false),
  (torny_rls.ce_part(),        'rls-ce-part@example.test',        'CE Participant', false),
  (torny_rls.ce_nonpart(),     'rls-ce-nonpart@example.test',     'CE Outsider',    false),
  (torny_rls.ce_part_b(),      'rls-ce-part-b@example.test',      'CE Cup B',       false),
  (torny_rls.ce_club_admin(),  'rls-ce-club-admin@example.test',  'CE Club Admin',  false),
  (torny_rls.ce_club_member(), 'rls-ce-club-member@example.test', 'CE Club Member', false),
  (torny_rls.ce_friend(),      'rls-ce-friend@example.test',      'CE Friend',      false),
  (torny_rls.le_a(),           'rls-le-a@example.test',           'LE Member A',    false),
  (torny_rls.le_b(),           'rls-le-b@example.test',           'LE Member B',    false),
  (torny_rls.le_out(),         'rls-le-out@example.test',         'LE Outsider',    false),
  (torny_rls.le_other(),       'rls-le-other@example.test',       'LE League B',    false),
  (torny_rls.le_x(),           'rls-le-x@example.test',           'LE Non-member',  false),
  (torny_rls.le_pending(),     'rls-le-pending@example.test',     'LE Pending',     false)
on conflict (id) do update
  set email = excluded.email, name = excluded.name, is_admin = excluded.is_admin;

-- Cup side.
insert into public.groups (id, name, created_by) values (torny_rls.ce_club(), 'CE Club', torny_rls.ce_club_admin());
insert into public.group_members (group_id, user_id, role) values
  (torny_rls.ce_club(), torny_rls.ce_club_admin(),  'owner'),
  (torny_rls.ce_club(), torny_rls.ce_club_member(), 'member');

insert into public.tournaments (id, name, team_1_name, team_2_name, status, created_by, group_id) values
  (torny_rls.ce_cup_a(),    'CE Cup A',    'Europa', 'USA', 'draft', torny_rls.ce_org(),        null),
  (torny_rls.ce_cup_b(),    'CE Cup B',    'Europa', 'USA', 'draft', torny_rls.ce_org(),        null),
  (torny_rls.ce_club_cup(), 'CE Club Cup', 'Europa', 'USA', 'draft', torny_rls.ce_club_admin(), torny_rls.ce_club());

-- The rows the cup link writes (joinCup, service role).
insert into public.tournament_participants (tournament_id, user_id) values
  (torny_rls.ce_cup_a(), torny_rls.ce_part()),
  (torny_rls.ce_cup_b(), torny_rls.ce_part_b());

-- The matches «Generer kamper» writes: scheduled, created_by the organiser.
insert into public.games (id, name, course_id, tee_box_id, status, game_mode, created_by, tournament_id, group_id) values
  (torny_rls.ce_game_a(),     'CE cup A match', torny_rls.course_id(), torny_rls.tee_box_id(), 'scheduled', 'solo_strokeplay', torny_rls.ce_org(),        torny_rls.ce_cup_a(),    null),
  (torny_rls.ce_game_plain(), 'CE plain game',  torny_rls.course_id(), torny_rls.tee_box_id(), 'scheduled', 'solo_strokeplay', torny_rls.ce_org(),        null,                    null),
  (torny_rls.ce_club_game(),  'CE club match',  torny_rls.course_id(), torny_rls.tee_box_id(), 'scheduled', 'solo_strokeplay', torny_rls.ce_club_admin(), torny_rls.ce_club_cup(), torny_rls.ce_club());
insert into public.games (id, name, course_id, tee_box_id, status, game_mode, created_by, tournament_id, source_game_id) values
  (torny_rls.ce_game_a_derived(), 'CE cup A derived', torny_rls.course_id(), torny_rls.tee_box_id(), 'scheduled', 'solo_strokeplay', torny_rls.ce_org(), torny_rls.ce_cup_a(), torny_rls.ce_game_a());

insert into public.friendships (requester_id, addressee_id, status) values
  (torny_rls.ce_org(), torny_rls.ce_friend(), 'accepted');

-- League side.
insert into public.leagues (id, name, season_start, season_end, standings_model, course_scope, course_id, tee_box_id, status, created_by) values
  (torny_rls.le_league_a(), 'LE League A', current_date - 1, current_date + 30, 'total', 'single_course_single_tee', torny_rls.course_id(), torny_rls.tee_box_id(), 'active', torny_rls.le_a()),
  (torny_rls.le_league_b(), 'LE League B', current_date - 1, current_date + 30, 'total', 'single_course_single_tee', torny_rls.course_id(), torny_rls.tee_box_id(), 'active', torny_rls.le_other());

insert into public.league_rounds (id, league_id, sequence, label, opens_at, closes_at, original_closes_at) values
  (torny_rls.le_round_a(), torny_rls.le_league_a(), 1, 'Runde 1', now() - interval '1 day', now() + interval '7 days', now() + interval '7 days'),
  (torny_rls.le_round_b(), torny_rls.le_league_b(), 1, 'Runde 1', now() - interval '1 day', now() + interval '7 days', now() + interval '7 days');

insert into public.league_players (league_id, user_id, accepted_at) values
  (torny_rls.le_league_a(), torny_rls.le_a(),     now()),
  (torny_rls.le_league_a(), torny_rls.le_b(),     now()),
  (torny_rls.le_league_a(), torny_rls.le_pending(), null),
  (torny_rls.le_league_b(), torny_rls.le_other(), now());

-- Flights as startLeagueRoundFlight makes them: inserted by the server
-- (guard_games_league_round_id refuses everyone else), created_by the player.
insert into public.games (id, name, course_id, tee_box_id, status, game_mode, created_by, league_round_id) values
  (torny_rls.le_flight_a(), 'LE flight A',  torny_rls.course_id(), torny_rls.tee_box_id(), 'scheduled', 'solo_strokeplay', torny_rls.le_a(), torny_rls.le_round_a()),
  (torny_rls.le_flight_x(), 'LE flight X',  torny_rls.course_id(), torny_rls.tee_box_id(), 'scheduled', 'solo_strokeplay', torny_rls.le_x(), torny_rls.le_round_a()),
  (torny_rls.le_plain_a(),  'LE A plain',   torny_rls.course_id(), torny_rls.tee_box_id(), 'scheduled', 'solo_strokeplay', torny_rls.le_a(), null);

-- ═════════════════════════════════════════════════════════════════════════════
-- CUP
-- ═════════════════════════════════════════════════════════════════════════════

-- 1 ─ organiser adds a participant to a match in a cup they run.
select torny_rls.as_service();
select ok(not public.is_invite_eligible(torny_rls.ce_org(), torny_rls.ce_part(), null),
  'case 1 precondition: the participant is not invite-eligible for the organiser');
savepoint case_1;
select torny_rls.as_user(torny_rls.ce_org());
select lives_ok(
  $$ insert into public.game_players (game_id, user_id, team_number, flight_number, accepted_at)
     values (torny_rls.ce_game_a(), torny_rls.ce_part(), 1, 1, now()) $$,
  'case 1: the organiser of a personal cup CAN add a cup participant to a cup match');
rollback to savepoint case_1;

-- 2 ─ same organiser, same match, someone who is not a participant.
select ok(not public.is_invite_eligible(torny_rls.ce_org(), torny_rls.ce_nonpart(), null),
  'case 2 precondition: the non-participant is not invite-eligible for the organiser');
savepoint case_2;
select torny_rls.as_user(torny_rls.ce_org());
select throws_like(
  $$ insert into public.game_players (game_id, user_id, team_number, flight_number, accepted_at)
     values (torny_rls.ce_game_a(), torny_rls.ce_nonpart(), 1, 1, now()) $$,
  '%not invite-eligible%',
  'case 2: the organiser CANNOT add someone who is not on the cup''s participant list');
rollback to savepoint case_2;

-- 3 ─ same organiser, own game without a cup, the same participant.
select ok(not public.is_invite_eligible(torny_rls.ce_org(), torny_rls.ce_part(), null),
  'case 3 precondition: the participant is not invite-eligible for the organiser');
savepoint case_3;
select torny_rls.as_user(torny_rls.ce_org());
select throws_like(
  $$ insert into public.game_players (game_id, user_id, flight_number, accepted_at)
     values (torny_rls.ce_game_plain(), torny_rls.ce_part(), 1, now()) $$,
  '%not invite-eligible%',
  'case 3: the cup rule does not reach the organiser''s games outside the cup');
rollback to savepoint case_3;

-- 4 ─ the organiser runs cups A and B; a cup B participant in a cup A match.
select ok(not public.is_invite_eligible(torny_rls.ce_org(), torny_rls.ce_part_b(), null),
  'case 4 precondition: the cup B participant is not invite-eligible for the organiser');
savepoint case_4;
select torny_rls.as_user(torny_rls.ce_org());
select throws_like(
  $$ insert into public.game_players (game_id, user_id, team_number, flight_number, accepted_at)
     values (torny_rls.ce_game_a(), torny_rls.ce_part_b(), 1, 1, now()) $$,
  '%not invite-eligible%',
  'case 4: a participant of cup B CANNOT be put in a cup A match');
rollback to savepoint case_4;

-- 5 ─ derived match (pass 2 in insertCupMatches), the participant.
select ok(not public.is_invite_eligible(torny_rls.ce_org(), torny_rls.ce_part(), null),
  'case 5 precondition: the participant is not invite-eligible for the organiser');
savepoint case_5;
select torny_rls.as_user(torny_rls.ce_org());
select lives_ok(
  $$ insert into public.game_players (game_id, user_id, team_number, flight_number, accepted_at)
     values (torny_rls.ce_game_a_derived(), torny_rls.ce_part(), 1, 1, now()) $$,
  'case 5: the organiser CAN add a cup participant to a derived match in the same cup');
rollback to savepoint case_5;

-- 6 ─ control: club cup, club member who is NOT on the participant list.
select ok(public.is_invite_eligible(torny_rls.ce_club_admin(), torny_rls.ce_club_member(), torny_rls.ce_club()),
  'case 6 precondition: the club member is invite-eligible through the club');
savepoint case_6;
select torny_rls.as_user(torny_rls.ce_club_admin());
select lives_ok(
  $$ insert into public.game_players (game_id, user_id, team_number, flight_number, accepted_at)
     values (torny_rls.ce_club_game(), torny_rls.ce_club_member(), 1, 1, now()) $$,
  'case 6 (control): a club admin CAN add a club member to a club cup match, as before');
rollback to savepoint case_6;

-- 7 ─ control: a friend of the creator in a game without a cup.
select ok(public.is_invite_eligible(torny_rls.ce_org(), torny_rls.ce_friend(), null),
  'case 7 precondition: the friend is invite-eligible');
savepoint case_7;
select torny_rls.as_user(torny_rls.ce_org());
select lives_ok(
  $$ insert into public.game_players (game_id, user_id, flight_number, accepted_at)
     values (torny_rls.ce_game_plain(), torny_rls.ce_friend(), 1, now()) $$,
  'case 7 (control): a creator CAN add a friend to a game without a cup, as before');
rollback to savepoint case_7;

-- ═════════════════════════════════════════════════════════════════════════════
-- LEAGUE
-- ═════════════════════════════════════════════════════════════════════════════

-- 8 ─ member A starts a flight with member B (both rows in one insert, as
--     startLeagueRoundFlight writes them).
select ok(not public.is_invite_eligible(torny_rls.le_a(), torny_rls.le_b(), null),
  'case 8 precondition: member B is not invite-eligible for member A');
savepoint case_8;
select torny_rls.as_user(torny_rls.le_a());
select lives_ok(
  $$ insert into public.game_players (game_id, user_id, accepted_at)
     values (torny_rls.le_flight_a(), torny_rls.le_a(), now()),
            (torny_rls.le_flight_a(), torny_rls.le_b(), null) $$,
  'case 8: a league member CAN put another member of the same league in a flight they started');
rollback to savepoint case_8;

-- 9 ─ same flight, someone outside the league.
select ok(not public.is_invite_eligible(torny_rls.le_a(), torny_rls.le_out(), null),
  'case 9 precondition: the outsider is not invite-eligible for member A');
savepoint case_9;
select torny_rls.as_user(torny_rls.le_a());
select throws_like(
  $$ insert into public.game_players (game_id, user_id, accepted_at)
     values (torny_rls.le_flight_a(), torny_rls.le_out(), null) $$,
  '%not invite-eligible%',
  'case 9: a league member CANNOT put someone outside the league in a flight they started');
rollback to savepoint case_9;

-- 10 ─ same flight, a member of league B only.
select ok(not public.is_invite_eligible(torny_rls.le_a(), torny_rls.le_other(), null),
  'case 10 precondition: the league B member is not invite-eligible for member A');
savepoint case_10;
select torny_rls.as_user(torny_rls.le_a());
select throws_like(
  $$ insert into public.game_players (game_id, user_id, accepted_at)
     values (torny_rls.le_flight_a(), torny_rls.le_other(), null) $$,
  '%not invite-eligible%',
  'case 10: a member of another league CANNOT be put in a league A flight');
rollback to savepoint case_10;

-- 11 ─ a flight created by someone who is not (or no longer) a member.
select ok(not public.is_invite_eligible(torny_rls.le_x(), torny_rls.le_b(), null),
  'case 11 precondition: member B is not invite-eligible for the non-member');
savepoint case_11;
select torny_rls.as_user(torny_rls.le_x());
select throws_like(
  $$ insert into public.game_players (game_id, user_id, accepted_at)
     values (torny_rls.le_flight_x(), torny_rls.le_b(), null) $$,
  '%not invite-eligible%',
  'case 11: a non-member CANNOT put a league member in a flight, both must be members');
rollback to savepoint case_11;

-- 12 ─ the league is finished.
select ok(not public.is_invite_eligible(torny_rls.le_a(), torny_rls.le_b(), null),
  'case 12 precondition: member B is not invite-eligible for member A');
savepoint case_12;
update public.leagues set status = 'finished' where id = torny_rls.le_league_a();
select torny_rls.as_user(torny_rls.le_a());
select throws_like(
  $$ insert into public.game_players (game_id, user_id, accepted_at)
     values (torny_rls.le_flight_a(), torny_rls.le_b(), null) $$,
  '%not invite-eligible%',
  'case 12: the league rule does not apply when the league is not active');
rollback to savepoint case_12;

-- 13 ─ member A's own game outside the league.
select ok(not public.is_invite_eligible(torny_rls.le_a(), torny_rls.le_b(), null),
  'case 13 precondition: member B is not invite-eligible for member A');
savepoint case_13;
select torny_rls.as_user(torny_rls.le_a());
select throws_like(
  $$ insert into public.game_players (game_id, user_id, accepted_at)
     values (torny_rls.le_plain_a(), torny_rls.le_b(), null) $$,
  '%not invite-eligible%',
  'case 13: the league rule does not reach a member''s games outside the league');
rollback to savepoint case_13;

-- 14 ─ member A's flight, a member whose row is still pending (accepted_at
--      null, as addLeaguePlayers writes it). Locks today's rule.
select ok(not public.is_invite_eligible(torny_rls.le_a(), torny_rls.le_pending(), null),
  'case 14 precondition: the pending member is not invite-eligible for member A');
savepoint case_14;
select torny_rls.as_user(torny_rls.le_a());
select lives_ok(
  $$ insert into public.game_players (game_id, user_id, accepted_at)
     values (torny_rls.le_flight_a(), torny_rls.le_pending(), null) $$,
  'case 14: a league member CAN put a member who has not accepted yet in a flight they started');
rollback to savepoint case_14;

-- The guard stays out of reach for clients (0137, #1121).
select ok(not has_function_privilege('anon', 'public.guard_game_players_invite_eligibility()', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.guard_game_players_invite_eligibility()', 'EXECUTE'),
  'guard_game_players_invite_eligibility is not client-executable');

select * from finish();
rollback;
