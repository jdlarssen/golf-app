-- supabase/tests/registration_seats_held_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Runtime test for migration 0199 (#2258).
--
--   1. registration_seats_held counts seats the way step 3 of
--      claim_open_registration_seat did: 1 per player outside a team,
--      max(rows, seat team size) per team, withdrawn rows excluded, 0 for an
--      empty game, one row per distinct game id.
--   2. The claim and the function agree on a team game with one half-full
--      team: the claim refuses at exactly the cap the function's count fills
--      and lets the next seat in one above it — and after that claim the
--      function counts the new row.
--   3. Only service_role may call it.
--
-- The existing open_registration_seat_claim_test.sql is the proof that the
-- claim's behaviour did not change; it runs unedited.
--
-- Every claim is called in its own statement and its effect is read in the
-- NEXT statement: a statement does not see its own writes (#1910).
--
-- Fixtures live in their own `torny_rsh` schema so they cannot collide with
-- the other suites.
--
-- Run via: supabase test db   (or `npm run test:rls`)
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

-- ── Fixture ids ──────────────────────────────────────────────────────────────
create schema if not exists torny_rsh;

-- uid(n): fixture user n. uid(0) owns every game.
create or replace function torny_rsh.uid(n int) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-b258-1' || lpad(n::text, 11, '0'))::uuid
$$;
create or replace function torny_rsh.gid(n int) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-b258-2' || lpad(n::text, 11, '0'))::uuid
$$;

-- seed_game: an open draft game owned by uid(0) with mode_config.team_size.
create or replace function torny_rsh.seed_game(p_n int, p_mode text, p_team_size int)
  returns void language plpgsql as $$
  begin
    insert into public.games (id, name, game_mode, mode_config, status, registration_mode, created_by)
    values (torny_rsh.gid(p_n), 'RSH game ' || p_n, p_mode,
            jsonb_build_object('team_size', p_team_size),
            'draft'::public.game_status, 'open', torny_rsh.uid(0));
  end;
$$;

-- add_rows: one active (or withdrawn) row per entry, users first..first+n-1.
-- A null entry is a player outside a team.
create or replace function torny_rsh.add_rows(
  p_game int, p_first int, p_teams int[], p_withdrawn boolean default false
) returns void language plpgsql as $$
  begin
    insert into public.game_players (game_id, user_id, team_number, flight_number, withdrawn_at)
    select torny_rsh.gid(p_game), torny_rsh.uid(p_first + i - 1), p_teams[i], p_teams[i],
           case when p_withdrawn then now() else null end
      from generate_subscripts(p_teams, 1) as i;
  end;
$$;

-- held(game, size): the function's count for one game. Before 0199 the
-- function does not exist; answering -1 instead of raising keeps the red run a
-- list of failing asserts rather than one aborted transaction.
create or replace function torny_rsh.held(p_game int, p_size int) returns integer
  language plpgsql as $$
  declare
    v integer;
  begin
    select h.seats into v
      from public.registration_seats_held(array[torny_rsh.gid(p_game)], array[p_size]) h;
    return v;
  exception
    when undefined_function then
      return -1;
  end;
$$;

-- claim: a solo claim under the given cap, as registerForOpenGame sends it.
create or replace function torny_rsh.claim(p_game int, p_user int, p_cap int, p_seat_team_size int)
  returns text language sql as $$
  select public.claim_open_registration_seat(
    p_game_id => torny_rsh.gid(p_game),
    p_user_id => torny_rsh.uid(p_user),
    p_seat_team_size => p_seat_team_size,
    p_max_teams => 10,
    p_accepted_at => now(),
    p_cap => p_cap)->>'outcome'
$$;

create or replace function torny_rsh.sig() returns text language sql immutable as $$
  select 'public.registration_seats_held(uuid[], integer[])'
$$;

-- ── Seed ─────────────────────────────────────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, email)
select torny_rsh.uid(n), '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated',
       'authenticated', 'rsh-' || n || '@example.test'
  from generate_series(0, 30) as n;

insert into public.users (id, email, name)
select id, email, 'RSH ' || email from auth.users
 where email like 'rsh-%@example.test'
on conflict (id) do update set email = excluded.email, name = excluded.name;

-- Texas à 4: team 1 half full (2 rows), one player outside a team, team 2
-- withdrawn in full. Held: 4 + 1 + 0 = 5.
select torny_rsh.seed_game(1, 'texas_scramble', 4);
select torny_rsh.add_rows(1, 1, array[1, 1, null]::int[]);
select torny_rsh.add_rows(1, 4, array[2, 2, 2, 2], true);
-- No rows at all.
select torny_rsh.seed_game(2, 'texas_scramble', 4);
-- Best ball, three players outside a team: 3.
select torny_rsh.seed_game(3, 'best_ball', 2);
select torny_rsh.add_rows(3, 1, array[null, null, null]::int[]);
-- Texas à 4, team 1 over-full (5 rows): every row counts.
select torny_rsh.seed_game(4, 'texas_scramble', 4);
select torny_rsh.add_rows(4, 1, array[1, 1, 1, 1, 1]);

-- ── 1. The count ─────────────────────────────────────────────────────────────
select is(torny_rsh.held(1, 4), 5,
  'half-full team holds its full size, a player outside a team holds one, a withdrawn team holds nothing');
select is(torny_rsh.held(2, 4), 0, 'a game with no rows holds 0');
select is(torny_rsh.held(3, 2), 3, 'players outside a team hold one seat each');
select is(torny_rsh.held(4, 4), 5, 'an over-full team holds every row it has');

select results_eq(
  $$ select h.game_id, h.seats
       from public.registration_seats_held(
         array[torny_rsh.gid(1), torny_rsh.gid(2), torny_rsh.gid(3), torny_rsh.gid(1)],
         array[4, 4, 2, 4]) h
      order by h.game_id $$,
  $$ values (torny_rsh.gid(1), 5), (torny_rsh.gid(2), 0), (torny_rsh.gid(3), 3) $$,
  'one call for a list: one row per distinct game id');

-- ── 2. The claim agrees ──────────────────────────────────────────────────────
select is(torny_rsh.claim(1, 20, 5, 4), 'game_full',
  'cap = the counted 5 seats: a solo claim is refused');
select is(torny_rsh.claim(1, 21, 6, 4), 'ok',
  'cap = the counted 5 seats + 1: a solo claim gets the last seat');
select is(torny_rsh.held(1, 4), 6, 'after the claim the function counts the new row');

-- ── 3. Who may call it ───────────────────────────────────────────────────────
select ok(case when to_regprocedure(torny_rsh.sig()) is null then false
               else has_function_privilege('service_role', torny_rsh.sig(), 'execute') end,
  'service_role can execute registration_seats_held');
select ok(case when to_regprocedure(torny_rsh.sig()) is null then false
               else not has_function_privilege('authenticated', torny_rsh.sig(), 'execute') end,
  'authenticated cannot execute registration_seats_held');
select ok(case when to_regprocedure(torny_rsh.sig()) is null then false
               else not has_function_privilege('anon', torny_rsh.sig(), 'execute') end,
  'anon cannot execute registration_seats_held');

select * from finish();

rollback;
