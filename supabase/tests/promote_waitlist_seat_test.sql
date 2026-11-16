-- supabase/tests/promote_waitlist_seat_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Runtime test for migration 0239 (#2482).
--
--   1. promote_waitlist_seat gives a freed seat to the first waiting request
--      only: created_at order, id on a tie, requesters already on the roster
--      skipped, and never past the cap.
--   2. It does nothing when the list is off, the game was closed by hand, is
--      not open or has started. After the deadline it still moves up.
--   3. Only service_role may call it, and registration_waitlist (the queue's
--      one home) lists the queue in that order.
--   4. The three new games columns: the cap's CHECK bounds, and a player who is
--      not the organiser changes none of them with a direct PATCH (#440).
--
-- The lock: the function takes the same `for no key update` on the games row as
-- claim_open_registration_seat, so two calls for one seat run one after the
-- other. A single pgTAP session cannot run them at the same time; the asserts
-- in section 1 show the second call for a seat getting nothing.
--
-- Every call is its own statement and its effect is read in the NEXT
-- statement: a statement does not see its own writes (#1910).
--
-- Fixtures live in their own `torny_pws` schema. Impersonation mirrors
-- fixtures/rls_helpers.psql, inlined so the file also runs as a rolled-back
-- probe on staging (no `\ir` there).
--
-- Run via: supabase test db   (or `npm run test:rls`)
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(37);

create schema if not exists torny_pws;

-- uid(n): fixture user n. uid(0) owns every game, uid(99) is a global admin.
create or replace function torny_pws.uid(n int) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-b482-1' || lpad(n::text, 11, '0'))::uuid
$$;
create or replace function torny_pws.gid(n int) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-b482-2' || lpad(n::text, 11, '0'))::uuid
$$;
-- rid(game, user): the request of user n in game g.
create or replace function torny_pws.rid(g int, n int) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-b482-3' || lpad(g::text, 5, '0') || lpad(n::text, 6, '0'))::uuid
$$;

create or replace function torny_pws.seed_game(
  p_n int,
  p_status text default 'scheduled',
  p_mode text default 'open',
  p_waitlist boolean default true,
  p_closed boolean default false,
  p_deadline timestamptz default null
) returns void language plpgsql as $$
  begin
    insert into public.games
      (id, name, game_mode, status, registration_mode, created_by,
       waitlist_enabled, signups_closed_at, signup_deadline, registration_cap)
    values (torny_pws.gid(p_n), 'PWS game ' || p_n, 'stableford',
            p_status::public.game_status, p_mode::public.registration_mode, torny_pws.uid(0),
            p_waitlist, case when p_closed then now() else null end, p_deadline, 3);
  end;
$$;

create or replace function torny_pws.add_players(p_game int, p_users int[]) returns void
language plpgsql as $$
  begin
    insert into public.game_players (game_id, user_id, accepted_at)
    select torny_pws.gid(p_game), torny_pws.uid(u), now() from unnest(p_users) as u;
  end;
$$;

-- request(game, user, minutes ago): a pending solo request.
create or replace function torny_pws.request(p_game int, p_user int, p_minutes_ago int)
returns void language plpgsql as $$
  begin
    insert into public.game_registration_requests (id, game_id, user_id, status, created_at)
    values (torny_pws.rid(p_game, p_user), torny_pws.gid(p_game), torny_pws.uid(p_user),
            'pending', now() - make_interval(mins => p_minutes_ago));
  end;
$$;

-- promote: the function under test as the service role, cap 3, solo seats.
-- Before 0239 it does not exist; answering keeps the red run a list of
-- failing asserts.
create or replace function torny_pws.promote(p_game int, p_user int, p_tee text default 'mens')
returns jsonb language plpgsql as $$
  begin
    return public.promote_waitlist_seat(
      p_game_id => torny_pws.gid(p_game),
      p_request_id => torny_pws.rid(p_game, p_user),
      p_cap => 3,
      p_seat_team_size => 1,
      p_tee_gender => p_tee::public.player_tee_gender);
  exception
    when undefined_function then
      return jsonb_build_object('outcome', 'function_missing');
  end;
$$;

create or replace function torny_pws.outcome(p_game int, p_user int) returns text
language sql as $$ select torny_pws.promote(p_game, p_user)->>'outcome' $$;

create or replace function torny_pws.active(p_game int) returns bigint language sql stable as $$
  select count(*) from public.game_players
   where game_id = torny_pws.gid(p_game) and withdrawn_at is null
$$;

-- patch_as(actor, game, column, value): rows a direct UPDATE with the actor's
-- JWT changed. Same impersonation as torny_rls.as_user. The ids are resolved
-- before the role switch: `authenticated` has no usage on torny_pws.
create or replace function torny_pws.patch_as(p_actor int, p_game int, p_set text)
  returns int language plpgsql as $$
  declare
    v_rows int;
    v_actor uuid := torny_pws.uid(p_actor);
    v_game uuid := torny_pws.gid(p_game);
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_actor::text, 'role', 'authenticated')::text, true);
    execute format('update public.games set %s where id = %L', p_set, v_game);
    get diagnostics v_rows = row_count;
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', null, true);
    return v_rows;
  end;
$$;

create or replace function torny_pws.sig() returns text language sql immutable as $$
  select 'public.promote_waitlist_seat(uuid, uuid, integer, integer, public.player_tee_gender)'
$$;

-- ── Seed ─────────────────────────────────────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, email)
select torny_pws.uid(n), '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated',
       'authenticated', 'pws-' || n || '@example.test'
  from (select generate_series(0, 40) as n union all select 99) as u;

insert into public.users (id, email, name, is_admin)
select id, email, 'PWS ' || email, id = torny_pws.uid(99) from auth.users
 where email like 'pws-%@example.test'
on conflict (id) do update set email = excluded.email, name = excluded.name, is_admin = excluded.is_admin;

-- Game 1: full (3 of 3), three waiting: 10 oldest, then 11, then 12.
select torny_pws.seed_game(1);
select torny_pws.add_players(1, array[1, 2, 3]);
select torny_pws.request(1, 10, 30);
select torny_pws.request(1, 11, 20);
select torny_pws.request(1, 12, 10);
-- Game 2: one free seat, two requests at the same instant: the lower id wins.
select torny_pws.seed_game(2);
select torny_pws.add_players(2, array[1, 2]);
insert into public.game_registration_requests (id, game_id, user_id, status, created_at)
values (torny_pws.rid(2, 21), torny_pws.gid(2), torny_pws.uid(21), 'pending', '2026-01-01T10:00:00Z'),
       (torny_pws.rid(2, 20), torny_pws.gid(2), torny_pws.uid(20), 'pending', '2026-01-01T10:00:00Z');
-- Game 3: one free seat; the oldest requester (22) is already on the roster.
select torny_pws.seed_game(3);
select torny_pws.add_players(3, array[1, 22]);
select torny_pws.request(3, 22, 30);
select torny_pws.request(3, 23, 10);
-- Game 4: list off. Game 5: closed by hand. Game 6: deadline passed.
-- Game 7: manual approval. Game 8: started.
select torny_pws.seed_game(4, p_waitlist => false);
select torny_pws.request(4, 10, 10);
select torny_pws.seed_game(5, p_closed => true);
select torny_pws.request(5, 10, 10);
select torny_pws.seed_game(6, p_deadline => now() - interval '1 hour');
select torny_pws.request(6, 10, 10);
select torny_pws.seed_game(7, p_mode => 'manual_approval');
select torny_pws.request(7, 10, 10);
select torny_pws.seed_game(8, p_status => 'active');
select torny_pws.request(8, 10, 10);
-- Game 9: a captain's request is not on the list.
select torny_pws.seed_game(9);
insert into public.game_registration_requests (id, game_id, user_id, status, is_team_captain, team_name)
values (torny_pws.rid(9, 10), torny_pws.gid(9), torny_pws.uid(10), 'pending', true, 'Laget');

-- ── 0. The queue itself ──────────────────────────────────────────────────────
select results_eq(
  $$ select user_id, place from public.registration_waitlist(array[torny_pws.gid(1)]) $$,
  $$ values (torny_pws.uid(10), 1), (torny_pws.uid(11), 2), (torny_pws.uid(12), 3) $$,
  'registration_waitlist: oldest first, places 1–3');
select results_eq(
  $$ select user_id, place from public.registration_waitlist(array[torny_pws.gid(3), torny_pws.gid(9)]) $$,
  $$ values (torny_pws.uid(23), 1) $$,
  'registration_waitlist: a requester on the roster and a captain are not on the list');
select ok(has_function_privilege('service_role', 'public.registration_waitlist(uuid[])', 'execute'),
  'service_role can execute registration_waitlist');
select ok(not has_function_privilege('authenticated', 'public.registration_waitlist(uuid[])', 'execute')
          and not has_function_privilege('anon', 'public.registration_waitlist(uuid[])', 'execute'),
  'authenticated and anon cannot execute registration_waitlist');

-- ── 1. The queue and the cap ─────────────────────────────────────────────────
select is(torny_pws.outcome(1, 11), 'not_first', 'second in the queue → not_first');
select is(torny_pws.outcome(1, 10), 'game_full', 'full round → game_full');
select is(torny_pws.active(1), 3::bigint, 'game_full: no row written');

-- Player 1 withdraws: one seat frees.
update public.game_players set withdrawn_at = now()
 where game_id = torny_pws.gid(1) and user_id = torny_pws.uid(1);

select is(torny_pws.promote(1, 10, 'ladies'),
  jsonb_build_object('outcome', 'ok', 'user_id', torny_pws.uid(10)),
  'first in the queue with a free seat → ok and the player');
select results_eq(
  $$ select status::text, decided_at is not null, decided_by_user_id is null
       from public.game_registration_requests where id = torny_pws.rid(1, 10) $$,
  $$ values ('approved', true, true) $$,
  'the request is approved, with a time and no decider');
select results_eq(
  $$ select team_number, flight_number, accepted_at is not null, signup_source, tee_gender::text
       from public.game_players where game_id = torny_pws.gid(1) and user_id = torny_pws.uid(10) $$,
  $$ values (null::int, null::int, true, null::text, 'ladies') $$,
  'the roster row: no team, confirmed, no source, the tee category passed in');
select is(torny_pws.active(1), 3::bigint, 'the round is at its cap again');
select is(torny_pws.outcome(1, 11), 'game_full', 'the next one in the queue finds no seat');
select is(torny_pws.outcome(1, 10), 'not_pending', 'the same request again → not_pending');
select is(torny_pws.active(1), 3::bigint, 'no second row for the seat');

-- ── Tie on created_at ────────────────────────────────────────────────────────
select is(torny_pws.outcome(2, 21), 'not_first', 'same instant: the higher id waits');
select is(torny_pws.outcome(2, 20), 'ok', 'same instant: the lower id gets the seat');

-- ── A requester already on the roster never blocks the queue ─────────────────
select is(torny_pws.outcome(3, 22), 'already_on_roster', 'requester on the roster → already_on_roster');
select is(torny_pws.outcome(3, 23), 'ok', 'the next one is first when the oldest is on the roster');
select is(torny_pws.active(3), 3::bigint, 'one row added');

-- ── 2. When nothing moves ────────────────────────────────────────────────────
select is(torny_pws.outcome(4, 10), 'waitlist_off', 'list off → waitlist_off');
select is(torny_pws.outcome(5, 10), 'signup_closed', 'closed by hand → signup_closed');
select is(torny_pws.outcome(6, 10), 'ok', 'after the deadline the list still moves up');
select is(torny_pws.outcome(7, 10), 'wrong_mode', 'manual approval → wrong_mode');
select is(torny_pws.outcome(8, 10), 'game_locked', 'started → game_locked');
select is(torny_pws.outcome(9, 10), 'not_pending', 'a captain''s request is not on the list');
select is(torny_pws.outcome(12, 10), 'game_not_found', 'missing game → game_not_found');
select is(torny_pws.active(4) + torny_pws.active(5) + torny_pws.active(7) + torny_pws.active(8) + torny_pws.active(9),
  0::bigint, 'none of the refused calls wrote a row');

-- ── 3. Who may call it ───────────────────────────────────────────────────────
select ok(case when to_regprocedure(torny_pws.sig()) is null then false
               else has_function_privilege('service_role', torny_pws.sig(), 'execute') end,
  'service_role can execute promote_waitlist_seat');
select ok(case when to_regprocedure(torny_pws.sig()) is null then false
               else not has_function_privilege('authenticated', torny_pws.sig(), 'execute') end,
  'authenticated cannot execute promote_waitlist_seat');
select ok(case when to_regprocedure(torny_pws.sig()) is null then false
               else not has_function_privilege('anon', torny_pws.sig(), 'execute') end,
  'anon cannot execute promote_waitlist_seat');

-- ── 4. The new columns ───────────────────────────────────────────────────────
select throws_ok(
  $$ update public.games set registration_cap = 1 where id = torny_pws.gid(1) $$,
  '23514', null, 'registration_cap 1 is below the CHECK');
select throws_ok(
  $$ update public.games set registration_cap = 201 where id = torny_pws.gid(1) $$,
  '23514', null, 'registration_cap 201 is above the CHECK');
select lives_ok(
  $$ update public.games set registration_cap = 200 where id = torny_pws.gid(1) $$,
  'registration_cap 200 is allowed');

-- Player 2 is on game 1's roster, so the game is visible to them, but they are
-- not its organiser.
select is(torny_pws.patch_as(2, 1, 'registration_cap = 50'), 0,
  'a player cannot PATCH registration_cap');
select is(torny_pws.patch_as(2, 1, $$signup_deadline = now() + interval '9 days'$$), 0,
  'a player cannot PATCH signup_deadline');
select is(torny_pws.patch_as(2, 1, 'waitlist_enabled = false'), 0,
  'a player cannot PATCH waitlist_enabled');
select is(torny_pws.patch_as(0, 1, 'registration_cap = 4'), 1,
  'the organiser can change registration_cap');

select * from finish();

rollback;
