-- supabase/tests/scores_putts_backfill_rls_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- RLS / trigger integration test: post-finish putt back-fill (#1290 del B),
-- verifying migration 0148's permissive UPDATE policy
-- «scores backfill own putts when finished» + the BEFORE UPDATE column guard
-- guard_scores_finished_putts_only.
--
-- The freeze this opens: after a game is finished, the base
-- «scores update by flight» policy refuses every non-admin write (it requires an
-- active game). 0148 adds a narrow crack — a player may change ONLY putts, ONLY
-- on their own rows, ONLY while the game is finished, ONLY if not withdrawn.
--
-- ALLOWED (must work):
--   1. Owner updates putts on own row of a finished game            → PASS
--   7. Service role changes strokes on a finished game (ops bypass) → PASS
--   8. Normal active-game flight update still works (trigger no-op) → PASS
--
-- FORBIDDEN (must be blocked — trigger 42501 or policy 0-rows):
--   2. Owner changes strokes on a finished game                     → BLOCKED (guard)
--   3. Owner changes entered_by on a finished game                  → BLOCKED (guard allowlist)
--   4. A flight-mate back-fills the OWNER's putts (not own row)     → BLOCKED (policy USING)
--   5. A withdrawn player back-fills their own putts                → BLOCKED (policy not-withdrawn)
--   6. Admin changes strokes on a finished game (admin tightened)   → BLOCKED (guard)
--
-- Reuses the shared torny_rls fixtures. seed_active_game() builds the graph as an
-- ACTIVE game; scores are seeded via the service-role seed_score() (RLS-bypassed),
-- then the game is flipped to 'finished' so the back-fill path is exercised.
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

-- Pre-seed score rows (service role bypasses RLS + the guard). entered_by =
-- flightmate on the owner's rows so the "foreign entered_by" back-fill case is
-- real (a flight-mate typed the strokes; the owner still owns the putts).
select torny_rls.seed_score(torny_rls.active_id(), 1);   -- putts-allowed
select torny_rls.seed_score(torny_rls.active_id(), 2);   -- strokes-blocked
select torny_rls.seed_score(torny_rls.active_id(), 3);   -- entered_by-blocked
select torny_rls.seed_score(torny_rls.active_id(), 4);   -- foreign-row-blocked
select torny_rls.seed_score(torny_rls.withdrawn_id(), 5);-- withdrawn-blocked
select torny_rls.seed_score(torny_rls.active_id(), 6);   -- admin-strokes-blocked
select torny_rls.seed_score(torny_rls.flightmate_id(), 7);-- active-game passthrough

-- Re-stamp the owner rows so entered_by is the flight-mate, not the owner.
update public.scores set entered_by = torny_rls.flightmate_id()
  where game_id = torny_rls.game_id()
    and user_id = torny_rls.active_id()
    and hole_number in (1, 2, 3, 4, 6);

-- ── Local probe helpers ─────────────────────────────────────────────────────────
-- try_backfill_putts(target, hole): current user sets ONLY putts on target's row.
create or replace function torny_rls.try_backfill_putts(p_target uuid, p_hole int) returns boolean
  language plpgsql as $$
  declare v_rows int;
  begin
    update public.scores set putts = 2
     where game_id = torny_rls.game_id() and user_id = p_target and hole_number = p_hole;
    get diagnostics v_rows = row_count;
    return v_rows > 0;
  exception when insufficient_privilege then return false;
  end;
$$;

-- try_change_strokes(target, hole): current user changes strokes on target's row.
-- Re-stamps entered_by like the shared try_update_score() helper
-- (fixtures/rls_helpers.psql) does — required to satisfy the base "scores
-- update by flight" policy's WITH CHECK (entered_by = auth.uid() or is_admin())
-- when the actor differs from the row's current entered_by (e.g. a flight-mate
-- write, or the service-role ops-bypass case).
create or replace function torny_rls.try_change_strokes(p_target uuid, p_hole int) returns boolean
  language plpgsql as $$
  declare
    v_actor uuid := nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub';
    v_rows int;
  begin
    update public.scores set strokes = 9, entered_by = coalesce(v_actor, p_target)
     where game_id = torny_rls.game_id() and user_id = p_target and hole_number = p_hole;
    get diagnostics v_rows = row_count;
    return v_rows > 0;
  exception when insufficient_privilege then return false;
  end;
$$;

-- try_change_entered_by(target, hole): current user rewrites entered_by (a hijack).
create or replace function torny_rls.try_change_entered_by(p_target uuid, p_hole int) returns boolean
  language plpgsql as $$
  declare
    v_actor uuid := nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub';
    v_rows int;
  begin
    update public.scores set entered_by = v_actor
     where game_id = torny_rls.game_id() and user_id = p_target and hole_number = p_hole;
    get diagnostics v_rows = row_count;
    return v_rows > 0;
  exception when insufficient_privilege then return false;
  end;
$$;

-- ── ACTIVE-game passthrough (before flipping to finished) ──────────────────────
-- The guard must no-op on active games: a same-flight player updating a flight-
-- mate's strokes the normal way still works.
select torny_rls.as_user(torny_rls.active_id());
select ok(
  torny_rls.try_change_strokes(torny_rls.flightmate_id(), 7),
  'ACTIVE game: same-flight strokes update still works (0148 guard no-ops on active games)'
);

-- ── Flip the game to finished ──────────────────────────────────────────────────
select torny_rls.as_service();
update public.games set status = 'finished' where id = torny_rls.game_id();

-- ── ALLOWED ─────────────────────────────────────────────────────────────────────
select torny_rls.as_user(torny_rls.active_id());
select ok(
  torny_rls.try_backfill_putts(torny_rls.active_id(), 1),
  'owner CAN back-fill putts on own row of a finished game (#1290)'
);

-- ── FORBIDDEN — column guard ─────────────────────────────────────────────────────
select ok(
  not torny_rls.try_change_strokes(torny_rls.active_id(), 2),
  'owner is BLOCKED from changing strokes on a finished game (column guard)'
);
select ok(
  not torny_rls.try_change_entered_by(torny_rls.active_id(), 3),
  'owner is BLOCKED from changing entered_by on a finished game (column-guard allowlist)'
);

-- ── FORBIDDEN — policy (not own row) ─────────────────────────────────────────────
select torny_rls.as_user(torny_rls.flightmate_id());
select ok(
  not torny_rls.try_backfill_putts(torny_rls.active_id(), 4),
  'a flight-mate is BLOCKED from back-filling the OWNER''s putts (policy: own row only)'
);

-- ── FORBIDDEN — policy (withdrawn) ───────────────────────────────────────────────
select torny_rls.as_user(torny_rls.withdrawn_id());
select ok(
  not torny_rls.try_backfill_putts(torny_rls.withdrawn_id(), 5),
  'a withdrawn player is BLOCKED from back-filling their own putts (policy: not withdrawn)'
);

-- ── FORBIDDEN — admin tightened to putts-only on finished games ──────────────────
select torny_rls.as_user(torny_rls.admin_id());
select ok(
  not torny_rls.try_change_strokes(torny_rls.active_id(), 6),
  'admin is BLOCKED from changing strokes on a finished game (0148 tightens admin to putts-only)'
);

-- ── ALLOWED — service role bypass (ops fixes) ────────────────────────────────────
select torny_rls.as_service();
select ok(
  torny_rls.try_change_strokes(torny_rls.active_id(), 6),
  'service role CAN change strokes on a finished game (ops-fix bypass, auth.uid() IS NULL)'
);

select * from finish();
rollback;
