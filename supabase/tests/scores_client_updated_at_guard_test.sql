-- supabase/tests/scores_client_updated_at_guard_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- RLS / trigger integration test: scores.client_updated_at monotonicity guard
-- (#803), verifying migration 0109's BEFORE UPDATE trigger guard_scores_self_update.
--
-- FORBIDDEN (any non-admin, non-service-role write):
--   1. Roll client_updated_at BACKWARD (non-monotonic)
--   2. Set client_updated_at to the far future (> now() + 5 min) — poisoning
--
-- ALLOWED (must keep working — trigger must not produce false positives):
--   3. Normal UPDATE with client_updated_at = now()            → PASS
--   4. UPDATE with client_updated_at = now() - 1 second       → PASS (past-ish, monotonic vs seed)
--   5. UPDATE with client_updated_at = now() + 4 minutes      → PASS (within tolerance)
--   6. Admin UPDATE with client_updated_at = far future (2099) → PASS (admin bypass)
--   7. Service role UPDATE with client_updated_at = far future → PASS (service bypass)
--
-- All score probes reuse the existing torny_rls.seed_score() helper to pre-seed
-- a row, then attempt an UPDATE — matching exactly how upsert_score_if_newer
-- operates at runtime.
--
-- Run via:  supabase test db   (boots local stack → applies migrations → here)
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

\ir fixtures/rls_helpers.psql

-- ── Seed ──────────────────────────────────────────────────────────────────────
select torny_rls.as_service();
select torny_rls.seed_active_game();

-- Pre-seed score rows for each test hole (service role, bypasses RLS/trigger).
-- Holes 10–16 are unused by other suites running in the same local stack session.
select torny_rls.seed_score(torny_rls.active_id(), 10);  -- hole 10: backward test
select torny_rls.seed_score(torny_rls.active_id(), 11);  -- hole 11: far-future test
select torny_rls.seed_score(torny_rls.active_id(), 12);  -- hole 12: now() pass
select torny_rls.seed_score(torny_rls.active_id(), 13);  -- hole 13: near-future pass
select torny_rls.seed_score(torny_rls.active_id(), 14);  -- hole 14: admin bypass
select torny_rls.seed_score(torny_rls.active_id(), 15);  -- hole 15: service bypass

-- ── Local probe helpers ────────────────────────────────────────────────────────

-- try_update_score_ts(target, hole, ts): UPDATE a score with a specific
-- client_updated_at value. Returns TRUE if the UPDATE applied, FALSE if blocked.
create or replace function torny_rls.try_update_score_ts(
  p_target uuid, p_hole int, p_ts timestamptz
) returns boolean
  language plpgsql as $$
  declare
    v_actor uuid := nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub';
    v_rows  int;
  begin
    update public.scores
       set strokes = 5,
           entered_by = coalesce(v_actor, p_target),
           client_updated_at = p_ts
     where game_id = torny_rls.game_id()
       and user_id = p_target
       and hole_number = p_hole;
    get diagnostics v_rows = row_count;
    return v_rows > 0;
  exception when insufficient_privilege then return false;
  end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- FORBIDDEN — non-admin writes that violate the monotonicity / future guard
-- ─────────────────────────────────────────────────────────────────────────────
select torny_rls.as_user(torny_rls.active_id());

-- 1. Non-monotonic: seed set client_updated_at = now(); going backward is blocked.
--    Use now() - interval '1 hour' to be clearly below the seed value.
select ok(
  not torny_rls.try_update_score_ts(torny_rls.active_id(), 10, now() - interval '1 hour'),
  'non-admin player is BLOCKED from rolling client_updated_at backward (non-monotonic, #803)'
);

-- 2. Far-future poisoning: 2099 is 73 years ahead — well beyond the 5-min tolerance.
select ok(
  not torny_rls.try_update_score_ts(torny_rls.active_id(), 11, '2099-01-01 00:00:00+00'::timestamptz),
  'non-admin player is BLOCKED from setting client_updated_at to far future / LWW poisoning (#803)'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- ALLOWED — legitimate writes the trigger must not break
-- ─────────────────────────────────────────────────────────────────────────────

-- 3. Normal update: now() is monotonic vs seed (seed was set at the start of
--    the transaction) and is not in the future — should pass.
select ok(
  torny_rls.try_update_score_ts(torny_rls.active_id(), 12, now()),
  'non-admin player CAN update score with client_updated_at = now() (normal offline sync path)'
);

-- 4. Near-future within tolerance: now() + 4 minutes < now() + 5 minutes → PASS.
select ok(
  torny_rls.try_update_score_ts(torny_rls.active_id(), 13, now() + interval '4 minutes'),
  'non-admin player CAN update score with client_updated_at within 5-minute clock-skew tolerance'
);

-- 5. Admin bypass: admin may write any timestamp including far future.
select torny_rls.as_user(torny_rls.admin_id());

select ok(
  torny_rls.try_update_score_ts(torny_rls.active_id(), 14, '2099-01-01 00:00:00+00'::timestamptz),
  'admin CAN set client_updated_at to far future (admin bypass of guard_scores_self_update)'
);

-- 6. Service role bypass: no JWT → trigger no-ops.
select torny_rls.as_service();

select ok(
  torny_rls.try_update_score_ts(torny_rls.active_id(), 15, '2099-01-01 00:00:00+00'::timestamptz),
  'service role CAN set client_updated_at to far future (service-role bypass, sanity)'
);

-- 7. Confirm the far-future write from test 2 was actually blocked (the stored
--    value should still be the original seed value, not 2099).
select isnt(
  (select client_updated_at from public.scores
     where game_id = torny_rls.game_id()
       and user_id = torny_rls.active_id()
       and hole_number = 11),
  '2099-01-01 00:00:00+00'::timestamptz,
  'client_updated_at on hole 11 is NOT 2099 — far-future poisoning was blocked'
);

select * from finish();
rollback;
