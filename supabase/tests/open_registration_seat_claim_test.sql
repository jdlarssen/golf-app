-- supabase/tests/open_registration_seat_claim_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Runtime test for migration 0177 (#2062, #2060).
--
--   1. claim_open_registration_seat counts seats the way tallyActiveRoster did
--      in submitTeamRegistration (#2011) — the table below mirrors those unit
--      tests, which is the trap-4 proof that the count moved without changing
--      meaning — and solo claims count seats too (owner's answer on #2062).
--   2. Only service_role may call it.
--   3. The "self register open" policy branch is gone: a player JWT can no
--      longer insert its own row into an open draft game; admin still can.
--
-- Every claim is called in its own statement and its effect is read in the
-- NEXT statement: a statement does not see its own writes (#1910).
--
-- Fixtures live in their own `torny_osc` schema so they cannot collide with the
-- other suites. Impersonation mirrors fixtures/rls_helpers.psql, inlined so the
-- file also runs as a rolled-back probe on staging (no `\ir` there).
--
-- Run via: supabase test db   (or `npm run test:rls`)
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

-- ── Fixture ids ──────────────────────────────────────────────────────────────
create schema if not exists torny_osc;

-- uid(n): fixture user n. uid(0) owns every game, uid(99) is a global admin.
create or replace function torny_osc.uid(n int) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-b062-1' || lpad(n::text, 11, '0'))::uuid
$$;
create or replace function torny_osc.gid(n int) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-b062-2' || lpad(n::text, 11, '0'))::uuid
$$;

-- seed_game: an open game owned by uid(0) with mode_config.team_size.
create or replace function torny_osc.seed_game(
  p_n int, p_mode text, p_team_size int,
  p_status text default 'draft', p_closed boolean default false
) returns void language plpgsql as $$
  begin
    insert into public.games (id, name, game_mode, mode_config, status, registration_mode, created_by, signups_closed_at)
    values (torny_osc.gid(p_n), 'OSC game ' || p_n, p_mode,
            jsonb_build_object('team_size', p_team_size),
            p_status::public.game_status, 'open', torny_osc.uid(0),
            case when p_closed then now() else null end);
  end;
$$;

-- add_rows: one active (or withdrawn) row per entry, users first..first+n-1.
-- A null entry is a player outside a team.
create or replace function torny_osc.add_rows(
  p_game int, p_first int, p_teams int[], p_withdrawn boolean default false
) returns void language plpgsql as $$
  begin
    insert into public.game_players (game_id, user_id, team_number, flight_number, withdrawn_at)
    select torny_osc.gid(p_game), torny_osc.uid(p_first + i - 1), p_teams[i], p_teams[i],
           case when p_withdrawn then now() else null end
      from generate_subscripts(p_teams, 1) as i;
  end;
$$;

-- claim: calls the function under test as the service role. Before 0177 the
-- function does not exist; answering instead of raising keeps the red run a
-- list of failing asserts rather than one aborted transaction.
create or replace function torny_osc.claim(
  p_game int, p_user int, p_cap int, p_seat_team_size int, p_new_team_size int
) returns jsonb language plpgsql as $$
  begin
    return public.claim_open_registration_seat(
      p_game_id => torny_osc.gid(p_game),
      p_user_id => torny_osc.uid(p_user),
      p_seat_team_size => p_seat_team_size,
      p_max_teams => 4,
      p_accepted_at => now(),
      p_cap => p_cap,
      p_new_team_size => p_new_team_size,
      p_signup_source => 'poster');
  exception
    when undefined_function then
      return jsonb_build_object('outcome', 'function_missing');
  end;
$$;

-- active(game): active rows in a game.
create or replace function torny_osc.active(p_game int) returns bigint language sql stable as $$
  select count(*) from public.game_players
   where game_id = torny_osc.gid(p_game) and withdrawn_at is null
$$;

-- try_insert_as(actor, game, target): TRUE if a direct INSERT with the actor's
-- JWT went through, FALSE if RLS refused it. Same impersonation as
-- torny_rls.as_user / as_service. The ids are resolved BEFORE the role switch:
-- `authenticated` has no usage on the torny_osc schema.
create or replace function torny_osc.try_insert_as(p_actor int, p_game int, p_target int)
  returns boolean language plpgsql as $$
  declare
    v_ok boolean;
    v_actor uuid := torny_osc.uid(p_actor);
    v_game uuid := torny_osc.gid(p_game);
    v_target uuid := torny_osc.uid(p_target);
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_actor::text, 'role', 'authenticated')::text, true);
    begin
      insert into public.game_players (game_id, user_id)
      values (v_game, v_target);
      v_ok := true;
    exception
      when insufficient_privilege then v_ok := false;
    end;
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', null, true);
    return v_ok;
  end;
$$;

create or replace function torny_osc.sig() returns text language sql immutable as $$
  select 'public.claim_open_registration_seat(uuid, uuid, integer, integer, timestamptz, integer, integer, text)'
$$;

-- ── Seed ─────────────────────────────────────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, email)
select torny_osc.uid(n), '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated',
       'authenticated', 'osc-' || n || '@example.test'
  from (select generate_series(0, 60) as n union all select 99) as u;

insert into public.users (id, email, name, is_admin)
select id, email, 'OSC ' || email, id = torny_osc.uid(99) from auth.users
 where email like 'osc-%@example.test'
on conflict (id) do update set email = excluded.email, name = excluded.name, is_admin = excluded.is_admin;

-- Texas à 4: cap 16 (MAX_TEAMS × 4).
select torny_osc.seed_game(1, 'texas_scramble', 4);  -- full grid
select torny_osc.add_rows(1, 1, array[1,1,1,1, 2,2,2,2, 3,3,3,3, 4,4,4,4]);
select torny_osc.seed_game(2, 'texas_scramble', 4);  -- room for one team
select torny_osc.add_rows(2, 1, array[1,1,1,1, 2,2,2,2, 3,3,3,3]);
select torny_osc.seed_game(3, 'texas_scramble', 4);  -- captains only + two outside a team: 2 + 3×4 = 14
select torny_osc.add_rows(3, 1, array[null,null, 1, 2, 3]::int[]);
select torny_osc.seed_game(4, 'texas_scramble', 4);  -- over-full team 1: 6 + 4 + 4 = 14
select torny_osc.add_rows(4, 1, array[1,1,1,1,1,1, 2, 3]);
select torny_osc.seed_game(5, 'texas_scramble', 4);  -- team 4 all withdrawn
select torny_osc.add_rows(5, 1, array[1,1,1,1, 2,2,2,2, 3,3,3,3]);
select torny_osc.add_rows(5, 13, array[4,4,4,4], true);
-- Florida à 2 below the cap (12) but every team number taken.
select torny_osc.seed_game(6, 'florida_scramble', 2);
select torny_osc.add_rows(6, 1, array[1,1, 2,2, 3,3, 4,4]);
-- Best ball, solo claims: cap 8, pairs.
select torny_osc.seed_game(7, 'best_ball', 2);       -- 7 outside a team
select torny_osc.add_rows(7, 1, array[null,null,null,null,null,null,null]::int[]);
select torny_osc.seed_game(8, 'best_ball', 2);       -- 6 outside a team + a pair with one row: 6 + 2 = 8
select torny_osc.add_rows(8, 1, array[null,null,null,null,null,null, 1]::int[]);
-- State gates.
select torny_osc.seed_game(9, 'texas_scramble', 4, 'active');
select torny_osc.seed_game(10, 'texas_scramble', 4, 'scheduled', true);
-- RLS: open draft game owned by uid(0), no rows.
select torny_osc.seed_game(11, 'stableford', 1);

-- ── 1. Seat count and team number ────────────────────────────────────────────
select is(torny_osc.claim(1, 50, 16, 4, 4), '{"outcome":"game_full","team_number":null}'::jsonb,
  'full grid → game_full');
select is(torny_osc.active(1), 16::bigint, 'full grid: no row written');

select is(torny_osc.claim(2, 50, 16, 4, 4), '{"outcome":"ok","team_number":4}'::jsonb,
  'room for one team → ok, team 4');
select results_eq(
  $$ select team_number, flight_number, accepted_at is not null, signup_source
       from public.game_players where game_id = torny_osc.gid(2) and user_id = torny_osc.uid(50) $$,
  $$ values (4, 4, true, 'poster') $$,
  'room for one team: the row has team = flight = 4, accepted_at and signup_source');

select is(torny_osc.claim(3, 50, 16, 4, 4), '{"outcome":"game_full","team_number":null}'::jsonb,
  'teams 1–3 hold their full size + 2 outside a team (14) and a team of 4 → game_full');

select is(torny_osc.claim(4, 50, 16, 4, 4), '{"outcome":"game_full","team_number":null}'::jsonb,
  'an over-full team holds every row it has (6 + 4 + 4) → game_full');

select is(torny_osc.claim(5, 50, 16, 4, 4), '{"outcome":"ok","team_number":4}'::jsonb,
  'a team whose members all withdrew frees its number → ok, team 4');

select is(torny_osc.claim(6, 50, 12, 2, 2), '{"outcome":"game_full","team_number":null}'::jsonb,
  'every team number taken below the cap → game_full');
select is(torny_osc.active(6), 8::bigint, 'no free team number: no row written');

-- ── Solo claims count seats ──────────────────────────────────────────────────
select is(torny_osc.claim(7, 50, 8, 2, null), '{"outcome":"ok","team_number":null}'::jsonb,
  'solo on the last seat → ok, no team number');
select is(torny_osc.claim(7, 51, 8, 2, null), '{"outcome":"game_full","team_number":null}'::jsonb,
  'solo one past the cap → game_full');
select is(torny_osc.active(7), 8::bigint, 'solo: exactly the cap is active');

select is(torny_osc.claim(8, 50, 8, 2, null), '{"outcome":"game_full","team_number":null}'::jsonb,
  'solo in a team format: a pair with one row holds two seats → game_full');

-- ── Existing row ─────────────────────────────────────────────────────────────
select is(torny_osc.claim(2, 50, 16, 4, 4), '{"outcome":"already_on_roster","team_number":4}'::jsonb,
  'already on the roster → already_on_roster with the row''s team number');
select is(torny_osc.active(2), 13::bigint, 'already on the roster: no second row');

-- ── State gates ──────────────────────────────────────────────────────────────
select is(torny_osc.claim(9, 50, 16, 4, 4)->>'outcome', 'game_locked', 'active game → game_locked');
select is(torny_osc.claim(10, 50, 16, 4, 4)->>'outcome', 'signup_closed', 'signups closed → signup_closed');
select is(torny_osc.claim(12, 50, 16, 4, 4)->>'outcome', 'game_not_found', 'missing game → game_not_found');

-- ── 2. Who may call it ───────────────────────────────────────────────────────
select ok(case when to_regprocedure(torny_osc.sig()) is null then false
               else has_function_privilege('service_role', torny_osc.sig(), 'execute') end,
  'service_role can execute claim_open_registration_seat');
select ok(case when to_regprocedure(torny_osc.sig()) is null then false
               else not has_function_privilege('authenticated', torny_osc.sig(), 'execute') end,
  'authenticated cannot execute claim_open_registration_seat');
select ok(case when to_regprocedure(torny_osc.sig()) is null then false
               else not has_function_privilege('anon', torny_osc.sig(), 'execute') end,
  'anon cannot execute claim_open_registration_seat');

-- ── 3. The policy ────────────────────────────────────────────────────────────
-- The first assert is the one that was red before 0177. The player-JWT insert
-- was already refused on main: the old self branch's EXISTS over `games` runs
-- under the player's own RLS, and a player who is not in the game (nor its
-- creator) cannot see it — probed on staging 2026-09-15 (count 0, 42501). The
-- branch was dead code that would turn into a live hole the day `games` gets a
-- discovery SELECT policy; the second assert locks the behaviour either way.
select ok(not exists (select 1 from pg_policy
                       where polrelid = 'public.game_players'::regclass
                         and polname = 'game_players self register open'),
  'the "self register open" policy is gone');
select is(torny_osc.try_insert_as(55, 11, 55), false,
  'a player JWT cannot insert its own row into an open draft game');
select is(torny_osc.try_insert_as(99, 11, 56), true,
  'a global admin JWT can still insert a row into someone else''s game');

select * from finish();

rollback;
