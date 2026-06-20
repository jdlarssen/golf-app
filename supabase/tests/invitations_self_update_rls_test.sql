-- supabase/tests/invitations_self_update_rls_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- RLS / trigger integration test: invitations self-accept guard (#0107, #731),
-- end-to-end against real Postgres roles. Verifies migration 0107's BEFORE UPDATE
-- trigger `guard_invitations_self_update`.
--
-- The "invitations self mark accepted" RLS policy WITH CHECK only pins `email`
-- (to the caller's JWT email) and `accepted_at IS NOT NULL` — it cannot express
-- column immutability, so before 0107 an email-invited user could, in one direct
-- PostgREST PATCH on their own invitation, flip accepted_at AND overwrite
-- invited_by/game_id/token/expires_at. Rewriting `invited_by` forges
-- befriend_inviter() (PR #489 auto-vennskap), forcing a one-sided accepted
-- friendship onto a stranger.
--
--   FORBIDDEN (the invitee, via a direct PATCH on their own invitation):
--     1. set accepted_at AND overwrite invited_by → REJECTED
--     2. (sanity) invited_by is unchanged afterwards
--
--   ALLOWED (must keep working):
--     3. set accepted_at only                     → PASS (legit accept path)
--
--   Negative control:
--     4. service role bypasses the trigger        → PASS  (proves the
--        authenticated asserts above are real enforcement, not a silent bypass)
--
-- Runs as the `authenticated` role with a forged JWT `sub`+`email` claim — the
-- same runtime path the app uses. See supabase/tests/README.md for how to run.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

\ir fixtures/rls_helpers.psql

-- Seed: users + game (seed_active_game) then a pending invitation addressed to
-- outsider_id's email, invited by admin_id.
select torny_rls.as_service();
select torny_rls.seed_active_game();
select torny_rls.seed_invitation();

-- ═════════════════════════════════════════════════════════════════════════════
-- FORBIDDEN — the invitee cannot rewrite invited_by on their own invitation
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_invitee(torny_rls.outsider_id(), 'rls-outsider@example.test');

select ok(
  not torny_rls.try_invitation_rewrite_inviter(torny_rls.active_id()),
  'invitee is BLOCKED from overwriting invited_by on their own invitation (0107 guard)'
);

-- Read the row back as service (RLS-bypassed) to assert nothing was written.
select torny_rls.as_service();
select is(
  (select invited_by from public.invitations where token = 'rls-inv-token'),
  torny_rls.admin_id(),
  'invited_by is unchanged after the rewrite attempt'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- ALLOWED — the invitee may flip accepted_at only
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_invitee(torny_rls.outsider_id(), 'rls-outsider@example.test');

select ok(
  torny_rls.try_invitation_accept_only(),
  'invitee CAN set accepted_at on their own invitation (legit accept path)'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- Negative control — service role bypasses the trigger (sanity)
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_service();

select ok(
  torny_rls.try_invitation_rewrite_inviter(torny_rls.active_id()),
  'service role bypasses the guard trigger (sanity — confirms the authenticated asserts are real)'
);

select * from finish();
rollback;
