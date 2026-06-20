-- supabase/tests/group_join_requests_self_update_rls_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- RLS / trigger integration test: group_join_requests self-withdraw guard
-- (#0107, #731), end-to-end against real Postgres roles. Verifies migration
-- 0107's BEFORE UPDATE trigger `guard_group_join_requests_self_update`.
--
-- The "group_join_requests admin update" policy WITH CHECK only forces
-- status='withdrawn' on the self branch, leaving decided_by_user_id/decided_at/
-- message writable — so a requester could falsify the decision-audit record
-- (attribute the decision to a group admin) while withdrawing. The legit decision
-- path is decide_join_request() run by a group admin.
--
--   FORBIDDEN (the requester, via a direct PATCH on their own request):
--     1. withdraw AND forge decided_by_user_id → REJECTED (audit forgery)
--     2. self-approve (status='approved')      → REJECTED (RLS WITH CHECK)
--
--   ALLOWED (must keep working):
--     3. withdraw (status-only change)         → PASS  (legit self-withdraw)
--     4. group admin (non-global-admin) decides → PASS  (is_group_admin bypass)
--
--   Negative control:
--     5. service role bypasses the trigger     → PASS  (proves the authenticated
--        asserts above are real enforcement, not a silent bypass)
--
-- The club is owned by flightmate_id (is_admin = FALSE), so assert 4 exercises the
-- is_group_admin bypass in isolation from the global-admin bypass. Runs as the
-- `authenticated` role with a forged JWT `sub`. See README.md for how to run.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

\ir fixtures/rls_helpers.psql

-- Seed: users (seed_active_game) + a club owned by flightmate_id with a pending
-- join request from outsider_id.
select torny_rls.as_service();
select torny_rls.seed_active_game();
select torny_rls.seed_group_join();

-- ═════════════════════════════════════════════════════════════════════════════
-- FORBIDDEN — the requester cannot forge the decision record or self-approve
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.outsider_id());

select ok(
  not torny_rls.try_gjr_set('withdrawn', torny_rls.admin_id()),
  'requester is BLOCKED from forging decided_by_user_id on self-withdraw (0107 guard)'
);

select ok(
  not torny_rls.try_gjr_set('approved', null),
  'requester is BLOCKED from self-approving their own join request (RLS WITH CHECK)'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- ALLOWED — the requester may withdraw (status only)
-- ═════════════════════════════════════════════════════════════════════════════
select ok(
  torny_rls.try_gjr_set('withdrawn', null),
  'requester CAN withdraw their own request (status-only change)'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- ALLOWED — a non-global-admin GROUP ADMIN decides (is_group_admin bypass)
-- ═════════════════════════════════════════════════════════════════════════════
-- Reset the request to pending first (the withdraw above committed within the tx).
select torny_rls.as_service();
select torny_rls.seed_group_join();

select torny_rls.as_user(torny_rls.flightmate_id());
select ok(
  torny_rls.try_gjr_set('approved', torny_rls.flightmate_id()),
  'group admin (non-global-admin) CAN decide the request (is_group_admin bypass)'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- Negative control — service role bypasses the trigger (sanity)
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_service();

select ok(
  torny_rls.try_gjr_set('rejected', torny_rls.admin_id()),
  'service role bypasses the guard trigger (sanity — confirms the authenticated asserts are real)'
);

select * from finish();
rollback;
