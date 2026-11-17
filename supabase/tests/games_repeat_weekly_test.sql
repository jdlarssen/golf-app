-- supabase/tests/games_repeat_weekly_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- «Gjenta hver uke» (#2460, migration 0240): games.repeat_weekly and the
-- server-owned link games.repeated_from_game_id.
--
--   1. the organiser turns repeat_weekly on for their own round      → ok
--   2. …and it is stored
--   3. an outsider PATCHes repeat_weekly (hostile PATCH, #440)       → 0 rows
--   4. …and the value is unchanged
--   5. the organiser PATCHes repeated_from_game_id                   → 42501
--   6. the organiser inserts a round with repeated_from_game_id      → 42501
--   7. the service role links a successor                            → ok
--   8. a second successor for the same round                         → 23505
--   9. repeat_weekly on a cup match (games_repeat_weekly_standalone) → 23514
--  10. the organiser deletes the round the successor came from       → ok
--  11. …and ON DELETE SET NULL cleared the successor's link
--
-- Every probe and its check are separate statements (#1910).
-- Depends on 0240. Run via: supabase test db (see supabase/tests/README.md)
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

\ir fixtures/rls_helpers.psql

-- ── Scenario-local fixtures (rw_ = repeat weekly) ─────────────────────────────
create or replace function torny_rls.rw_source()    returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-246000000001'::uuid $$;
create or replace function torny_rls.rw_next()      returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-246000000002'::uuid $$;
create or replace function torny_rls.rw_other()     returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-246000000003'::uuid $$;
create or replace function torny_rls.rw_forged()    returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-246000000004'::uuid $$;
create or replace function torny_rls.rw_cup()       returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-246000000005'::uuid $$;
create or replace function torny_rls.rw_cup_match() returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-246000000006'::uuid $$;

-- security definer: reads past RLS.
create or replace function torny_rls.rw_repeat_of(p_game uuid) returns boolean
  language sql security definer set search_path = '' as $$
    select repeat_weekly from public.games where id = p_game;
$$;

create or replace function torny_rls.rw_link_of(p_game uuid) returns uuid
  language sql security definer set search_path = '' as $$
    select repeated_from_game_id from public.games where id = p_game;
$$;

grant execute on all functions in schema torny_rls to authenticated, anon, service_role;

-- ── Seed ──────────────────────────────────────────────────────────────────────
-- active_id organises a finished round (rw_source), a scheduled round that
-- will be its successor (rw_next) and a second scheduled round (rw_other).
-- admin_id owns a cup with one match.
select torny_rls.as_service();
select torny_rls.seed_active_game();

insert into public.games (id, name, course_id, tee_box_id, status, game_mode, created_by, started_at, ended_at, repeat_weekly) values
  (torny_rls.rw_source(), 'RW source', torny_rls.course_id(), torny_rls.tee_box_id(),
   'finished', 'stableford', torny_rls.active_id(), now() - interval '4 hours', now(), true),
  (torny_rls.rw_next(), 'RW next', torny_rls.course_id(), torny_rls.tee_box_id(),
   'scheduled', 'stableford', torny_rls.active_id(), null, null, true),
  (torny_rls.rw_other(), 'RW other', torny_rls.course_id(), torny_rls.tee_box_id(),
   'scheduled', 'stableford', torny_rls.active_id(), null, null, false);

insert into public.tournaments (id, name, team_1_name, team_2_name, status, created_by) values
  (torny_rls.rw_cup(), 'RW Cup', 'Europa', 'USA', 'active', torny_rls.admin_id());

insert into public.games (id, name, course_id, tee_box_id, status, game_mode, created_by, tournament_id) values
  (torny_rls.rw_cup_match(), 'RW cup match', torny_rls.course_id(), torny_rls.tee_box_id(),
   'scheduled', 'singles_matchplay', torny_rls.admin_id(), torny_rls.rw_cup());

-- ═════════════════════════════════════════════════════════════════════════════
-- repeat_weekly: the organiser's switch, nobody else's
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.active_id());

select lives_ok(
  $$ update public.games set repeat_weekly = true where id = torny_rls.rw_other() $$,
  'the organiser CAN turn repeat_weekly on for their own round'
);

select torny_rls.as_service();

select is(torny_rls.rw_repeat_of(torny_rls.rw_other()), true,
  'the organiser''s switch is stored');

select torny_rls.as_user(torny_rls.outsider_id());

select lives_ok(
  $$ update public.games set repeat_weekly = false where id = torny_rls.rw_other() $$,
  'an outsider''s PATCH runs without error (RLS matches 0 rows)'
);

select torny_rls.as_service();

select is(torny_rls.rw_repeat_of(torny_rls.rw_other()), true,
  'the outsider''s PATCH left the switch on');

-- ═════════════════════════════════════════════════════════════════════════════
-- repeated_from_game_id: server-owned
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.active_id());

select throws_ok(
  $$ update public.games set repeated_from_game_id = torny_rls.rw_source() where id = torny_rls.rw_other() $$,
  '42501', null,
  'the organiser cannot link their own round to another round'
);

select throws_ok(
  $$ insert into public.games (id, name, course_id, tee_box_id, status, game_mode, created_by, repeated_from_game_id)
     values (torny_rls.rw_forged(), 'RW forged', torny_rls.course_id(), torny_rls.tee_box_id(),
             'scheduled', 'stableford', torny_rls.active_id(), torny_rls.rw_source()) $$,
  '42501', null,
  'the organiser cannot insert a round with a link'
);

select torny_rls.as_service();

select lives_ok(
  $$ update public.games set repeated_from_game_id = torny_rls.rw_source() where id = torny_rls.rw_next() $$,
  'the service role links the successor'
);

select throws_ok(
  $$ update public.games set repeated_from_game_id = torny_rls.rw_source() where id = torny_rls.rw_other() $$,
  '23505', null,
  'a round gets at most one successor (the unique link)'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- games_repeat_weekly_standalone
-- ═════════════════════════════════════════════════════════════════════════════
select throws_ok(
  $$ update public.games set repeat_weekly = true where id = torny_rls.rw_cup_match() $$,
  '23514', null,
  'a cup match cannot repeat weekly'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- ON DELETE SET NULL passes the guard
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.active_id());

select lives_ok(
  $$ delete from public.games where id = torny_rls.rw_source() $$,
  'the organiser can delete the round a successor came from'
);

select torny_rls.as_service();

select is(torny_rls.rw_link_of(torny_rls.rw_next()), null::uuid,
  'deleting the source cleared the successor''s link');

select * from finish();
rollback;
