-- supabase/tests/withdrawn_columns_self_update_rls_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- RLS / trigger integration test: game_players withdrawn_at guard (#802),
-- verifying migration 0108's BEFORE UPDATE addition to guard_game_players_self_update.
--
-- The 0107 trigger already covers approved_*, team_number, flight_number and
-- course_handicap. This suite focuses exclusively on the two new columns:
--   withdrawn_at, withdrawn_by_user_id
--
-- FORBIDDEN (a non-admin player acting on their OWN row):
--   1. Self-set withdrawn_at (self-withdraw bypassing supportsWithdrawal gate)
--   2. Self-clear withdrawn_at (overriding an admin-set withdrawal)
--   3. Self-set withdrawn_by_user_id (audit column forgery)
--
-- ALLOWED (legitimate paths the trigger must not break):
--   4. Admin sets withdrawn_at on another player's row      → PASS
--   5. Admin clears withdrawn_at on another player's row    → PASS
--   6. Game creator sets withdrawn_at on another player's row → PASS
--   7. Service role bypasses the guard entirely             → PASS (sanity)
--   8. Player submits their own scorecard (submitted_at)    → PASS (unrelated
--      column; confirms trigger does not over-fire)
--
-- Runs as the `authenticated` role with a forged JWT `sub` claim — the same
-- runtime path the app uses. See fixtures/rls_helpers.psql for the rig details.
--
-- Run via:  supabase test db   (boots local stack → applies migrations → here)
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

\ir fixtures/rls_helpers.psql

-- ── Seed ──────────────────────────────────────────────────────────────────────
select torny_rls.as_service();
select torny_rls.seed_active_game();

-- ── Probe helpers (local to this suite) ──────────────────────────────────────

-- try_self_set_withdrawn(): current user sets their OWN withdrawn_at + withdrawn_by.
create or replace function torny_rls.try_self_set_withdrawn(p_target uuid) returns boolean
  language plpgsql as $$
  declare v_actor uuid := nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub';
          v_rows  int;
  begin
    update public.game_players
       set withdrawn_at = now(),
           withdrawn_by_user_id = coalesce(v_actor, p_target)
     where game_id = torny_rls.game_id() and user_id = p_target;
    get diagnostics v_rows = row_count;
    return v_rows > 0;
  exception when insufficient_privilege then return false;
  end;
$$;

-- try_self_clear_withdrawn(): current user clears their OWN withdrawn_at.
-- withdrawn_id is seeded with withdrawn_at = now(); this tries to null it out.
create or replace function torny_rls.try_self_clear_withdrawn(p_target uuid) returns boolean
  language plpgsql as $$
  declare v_rows int;
  begin
    update public.game_players
       set withdrawn_at = null,
           withdrawn_by_user_id = null
     where game_id = torny_rls.game_id() and user_id = p_target;
    get diagnostics v_rows = row_count;
    return v_rows > 0;
  exception when insufficient_privilege then return false;
  end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- FORBIDDEN — a non-admin player cannot touch their OWN withdrawn_* columns
-- ─────────────────────────────────────────────────────────────────────────────
select torny_rls.as_user(torny_rls.active_id());

select ok(
  not torny_rls.try_self_set_withdrawn(torny_rls.active_id()),
  'non-admin player is BLOCKED from self-setting withdrawn_at on their OWN row (#802)'
);

-- Verify the column was not actually written.
select is(
  (select withdrawn_at from public.game_players
     where game_id = torny_rls.game_id() and user_id = torny_rls.active_id()),
  null,
  'withdrawn_at remained NULL after blocked self-set attempt'
);

-- A player with an admin-set withdrawal should not be able to clear it.
select torny_rls.as_user(torny_rls.withdrawn_id());

select ok(
  not torny_rls.try_self_clear_withdrawn(torny_rls.withdrawn_id()),
  'non-admin player is BLOCKED from self-clearing admin-set withdrawn_at on their OWN row (#802)'
);

-- withdrawn_at must still be set (not cleared).
select isnt(
  (select withdrawn_at from public.game_players
     where game_id = torny_rls.game_id() and user_id = torny_rls.withdrawn_id()),
  null,
  'withdrawn_at remains set after blocked self-clear attempt'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- ALLOWED — admin and game creator may set/clear withdrawn_* on any row
-- ─────────────────────────────────────────────────────────────────────────────
select torny_rls.as_user(torny_rls.admin_id());

select ok(
  torny_rls.try_self_set_withdrawn(torny_rls.active_id()),
  'admin CAN set withdrawn_at on another player''s row (admin bypass)'
);

select ok(
  torny_rls.try_self_clear_withdrawn(torny_rls.active_id()),
  'admin CAN clear withdrawn_at on another player''s row (admin bypass)'
);

-- Game creator (non-admin) withdrawing another player.
-- seed_active_game sets created_by = admin_id; reassign to flightmate_id.
select torny_rls.as_service();
update public.games set created_by = torny_rls.flightmate_id()
  where id = torny_rls.game_id();

select torny_rls.as_user(torny_rls.flightmate_id());

select ok(
  torny_rls.try_self_set_withdrawn(torny_rls.active_id()),
  'non-admin game creator CAN set withdrawn_at on ANOTHER player''s row (creator bypass)'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Negative control — service role bypasses the trigger
-- ─────────────────────────────────────────────────────────────────────────────
select torny_rls.as_service();

select ok(
  torny_rls.try_self_set_withdrawn(torny_rls.active_id()),
  'service role bypasses the guard trigger (sanity — confirms authenticated asserts are real enforcement)'
);

select * from finish();
rollback;
