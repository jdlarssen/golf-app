-- supabase/tests/game_side_claims_rls_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- The side contest on the hole (#2283, migration 0237): game_side_claims,
-- game_gir_claims, side_claim_flight_key, record_side_claim,
-- record_gir_claims and side_claims_for_finish.
--
-- The rules' TypeScript home is lib/games/sideContest.ts. The bounds (holes
-- 1–18, distance 0.1–99.9) are pinned against the migration by
-- lib/games/sideContestDbCheck.test.ts; the cases below run the rounding and
-- the edges through the rpc.
--
-- Fixtures (sc_ = side claims):
--   G1 plain stableford, active, closest to pin slot 1 on hole 7 (slot 2 has
--      hole 11, but side_ctp_count = 1), longest drive on hole 9. Eight active
--      players in two flights, so the flight key is the flight number:
--      flight 1 = org (the organiser, playing), f1a, f1b, f1c, plus f1w
--      (withdrawn); flight 2 = f2a, f2b, f2c, f2d.
--   GF plain stableford, finished, closest to pin on hole 7: org and f1a.
--   Cup C: closest to pin on hole 3 (two slots), GIR on hole 5.
--   CM1 fourball match in C, active: c1a, c1b (team 1), c1c, c1d (team 2),
--      c1w (team 1, withdrawn). Four active players, one flight, key 0.
--   CM2 fourball match in C, active: c2a, c2b, c2c, c2d.
--   CD singles derived from CM1 (source_game_id), active: c1a, c1c.
--   CF singles in C, finished: c2a, c2c.
--   out plays in no game.
--
-- No savepoints: the cases run in order and each one's state is the input to
-- the next, so the file also runs as a rolled-back probe against staging.
-- Every rpc call and its check are separate statements (#1910).
-- Depends on 0237. Run via: supabase test db (see supabase/tests/README.md)
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(56);

\ir fixtures/rls_helpers.psql

-- ── Scenario-local fixtures ──────────────────────────────────────────────────
create or replace function torny_rls.sc_user(n int) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-a000-2283000000' || lpad(n::text, 2, '0'))::uuid
$$;
create or replace function torny_rls.sc_game(n int) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-a000-2283000001' || lpad(n::text, 2, '0'))::uuid
$$;
create or replace function torny_rls.sc_cup() returns uuid language sql immutable as $$
  select '00000000-0000-4000-a000-228300000200'::uuid
$$;

create or replace function torny_rls.sc_org() returns uuid language sql immutable as $$ select torny_rls.sc_user(1) $$;
create or replace function torny_rls.sc_f1a() returns uuid language sql immutable as $$ select torny_rls.sc_user(2) $$;
create or replace function torny_rls.sc_f1b() returns uuid language sql immutable as $$ select torny_rls.sc_user(3) $$;
create or replace function torny_rls.sc_f1c() returns uuid language sql immutable as $$ select torny_rls.sc_user(4) $$;
create or replace function torny_rls.sc_f1w() returns uuid language sql immutable as $$ select torny_rls.sc_user(5) $$;
create or replace function torny_rls.sc_f2a() returns uuid language sql immutable as $$ select torny_rls.sc_user(6) $$;
create or replace function torny_rls.sc_f2b() returns uuid language sql immutable as $$ select torny_rls.sc_user(7) $$;
create or replace function torny_rls.sc_f2c() returns uuid language sql immutable as $$ select torny_rls.sc_user(8) $$;
create or replace function torny_rls.sc_f2d() returns uuid language sql immutable as $$ select torny_rls.sc_user(9) $$;
create or replace function torny_rls.sc_out() returns uuid language sql immutable as $$ select torny_rls.sc_user(10) $$;
create or replace function torny_rls.sc_c1a() returns uuid language sql immutable as $$ select torny_rls.sc_user(11) $$;
create or replace function torny_rls.sc_c1b() returns uuid language sql immutable as $$ select torny_rls.sc_user(12) $$;
create or replace function torny_rls.sc_c1c() returns uuid language sql immutable as $$ select torny_rls.sc_user(13) $$;
create or replace function torny_rls.sc_c1d() returns uuid language sql immutable as $$ select torny_rls.sc_user(14) $$;
create or replace function torny_rls.sc_c1w() returns uuid language sql immutable as $$ select torny_rls.sc_user(15) $$;
create or replace function torny_rls.sc_c2a() returns uuid language sql immutable as $$ select torny_rls.sc_user(21) $$;
create or replace function torny_rls.sc_c2b() returns uuid language sql immutable as $$ select torny_rls.sc_user(22) $$;
create or replace function torny_rls.sc_c2c() returns uuid language sql immutable as $$ select torny_rls.sc_user(23) $$;
create or replace function torny_rls.sc_c2d() returns uuid language sql immutable as $$ select torny_rls.sc_user(24) $$;

create or replace function torny_rls.sc_g1()  returns uuid language sql immutable as $$ select torny_rls.sc_game(1) $$;
create or replace function torny_rls.sc_gf()  returns uuid language sql immutable as $$ select torny_rls.sc_game(2) $$;
create or replace function torny_rls.sc_cm1() returns uuid language sql immutable as $$ select torny_rls.sc_game(3) $$;
create or replace function torny_rls.sc_cm2() returns uuid language sql immutable as $$ select torny_rls.sc_game(4) $$;
create or replace function torny_rls.sc_cd()  returns uuid language sql immutable as $$ select torny_rls.sc_game(5) $$;
create or replace function torny_rls.sc_cf()  returns uuid language sql immutable as $$ select torny_rls.sc_game(6) $$;

grant execute on all functions in schema torny_rls to authenticated, anon, service_role;

-- ── Seed ──────────────────────────────────────────────────────────────────────
-- seed_active_game() gives the course and the tee. Its own game is not used.
select torny_rls.as_service();
select torny_rls.seed_active_game();

insert into auth.users (id, instance_id, aud, role, email)
select torny_rls.sc_user(n), '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
       'rls-' || torny_rls.sc_user(n)::text || '@example.test'
  from unnest(array[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 21, 22, 23, 24]) as n;

update public.users set is_admin = false, name = 'SC ' || right(id::text, 2), nickname = null
 where id::text like '00000000-0000-4000-a000-2283000000%';

insert into public.tournaments (id, name, team_1_name, team_2_name, status, created_by)
  values (torny_rls.sc_cup(), 'SC Cup', 'Europa', 'USA', 'active', torny_rls.sc_org());

insert into public.tournament_side_awards (tournament_id, kind, hole_number, points, slot, gir_max_per_team) values
  (torny_rls.sc_cup(), 'ctp', 3, 2,   1, null),
  (torny_rls.sc_cup(), 'ctp', 3, 2,   2, null),
  (torny_rls.sc_cup(), 'gir', 5, 1.5, 1, 2);

insert into public.games (id, name, course_id, tee_box_id, status, game_mode, created_by, started_at, ended_at,
                          side_tournament_enabled, side_ld_count, side_ctp_count, side_ld_holes, side_ctp_holes) values
  (torny_rls.sc_g1(), 'SC G1', torny_rls.course_id(), torny_rls.tee_box_id(), 'active',   'stableford',
   torny_rls.sc_org(), now(), null, true, 1, 1, '{9}', '{7,11}'),
  (torny_rls.sc_gf(), 'SC GF', torny_rls.course_id(), torny_rls.tee_box_id(), 'finished', 'stableford',
   torny_rls.sc_org(), now() - interval '4 hours', now(), true, 0, 1, null, '{7}');

insert into public.games (id, name, course_id, tee_box_id, status, game_mode, created_by, started_at, ended_at, tournament_id) values
  (torny_rls.sc_cm1(), 'SC CM1', torny_rls.course_id(), torny_rls.tee_box_id(), 'active',   'fourball_matchplay',
   torny_rls.sc_org(), now(), null, torny_rls.sc_cup()),
  (torny_rls.sc_cm2(), 'SC CM2', torny_rls.course_id(), torny_rls.tee_box_id(), 'active',   'fourball_matchplay',
   torny_rls.sc_org(), now(), null, torny_rls.sc_cup()),
  (torny_rls.sc_cf(),  'SC CF',  torny_rls.course_id(), torny_rls.tee_box_id(), 'finished', 'singles_matchplay',
   torny_rls.sc_org(), now() - interval '4 hours', now(), torny_rls.sc_cup());

insert into public.games (id, name, course_id, tee_box_id, status, game_mode, created_by, started_at, tournament_id, source_game_id)
  values (torny_rls.sc_cd(), 'SC CD', torny_rls.course_id(), torny_rls.tee_box_id(), 'active', 'singles_matchplay',
          torny_rls.sc_org(), now(), torny_rls.sc_cup(), torny_rls.sc_cm1());

insert into public.game_players (game_id, user_id, team_number, flight_number, withdrawn_at) values
  (torny_rls.sc_g1(),  torny_rls.sc_org(), 1, 1, null),
  (torny_rls.sc_g1(),  torny_rls.sc_f1a(), 1, 1, null),
  (torny_rls.sc_g1(),  torny_rls.sc_f1b(), 1, 1, null),
  (torny_rls.sc_g1(),  torny_rls.sc_f1c(), 1, 1, null),
  (torny_rls.sc_g1(),  torny_rls.sc_f1w(), 1, 1, now()),
  (torny_rls.sc_g1(),  torny_rls.sc_f2a(), 1, 2, null),
  (torny_rls.sc_g1(),  torny_rls.sc_f2b(), 1, 2, null),
  (torny_rls.sc_g1(),  torny_rls.sc_f2c(), 1, 2, null),
  (torny_rls.sc_g1(),  torny_rls.sc_f2d(), 1, 2, null),
  (torny_rls.sc_gf(),  torny_rls.sc_org(), 1, 1, null),
  (torny_rls.sc_gf(),  torny_rls.sc_f1a(), 1, 1, null),
  (torny_rls.sc_cm1(), torny_rls.sc_c1a(), 1, 1, null),
  (torny_rls.sc_cm1(), torny_rls.sc_c1b(), 1, 1, null),
  (torny_rls.sc_cm1(), torny_rls.sc_c1c(), 2, 1, null),
  (torny_rls.sc_cm1(), torny_rls.sc_c1d(), 2, 1, null),
  (torny_rls.sc_cm1(), torny_rls.sc_c1w(), 1, 1, now()),
  (torny_rls.sc_cm2(), torny_rls.sc_c2a(), 1, 1, null),
  (torny_rls.sc_cm2(), torny_rls.sc_c2b(), 1, 1, null),
  (torny_rls.sc_cm2(), torny_rls.sc_c2c(), 2, 1, null),
  (torny_rls.sc_cm2(), torny_rls.sc_c2d(), 2, 1, null),
  (torny_rls.sc_cd(),  torny_rls.sc_c1a(), 1, 1, null),
  (torny_rls.sc_cd(),  torny_rls.sc_c1c(), 2, 1, null),
  (torny_rls.sc_cf(),  torny_rls.sc_c2a(), 1, 1, null),
  (torny_rls.sc_cf(),  torny_rls.sc_c2c(), 2, 1, null);

-- ═════════════════════════════════════════════════════════════════════════════
-- Grants
-- ═════════════════════════════════════════════════════════════════════════════
select ok(
  not has_function_privilege('anon', 'public.record_side_claim(uuid, text, integer, uuid, numeric)', 'execute')
  and not has_function_privilege('anon', 'public.record_gir_claims(uuid, integer, uuid[], boolean)', 'execute')
  and not has_function_privilege('anon', 'public.side_claims_for_finish(uuid)', 'execute'),
  'anon cannot run the three rpcs');

select ok(
  has_function_privilege('authenticated', 'public.record_side_claim(uuid, text, integer, uuid, numeric)', 'execute')
  and has_function_privilege('authenticated', 'public.record_gir_claims(uuid, integer, uuid[], boolean)', 'execute')
  and has_function_privilege('authenticated', 'public.side_claim_flight_key(uuid)', 'execute'),
  'authenticated can run the write rpcs and the flight key');

select ok(
  not has_function_privilege('authenticated', 'public.is_side_contest_hole(uuid, text, integer)', 'execute'),
  'is_side_contest_hole is internal: no client role runs it');

-- ═════════════════════════════════════════════════════════════════════════════
-- Flight key
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.sc_f2a());
select is(public.side_claim_flight_key(torny_rls.sc_g1()), 2, 'multi-flight game: the key is the flight number');

select torny_rls.as_user(torny_rls.sc_c1a());
select is(public.side_claim_flight_key(torny_rls.sc_cm1()), 0, 'four active players (one withdrawn): one flight, key 0');

select torny_rls.as_user(torny_rls.sc_f1w());
select is(public.side_claim_flight_key(torny_rls.sc_g1()), null::integer, 'withdrawn player: no key');

-- ═════════════════════════════════════════════════════════════════════════════
-- record_side_claim: accepted
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.sc_f1a());
select is(public.record_side_claim(torny_rls.sc_g1(), 'closest_to_pin', 7, torny_rls.sc_f1b(), 2.46), 'ok',
  'closest to pin on the game''s own hole 7 (side_ctp_holes) is accepted');

select torny_rls.as_user(torny_rls.sc_f1b());
select results_eq(
  $$ select category, hole_number, flight_number, winner_user_id, distance_m, entered_by
       from public.game_side_claims where game_id = torny_rls.sc_g1() $$,
  $$ values ('closest_to_pin'::text, 7, 1, torny_rls.sc_f1b(), 2.5::numeric, torny_rls.sc_f1a()) $$,
  'a flightmate sees the claim: flight 1, 2.46 rounded to 2.5, entered by f1a');

select torny_rls.as_user(torny_rls.sc_f2a());
select is((select count(*)::int from public.game_side_claims where game_id = torny_rls.sc_g1()), 0,
  'flight 2 does not see what flight 1 reported');

select is(public.record_side_claim(torny_rls.sc_g1(), 'closest_to_pin', 7, torny_rls.sc_f2b(), null), 'ok',
  'flight 2 reports its own closest to pin on hole 7');

select torny_rls.as_user(torny_rls.sc_org());
select results_eq(
  $$ select flight_number, winner_user_id from public.game_side_claims where game_id = torny_rls.sc_g1() $$,
  $$ values (1, torny_rls.sc_f1b()) $$,
  'the organiser who plays in flight 1 sees flight 1''s claim only');

select torny_rls.as_user(torny_rls.sc_f1c());
select is(public.record_side_claim(torny_rls.sc_g1(), 'longest_drive', 9, torny_rls.sc_f1c(), null), 'ok',
  'longest drive on the game''s own hole 9 (side_ld_holes) is accepted');

select is(public.record_side_claim(torny_rls.sc_g1(), 'closest_to_pin', 7, torny_rls.sc_f1a(), 0.1), 'ok',
  'distance 0.1 m is accepted');

select is(public.record_side_claim(torny_rls.sc_g1(), 'closest_to_pin', 7, torny_rls.sc_f1a(), 99.9), 'ok',
  'distance 99.9 m is accepted');

select is(public.record_side_claim(torny_rls.sc_g1(), 'closest_to_pin', 7, null, null), 'ok',
  '«Ingen på green» (no winner, no distance) is accepted');

select results_eq(
  $$ select winner_user_id, distance_m, entered_by from public.game_side_claims
      where game_id = torny_rls.sc_g1() and category = 'closest_to_pin' $$,
  $$ values (null::uuid, null::numeric, torny_rls.sc_f1c()) $$,
  'the last report wins: no winner, no distance, entered by f1c');

-- ═════════════════════════════════════════════════════════════════════════════
-- record_side_claim: refused
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.sc_out());
select is(public.record_side_claim(torny_rls.sc_g1(), 'closest_to_pin', 7, null, null), 'not_player',
  'a non-player is refused');

select torny_rls.as_user(torny_rls.sc_f1w());
select is(public.record_side_claim(torny_rls.sc_g1(), 'closest_to_pin', 7, null, null), 'not_player',
  'a withdrawn player is refused');

select torny_rls.as_user(torny_rls.sc_f1a());
select is(public.record_side_claim(torny_rls.sc_g1(), 'closest_to_pin', 7, torny_rls.sc_f2a(), null), 'wrong_flight',
  'a winner from the other flight is refused');

select is(public.record_side_claim(torny_rls.sc_g1(), 'closest_to_pin', 7, torny_rls.sc_f1w(), null), 'wrong_flight',
  'a withdrawn flightmate as winner is refused');

select is(public.record_side_claim(torny_rls.sc_g1(), 'closest_to_pin', 6, null, null), 'no_slot',
  'hole 6 is not a contest hole');

select is(public.record_side_claim(torny_rls.sc_g1(), 'closest_to_pin', 11, null, null), 'no_slot',
  'hole 11 is in slot 2, but side_ctp_count is 1');

select is(public.record_side_claim(torny_rls.sc_g1(), 'longest_drive', 7, null, null), 'no_slot',
  'longest drive on the closest-to-pin hole is refused');

select is(public.record_side_claim(torny_rls.sc_g1(), 'longest_drive', 9, torny_rls.sc_f1b(), 250), 'bad_distance',
  'a distance on longest drive is refused');

select is(public.record_side_claim(torny_rls.sc_g1(), 'closest_to_pin', 7, null, 2), 'bad_distance',
  'a distance without a winner is refused');

select is(public.record_side_claim(torny_rls.sc_g1(), 'closest_to_pin', 7, torny_rls.sc_f1b(), 0.04), 'bad_distance',
  '0.04 m rounds to 0.0 and is refused');

select is(public.record_side_claim(torny_rls.sc_g1(), 'closest_to_pin', 7, torny_rls.sc_f1b(), 100), 'bad_distance',
  '100 m is refused');

select is(public.record_side_claim(torny_rls.sc_gf(), 'closest_to_pin', 7, null, null), 'not_active',
  'a finished game is refused');

select results_eq(
  $$ select winner_user_id, distance_m from public.game_side_claims
      where game_id = torny_rls.sc_g1() and category = 'closest_to_pin' $$,
  $$ values (null::uuid, null::numeric) $$,
  'no refused call changed the row');

-- ═════════════════════════════════════════════════════════════════════════════
-- record_side_claim: the cup's holes
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.sc_c1a());
select is(public.record_side_claim(torny_rls.sc_cm1(), 'closest_to_pin', 3, torny_rls.sc_c1c(), 1.8), 'ok',
  'closest to pin on the cup''s hole 3 (tournament_side_awards) is accepted');

select is(public.record_side_claim(torny_rls.sc_cm1(), 'closest_to_pin', 4, null, null), 'no_slot',
  'the cup has no closest to pin on hole 4');

select is(public.record_side_claim(torny_rls.sc_cm1(), 'longest_drive', 3, null, null), 'no_slot',
  'the cup has closest to pin on hole 3, not longest drive');

select is(public.record_side_claim(torny_rls.sc_cm1(), 'closest_to_pin', 3, torny_rls.sc_c2a(), null), 'wrong_flight',
  'a winner from another match is refused');

select is(public.record_side_claim(torny_rls.sc_cd(), 'closest_to_pin', 3, null, null), 'no_slot',
  'a derived cup game keeps no scores and has no contest holes');

-- ═════════════════════════════════════════════════════════════════════════════
-- side_claims_for_finish
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.sc_f1a());
select throws_ok(
  $$ select * from public.side_claims_for_finish(torny_rls.sc_g1()) $$,
  '42501', null,
  'a plain player cannot read every flight''s claims');

select torny_rls.as_user(torny_rls.sc_org());
select results_eq(
  $$ select category, hole_number, flight_number, winner_user_id, winner_name
       from public.side_claims_for_finish(torny_rls.sc_g1()) $$,
  $$ values ('closest_to_pin'::text, 7, 1, null::uuid, null::text),
            ('closest_to_pin'::text, 7, 2, torny_rls.sc_f2b(), 'SC 07'::text),
            ('longest_drive'::text,  9, 1, torny_rls.sc_f1c(), 'SC 04'::text) $$,
  'the organiser reads both flights'' claims, with the winner''s name');

-- ═════════════════════════════════════════════════════════════════════════════
-- record_gir_claims
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.sc_c1a());
select is(public.record_gir_claims(torny_rls.sc_cm1(), 5, array[torny_rls.sc_c1a(), torny_rls.sc_c1c()], true), 'ok',
  'GIR on the cup''s hole 5 is accepted for two players');

select torny_rls.as_user(torny_rls.sc_c1b());
select results_eq(
  $$ select user_id, flight_number, hit, entered_by from public.game_gir_claims
      where game_id = torny_rls.sc_cm1() order by user_id $$,
  $$ values (torny_rls.sc_c1a(), 0, true, torny_rls.sc_c1a()),
            (torny_rls.sc_c1c(), 0, true, torny_rls.sc_c1a()) $$,
  'a matchmate sees one row per player, key 0');

select torny_rls.as_user(torny_rls.sc_c2a());
select is((select count(*)::int from public.game_gir_claims where game_id = torny_rls.sc_cm1()), 0,
  'a player from another match sees none of them');

select torny_rls.as_user(torny_rls.sc_c1a());
select is(public.record_gir_claims(torny_rls.sc_cm1(), 6, array[torny_rls.sc_c1a()], true), 'no_slot',
  'hole 6 has no GIR in the cup');

select is(public.record_gir_claims(torny_rls.sc_cd(), 5, array[torny_rls.sc_c1a()], true), 'no_slot',
  'a derived cup game is refused');

select is(public.record_gir_claims(torny_rls.sc_cm1(), 5, array[torny_rls.sc_c2a()], true), 'wrong_flight',
  'a player from another match is refused');

select is(public.record_gir_claims(torny_rls.sc_cm1(), 5, array[torny_rls.sc_c1w()], true), 'wrong_flight',
  'a withdrawn player is refused');

select is(public.record_gir_claims(torny_rls.sc_cm1(), 5, array[]::uuid[], true), 'wrong_flight',
  'an empty list is refused');

select is(public.record_gir_claims(torny_rls.sc_cm1(), 5,
            array[torny_rls.sc_c1b(), torny_rls.sc_c1d(), torny_rls.sc_c2a()], true), 'wrong_flight',
  'two valid players and one from another match: refused');

select is((select count(*)::int from public.game_gir_claims where game_id = torny_rls.sc_cm1()), 2,
  'and nothing was written for the two valid ones');

select torny_rls.as_user(torny_rls.sc_c1w());
select is(public.record_gir_claims(torny_rls.sc_cm1(), 5, array[torny_rls.sc_c1a()], true), 'not_player',
  'a withdrawn caller is refused');

select torny_rls.as_user(torny_rls.sc_c2a());
select is(public.record_gir_claims(torny_rls.sc_cf(), 5, array[torny_rls.sc_c2a()], true), 'not_active',
  'a finished match is refused');

select torny_rls.as_user(torny_rls.sc_f1a());
select is(public.record_gir_claims(torny_rls.sc_g1(), 5, array[torny_rls.sc_f1a()], true), 'no_slot',
  'a plain game without tournament_id has no GIR');

select torny_rls.as_user(torny_rls.sc_c1d());
select is(public.record_gir_claims(torny_rls.sc_cm1(), 5,
            array[torny_rls.sc_c1a(), torny_rls.sc_c1b(), torny_rls.sc_c1c(), torny_rls.sc_c1d()], false), 'ok',
  '«Ingen traff greenen»: the whole match as missed');

select results_eq(
  $$ select count(*)::int, count(*) filter (where hit)::int from public.game_gir_claims
      where game_id = torny_rls.sc_cm1() and hole_number = 5 $$,
  $$ values (4, 0) $$,
  'four rows, none a hit: the two earlier hits were overwritten');

-- ═════════════════════════════════════════════════════════════════════════════
-- Direct writes are refused
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.sc_f1a());
select throws_ok(
  $$ insert into public.game_side_claims (game_id, category, hole_number, flight_number, winner_user_id, entered_by)
     values (torny_rls.sc_g1(), 'longest_drive', 9, 1, torny_rls.sc_f1a(), torny_rls.sc_f1a()) $$,
  '42501', null,
  'a player cannot INSERT into game_side_claims directly');

select throws_ok(
  $$ update public.game_side_claims set winner_user_id = torny_rls.sc_f1a() where game_id = torny_rls.sc_g1() $$,
  '42501', null,
  'a player cannot PATCH game_side_claims directly');

select torny_rls.as_user(torny_rls.sc_c1a());
select throws_ok(
  $$ insert into public.game_gir_claims (game_id, hole_number, user_id, flight_number, hit, entered_by)
     values (torny_rls.sc_cm1(), 5, torny_rls.sc_c1b(), 0, true, torny_rls.sc_c1a()) $$,
  '42501', null,
  'a player cannot INSERT into game_gir_claims directly');

select throws_ok(
  $$ update public.game_gir_claims set hit = true where game_id = torny_rls.sc_cm1() $$,
  '42501', null,
  'a player cannot PATCH game_gir_claims directly');

select torny_rls.as_service();
select results_eq(
  $$ select (select count(*)::int from public.game_side_claims where game_id = torny_rls.sc_g1()),
            (select count(*)::int from public.game_gir_claims where game_id = torny_rls.sc_cm1() and hit) $$,
  $$ values (3, 0) $$,
  'the direct writes changed nothing');

select * from finish();
rollback;
