-- supabase/tests/scores_finished_tournament_select_rls_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- RLS integration test: the finished-tournament branch of
-- `scores select gating per mode` (#1550, migration 0161).
--
-- Invariant under test: a participant of a FINISHED tournament may read the
-- scores of EVERY match in that tournament — also the matches they sat out —
-- while nothing else widens:
--
--   (a) cup participant reads a finished match he did NOT play        → >0 rows
--   (b) stranger (not in the tournament) reads the same match         → 0 rows
--   (c) cup participant, ACTIVE tournament, match he is not in        → 0 rows
--       (the spoiler guard in the cup presentation must survive)
--   (d) plain game with tournament_id NULL                            → 0 rows
--       (unchanged — own/flight branches keep governing)
--
-- Runs as the `authenticated` role with a forged JWT `sub` claim, the same
-- runtime path the app uses, so `is_participant_of_finished_tournament` and the
-- sibling SECURITY DEFINER helpers execute exactly as in production. The seeding
-- role (postgres) BYPASSES RLS, hence the explicit SET ROLE before every probe.
--
-- Run via:  supabase test db   (boots local stack → applies migrations → here)
-- See supabase/tests/README.md.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

\ir fixtures/rls_helpers.psql

-- ─────────────────────────────────────────────────────────────────────────────
-- Scenario-local fixtures (ft_ = finished tournament). Distinct ids from the
-- main rig so reset() never collides with these rows.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function torny_rls.ft_tournament(n int) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-a000-f7000000' || lpad(n::text, 4, '0'))::uuid
$$;

create or replace function torny_rls.ft_game(n int) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-a000-f7100000' || lpad(n::text, 4, '0'))::uuid
$$;

create or replace function torny_rls.ft_user(n int) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-a000-f7200000' || lpad(n::text, 4, '0'))::uuid
$$;

-- Tear down this scenario's rows, FK-ordered.
create or replace function torny_rls.ft_reset() returns void language plpgsql as $$
declare i int;
begin
  for i in 1..4 loop
    delete from public.scores       where game_id = torny_rls.ft_game(i);
    delete from public.game_players where game_id = torny_rls.ft_game(i);
    delete from public.games        where id      = torny_rls.ft_game(i);
  end loop;
  delete from public.tournament_participants
    where tournament_id in (torny_rls.ft_tournament(1), torny_rls.ft_tournament(2));
  delete from public.tournaments
    where id in (torny_rls.ft_tournament(1), torny_rls.ft_tournament(2));
  for i in 1..5 loop
    delete from public.users where id = torny_rls.ft_user(i);
    delete from auth.users  where id = torny_rls.ft_user(i);
  end loop;
end;
$$;

-- Full seed. Service role only.
--
--   tournament 1 — FINISHED, participants u1 u2 u3 u4
--     game 1: u1 + u2 (finished)   ← the match u1 played
--     game 2: u3 + u4 (finished)   ← the match u1 sat out  (the NEW case)
--   tournament 2 — ACTIVE, participants u1 u3 u4
--     game 3: u3 + u4 (finished)   ← a played match in a RUNNING cup (spoiler)
--   no tournament
--     game 4: u3 + u4 (finished)   ← plain game, tournament_id NULL
--   u5 is a stranger: a real user, in no tournament and no game.
create or replace function torny_rls.ft_seed() returns void language plpgsql as $$
declare i int;
begin
  perform torny_rls.ft_reset();

  for i in 1..5 loop
    insert into auth.users (id, instance_id, aud, role, email)
      values (torny_rls.ft_user(i), '00000000-0000-0000-0000-000000000000'::uuid,
              'authenticated', 'authenticated', 'ft-user-' || i || '@example.test')
    on conflict (id) do nothing;
    insert into public.users (id, email, name, is_admin)
      values (torny_rls.ft_user(i), 'ft-user-' || i || '@example.test', 'FT User ' || i, false)
    on conflict (id) do update
      set email = excluded.email, name = excluded.name, is_admin = excluded.is_admin;
  end loop;

  -- Course + tee come from the main rig (seed_active_game ran first); re-insert
  -- defensively so this seed also stands alone.
  insert into public.courses (id, name, created_by)
    values (torny_rls.course_id(), 'RLS Test Course', torny_rls.admin_id())
  on conflict (id) do nothing;
  insert into public.course_holes (course_id, hole_number, stroke_index, par_mens, par_ladies, par_juniors)
    select torny_rls.course_id(), h, h, 4, 4, 4 from generate_series(1, 18) as h
  on conflict do nothing;
  insert into public.tee_boxes (id, course_id, name, slope_mens, course_rating_mens, par_total_mens)
    values (torny_rls.tee_box_id(), torny_rls.course_id(), 'White', 113, 70.0, 72)
  on conflict (id) do nothing;

  -- tournaments.status is text with CHECK in ('draft','active','finished');
  -- every other NOT NULL column carries a default (verified against live
  -- staging 2026-08-14).
  insert into public.tournaments (id, name, team_1_name, team_2_name, status, created_by) values
    (torny_rls.ft_tournament(1), 'FT Finished Cup', 'Europa', 'USA', 'finished', torny_rls.admin_id()),
    (torny_rls.ft_tournament(2), 'FT Active Cup',   'Europa', 'USA', 'active',   torny_rls.admin_id());

  insert into public.tournament_participants (tournament_id, user_id) values
    (torny_rls.ft_tournament(1), torny_rls.ft_user(1)),
    (torny_rls.ft_tournament(1), torny_rls.ft_user(2)),
    (torny_rls.ft_tournament(1), torny_rls.ft_user(3)),
    (torny_rls.ft_tournament(1), torny_rls.ft_user(4)),
    (torny_rls.ft_tournament(2), torny_rls.ft_user(1)),
    (torny_rls.ft_tournament(2), torny_rls.ft_user(3)),
    (torny_rls.ft_tournament(2), torny_rls.ft_user(4));

  -- game_mode must satisfy the 0111 games_game_mode_check; solo_strokeplay is
  -- the fixture-proven slug and the SELECT policy never reads the mode.
  insert into public.games (id, name, course_id, tee_box_id, status, game_mode, created_by, started_at, tournament_id) values
    (torny_rls.ft_game(1), 'FT Match 1', torny_rls.course_id(), torny_rls.tee_box_id(),
     'finished', 'solo_strokeplay', torny_rls.admin_id(), now(), torny_rls.ft_tournament(1)),
    (torny_rls.ft_game(2), 'FT Match 2', torny_rls.course_id(), torny_rls.tee_box_id(),
     'finished', 'solo_strokeplay', torny_rls.admin_id(), now(), torny_rls.ft_tournament(1)),
    (torny_rls.ft_game(3), 'FT Match 3', torny_rls.course_id(), torny_rls.tee_box_id(),
     'finished', 'solo_strokeplay', torny_rls.admin_id(), now(), torny_rls.ft_tournament(2)),
    (torny_rls.ft_game(4), 'FT Plain',   torny_rls.course_id(), torny_rls.tee_box_id(),
     'finished', 'solo_strokeplay', torny_rls.admin_id(), now(), null);

  insert into public.game_players (game_id, user_id, team_number, flight_number) values
    (torny_rls.ft_game(1), torny_rls.ft_user(1), 1, 1),
    (torny_rls.ft_game(1), torny_rls.ft_user(2), 2, 1),
    (torny_rls.ft_game(2), torny_rls.ft_user(3), 1, 1),
    (torny_rls.ft_game(2), torny_rls.ft_user(4), 2, 1),
    (torny_rls.ft_game(3), torny_rls.ft_user(3), 1, 1),
    (torny_rls.ft_game(3), torny_rls.ft_user(4), 2, 1),
    (torny_rls.ft_game(4), torny_rls.ft_user(3), 1, 1),
    (torny_rls.ft_game(4), torny_rls.ft_user(4), 2, 1);

  -- Two score rows per game — enough for an exact-count assert.
  insert into public.scores (game_id, user_id, hole_number, strokes, entered_by, client_updated_at) values
    (torny_rls.ft_game(1), torny_rls.ft_user(1), 1, 4, torny_rls.ft_user(1), now()),
    (torny_rls.ft_game(1), torny_rls.ft_user(2), 1, 5, torny_rls.ft_user(2), now()),
    (torny_rls.ft_game(2), torny_rls.ft_user(3), 1, 4, torny_rls.ft_user(3), now()),
    (torny_rls.ft_game(2), torny_rls.ft_user(4), 1, 5, torny_rls.ft_user(4), now()),
    (torny_rls.ft_game(3), torny_rls.ft_user(3), 2, 4, torny_rls.ft_user(3), now()),
    (torny_rls.ft_game(3), torny_rls.ft_user(4), 2, 5, torny_rls.ft_user(4), now()),
    (torny_rls.ft_game(4), torny_rls.ft_user(3), 3, 4, torny_rls.ft_user(3), now()),
    (torny_rls.ft_game(4), torny_rls.ft_user(4), 3, 5, torny_rls.ft_user(4), now());
end;
$$;

-- How many score rows the CURRENT role/JWT can actually see. SECURITY INVOKER
-- on purpose — a definer probe would run as the owner and bypass RLS, which is
-- the one thing this file exists to measure.
create or replace function torny_rls.ft_visible_scores(p_game uuid) returns int
  language sql stable as $$
  select count(*)::int from public.scores where game_id = p_game;
$$;

grant execute on all functions in schema torny_rls to authenticated, anon, service_role;

select torny_rls.as_service();
select torny_rls.seed_active_game();  -- course + tee + admin
select torny_rls.ft_seed();

-- ═════════════════════════════════════════════════════════════════════════════
-- (a) Cup participant, FINISHED cup
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.ft_user(1));

select cmp_ok(
  torny_rls.ft_visible_scores(torny_rls.ft_game(1)), '>', 0,
  '#1550 control: cup participant sees scores in the match he PLAYED'
);
select cmp_ok(
  torny_rls.ft_visible_scores(torny_rls.ft_game(2)), '>', 0,
  '#1550: cup participant sees scores in a finished match he did NOT play'
);
select is(
  torny_rls.ft_visible_scores(torny_rls.ft_game(2)), 2,
  '#1550: he sees ALL rows in that match, not a partial slice'
);
select ok(
  public.is_participant_of_finished_tournament(torny_rls.ft_game(2)),
  '#1550: helper is TRUE for a match in a finished tournament he takes part in'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- (c) Same reader, ACTIVE cup — the spoiler guard must hold
-- ═════════════════════════════════════════════════════════════════════════════
select is(
  torny_rls.ft_visible_scores(torny_rls.ft_game(3)), 0,
  '#1550: ACTIVE tournament — participant sees NOTHING in a match he is not in (spoiler guard)'
);
select ok(
  not public.is_participant_of_finished_tournament(torny_rls.ft_game(3)),
  '#1550: helper is FALSE while the tournament is still active'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- (d) Plain game, tournament_id NULL — unchanged
-- ═════════════════════════════════════════════════════════════════════════════
select is(
  torny_rls.ft_visible_scores(torny_rls.ft_game(4)), 0,
  '#1550: game without tournament_id is unchanged — non-participant sees 0'
);
select ok(
  not public.is_participant_of_finished_tournament(torny_rls.ft_game(4)),
  '#1550: helper is FALSE when the game has no tournament_id'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- (b) Stranger — in no tournament, in no game
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.ft_user(5));

select is(
  torny_rls.ft_visible_scores(torny_rls.ft_game(2)), 0,
  '#1550: stranger sees 0 rows in the finished cup match'
);
select is(
  torny_rls.ft_visible_scores(torny_rls.ft_game(1)), 0,
  '#1550: stranger sees 0 rows in every match of the cup, not just one'
);
select ok(
  not public.is_participant_of_finished_tournament(torny_rls.ft_game(2)),
  '#1550: helper is FALSE for a reader outside the tournament'
);

-- Sanity: the seeding role really does bypass RLS, so the asserts above are the
-- meaningful ones.
select torny_rls.as_service();
select cmp_ok(
  torny_rls.ft_visible_scores(torny_rls.ft_game(2)), '>', 0,
  'service role bypasses RLS (sanity — confirms the authenticated asserts are real)'
);

select torny_rls.ft_reset();

select * from finish();
rollback;
