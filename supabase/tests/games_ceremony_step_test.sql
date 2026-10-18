-- supabase/tests/games_ceremony_step_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- games.ceremony_step (#2298, migration 0211): the prize-giving step the
-- organiser drives from the phone and the big screen reads.
--
--   1. the CHECK refuses 5                                           → 23514
--   2. the CHECK refuses −1                                          → 23514
--   3. the creator sets the step on their own game                   → ok
--   4. …and it is stored
--   5. an outsider PATCHes the creator's game (hostile PATCH, #440)  → 0 rows
--   6. …and the step is unchanged
--   7. a player who is not the creator PATCHes the admin's game      → 0 rows
--   8. …and that game's step is still null
--
-- Every probe and its check are separate statements (#1910).
-- Depends on 0211. Run via: supabase test db (see supabase/tests/README.md)
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

\ir fixtures/rls_helpers.psql

-- ── Scenario-local fixtures (cs_ = ceremony step) ─────────────────────────────
create or replace function torny_rls.cs_game() returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-229800000101'::uuid $$;

-- security definer: reads past RLS.
create or replace function torny_rls.cs_step_of(p_game uuid) returns smallint
  language sql security definer set search_path = '' as $$
    select ceremony_step from public.games where id = p_game;
$$;

grant execute on all functions in schema torny_rls to authenticated, anon, service_role;

-- ── Seed ──────────────────────────────────────────────────────────────────────
-- seed_active_game() makes the admin's game; active_id gets a finished game
-- of their own.
select torny_rls.as_service();
select torny_rls.seed_active_game();

insert into public.games (id, name, course_id, tee_box_id, status, game_mode, created_by, started_at, ended_at) values
  (torny_rls.cs_game(), 'CS own game', torny_rls.course_id(), torny_rls.tee_box_id(),
   'finished', 'stableford', torny_rls.active_id(), now() - interval '4 hours', now());

-- ═════════════════════════════════════════════════════════════════════════════
-- The CHECK mirrors CEREMONY_MAX_STEP
-- ═════════════════════════════════════════════════════════════════════════════
select throws_ok(
  $$ update public.games set ceremony_step = 5 where id = torny_rls.cs_game() $$,
  '23514', null,
  'the CHECK refuses step 5 (side prizes + three places = 4)'
);

select throws_ok(
  $$ update public.games set ceremony_step = -1 where id = torny_rls.cs_game() $$,
  '23514', null,
  'the CHECK refuses a negative step'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- The creator drives it; nobody else can
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.active_id());

select lives_ok(
  $$ update public.games set ceremony_step = 2 where id = torny_rls.cs_game() $$,
  'the creator CAN set the step on their own finished game'
);

select torny_rls.as_service();

select is(torny_rls.cs_step_of(torny_rls.cs_game()), 2::smallint,
  'the creator''s step is stored');

select torny_rls.as_user(torny_rls.outsider_id());

select lives_ok(
  $$ update public.games set ceremony_step = 4 where id = torny_rls.cs_game() $$,
  'an outsider''s PATCH runs without error (RLS matches 0 rows)'
);

select torny_rls.as_service();

select is(torny_rls.cs_step_of(torny_rls.cs_game()), 2::smallint,
  'the outsider''s PATCH left the step unchanged');

select torny_rls.as_user(torny_rls.active_id());

select lives_ok(
  $$ update public.games set ceremony_step = 1 where id = torny_rls.game_id() $$,
  'a player who did not create the game PATCHes it without error (0 rows)'
);

select torny_rls.as_service();

select is(torny_rls.cs_step_of(torny_rls.game_id()), null::smallint,
  'the player''s PATCH left the admin''s game without a step');

select * from finish();
rollback;
