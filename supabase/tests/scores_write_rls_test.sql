-- supabase/tests/scores_write_rls_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- RLS integration test: scores write-policies, end-to-end against real Postgres
-- roles (#440). Verifies the write invariants from #387 / migration 0073:
--
--   1. An active, not-withdrawn, not-submitted player CAN write (insert + update)
--      their OWN scores AND their FLIGHT-mate's scores.
--   2. A WITHDRAWN player (game_players.withdrawn_at set) is BLOCKED from
--      insert AND update of their scores.
--   3. A SUBMITTED player (game_players.submitted_at set) is BLOCKED from
--      insert AND update of their scores.
--   4. ADMIN bypasses — can write any player's scores.
--
-- Plus negative controls that the rig is genuinely enforcing RLS rather than
-- waving everything through: an OUTSIDER (not in the game) is blocked.
--
-- This runs as the `authenticated` role with a forged JWT `sub` claim — the same
-- runtime path the app uses — so the SECURITY DEFINER helpers (is_admin,
-- same_flight, is_in_game) execute exactly as in production. The seeding role
-- (postgres) BYPASSES RLS, so we explicitly SET ROLE authenticated before every
-- probe; that is what makes a passing assert meaningful.
--
-- Run via:  supabase test db   (boots local stack → applies migrations → here)
-- See supabase/tests/README.md.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- pgTAP is bundled with the local stack; `supabase test db` normally installs it
-- before running, but creating it here first keeps the file runnable on its own
-- via psql too. Idempotent — harmless if already present.
create extension if not exists pgtap with schema extensions;

select plan(19);

-- Pull in the reusable seed + impersonation primitives (#412/#414 reuse these).
\ir fixtures/rls_helpers.psql

-- ── Seed: one active game, five in-flight players + one outsider ──────────────
select torny_rls.as_service();
select torny_rls.seed_active_game();

-- Pre-seed score rows the UPDATE probes will try to mutate (one hole each,
-- distinct from the INSERT-probe holes so nothing collides on the unique index).
select torny_rls.seed_score(torny_rls.active_id(),     10);  -- active's own
select torny_rls.seed_score(torny_rls.flightmate_id(), 11);  -- flightmate's (active updates it)
select torny_rls.seed_score(torny_rls.withdrawn_id(),  12);  -- withdrawn's
select torny_rls.seed_score(torny_rls.submitted_id(),  13);  -- submitted's

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. Active, clean player CAN write own + flight scores
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.active_id());

select ok(
  torny_rls.try_insert_score(torny_rls.active_id(), 1),
  'active player CAN insert own score'
);
select ok(
  torny_rls.try_insert_score(torny_rls.flightmate_id(), 2),
  'active player CAN insert flight-mate score'
);
select ok(
  torny_rls.try_update_score(torny_rls.active_id(), 10),
  'active player CAN update own score'
);
select ok(
  torny_rls.try_update_score(torny_rls.flightmate_id(), 11),
  'active player CAN update flight-mate score'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. Withdrawn player is BLOCKED (insert + update), for self and via others
-- ═════════════════════════════════════════════════════════════════════════════

-- The withdrawn player themself cannot write their own scores.
select torny_rls.as_user(torny_rls.withdrawn_id());
select ok(
  not torny_rls.try_insert_score(torny_rls.withdrawn_id(), 3),
  'withdrawn player is BLOCKED from inserting own score'
);
select ok(
  not torny_rls.try_update_score(torny_rls.withdrawn_id(), 12),
  'withdrawn player is BLOCKED from updating own score'
);

-- An active flight-mate also cannot write the withdrawn player's scores
-- (the block keys off the TARGET's withdrawn_at, not the actor).
select torny_rls.as_user(torny_rls.active_id());
select ok(
  not torny_rls.try_insert_score(torny_rls.withdrawn_id(), 4),
  'flight-mate is BLOCKED from inserting a withdrawn target''s score'
);
select ok(
  not torny_rls.try_update_score(torny_rls.withdrawn_id(), 12),
  'flight-mate is BLOCKED from updating a withdrawn target''s score'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. Submitted player is BLOCKED (insert + update), for self and via others
-- ═════════════════════════════════════════════════════════════════════════════

select torny_rls.as_user(torny_rls.submitted_id());
select ok(
  not torny_rls.try_insert_score(torny_rls.submitted_id(), 5),
  'submitted player is BLOCKED from inserting own score'
);
select ok(
  not torny_rls.try_update_score(torny_rls.submitted_id(), 13),
  'submitted player is BLOCKED from updating own score'
);

select torny_rls.as_user(torny_rls.active_id());
select ok(
  not torny_rls.try_insert_score(torny_rls.submitted_id(), 6),
  'flight-mate is BLOCKED from inserting a submitted target''s score'
);
select ok(
  not torny_rls.try_update_score(torny_rls.submitted_id(), 13),
  'flight-mate is BLOCKED from updating a submitted target''s score'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. Admin bypasses — can write any player, including withdrawn + submitted
-- ═════════════════════════════════════════════════════════════════════════════

select torny_rls.as_user(torny_rls.admin_id());
select ok(
  torny_rls.try_insert_score(torny_rls.active_id(), 7),
  'admin CAN insert another player''s score'
);
select ok(
  torny_rls.try_insert_score(torny_rls.withdrawn_id(), 8),
  'admin bypasses the withdrawn block (insert)'
);
select ok(
  torny_rls.try_insert_score(torny_rls.submitted_id(), 9),
  'admin bypasses the submitted block (insert)'
);
select ok(
  torny_rls.try_update_score(torny_rls.withdrawn_id(), 12),
  'admin bypasses the withdrawn block (update)'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- Negative controls — prove RLS is actually on (not silently bypassed)
-- ═════════════════════════════════════════════════════════════════════════════

-- An outsider (not a game_player) cannot write any score in this game.
select torny_rls.as_user(torny_rls.outsider_id());
select ok(
  not torny_rls.try_insert_score(torny_rls.active_id(), 14),
  'outsider is BLOCKED from inserting into this game'
);
select ok(
  not torny_rls.try_insert_score(torny_rls.outsider_id(), 15),
  'outsider is BLOCKED from inserting their own score (not a participant)'
);

-- Sanity: confirm the seeding role really does bypass RLS, so we know the
-- `authenticated` results above are the meaningful ones.
select torny_rls.as_service();
select ok(
  torny_rls.try_insert_score(torny_rls.withdrawn_id(), 16),
  'service role bypasses RLS (sanity — confirms authenticated asserts are real)'
);

select * from finish();
rollback;
