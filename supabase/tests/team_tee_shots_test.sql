-- supabase/tests/team_tee_shots_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- «Hvem sitt utslag» (#2580, migration 0209): the table, the write RPC, the
-- shortfall count, the delivery guard on game_players and the CHECK on
-- games.mode_config.min_tee_shots.
--
-- The rule's TypeScript home is lib/games/teeShots.ts, pinned by
-- lib/games/teeShots.test.ts. Two tables stand in both files and must agree
-- (trap 4): the feasibility table (team size 2–4 × minimum 3–6) and the
-- shamble-after-the-first-delivery case (minimum 3, one card in after hole
-- 16). team_tee_shot_shortfall is checked against the same numbers as the
-- Type A cases Utslag 3 (2) and Utslag 2b (3).
--
-- Fixtures (tt_ = tee-shot test):
--   G1 Texas, team_size 2, minimum 3, active, four players in two pairs, one
--      pair per flight (≤ 4 active players: everyone can score for everyone).
--   G2 Texas, team_size 2, minimum 3, active, six players: teams 1 and 2 in
--      flight 1, team 3 in flight 2.
--   G3 Texas, team_size 4, minimum 4, active: team 1 is Marte, Jonas, Sigrid
--      and Per with the artboard's 18 picks (Utslag 3, Per short by 2); team 2
--      is three players on six each.
--   G4 shamble, team_size 4, minimum 3, active: the Type A partial case.
--   G5 Texas, active, setting off. G6 Texas, scheduled, setting on.
--   G7 Texas, team_size 2, minimum 3, active: w1 active, w2 withdrawn.
--   tt_creator creates every game and plays in none; tt_out is in no game.
--
-- The organiser's INSERTs pass the invite-eligibility guard (0115/0208) by
-- inserting the creator's own row; a refusal is matched on 'tee_shots_short'
-- so a 42501 from that guard can never pass for it.
--
-- Every probe and its check are separate statements (#1910).
-- Depends on 0209. Run via: supabase test db (see supabase/tests/README.md)
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(60);

\ir fixtures/rls_helpers.psql

-- ── Scenario-local fixtures ──────────────────────────────────────────────────
create or replace function torny_rls.tt_creator() returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-258000000001'::uuid $$;
create or replace function torny_rls.tt_out()     returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-258000000002'::uuid $$;
create or replace function torny_rls.tt_g1_a1()   returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-258000000011'::uuid $$;
create or replace function torny_rls.tt_g1_a2()   returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-258000000012'::uuid $$;
create or replace function torny_rls.tt_g1_b1()   returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-258000000013'::uuid $$;
create or replace function torny_rls.tt_g1_b2()   returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-258000000014'::uuid $$;
create or replace function torny_rls.tt_g2_p(n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-a000-2580000000' || (20 + n)::text)::uuid $$;
create or replace function torny_rls.tt_marte()   returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-258000000031'::uuid $$;
create or replace function torny_rls.tt_jonas()   returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-258000000032'::uuid $$;
create or replace function torny_rls.tt_sigrid()  returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-258000000033'::uuid $$;
create or replace function torny_rls.tt_per()     returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-258000000034'::uuid $$;
create or replace function torny_rls.tt_x(n int)  returns uuid language sql immutable as $$ select ('00000000-0000-4000-a000-2580000000' || (34 + n)::text)::uuid $$;
create or replace function torny_rls.tt_sm()      returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-258000000041'::uuid $$;
create or replace function torny_rls.tt_sj()      returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-258000000042'::uuid $$;
create or replace function torny_rls.tt_ss()      returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-258000000043'::uuid $$;
create or replace function torny_rls.tt_sp()      returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-258000000044'::uuid $$;

create or replace function torny_rls.tt_w1()      returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-258000000051'::uuid $$;
create or replace function torny_rls.tt_w2()      returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-258000000052'::uuid $$;

create or replace function torny_rls.tt_game(n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-a000-25800000010' || n::text)::uuid $$;

-- Tries a draft game of the given format with the given team size and
-- minimum; false when games_min_tee_shots_valid refuses it. Any other error
-- (another CHECK included) is raised, so it cannot pass for «går ikke».
-- Runs as the service role.
create or replace function torny_rls.tt_check_accepts(p_mode text, p_size int, p_min int) returns boolean
  language plpgsql
  as $$
  declare
    v_config jsonb;
    v_constraint text;
  begin
    v_config := case p_mode
      when 'shamble' then jsonb_build_object('kind', 'shamble', 'team_size', p_size, 'teams_count', 2,
                                             'shamble_variant', 'shamble', 'shamble_count', 2, 'shamble_scoring', 'net')
      else jsonb_build_object('kind', p_mode, 'team_size', p_size, 'teams_count', 2, 'team_handicap_pct', 25)
    end || jsonb_build_object('min_tee_shots', p_min);
    insert into public.games (name, course_id, tee_box_id, status, game_mode, mode_config, created_by)
    values ('TT check', torny_rls.course_id(), torny_rls.tee_box_id(), 'draft', p_mode, v_config, torny_rls.tt_creator());
    return true;
  exception
    when check_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'games_min_tee_shots_valid' then
        return false;
      end if;
      raise;
  end;
  $$;

grant execute on all functions in schema torny_rls to authenticated, anon, service_role;

-- ── Seed ──────────────────────────────────────────────────────────────────────
-- seed_active_game() gives the course, the tee and admin_id(). Its own game is
-- not used below.
select torny_rls.as_service();
select torny_rls.seed_active_game();

insert into auth.users (id, instance_id, aud, role, email)
select uid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
       'rls-' || uid::text || '@example.test'
  from unnest(array[
    torny_rls.tt_creator(), torny_rls.tt_out(),
    torny_rls.tt_g1_a1(), torny_rls.tt_g1_a2(), torny_rls.tt_g1_b1(), torny_rls.tt_g1_b2(),
    torny_rls.tt_g2_p(1), torny_rls.tt_g2_p(2), torny_rls.tt_g2_p(3),
    torny_rls.tt_g2_p(4), torny_rls.tt_g2_p(5), torny_rls.tt_g2_p(6),
    torny_rls.tt_marte(), torny_rls.tt_jonas(), torny_rls.tt_sigrid(), torny_rls.tt_per(),
    torny_rls.tt_x(1), torny_rls.tt_x(2), torny_rls.tt_x(3),
    torny_rls.tt_sm(), torny_rls.tt_sj(), torny_rls.tt_ss(), torny_rls.tt_sp(),
    torny_rls.tt_w1(), torny_rls.tt_w2()
  ]) as uid;

update public.users set is_admin = false, name = 'TT ' || right(id::text, 2)
 where id::text like '00000000-0000-4000-a000-2580%';

insert into public.games (id, name, course_id, tee_box_id, status, game_mode, mode_config, created_by, started_at) values
  (torny_rls.tt_game(1), 'TT G1', torny_rls.course_id(), torny_rls.tee_box_id(), 'active', 'texas_scramble',
   '{"kind":"texas_scramble","team_size":2,"teams_count":2,"team_handicap_pct":25,"min_tee_shots":3}', torny_rls.tt_creator(), now()),
  (torny_rls.tt_game(2), 'TT G2', torny_rls.course_id(), torny_rls.tee_box_id(), 'active', 'texas_scramble',
   '{"kind":"texas_scramble","team_size":2,"teams_count":3,"team_handicap_pct":25,"min_tee_shots":3}', torny_rls.tt_creator(), now()),
  (torny_rls.tt_game(3), 'TT G3', torny_rls.course_id(), torny_rls.tee_box_id(), 'active', 'texas_scramble',
   '{"kind":"texas_scramble","team_size":4,"teams_count":2,"team_handicap_pct":10,"min_tee_shots":4}', torny_rls.tt_creator(), now()),
  (torny_rls.tt_game(4), 'TT G4', torny_rls.course_id(), torny_rls.tee_box_id(), 'active', 'shamble',
   '{"kind":"shamble","team_size":4,"teams_count":1,"shamble_variant":"shamble","shamble_count":2,"shamble_scoring":"net","min_tee_shots":3}', torny_rls.tt_creator(), now()),
  (torny_rls.tt_game(5), 'TT G5', torny_rls.course_id(), torny_rls.tee_box_id(), 'active', 'texas_scramble',
   '{"kind":"texas_scramble","team_size":2,"teams_count":2,"team_handicap_pct":25}', torny_rls.tt_creator(), now()),
  (torny_rls.tt_game(6), 'TT G6', torny_rls.course_id(), torny_rls.tee_box_id(), 'scheduled', 'texas_scramble',
   '{"kind":"texas_scramble","team_size":2,"teams_count":2,"team_handicap_pct":25,"min_tee_shots":3}', torny_rls.tt_creator(), null),
  (torny_rls.tt_game(7), 'TT G7', torny_rls.course_id(), torny_rls.tee_box_id(), 'active', 'texas_scramble',
   '{"kind":"texas_scramble","team_size":2,"teams_count":1,"team_handicap_pct":25,"min_tee_shots":3}', torny_rls.tt_creator(), now());

insert into public.game_players (game_id, user_id, team_number, flight_number) values
  (torny_rls.tt_game(1), torny_rls.tt_g1_a1(), 1, 1),
  (torny_rls.tt_game(1), torny_rls.tt_g1_a2(), 1, 1),
  (torny_rls.tt_game(1), torny_rls.tt_g1_b1(), 2, 2),
  (torny_rls.tt_game(1), torny_rls.tt_g1_b2(), 2, 2),
  (torny_rls.tt_game(2), torny_rls.tt_g2_p(1), 1, 1),
  (torny_rls.tt_game(2), torny_rls.tt_g2_p(2), 1, 1),
  (torny_rls.tt_game(2), torny_rls.tt_g2_p(3), 2, 1),
  (torny_rls.tt_game(2), torny_rls.tt_g2_p(4), 2, 1),
  (torny_rls.tt_game(2), torny_rls.tt_g2_p(5), 3, 2),
  (torny_rls.tt_game(2), torny_rls.tt_g2_p(6), 3, 2),
  (torny_rls.tt_game(3), torny_rls.tt_marte(),  1, 1),
  (torny_rls.tt_game(3), torny_rls.tt_jonas(),  1, 1),
  (torny_rls.tt_game(3), torny_rls.tt_sigrid(), 1, 1),
  (torny_rls.tt_game(3), torny_rls.tt_per(),    1, 1),
  (torny_rls.tt_game(3), torny_rls.tt_x(1),     2, 2),
  (torny_rls.tt_game(3), torny_rls.tt_x(2),     2, 2),
  (torny_rls.tt_game(3), torny_rls.tt_x(3),     2, 2),
  (torny_rls.tt_game(4), torny_rls.tt_sm(), 1, 1),
  (torny_rls.tt_game(4), torny_rls.tt_sj(), 1, 1),
  (torny_rls.tt_game(4), torny_rls.tt_ss(), 1, 1),
  (torny_rls.tt_game(4), torny_rls.tt_sp(), 1, 1),
  (torny_rls.tt_game(5), torny_rls.tt_g1_a1(), 1, 1),
  (torny_rls.tt_game(6), torny_rls.tt_g1_a1(), 1, 1);

insert into public.game_players (game_id, user_id, team_number, flight_number, withdrawn_at) values
  (torny_rls.tt_game(7), torny_rls.tt_w1(), 1, 1, null),
  (torny_rls.tt_game(7), torny_rls.tt_w2(), 1, 1, now());

-- G3 team 1, Utslag 3 (`Utslag-forslag-levering`), hole by hole:
-- Sigrid, Marte, Marte, Jonas, Sigrid, Marte, Marte, Jonas, Per,
-- Sigrid, Marte, Jonas, Per, Jonas, Marte, Sigrid, Jonas, Marte.
insert into public.team_tee_shots (game_id, team_number, hole_number, tee_shot_by, entered_by, client_updated_at)
select torny_rls.tt_game(3), 1, h, owner, torny_rls.tt_marte(), now() - interval '1 day'
  from unnest(array[
    torny_rls.tt_sigrid(), torny_rls.tt_marte(), torny_rls.tt_marte(), torny_rls.tt_jonas(),
    torny_rls.tt_sigrid(), torny_rls.tt_marte(), torny_rls.tt_marte(), torny_rls.tt_jonas(),
    torny_rls.tt_per(),    torny_rls.tt_sigrid(), torny_rls.tt_marte(), torny_rls.tt_jonas(),
    torny_rls.tt_per(),    torny_rls.tt_jonas(), torny_rls.tt_marte(), torny_rls.tt_sigrid(),
    torny_rls.tt_jonas(),  torny_rls.tt_marte()
  ]) with ordinality as o(owner, h);

-- G3 team 2: three players on six each, nobody short.
insert into public.team_tee_shots (game_id, team_number, hole_number, tee_shot_by, entered_by, client_updated_at)
select torny_rls.tt_game(3), 2, h, torny_rls.tt_x(((h - 1) % 3)::int + 1), torny_rls.tt_x(1), now() - interval '1 day'
  from generate_series(1, 18) as h;

-- G1 team 2: b1 and b2 on three each, so b1 can deliver the team card.
insert into public.team_tee_shots (game_id, team_number, hole_number, tee_shot_by, entered_by, client_updated_at)
select torny_rls.tt_game(1), 2, h, case when h <= 3 then torny_rls.tt_g1_b1() else torny_rls.tt_g1_b2() end,
       torny_rls.tt_g1_b1(), now() - interval '1 day'
  from generate_series(1, 6) as h;

-- G4: the Type A partial case. Marte 5, Jonas 4, Sigrid 4, Per 3 on holes
-- 1–16; hole 3 is Per's.
insert into public.team_tee_shots (game_id, team_number, hole_number, tee_shot_by, entered_by, client_updated_at)
select torny_rls.tt_game(4), 1, h, owner, torny_rls.tt_sm(), now() - interval '1 day'
  from unnest(array[
    torny_rls.tt_sm(), torny_rls.tt_sj(), torny_rls.tt_sp(), torny_rls.tt_ss(),
    torny_rls.tt_sm(), torny_rls.tt_sj(), torny_rls.tt_sp(), torny_rls.tt_ss(),
    torny_rls.tt_sm(), torny_rls.tt_sj(), torny_rls.tt_sp(), torny_rls.tt_ss(),
    torny_rls.tt_sm(), torny_rls.tt_sj(), torny_rls.tt_ss(), torny_rls.tt_sm()
  ]) with ordinality as o(owner, h);

-- ═════════════════════════════════════════════════════════════════════════════
-- CHECK games_min_tee_shots_valid (criterion 2)
-- ═════════════════════════════════════════════════════════════════════════════
select throws_ok(
  $$ insert into public.games (name, course_id, tee_box_id, status, game_mode, mode_config, created_by)
     values ('TT 5x4', torny_rls.course_id(), torny_rls.tee_box_id(), 'draft', 'texas_scramble',
             '{"kind":"texas_scramble","team_size":4,"teams_count":2,"team_handicap_pct":10,"min_tee_shots":5}',
             torny_rls.tt_creator()) $$,
  '23514', null,
  'CHECK: a four-player team cannot have a minimum of 5 (INSERT)');

select throws_ok(
  $$ update public.games set mode_config = mode_config || '{"min_tee_shots":5}' where id = torny_rls.tt_game(3) $$,
  '23514', null,
  'CHECK: a four-player team cannot have a minimum of 5 (UPDATE of mode_config)');

-- The same table stands in lib/games/teeShots.test.ts (minTeeShotsFeasible),
-- and holds for each of the four formats.
select results_eq(
  format($$ select s, m, torny_rls.tt_check_accepts(%L, s, m)
              from (values (2,3),(2,4),(2,5),(2,6),(3,3),(3,4),(3,5),(3,6),(4,3),(4,4),(4,5),(4,6)) as v(s, m)
             order by s, m $$, f),
  $$ values (2,3,true),(2,4,true),(2,5,true),(2,6,true),
            (3,3,true),(3,4,true),(3,5,true),(3,6,true),
            (4,3,true),(4,4,true),(4,5,false),(4,6,false) $$,
  format('CHECK agrees with minTeeShotsFeasible on all twelve team size × minimum pairs (%s)', f))
  from unnest(array['texas_scramble', 'ambrose', 'florida_scramble', 'shamble']) as f;

select throws_ok(
  $$ insert into public.games (name, course_id, tee_box_id, status, game_mode, mode_config, created_by)
     values ('TT string', torny_rls.course_id(), torny_rls.tee_box_id(), 'draft', 'texas_scramble',
             '{"kind":"texas_scramble","team_size":2,"teams_count":2,"team_handicap_pct":25,"min_tee_shots":"4"}',
             torny_rls.tt_creator()) $$,
  '23514', null,
  'CHECK: the string "4" is a CHECK violation, not a cast error');

select throws_ok(
  $$ insert into public.games (name, course_id, tee_box_id, status, game_mode, mode_config, created_by)
     values ('TT fraction', torny_rls.course_id(), torny_rls.tee_box_id(), 'draft', 'texas_scramble',
             '{"kind":"texas_scramble","team_size":2,"teams_count":2,"team_handicap_pct":25,"min_tee_shots":3.5}',
             torny_rls.tt_creator()) $$,
  '23514', null,
  'CHECK: 3.5 is a CHECK violation');

select throws_ok(
  $$ insert into public.games (name, course_id, tee_box_id, status, game_mode, mode_config, created_by)
     values ('TT best ball', torny_rls.course_id(), torny_rls.tee_box_id(), 'draft', 'best_ball',
             '{"kind":"best_ball","team_size":2,"teams_count":2,"min_tee_shots":3}',
             torny_rls.tt_creator()) $$,
  '23514', null,
  'CHECK: a format that does not count tee shots cannot have the key');

-- ═════════════════════════════════════════════════════════════════════════════
-- Privileges
-- ═════════════════════════════════════════════════════════════════════════════
select ok(not has_function_privilege('authenticated', 'public.team_tee_shot_shortfall(uuid, integer, uuid)', 'execute'),
  'authenticated cannot run team_tee_shot_shortfall');
select ok(not has_function_privilege('anon', 'public.team_tee_shot_shortfall(uuid, integer, uuid)', 'execute'),
  'anon cannot run team_tee_shot_shortfall');
select ok(has_function_privilege('authenticated', 'public.set_team_tee_shot_if_newer(uuid, integer, integer, uuid, timestamptz)', 'execute'),
  'authenticated can run set_team_tee_shot_if_newer');
select ok(not has_function_privilege('anon', 'public.set_team_tee_shot_if_newer(uuid, integer, integer, uuid, timestamptz)', 'execute'),
  'anon cannot run set_team_tee_shot_if_newer');
select ok(not (has_table_privilege('authenticated', 'public.team_tee_shots', 'INSERT')
            or has_table_privilege('authenticated', 'public.team_tee_shots', 'UPDATE')
            or has_table_privilege('authenticated', 'public.team_tee_shots', 'DELETE')
            or has_table_privilege('authenticated', 'public.team_tee_shots', 'TRUNCATE')),
  'authenticated has no INSERT, UPDATE, DELETE or TRUNCATE on team_tee_shots');
select ok(not (has_table_privilege('anon', 'public.team_tee_shots', 'INSERT')
            or has_table_privilege('anon', 'public.team_tee_shots', 'UPDATE')
            or has_table_privilege('anon', 'public.team_tee_shots', 'DELETE')
            or has_table_privilege('anon', 'public.team_tee_shots', 'TRUNCATE')),
  'anon has no INSERT, UPDATE, DELETE or TRUNCATE on team_tee_shots');
select ok(has_table_privilege('authenticated', 'public.team_tee_shots', 'SELECT'),
  'authenticated keeps SELECT on team_tee_shots (the policy decides the rows)');

-- ═════════════════════════════════════════════════════════════════════════════
-- Reading
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.tt_creator());
select is((select count(*)::int from public.team_tee_shots where game_id = torny_rls.tt_game(3) and team_number = 1), 18,
  'the creator who neither plays nor is admin sees the rows');

select torny_rls.as_user(torny_rls.tt_out());
select is((select count(*)::int from public.team_tee_shots where game_id = torny_rls.tt_game(3)), 0,
  'a signed-in outsider sees no rows');

select torny_rls.as_user(torny_rls.tt_per());
select is((select count(*)::int from public.team_tee_shots where game_id = torny_rls.tt_game(3) and team_number = 1), 18,
  'a player in the game sees the rows');

-- ═════════════════════════════════════════════════════════════════════════════
-- Shortfall: the same numbers as Type A
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_service();
select is(public.team_tee_shot_shortfall(torny_rls.tt_game(3), 1), 2,
  'Utslag 3: team_tee_shot_shortfall is 2 (Per short by 2), as teeShotStatus');

savepoint utslag_2b;
delete from public.team_tee_shots where game_id = torny_rls.tt_game(3) and team_number = 1 and hole_number >= 16;
select is(public.team_tee_shot_shortfall(torny_rls.tt_game(3), 1), 3,
  'Utslag 2b: team_tee_shot_shortfall is 3 (Sigrid 1, Per 2), as teeShotStatus');
rollback to savepoint utslag_2b;

-- ═════════════════════════════════════════════════════════════════════════════
-- Hostile direct writes (no write policy)
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.tt_marte());
select throws_ok(
  $$ insert into public.team_tee_shots (game_id, team_number, hole_number, tee_shot_by, entered_by, client_updated_at)
     values (torny_rls.tt_game(3), 2, 1, torny_rls.tt_marte(), torny_rls.tt_marte(), now()) $$,
  '42501', null,
  'a player cannot INSERT into team_tee_shots directly');

select throws_ok(
  $$ update public.team_tee_shots set tee_shot_by = torny_rls.tt_per()
      where game_id = torny_rls.tt_game(3) and team_number = 1 and hole_number = 1 $$,
  '42501', null,
  'a player cannot UPDATE team_tee_shots directly');
select is((select tee_shot_by from public.team_tee_shots where game_id = torny_rls.tt_game(3) and team_number = 1 and hole_number = 1),
  torny_rls.tt_sigrid(),
  'the direct UPDATE changed nothing');

select throws_ok(
  $$ delete from public.team_tee_shots where game_id = torny_rls.tt_game(3) $$,
  '42501', null,
  'a player cannot DELETE from team_tee_shots directly');
select is((select count(*)::int from public.team_tee_shots where game_id = torny_rls.tt_game(3) and team_number = 1), 18,
  'the direct DELETE removed nothing');

-- ═════════════════════════════════════════════════════════════════════════════
-- The delivery guard on game_players
-- ═════════════════════════════════════════════════════════════════════════════
savepoint creator_short_team;
select torny_rls.as_user(torny_rls.tt_creator());
select throws_ok(
  $$ insert into public.game_players (game_id, user_id, team_number, flight_number, submitted_at)
     values (torny_rls.tt_game(3), torny_rls.tt_creator(), 1, 1, now()) $$,
  'P0001', 'tee_shots_short',
  'the organiser cannot INSERT a delivered row on a team that is short');
rollback to savepoint creator_short_team;

savepoint creator_new_player;
select torny_rls.as_user(torny_rls.tt_creator());
select throws_ok(
  $$ insert into public.game_players (game_id, user_id, team_number, flight_number, submitted_at)
     values (torny_rls.tt_game(3), torny_rls.tt_creator(), 2, 2, now()) $$,
  'P0001', 'tee_shots_short',
  'the organiser cannot INSERT a delivered row for a new player with 0 tee shots (counted via p_extra_member)');
rollback to savepoint creator_new_player;

savepoint creator_withdrawn;
select torny_rls.as_user(torny_rls.tt_creator());
select lives_ok(
  $$ insert into public.game_players (game_id, user_id, team_number, flight_number, submitted_at, withdrawn_at)
     values (torny_rls.tt_game(3), torny_rls.tt_creator(), 2, 2, now(), now()) $$,
  'the same INSERT with withdrawn_at set goes through (a withdrawn player is not counted)');
rollback to savepoint creator_withdrawn;

select torny_rls.as_user(torny_rls.tt_per());
select throws_ok(
  $$ update public.game_players set submitted_at = now()
      where game_id = torny_rls.tt_game(3) and user_id = torny_rls.tt_per() $$,
  'P0001', 'tee_shots_short',
  'a player''s direct PATCH of submitted_at is refused while the team is short');

-- Swap Per in on two of Marte's holes (2 and 3): Marte 5, Per 4.
select torny_rls.as_service();
update public.team_tee_shots set tee_shot_by = torny_rls.tt_per()
 where game_id = torny_rls.tt_game(3) and team_number = 1 and hole_number in (2, 3);

select torny_rls.as_user(torny_rls.tt_per());
select lives_ok(
  $$ update public.game_players set submitted_at = now()
      where game_id = torny_rls.tt_game(3) and user_id = torny_rls.tt_per() $$,
  'the same PATCH goes through once nobody is short');

-- ═════════════════════════════════════════════════════════════════════════════
-- set_team_tee_shot_if_newer: refusals, one by one
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.tt_g1_a1());
select is((select was_applied from public.set_team_tee_shot_if_newer(torny_rls.tt_game(6), 1, 1, torny_rls.tt_g1_a1(), now() - interval '1 hour')),
  null::boolean,
  'refused: the game is not active');

select is((select was_applied from public.set_team_tee_shot_if_newer(torny_rls.tt_game(5), 1, 1, torny_rls.tt_g1_a1(), now() - interval '1 hour')),
  null::boolean,
  'refused: the game does not have the setting');

select is((select was_applied from public.set_team_tee_shot_if_newer(torny_rls.tt_game(1), 1, 9, torny_rls.tt_g1_b1(), now() - interval '1 hour')),
  null::boolean,
  'refused: the tee shot belongs to someone on another team');

select is((select was_applied from public.set_team_tee_shot_if_newer(torny_rls.tt_game(1), 1, 9, torny_rls.tt_g1_a1(), now() + interval '1 day')),
  null::boolean,
  'refused: a client stamp far in the future (#803)');

select torny_rls.as_user(torny_rls.tt_out());
select is((select was_applied from public.set_team_tee_shot_if_newer(torny_rls.tt_game(1), 1, 9, torny_rls.tt_g1_a1(), now() - interval '1 hour')),
  null::boolean,
  'refused: the writer is not in the game');

select torny_rls.as_user(torny_rls.tt_creator());
select is((select was_applied from public.set_team_tee_shot_if_newer(torny_rls.tt_game(1), 1, 9, torny_rls.tt_g1_a1(), now() - interval '1 hour')),
  null::boolean,
  'refused: the organiser who does not play is not a writer');

select torny_rls.as_user(torny_rls.tt_w2());
select is((select was_applied from public.set_team_tee_shot_if_newer(torny_rls.tt_game(7), 1, 1, torny_rls.tt_w1(), now() - interval '1 hour')),
  null::boolean,
  'refused: a withdrawn player cannot write for their own team');

select torny_rls.as_user(torny_rls.tt_w1());
select is((select was_applied from public.set_team_tee_shot_if_newer(torny_rls.tt_game(7), 1, 1, torny_rls.tt_w2(), now() - interval '1 hour')),
  null::boolean,
  'refused: an active teammate cannot give the tee shot to a withdrawn player');

-- ═════════════════════════════════════════════════════════════════════════════
-- Who may write
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.admin_id());
select is((select was_applied from public.set_team_tee_shot_if_newer(torny_rls.tt_game(1), 1, 10, torny_rls.tt_g1_a1(), now() - interval '1 hour')),
  true,
  'an admin can write');

select torny_rls.as_user(torny_rls.tt_g1_a1());
select is((select was_applied from public.set_team_tee_shot_if_newer(torny_rls.tt_game(1), 2, 7, torny_rls.tt_g1_b1(), now() - interval '1 hour')),
  true,
  'Texas, four active players, two pairs: a player on team 1 can enter team 2 (can_score_for)');

select torny_rls.as_user(torny_rls.tt_g2_p(5));
select is((select was_applied from public.set_team_tee_shot_if_newer(torny_rls.tt_game(2), 1, 1, torny_rls.tt_g2_p(1), now() - interval '1 hour')),
  null::boolean,
  'more than four players: a player in another flight cannot enter team 1');

select torny_rls.as_user(torny_rls.tt_g2_p(3));
select is((select was_applied from public.set_team_tee_shot_if_newer(torny_rls.tt_game(2), 1, 1, torny_rls.tt_g2_p(1), now() - interval '1 hour')),
  true,
  'more than four players: a player in the same flight can enter team 1');

-- ═════════════════════════════════════════════════════════════════════════════
-- Last write wins; scores and tee shots on the same hole both stand
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.tt_g1_a1());
select is((select was_applied from public.set_team_tee_shot_if_newer(torny_rls.tt_game(1), 1, 1, torny_rls.tt_g1_a1(), now() - interval '10 minutes')),
  true,
  'last write wins: the newer write lands');
select is((select was_applied from public.set_team_tee_shot_if_newer(torny_rls.tt_game(1), 1, 1, torny_rls.tt_g1_a2(), now() - interval '20 minutes')),
  false,
  'last write wins: an older write is not applied');
select is((select tee_shot_by from public.team_tee_shots where game_id = torny_rls.tt_game(1) and team_number = 1 and hole_number = 1),
  torny_rls.tt_g1_a1(),
  'last write wins: the row keeps the newer choice');
-- The guard sits on the upsert itself, so two first writes at the same moment
-- cannot let the older stamp win either (both reach DO UPDATE). A refused
-- write answers with the row that stands.
select is((select tee_shot_by from public.set_team_tee_shot_if_newer(torny_rls.tt_game(1), 1, 1, torny_rls.tt_g1_a2(), now() - interval '30 minutes')),
  torny_rls.tt_g1_a1(),
  'last write wins: an older write is answered with the row that stands');
select is((select was_applied
             from public.set_team_tee_shot_if_newer(torny_rls.tt_game(1), 1, 1, torny_rls.tt_g1_a2(),
                    (select client_updated_at from public.team_tee_shots
                      where game_id = torny_rls.tt_game(1) and team_number = 1 and hole_number = 1))),
  false,
  'last write wins: the same stamp does not overwrite');

select ok((select was_applied from public.upsert_score_if_newer(torny_rls.tt_game(1), torny_rls.tt_g1_a1(), 3, 4, torny_rls.tt_g1_a1(), now() - interval '5 minutes')),
  'score first on hole 3');
select ok((select was_applied from public.set_team_tee_shot_if_newer(torny_rls.tt_game(1), 1, 3, torny_rls.tt_g1_a2(), now() - interval '4 minutes')),
  'then the tee shot on hole 3');
select ok((select was_applied from public.set_team_tee_shot_if_newer(torny_rls.tt_game(1), 1, 4, torny_rls.tt_g1_a2(), now() - interval '4 minutes')),
  'tee shot first on hole 4');
select ok((select was_applied from public.upsert_score_if_newer(torny_rls.tt_game(1), torny_rls.tt_g1_a1(), 4, 5, torny_rls.tt_g1_a1(), now() - interval '3 minutes')),
  'then the score on hole 4');
select is((select count(*)::int from public.scores where game_id = torny_rls.tt_game(1) and user_id = torny_rls.tt_g1_a1() and hole_number in (3, 4)), 2,
  'both scores stand');
select is((select count(*)::int from public.team_tee_shots where game_id = torny_rls.tt_game(1) and team_number = 1 and hole_number in (3, 4) and tee_shot_by = torny_rls.tt_g1_a2()), 2,
  'both tee shots stand');

-- ═════════════════════════════════════════════════════════════════════════════
-- Scramble is frozen once the team card is in
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_service();
update public.game_players set submitted_at = now()
 where game_id = torny_rls.tt_game(1) and user_id = torny_rls.tt_g1_b1();

select torny_rls.as_user(torny_rls.tt_g1_b2());
select is((select was_applied from public.set_team_tee_shot_if_newer(torny_rls.tt_game(1), 2, 8, torny_rls.tt_g1_b2(), now() - interval '1 hour')),
  null::boolean,
  'scramble: after the team card is in, nobody on the team can change a tee shot');

-- ═════════════════════════════════════════════════════════════════════════════
-- Shamble after the first delivery (the Type A partial case)
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_service();
update public.game_players set submitted_at = now()
 where game_id = torny_rls.tt_game(4) and user_id = torny_rls.tt_sm();

select torny_rls.as_user(torny_rls.tt_sj());
select is((select was_applied from public.set_team_tee_shot_if_newer(torny_rls.tt_game(4), 1, 17, torny_rls.tt_sm(), now() - interval '1 hour')),
  true,
  'shamble, one card in: a pick on hole 17 that keeps the count is accepted');
select is((select was_applied from public.set_team_tee_shot_if_newer(torny_rls.tt_game(4), 1, 3, torny_rls.tt_sj(), now() - interval '1 hour')),
  null::boolean,
  'shamble, one card in: a swap on hole 3 that puts Per on 2 is refused');
select is((select was_applied from public.set_team_tee_shot_if_newer(torny_rls.tt_game(4), 1, 3, null, now() - interval '1 hour')),
  null::boolean,
  'shamble, one card in: clearing hole 3 (Per under 3) is refused');
select is((select tee_shot_by from public.team_tee_shots where game_id = torny_rls.tt_game(4) and team_number = 1 and hole_number = 3),
  torny_rls.tt_sp(),
  'shamble, one card in: hole 3 is still Per''s');

select torny_rls.as_service();
update public.game_players set submitted_at = now()
 where game_id = torny_rls.tt_game(4) and user_id in (torny_rls.tt_sj(), torny_rls.tt_ss(), torny_rls.tt_sp());

select torny_rls.as_user(torny_rls.tt_sj());
select is((select was_applied from public.set_team_tee_shot_if_newer(torny_rls.tt_game(4), 1, 18, torny_rls.tt_sj(), now() - interval '1 hour')),
  null::boolean,
  'shamble, every card in: the choices are frozen');

select * from finish();

rollback;
