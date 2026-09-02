-- supabase/tests/users_anonymize_withdrawal_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Runtime test for migration 0174 (#1909): `anonymize_user` must WITHDRAW the
-- account from everything that has not finished, in the same transaction as the
-- scrub.
--
-- Why this matters: #1909 narrows the delete block to "sole organizer of
-- something open", so an ordinary PLAYER can now delete themselves mid-round.
-- If the RPC did not withdraw them, their row would sit there as "Slettet
-- bruker" with no submission and block the organizer's endGame forever — which
-- is the exact trap the issue set out to remove.
--
-- The RPC is SECURITY DEFINER and only service_role may EXECUTE it, so this
-- suite seeds and calls as the privileged role. No impersonation needed: the
-- three game_players guards all escape on `auth.uid() is null`, which is
-- precisely the production path (the admin client carries no JWT `sub`).
--
-- Fixtures live in their own `torny_wd` schema so they cannot collide with
-- `torny_rls` (fixtures/rls_helpers.psql) — the two suites seed different
-- graphs and may run in the same session.
--
-- Run via: supabase test db   (or `npm run test:rls`)
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

-- ── Fixture ids ──────────────────────────────────────────────────────────────
create schema if not exists torny_wd;

create or replace function torny_wd.subject_id()  returns uuid language sql immutable as $$ select '00000000-0000-4000-b000-000000000001'::uuid $$; -- the player who deletes themselves
create or replace function torny_wd.organizer_id() returns uuid language sql immutable as $$ select '00000000-0000-4000-b000-000000000002'::uuid $$; -- owns everything
create or replace function torny_wd.course_id()   returns uuid language sql immutable as $$ select '00000000-0000-4000-b000-0000000000c0'::uuid $$;
create or replace function torny_wd.tee_box_id()  returns uuid language sql immutable as $$ select '00000000-0000-4000-b000-0000000000c1'::uuid $$;
create or replace function torny_wd.game_active_id()    returns uuid language sql immutable as $$ select '00000000-0000-4000-b000-00000000a001'::uuid $$;
create or replace function torny_wd.game_scheduled_id() returns uuid language sql immutable as $$ select '00000000-0000-4000-b000-00000000a002'::uuid $$;
create or replace function torny_wd.game_draft_id()     returns uuid language sql immutable as $$ select '00000000-0000-4000-b000-00000000a003'::uuid $$;
create or replace function torny_wd.game_finished_id()  returns uuid language sql immutable as $$ select '00000000-0000-4000-b000-00000000a004'::uuid $$;
create or replace function torny_wd.cup_open_id()     returns uuid language sql immutable as $$ select '00000000-0000-4000-b000-00000000b001'::uuid $$;
create or replace function torny_wd.cup_finished_id() returns uuid language sql immutable as $$ select '00000000-0000-4000-b000-00000000b002'::uuid $$;
create or replace function torny_wd.league_open_id()     returns uuid language sql immutable as $$ select '00000000-0000-4000-b000-00000000b003'::uuid $$;
create or replace function torny_wd.league_finished_id() returns uuid language sql immutable as $$ select '00000000-0000-4000-b000-00000000b004'::uuid $$;
create or replace function torny_wd.lineup_session_id() returns uuid language sql immutable as $$ select '00000000-0000-4000-b000-00000000b005'::uuid $$;

-- ── Seed ─────────────────────────────────────────────────────────────────────
-- The subject PARTICIPATES in everything but ORGANIZES nothing — that is the
-- account the narrowed rule now lets through.
insert into auth.users (id, instance_id, aud, role, email)
values
  (torny_wd.subject_id(),   '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'wd-subject@example.test'),
  (torny_wd.organizer_id(), '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'wd-organizer@example.test');

-- handle_new_auth_user already inserted matching public.users rows; stamp names.
insert into public.users (id, email, name, is_admin) values
  (torny_wd.subject_id(),   'wd-subject@example.test',   'WD Subject',   false),
  (torny_wd.organizer_id(), 'wd-organizer@example.test', 'WD Organizer', false)
on conflict (id) do update
  set email = excluded.email, name = excluded.name, is_admin = excluded.is_admin;

insert into public.courses (id, name, created_by)
  values (torny_wd.course_id(), 'WD Test Course', torny_wd.organizer_id());
insert into public.course_holes (course_id, hole_number, stroke_index, par_mens, par_ladies, par_juniors)
  select torny_wd.course_id(), h, h, 4, 4, 4 from generate_series(1, 18) as h;
insert into public.tee_boxes (id, course_id, name, slope_mens, course_rating_mens, par_total_mens)
  values (torny_wd.tee_box_id(), torny_wd.course_id(), 'White', 113, 70.0, 72);

insert into public.games (id, name, course_id, tee_box_id, status, game_mode, created_by, started_at) values
  (torny_wd.game_active_id(),    'WD Active',    torny_wd.course_id(), torny_wd.tee_box_id(), 'active',    'solo_strokeplay', torny_wd.organizer_id(), now()),
  (torny_wd.game_scheduled_id(), 'WD Scheduled', torny_wd.course_id(), torny_wd.tee_box_id(), 'scheduled', 'solo_strokeplay', torny_wd.organizer_id(), null),
  (torny_wd.game_draft_id(),     'WD Draft',     torny_wd.course_id(), torny_wd.tee_box_id(), 'draft',     'solo_strokeplay', torny_wd.organizer_id(), null),
  (torny_wd.game_finished_id(),  'WD Finished',  torny_wd.course_id(), torny_wd.tee_box_id(), 'finished',  'solo_strokeplay', torny_wd.organizer_id(), now());

insert into public.game_players (game_id, user_id, team_number, flight_number) values
  (torny_wd.game_active_id(),    torny_wd.subject_id(), 1, 1),
  (torny_wd.game_scheduled_id(), torny_wd.subject_id(), 1, 1),
  (torny_wd.game_draft_id(),     torny_wd.subject_id(), 1, 1),
  (torny_wd.game_finished_id(),  torny_wd.subject_id(), 1, 1);

-- A score in the ACTIVE game: it must SURVIVE the withdrawal (the flightmates'
-- history is not ours to rewrite).
insert into public.scores (game_id, user_id, hole_number, strokes, entered_by, client_updated_at)
  values (torny_wd.game_active_id(), torny_wd.subject_id(), 1, 5, torny_wd.subject_id(), now());

insert into public.tournaments (id, name, team_1_name, team_2_name, status, created_by) values
  (torny_wd.cup_open_id(),     'WD Open Cup',     'Europa', 'USA', 'active',   torny_wd.organizer_id()),
  (torny_wd.cup_finished_id(), 'WD Finished Cup', 'Europa', 'USA', 'finished', torny_wd.organizer_id());
insert into public.tournament_participants (tournament_id, user_id, team_number, is_captain) values
  (torny_wd.cup_open_id(),     torny_wd.subject_id(), 1, false),
  (torny_wd.cup_finished_id(), torny_wd.subject_id(), 1, false);

insert into public.leagues (id, name, season_start, season_end, standings_model, course_scope, status, created_by) values
  (torny_wd.league_open_id(),     'WD Open League',     current_date, current_date + 30, 'total', 'multi_course', 'active',   torny_wd.organizer_id()),
  (torny_wd.league_finished_id(), 'WD Finished League', current_date, current_date + 30, 'total', 'multi_course', 'finished', torny_wd.organizer_id());
insert into public.league_players (league_id, user_id) values
  (torny_wd.league_open_id(),     torny_wd.subject_id()),
  (torny_wd.league_finished_id(), torny_wd.subject_id());

-- Captain lineup seat (0172) inside the OPEN cup.
insert into public.cup_lineup_sessions (id, tournament_id, session_index, format, slot_count, created_by)
  values (torny_wd.lineup_session_id(), torny_wd.cup_open_id(), 1, 'singles_matchplay', 2, torny_wd.organizer_id());
insert into public.cup_lineup_slots (session_id, team_number, slot_index, seat, user_id)
  values (torny_wd.lineup_session_id(), 1, 1, 1, torny_wd.subject_id());

-- ── Act ──────────────────────────────────────────────────────────────────────
select public.anonymize_user(torny_wd.subject_id());

-- ── 1–3. Active game: row KEPT, marked withdrawn, by themselves ──────────────
select ok(
  exists(select 1 from public.game_players
          where game_id = torny_wd.game_active_id() and user_id = torny_wd.subject_id()),
  '#1909: active game keeps the game_players row (history is not rewritten)'
);
select isnt(
  (select withdrawn_at from public.game_players
    where game_id = torny_wd.game_active_id() and user_id = torny_wd.subject_id()),
  null,
  '#1909: active game sets withdrawn_at'
);
select is(
  (select withdrawn_by_user_id from public.game_players
    where game_id = torny_wd.game_active_id() and user_id = torny_wd.subject_id()),
  torny_wd.subject_id(),
  '#1909: withdrawn_by_user_id is the deleted account itself'
);

-- ── 4. The score in the active game survives ────────────────────────────────
select ok(
  exists(select 1 from public.scores
          where game_id = torny_wd.game_active_id() and user_id = torny_wd.subject_id()),
  '#1909: scores already entered in the active game are NOT deleted'
);

-- ── 5–6. Not-yet-started games: row REMOVED ─────────────────────────────────
select ok(
  not exists(select 1 from public.game_players
              where game_id = torny_wd.game_scheduled_id() and user_id = torny_wd.subject_id()),
  '#1909: scheduled game drops the game_players row (pre-start withdrawal)'
);
select ok(
  not exists(select 1 from public.game_players
              where game_id = torny_wd.game_draft_id() and user_id = torny_wd.subject_id()),
  '#1909: draft game drops the game_players row'
);

-- ── 7–8. Finished game: completely untouched ────────────────────────────────
select ok(
  exists(select 1 from public.game_players
          where game_id = torny_wd.game_finished_id() and user_id = torny_wd.subject_id()),
  '#1909: finished game keeps the game_players row'
);
select is(
  (select withdrawn_at from public.game_players
    where game_id = torny_wd.game_finished_id() and user_id = torny_wd.subject_id()),
  null,
  '#1909: finished game is NOT marked withdrawn'
);

-- ── 9–10. Cups: open one loses the participant, finished one keeps it ───────
select ok(
  not exists(select 1 from public.tournament_participants
              where tournament_id = torny_wd.cup_open_id() and user_id = torny_wd.subject_id()),
  '#1909: unfinished cup drops tournament_participants (no re-rostering by the wizard)'
);
select ok(
  exists(select 1 from public.tournament_participants
          where tournament_id = torny_wd.cup_finished_id() and user_id = torny_wd.subject_id()),
  '#1909: finished cup keeps tournament_participants (history)'
);

-- ── 11–12. Leagues: same split ──────────────────────────────────────────────
select ok(
  not exists(select 1 from public.league_players
              where league_id = torny_wd.league_open_id() and user_id = torny_wd.subject_id()),
  '#1909: unfinished league drops league_players'
);
select ok(
  exists(select 1 from public.league_players
          where league_id = torny_wd.league_finished_id() and user_id = torny_wd.subject_id()),
  '#1909: finished league keeps league_players (history)'
);

-- ── 13. Captain lineup seat in the open cup is freed ────────────────────────
select ok(
  not exists(select 1 from public.cup_lineup_slots
              where session_id = torny_wd.lineup_session_id() and user_id = torny_wd.subject_id()),
  '#1909: cup_lineup_slots seat in an unfinished cup is released (0172)'
);

-- ── 14. Idempotence: a second run preserves the FIRST withdrawn_at ──────────
-- The retry path (auth step failed, RPC committed) re-enters here, so a second
-- call must not move the timestamp.
create temporary table wd_first_stamp as
  select withdrawn_at from public.game_players
   where game_id = torny_wd.game_active_id() and user_id = torny_wd.subject_id();

select public.anonymize_user(torny_wd.subject_id());

select is(
  (select withdrawn_at from public.game_players
    where game_id = torny_wd.game_active_id() and user_id = torny_wd.subject_id()),
  (select withdrawn_at from wd_first_stamp),
  '#1909: re-running anonymize_user preserves the first withdrawn_at (idempotent)'
);

select * from finish();
rollback;
