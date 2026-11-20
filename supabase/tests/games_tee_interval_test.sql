-- supabase/tests/games_tee_interval_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Start time per flight (#2451, migration 0243): games.tee_interval_minutes and
-- the new kind 'tee_time_changed'.
--
--   1. the organiser sets 12 minutes on their own round              → ok
--   2. …and it is stored
--   3. an outsider PATCHes the interval (hostile PATCH, #440)         → 0 rows
--   4. …and the value is unchanged
--   5. the organiser PATCHes 9 (games_tee_interval_minutes_choices)   → 23514
--   6. the organiser sets it back to NULL (everyone out together)     → ok
--   7. …and it is stored
--   8. a player inserts a tee_time_changed varsel to another player   → 42501
--   9. the service role inserts one (the kind CHECK knows it)         → ok
--
-- Every probe and its check are separate statements (#1910).
-- Depends on 0243. Run via: supabase test db (see supabase/tests/README.md)
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

\ir fixtures/rls_helpers.psql

-- ── Scenario-local fixtures (ti_ = tee interval) ──────────────────────────────
create or replace function torny_rls.ti_game() returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-245100000001'::uuid $$;

-- security definer: reads past RLS.
create or replace function torny_rls.ti_interval_of(p_game uuid) returns smallint
  language sql security definer set search_path = '' as $$
    select tee_interval_minutes from public.games where id = p_game;
$$;

grant execute on all functions in schema torny_rls to authenticated, anon, service_role;

-- ── Seed ──────────────────────────────────────────────────────────────────────
-- active_id organises a scheduled round with 10 minutes between the flights.
select torny_rls.as_service();
select torny_rls.seed_active_game();

insert into public.games (id, name, course_id, tee_box_id, status, game_mode, created_by,
                          scheduled_tee_off_at, tee_interval_minutes) values
  (torny_rls.ti_game(), 'TI round', torny_rls.course_id(), torny_rls.tee_box_id(),
   'scheduled', 'solo_strokeplay', torny_rls.active_id(), now() + interval '1 day', 10);

-- ═════════════════════════════════════════════════════════════════════════════
-- tee_interval_minutes: the organiser's choice, nobody else's
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.active_id());

select lives_ok(
  $$ update public.games set tee_interval_minutes = 12 where id = torny_rls.ti_game() $$,
  'the organiser CAN set the interval on their own round'
);

select torny_rls.as_service();

select is(torny_rls.ti_interval_of(torny_rls.ti_game()), 12::smallint,
  'the organiser''s interval is stored');

select torny_rls.as_user(torny_rls.outsider_id());

select lives_ok(
  $$ update public.games set tee_interval_minutes = 8 where id = torny_rls.ti_game() $$,
  'an outsider''s PATCH runs without error (RLS matches 0 rows)'
);

select torny_rls.as_service();

select is(torny_rls.ti_interval_of(torny_rls.ti_game()), 12::smallint,
  'the outsider''s PATCH left the interval at 12');

select torny_rls.as_user(torny_rls.active_id());

select throws_ok(
  $$ update public.games set tee_interval_minutes = 9 where id = torny_rls.ti_game() $$,
  '23514', null,
  'only 8, 10 or 12 minutes (games_tee_interval_minutes_choices)'
);

select lives_ok(
  $$ update public.games set tee_interval_minutes = null where id = torny_rls.ti_game() $$,
  'the organiser CAN set the interval back to NULL'
);

select torny_rls.as_service();

select is(torny_rls.ti_interval_of(torny_rls.ti_game()), null::smallint,
  'NULL is stored: every group goes out at the tee-off');

-- ═════════════════════════════════════════════════════════════════════════════
-- tee_time_changed: written by the server only
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.active_id());

select throws_ok(
  $$ insert into public.notifications (user_id, kind, payload)
     values (torny_rls.flightmate_id(), 'tee_time_changed',
             jsonb_build_object('game_id', torny_rls.ti_game(), 'game_name', 'TI round',
                                'tee_off_at', '2026-11-22T08:10:00.000Z')) $$,
  '42501', null,
  'a player cannot write a tee_time_changed varsel to another player (no insert policy)'
);

select torny_rls.as_service();

select lives_ok(
  $$ insert into public.notifications (user_id, kind, payload)
     values (torny_rls.flightmate_id(), 'tee_time_changed',
             jsonb_build_object('game_id', torny_rls.ti_game(), 'game_name', 'TI round',
                                'tee_off_at', '2026-11-22T08:10:00.000Z')) $$,
  'the service role writes a tee_time_changed varsel'
);

select * from finish();
rollback;
