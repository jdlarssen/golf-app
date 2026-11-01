-- supabase/tests/tee_starter_if_unset_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- The tee starter choice from a phone's queue (#2751, migration 0231).
--
-- set_tee_starter_if_unset: the first pick to reach the server stands, in
-- Patsome (patsome_tee_starters) and foursomes matchplay (one column on games).
-- A refusal is one row of NULLs. A player still has no direct write on games.
--
-- Fixtures (ts_ = tee starter):
--   G1 patsome, active: team 1 is a1 + a2, team 2 is b1 + b2.
--   G2 foursomes_matchplay, active: side 1 is a1 + a2, side 2 is b1 + b2, c1 is
--      on a side 3 no foursomes game can have.
--   G3 patsome, finished: team 1 is a1 + a2.
--   G4 texas_scramble, active: team 1 is a1 + a2 (the wrong format).
--   G5 patsome, active: team 1 is a1 and w, where w has withdrawn.
--   G6 patsome, active: team 1 is a1 + a2, a pick already on the row, set by
--      the web's action before the phone's queue arrives.
--   ts_creator creates every game and plays in none; ts_out is in no game.
--
-- Every probe and its check are separate statements (#1910).
-- Depends on 0231. Run via: supabase test db (see supabase/tests/README.md)
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(32);

\ir fixtures/rls_helpers.psql

-- ── Scenario-local fixtures ──────────────────────────────────────────────────
create or replace function torny_rls.ts_creator() returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-275100000001'::uuid $$;
create or replace function torny_rls.ts_out()     returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-275100000002'::uuid $$;
create or replace function torny_rls.ts_a1()      returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-275100000011'::uuid $$;
create or replace function torny_rls.ts_a2()      returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-275100000012'::uuid $$;
create or replace function torny_rls.ts_b1()      returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-275100000013'::uuid $$;
create or replace function torny_rls.ts_b2()      returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-275100000014'::uuid $$;
create or replace function torny_rls.ts_c1()      returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-275100000015'::uuid $$;
create or replace function torny_rls.ts_w()       returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-275100000016'::uuid $$;
create or replace function torny_rls.ts_game(n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-a000-27510000010' || n::text)::uuid $$;

grant execute on all functions in schema torny_rls to authenticated, anon, service_role;

select torny_rls.as_service();
select torny_rls.seed_active_game();

insert into auth.users (id, instance_id, aud, role, email)
select uid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
       'rls-' || uid::text || '@example.test'
  from unnest(array[
    torny_rls.ts_creator(), torny_rls.ts_out(), torny_rls.ts_a1(), torny_rls.ts_a2(),
    torny_rls.ts_b1(), torny_rls.ts_b2(), torny_rls.ts_c1(), torny_rls.ts_w()
  ]) as uid;

update public.users set is_admin = false, name = 'TS ' || right(id::text, 2)
 where id::text like '00000000-0000-4000-a000-2751%';

insert into public.games (id, name, course_id, tee_box_id, status, game_mode, mode_config, created_by, started_at) values
  (torny_rls.ts_game(1), 'TS G1', torny_rls.course_id(), torny_rls.tee_box_id(), 'active', 'patsome',
   '{"kind":"patsome","patsome_scoring":"net"}', torny_rls.ts_creator(), now()),
  (torny_rls.ts_game(2), 'TS G2', torny_rls.course_id(), torny_rls.tee_box_id(), 'active', 'foursomes_matchplay',
   '{"kind":"foursomes_matchplay"}', torny_rls.ts_creator(), now()),
  (torny_rls.ts_game(3), 'TS G3', torny_rls.course_id(), torny_rls.tee_box_id(), 'finished', 'patsome',
   '{"kind":"patsome","patsome_scoring":"net"}', torny_rls.ts_creator(), now()),
  (torny_rls.ts_game(4), 'TS G4', torny_rls.course_id(), torny_rls.tee_box_id(), 'active', 'texas_scramble',
   '{"kind":"texas_scramble","team_size":2,"teams_count":1,"team_handicap_pct":25}', torny_rls.ts_creator(), now()),
  (torny_rls.ts_game(5), 'TS G5', torny_rls.course_id(), torny_rls.tee_box_id(), 'active', 'patsome',
   '{"kind":"patsome","patsome_scoring":"net"}', torny_rls.ts_creator(), now()),
  (torny_rls.ts_game(6), 'TS G6', torny_rls.course_id(), torny_rls.tee_box_id(), 'active', 'patsome',
   '{"kind":"patsome","patsome_scoring":"net"}', torny_rls.ts_creator(), now());

insert into public.game_players (game_id, user_id, team_number, flight_number, withdrawn_at) values
  (torny_rls.ts_game(1), torny_rls.ts_a1(), 1, 1, null),
  (torny_rls.ts_game(1), torny_rls.ts_a2(), 1, 1, null),
  (torny_rls.ts_game(1), torny_rls.ts_b1(), 2, 1, null),
  (torny_rls.ts_game(1), torny_rls.ts_b2(), 2, 1, null),
  (torny_rls.ts_game(2), torny_rls.ts_a1(), 1, 1, null),
  (torny_rls.ts_game(2), torny_rls.ts_a2(), 1, 1, null),
  (torny_rls.ts_game(2), torny_rls.ts_b1(), 2, 1, null),
  (torny_rls.ts_game(2), torny_rls.ts_b2(), 2, 1, null),
  (torny_rls.ts_game(2), torny_rls.ts_c1(), 3, 1, null),
  (torny_rls.ts_game(3), torny_rls.ts_a1(), 1, 1, null),
  (torny_rls.ts_game(3), torny_rls.ts_a2(), 1, 1, null),
  (torny_rls.ts_game(4), torny_rls.ts_a1(), 1, 1, null),
  (torny_rls.ts_game(4), torny_rls.ts_a2(), 1, 1, null),
  (torny_rls.ts_game(5), torny_rls.ts_a1(), 1, 1, null),
  (torny_rls.ts_game(5), torny_rls.ts_w(),  1, 1, now()),
  (torny_rls.ts_game(6), torny_rls.ts_a1(), 1, 1, null),
  (torny_rls.ts_game(6), torny_rls.ts_a2(), 1, 1, null);

insert into public.patsome_tee_starters (game_id, team_number, tee_starter_user_id)
values (torny_rls.ts_game(6), 1, torny_rls.ts_a2());

-- Every other column on the game, to prove the RPC writes one column only.
create or replace function torny_rls.ts_game_rest(p_game uuid) returns jsonb
  language sql
  as $$
    select to_jsonb(g) - 'foursomes_side1_tee_starter_user_id' - 'foursomes_side2_tee_starter_user_id'
      from public.games g
     where g.id = p_game
  $$;

create temp table ts_before as
  select torny_rls.ts_game_rest(torny_rls.ts_game(2)) as rest;

-- ═════════════════════════════════════════════════════════════════════════════
-- Patsome: the first pick stands
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.ts_a1());

select is((select was_applied from public.set_tee_starter_if_unset(torny_rls.ts_game(1), 1, torny_rls.ts_a1())),
  true,
  'patsome: the first call applies');
select is((select tee_starter from public.set_tee_starter_if_unset(torny_rls.ts_game(1), 1, torny_rls.ts_a1())),
  torny_rls.ts_a1(),
  'patsome: the same call again answers with the same pick');
select is((select was_applied from public.set_tee_starter_if_unset(torny_rls.ts_game(1), 1, torny_rls.ts_a1())),
  true,
  'patsome: the same call again gives the same answer, so a lost reply is harmless');

select torny_rls.as_user(torny_rls.ts_a2());

select is((select was_applied from public.set_tee_starter_if_unset(torny_rls.ts_game(1), 1, torny_rls.ts_a2())),
  false,
  'patsome: the partner''s other pick is not applied');
select is((select tee_starter from public.set_tee_starter_if_unset(torny_rls.ts_game(1), 1, torny_rls.ts_a2())),
  torny_rls.ts_a1(),
  'patsome: the partner''s call answers with the first pick');
select is((select tee_starter_user_id from public.patsome_tee_starters where game_id = torny_rls.ts_game(1) and team_number = 1),
  torny_rls.ts_a1(),
  'patsome: the row still holds the first pick');

select torny_rls.as_user(torny_rls.ts_a1());

select is((select tee_starter from public.set_tee_starter_if_unset(torny_rls.ts_game(6), 1, torny_rls.ts_a1())),
  torny_rls.ts_a2(),
  'patsome: a pick made on the web first stands when the phone''s queue arrives');
select is((select was_applied from public.set_tee_starter_if_unset(torny_rls.ts_game(6), 1, torny_rls.ts_a1())),
  false,
  'patsome: the queued pick is not applied over the web''s');

-- ═════════════════════════════════════════════════════════════════════════════
-- Foursomes: the same rule on the games columns
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.ts_b1());

select is((select was_applied from public.set_tee_starter_if_unset(torny_rls.ts_game(2), 2, torny_rls.ts_b2())),
  true,
  'foursomes: the first call applies');
select is((select tee_starter from public.set_tee_starter_if_unset(torny_rls.ts_game(2), 2, torny_rls.ts_b2())),
  torny_rls.ts_b2(),
  'foursomes: the same call again answers with the same pick');

select torny_rls.as_user(torny_rls.ts_b2());

select is((select was_applied from public.set_tee_starter_if_unset(torny_rls.ts_game(2), 2, torny_rls.ts_b1())),
  false,
  'foursomes: the partner''s other pick is not applied');
select is((select tee_starter from public.set_tee_starter_if_unset(torny_rls.ts_game(2), 2, torny_rls.ts_b1())),
  torny_rls.ts_b2(),
  'foursomes: the partner''s call answers with the first pick');

select torny_rls.as_service();

select is((select foursomes_side2_tee_starter_user_id from public.games where id = torny_rls.ts_game(2)),
  torny_rls.ts_b2(),
  'foursomes: side 2 holds the first pick');
select is((select foursomes_side1_tee_starter_user_id from public.games where id = torny_rls.ts_game(2)),
  null::uuid,
  'foursomes: side 1 is untouched');
select is(torny_rls.ts_game_rest(torny_rls.ts_game(2)),
  (select rest from ts_before),
  'foursomes: no other column on the game changed');

-- ═════════════════════════════════════════════════════════════════════════════
-- Refused: one row of NULLs, nothing written
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.ts_out());

select is((select count(*)::int from public.set_tee_starter_if_unset(torny_rls.ts_game(1), 2, torny_rls.ts_b1())),
  1,
  'a refusal is one row');
select is((select tee_starter from public.set_tee_starter_if_unset(torny_rls.ts_game(1), 2, torny_rls.ts_b1())),
  null::uuid,
  'a stranger is refused');

select torny_rls.as_user(torny_rls.ts_a1());

select is((select was_applied from public.set_tee_starter_if_unset(torny_rls.ts_game(1), 2, torny_rls.ts_b1())),
  null::boolean,
  'a member of the other team is refused');

select torny_rls.as_user(torny_rls.ts_b1());

select is((select was_applied from public.set_tee_starter_if_unset(torny_rls.ts_game(1), 2, torny_rls.ts_a1())),
  null::boolean,
  'a pick outside the team is refused');

select torny_rls.as_user(torny_rls.ts_a1());

select is((select was_applied from public.set_tee_starter_if_unset(torny_rls.ts_game(5), 1, torny_rls.ts_w())),
  null::boolean,
  'a withdrawn pick is refused');

select torny_rls.as_user(torny_rls.ts_w());

select is((select was_applied from public.set_tee_starter_if_unset(torny_rls.ts_game(5), 1, torny_rls.ts_a1())),
  null::boolean,
  'a withdrawn caller is refused');

select torny_rls.as_user(torny_rls.ts_a1());

select is((select was_applied from public.set_tee_starter_if_unset(torny_rls.ts_game(3), 1, torny_rls.ts_a1())),
  null::boolean,
  'a finished game is refused');
select is((select was_applied from public.set_tee_starter_if_unset(torny_rls.ts_game(4), 1, torny_rls.ts_a1())),
  null::boolean,
  'the wrong format is refused');

select torny_rls.as_user(torny_rls.ts_c1());

select is((select was_applied from public.set_tee_starter_if_unset(torny_rls.ts_game(2), 3, torny_rls.ts_c1())),
  null::boolean,
  'side 3 in foursomes is refused');

select torny_rls.as_service();

select is((select count(*)::int from public.patsome_tee_starters
             where game_id in (torny_rls.ts_game(3), torny_rls.ts_game(5))
                or (game_id = torny_rls.ts_game(1) and team_number = 2)),
  0,
  'no refusal wrote a row');

-- ═════════════════════════════════════════════════════════════════════════════
-- Admin, and the role that may call it
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.admin_id());

select is((select was_applied from public.set_tee_starter_if_unset(torny_rls.ts_game(2), 1, torny_rls.ts_a2())),
  true,
  'an admin who is not on the side may set the pick');

select torny_rls.as_service();

select is((select foursomes_side1_tee_starter_user_id from public.games where id = torny_rls.ts_game(2)),
  torny_rls.ts_a2(),
  'the admin''s pick is on side 1');
select ok(not has_function_privilege('anon', 'public.set_tee_starter_if_unset(uuid, integer, uuid)', 'execute'),
  'anon may not call the function');
select ok(has_function_privilege('authenticated', 'public.set_tee_starter_if_unset(uuid, integer, uuid)', 'execute'),
  'authenticated may call the function');

-- ═════════════════════════════════════════════════════════════════════════════
-- A direct PATCH on games is still closed (trap 3)
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.ts_a1());

update public.games
   set foursomes_side1_tee_starter_user_id = torny_rls.ts_a1(), name = 'Hacked'
 where id = torny_rls.ts_game(2);

select torny_rls.as_service();

select is((select foursomes_side1_tee_starter_user_id from public.games where id = torny_rls.ts_game(2)),
  torny_rls.ts_a2(),
  'a player''s direct update does not change the pick');
select is((select name from public.games where id = torny_rls.ts_game(2)),
  'TS G2',
  'a player''s direct update does not change the name');

select torny_rls.as_user(torny_rls.ts_a1());

select is((select tee_starter from public.set_tee_starter_if_unset(null, 1, torny_rls.ts_a1())),
  null::uuid,
  'no game is refused');

select * from finish();

rollback;
