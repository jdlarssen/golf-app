-- supabase/tests/flight_scope_rls_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- RLS integration test: én-flight-regelen (#543) for can_score_for() and
-- same_flight_or_solo(), as updated in migration 0095.
--
-- Verifies the invariants from the contract:
--
--   A. Singles matchplay, 2 players on sides 1/2: cross-side WRITE allowed
--      (can_score_for) and live READ allowed (same_flight_or_solo).
--
--   B. Wolf with 5 active flightless players: cross-write allowed (wolf =
--      always one flight).
--
--   C. 6-player flightless game: cross-write DENIED (guard unchanged for >4
--      players without flight assignment in a non-wolf format).
--
--   D. 6-player game with flights (players 1–4 in flight 1, 5–6 in flight 2):
--      same-flight write ALLOWED, cross-flight write DENIED.
--
-- These run as the `authenticated` role with a forged JWT `sub` claim — the same
-- path the app uses. All four scenarios are seeded independently; each resets
-- the fixture data between scenarios.
--
-- NOTE: Requires a local Postgres with all migrations applied (migration 0095
-- must be present). See supabase/tests/README.md for how to run.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

-- 11 asserts below — the plan said 12 since the file's first commit, which
-- made every full-suite run end "Bad plan" even with all asserts green.
select plan(11);

\ir fixtures/rls_helpers.psql

-- ─────────────────────────────────────────────────────────────────────────────
-- Local helpers for flight-scope scenarios.
-- We extend the torny_rls schema with scenario-specific ids and seed helpers.
-- ─────────────────────────────────────────────────────────────────────────────

-- Well-known game id for these scenarios (distinct from the main rig's game).
create or replace function torny_rls.fs_game_id() returns uuid language sql immutable as $$
  select '00000000-0000-4000-a000-000000000fa0'::uuid
$$;

-- Six deterministic user ids for the flight-scope tests.
create or replace function torny_rls.fs_user(n int) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-a000-00000000fa' || lpad(n::text, 2, '0'))::uuid
$$;

-- Reset this scenario's fixture rows only (FK-ordered).
create or replace function torny_rls.fs_reset() returns void language plpgsql as $$
begin
  delete from public.scores       where game_id = torny_rls.fs_game_id();
  delete from public.game_players where game_id = torny_rls.fs_game_id();
  delete from public.games        where id      = torny_rls.fs_game_id();
end;
$$;

-- Ensure all six users exist in auth.users + public.users (idempotent).
create or replace function torny_rls.fs_ensure_users() returns void language plpgsql as $$
declare
  i int;
begin
  for i in 1..6 loop
    insert into auth.users (id, instance_id, aud, role, email)
      values (
        torny_rls.fs_user(i),
        '00000000-0000-0000-0000-000000000000'::uuid,
        'authenticated',
        'authenticated',
        'fs-user-' || i || '@example.test'
      )
    on conflict (id) do nothing;

    insert into public.users (id, email, name, is_admin)
      values (
        torny_rls.fs_user(i),
        'fs-user-' || i || '@example.test',
        'FS User ' || i,
        false
      )
    on conflict (id) do update
      set email = excluded.email, name = excluded.name, is_admin = excluded.is_admin;
  end loop;
end;
$$;

-- Seed an active game with the given mode and game_players rows.
-- p_players: array of (user_id, team_number, flight_number).
create or replace function torny_rls.fs_seed_game(
  p_mode text,
  p_players jsonb
) returns void language plpgsql as $$
declare
  rec jsonb;
begin
  perform torny_rls.fs_reset();
  perform torny_rls.fs_ensure_users();

  -- Reuse the main rig's course + tee (seeded by seed_active_game).
  -- We only create the game + players here; if the course/tee don't exist yet,
  -- we seed them. Use ON CONFLICT DO NOTHING since seed_active_game may have
  -- already created them.
  insert into public.courses (id, name, created_by)
    values (torny_rls.course_id(), 'RLS Test Course', torny_rls.admin_id())
  on conflict (id) do nothing;

  insert into public.course_holes (course_id, hole_number, stroke_index, par_mens, par_ladies, par_juniors)
    select torny_rls.course_id(), h, h, 4, 4, 4 from generate_series(1, 18) as h
  on conflict do nothing;

  insert into public.tee_boxes (id, course_id, name, slope_mens, course_rating_mens, par_total_mens)
    values (torny_rls.tee_box_id(), torny_rls.course_id(), 'White', 113, 70.0, 72)
  on conflict (id) do nothing;

  insert into public.games (id, name, course_id, tee_box_id, status, game_mode, created_by, started_at)
    values (
      torny_rls.fs_game_id(),
      'FS Test Game',
      torny_rls.course_id(),
      torny_rls.tee_box_id(),
      'active',
      p_mode,
      torny_rls.admin_id(),
      now()
    );

  for rec in select * from jsonb_array_elements(p_players)
  loop
    insert into public.game_players (game_id, user_id, team_number, flight_number, submitted_at, withdrawn_at)
      values (
        torny_rls.fs_game_id(),
        (rec->>'user_id')::uuid,
        (rec->>'team_number')::int,
        (rec->>'flight_number')::int,
        null,
        null
      );
  end loop;
end;
$$;

-- try_write: current impersonated user attempts to INSERT a score for p_target.
-- Returns true if allowed, false if blocked. Uses fs_game_id().
create or replace function torny_rls.fs_try_write(p_target uuid, p_hole int) returns boolean
  language plpgsql as $$
declare
  v_actor uuid := nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub';
begin
  insert into public.scores (game_id, user_id, hole_number, strokes, entered_by, client_updated_at)
    values (torny_rls.fs_game_id(), p_target, p_hole, 4, coalesce(v_actor, p_target), now());
  return true;
exception
  when insufficient_privilege then return false;
end;
$$;

-- try_read: returns true if the current user can see p_target's score in fs_game_id().
-- We probe via same_flight_or_solo() directly (avoids needing SELECT policy).
create or replace function torny_rls.fs_try_read(p_target uuid) returns boolean
  language plpgsql security definer as $$
begin
  return public.same_flight_or_solo(torny_rls.fs_game_id(), p_target);
end;
$$;

grant execute on all functions in schema torny_rls to authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- A. Singles matchplay: 2 players, sides 1/2 — cross-side WRITE + READ allowed
-- ─────────────────────────────────────────────────────────────────────────────

select torny_rls.as_service();
select torny_rls.seed_active_game();   -- ensures course + tee + admin exist

-- Ensure admin user in public.users (may already exist from seed_active_game)
insert into auth.users (id, instance_id, aud, role, email)
  values (
    torny_rls.admin_id(),
    '00000000-0000-0000-0000-000000000000'::uuid,
    'authenticated', 'authenticated', 'rls-admin@example.test'
  )
on conflict (id) do nothing;

select torny_rls.fs_seed_game(
  'singles_matchplay',
  jsonb_build_array(
    jsonb_build_object('user_id', torny_rls.fs_user(1), 'team_number', 1, 'flight_number', 1),
    jsonb_build_object('user_id', torny_rls.fs_user(2), 'team_number', 2, 'flight_number', 2)
  )
);

-- Player 1 (side 1) tries to write player 2's (side 2) score.
select torny_rls.as_user(torny_rls.fs_user(1));
select ok(
  torny_rls.fs_try_write(torny_rls.fs_user(2), 1),
  'singles matchplay: player on side 1 CAN write side-2 player''s score (2 active = single-flight)'
);
select ok(
  torny_rls.fs_try_read(torny_rls.fs_user(2)),
  'singles matchplay: player on side 1 CAN read side-2 player''s score live (single-flight)'
);

-- Player 2 (side 2) tries to write player 1's (side 1) score.
select torny_rls.as_user(torny_rls.fs_user(2));
select ok(
  torny_rls.fs_try_write(torny_rls.fs_user(1), 2),
  'singles matchplay: player on side 2 CAN write side-1 player''s score (2 active = single-flight)'
);
select ok(
  torny_rls.fs_try_read(torny_rls.fs_user(1)),
  'singles matchplay: player on side 2 CAN read side-1 player''s score live (single-flight)'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- B. Wolf with 5 active flightless players — cross-write allowed
-- ─────────────────────────────────────────────────────────────────────────────

select torny_rls.as_service();
select torny_rls.fs_seed_game(
  'wolf',
  jsonb_build_array(
    jsonb_build_object('user_id', torny_rls.fs_user(1), 'team_number', null, 'flight_number', null),
    jsonb_build_object('user_id', torny_rls.fs_user(2), 'team_number', null, 'flight_number', null),
    jsonb_build_object('user_id', torny_rls.fs_user(3), 'team_number', null, 'flight_number', null),
    jsonb_build_object('user_id', torny_rls.fs_user(4), 'team_number', null, 'flight_number', null),
    jsonb_build_object('user_id', torny_rls.fs_user(5), 'team_number', null, 'flight_number', null)
  )
);

select torny_rls.as_user(torny_rls.fs_user(1));
select ok(
  torny_rls.fs_try_write(torny_rls.fs_user(5), 3),
  'wolf 5 players: any player CAN write any other''s score (wolf = always one flight)'
);
select ok(
  torny_rls.fs_try_read(torny_rls.fs_user(5)),
  'wolf 5 players: any player CAN read any other''s score live (wolf = always one flight)'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- C. 6-player flightless non-wolf game — cross-write DENIED
-- ─────────────────────────────────────────────────────────────────────────────

select torny_rls.as_service();
select torny_rls.fs_seed_game(
  'skins',
  jsonb_build_array(
    jsonb_build_object('user_id', torny_rls.fs_user(1), 'team_number', null, 'flight_number', null),
    jsonb_build_object('user_id', torny_rls.fs_user(2), 'team_number', null, 'flight_number', null),
    jsonb_build_object('user_id', torny_rls.fs_user(3), 'team_number', null, 'flight_number', null),
    jsonb_build_object('user_id', torny_rls.fs_user(4), 'team_number', null, 'flight_number', null),
    jsonb_build_object('user_id', torny_rls.fs_user(5), 'team_number', null, 'flight_number', null),
    jsonb_build_object('user_id', torny_rls.fs_user(6), 'team_number', null, 'flight_number', null)
  )
);

select torny_rls.as_user(torny_rls.fs_user(1));
select ok(
  not torny_rls.fs_try_write(torny_rls.fs_user(6), 4),
  'skins 6 flightless players: cross-write DENIED (>4 active, no flights assigned)'
);
-- Each player CAN still write their own score.
select ok(
  torny_rls.fs_try_write(torny_rls.fs_user(1), 5),
  'skins 6 flightless players: player CAN write own score'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- D. 6-player game with flights (1,1,1,1,2,2): same-flight ALLOWED, cross DENIED
-- ─────────────────────────────────────────────────────────────────────────────

select torny_rls.as_service();
select torny_rls.fs_seed_game(
  'skins',
  jsonb_build_array(
    jsonb_build_object('user_id', torny_rls.fs_user(1), 'team_number', null, 'flight_number', 1),
    jsonb_build_object('user_id', torny_rls.fs_user(2), 'team_number', null, 'flight_number', 1),
    jsonb_build_object('user_id', torny_rls.fs_user(3), 'team_number', null, 'flight_number', 1),
    jsonb_build_object('user_id', torny_rls.fs_user(4), 'team_number', null, 'flight_number', 1),
    jsonb_build_object('user_id', torny_rls.fs_user(5), 'team_number', null, 'flight_number', 2),
    jsonb_build_object('user_id', torny_rls.fs_user(6), 'team_number', null, 'flight_number', 2)
  )
);

-- Flight 1 member writes another flight-1 member's score: ALLOWED.
select torny_rls.as_user(torny_rls.fs_user(1));
select ok(
  torny_rls.fs_try_write(torny_rls.fs_user(4), 6),
  '6-player with flights: same-flight write ALLOWED (flights 1→1)'
);

-- Flight 1 member writes a flight-2 member's score: DENIED.
select ok(
  not torny_rls.fs_try_write(torny_rls.fs_user(5), 7),
  '6-player with flights: cross-flight write DENIED (flight 1→2)'
);

-- Flight 2 member writes another flight-2 member's score: ALLOWED.
select torny_rls.as_user(torny_rls.fs_user(5));
select ok(
  torny_rls.fs_try_write(torny_rls.fs_user(6), 8),
  '6-player with flights: same-flight write ALLOWED (flights 2→2)'
);

-- Cleanup.
select torny_rls.as_service();
select torny_rls.fs_reset();

select * from finish();
rollback;
