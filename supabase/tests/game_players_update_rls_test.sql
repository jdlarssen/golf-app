-- supabase/tests/game_players_update_rls_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- RLS / trigger integration test: game_players self-update guard (#670),
-- end-to-end against real Postgres roles. Verifies migration 0103's BEFORE
-- UPDATE trigger `guard_game_players_self_update`:
--
--   FORBIDDEN (a non-admin player, via a direct PATCH on their OWN row):
--     1. set approved_at on own row           → REJECTED (self-approval)
--     2. set approved_by_user_id on own row   → REJECTED (self-approval)
--     3. change course_handicap on own row    → REJECTED (post-start, active game)
--
--   ALLOWED (must keep working — the trigger no-ops, RLS governs):
--     4. set submitted_at on own row          → PASS  (submitScorecard path)
--     5. game creator approves ANOTHER's row  → PASS  (peer/creator approval)
--     6. admin sets any player's handicap     → PASS  (admin handicap adjust)
--     7. admin approves any player's row       → PASS  (admin bypass)
--
--   Negative control:
--     8. service role bypasses the trigger    → PASS  (sanity — proves the
--        authenticated asserts above are real enforcement, not silent bypass)
--
-- Runs as the `authenticated` role with a forged JWT `sub` claim — the same
-- runtime path the app uses — so the SECURITY DEFINER helpers (is_admin) and the
-- SECURITY DEFINER trigger execute exactly as in production. The seeding role
-- (postgres) BYPASSES RLS (but NOT the trigger's auth.uid()-IS-NULL escape, by
-- design), so we explicitly SET ROLE authenticated before every authenticated
-- probe.
--
-- Run via:  supabase test db   (boots local stack → applies migrations → here)
-- See supabase/tests/README.md (same rig + run-around as #440).
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

\ir fixtures/rls_helpers.psql

-- ── Seed: one ACTIVE game, five in-flight players + one outsider ──────────────
-- active_id / flightmate_id are clean (no approved_at / submitted_at), in flight 1
-- with admin_id; the game is created_by admin_id and status = 'active'.
select torny_rls.as_service();
select torny_rls.seed_active_game();

-- ═════════════════════════════════════════════════════════════════════════════
-- FORBIDDEN — a non-admin player cannot self-approve or self-edit handicap
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.active_id());

select ok(
  not torny_rls.try_self_approve(torny_rls.active_id()),
  'non-admin player is BLOCKED from setting approved_at on their OWN row (self-approval)'
);

-- approved_by_user_id is set together with approved_at by try_self_approve, so a
-- still-null approved_at after the probe proves NEITHER column was written.
select is(
  (select approved_at from public.game_players
     where game_id = torny_rls.game_id() and user_id = torny_rls.active_id()),
  null,
  'self-approval left approved_at NULL (approved_by_user_id write blocked too)'
);

select ok(
  not torny_rls.try_set_handicap(torny_rls.active_id(), 1),
  'non-admin player is BLOCKED from changing their OWN course_handicap in an active game'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- ALLOWED — legitimate paths the trigger must not break
-- ═════════════════════════════════════════════════════════════════════════════

-- 4. The submitScorecard path: a player marks their own scorecard submitted.
select ok(
  torny_rls.try_submit(torny_rls.active_id()),
  'non-admin player CAN set submitted_at on their own row (submitScorecard path)'
);

-- 5. Peer/creator approval: a non-admin GAME CREATOR approves ANOTHER player's
--    row. seed_active_game makes admin_id the creator; reassign creator to a
--    non-admin (flightmate_id) so this asserts the trigger lets a non-admin
--    through on a row that is NOT their own (NEW.user_id <> auth.uid()), with the
--    existing "game_players creator update" RLS policy granting the row access.
select torny_rls.as_service();
update public.games set created_by = torny_rls.flightmate_id()
  where id = torny_rls.game_id();

select torny_rls.as_user(torny_rls.flightmate_id());
select ok(
  torny_rls.try_self_approve(torny_rls.active_id()),
  'non-admin game creator CAN approve ANOTHER player''s row (peer-approval not self-approval)'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- ALLOWED — admin bypasses the trigger entirely
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.admin_id());

select ok(
  torny_rls.try_set_handicap(torny_rls.flightmate_id(), 12),
  'admin CAN set a player''s course_handicap (admin handicap adjustment)'
);

select ok(
  torny_rls.try_self_approve(torny_rls.flightmate_id()),
  'admin CAN approve a player''s row (admin bypass)'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- Negative control — service role bypasses the trigger (sanity)
-- ═════════════════════════════════════════════════════════════════════════════
-- The service role has no JWT sub → auth.uid() is NULL → the trigger no-ops, so
-- even a "self-approval"-shaped write lands. This proves the authenticated
-- asserts above are real enforcement (the trigger keys off auth.uid(), and the
-- privileged seeding/admin-client path is deliberately unguarded).
select torny_rls.as_service();
select ok(
  torny_rls.try_set_handicap(torny_rls.submitted_id(), 9),
  'service role bypasses the guard trigger (sanity — confirms authenticated asserts are real)'
);

select * from finish();
rollback;
