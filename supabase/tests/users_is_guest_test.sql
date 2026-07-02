-- supabase/tests/users_is_guest_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- RLS / trigger integration test: users.is_guest guard + metrics exclusion
-- (#1009, migration 0127), end-to-end against real Postgres roles.
--
-- is_guest gates the guest exclusions (club stats, key metrics, mail fan-outs)
-- and the claim flow. The "users update own" RLS policy WITH CHECK validates
-- row ownership only, never WHICH columns changed — so without the 0127
-- extension of `guard_users_self_update` any registered user could PATCH their
-- own row in or out of guest status (horizontal stats/mail manipulation, and a
-- claimed-but-unclicked guest could re-flag themselves). Only the service-role
-- app paths (guest creation, first-login clearing) and admins may flip it.
--
--   FORBIDDEN (a non-admin, via a direct PATCH on their OWN row):
--     1. set is_guest = true on own row   → REJECTED
--     2. (sanity) is_guest stays false afterwards
--     3. clear is_guest = false on own guest-row → REJECTED (claim-clearing is
--        service-role only; the guest proved mail ownership via OTP, not PATCH)
--     4. (sanity) is_guest stays true afterwards
--
--   ALLOWED (must keep working):
--     5. global admin flips another user's is_guest → PASS (admin write-path)
--     6. service role flips is_guest              → PASS (guest creation /
--        first-login clearing run through getAdminClient())
--
--   Metrics exclusion (admin_key_metrics, 0127 replace of 0126):
--     Fixture: game 1 (finished) = admin+active+flightmate+submitted (withdrawn
--     is withdrawn); game 2 (finished) = admin+active+flightmate. Flag
--     `submitted` as guest and diff the RPC output:
--     7. users_ge1 drops by exactly 1 (the guest no longer counts as a user)
--     8. users_ge2 unchanged (admin/active/flightmate still have 2 games)
--     9. gjenger_ge2 unchanged — the guest is KEPT in gjeng-fingerprints
--        (contract decision 1: uuid continuity through claim). If the guest
--        exclusion wrongly leaked into the fingerprints CTE, game 1's
--        fingerprint would collapse to game 2's set and gjenger_ge2 would
--        jump by 1 — this assert catches exactly that.
--
-- Runs as the `authenticated` role with a forged JWT `sub` claim — the same
-- runtime path the app uses. See supabase/tests/README.md for how to run.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

\ir fixtures/rls_helpers.psql

-- Seed reuses the shared rig, then finishes the game and adds a second finished
-- game whose roster differs from game 1 ONLY by the guest-to-be (`submitted`).
select torny_rls.as_service();
select torny_rls.seed_active_game();

update public.games
   set status = 'finished', ended_at = now()
 where id = torny_rls.game_id();

insert into public.games (id, name, course_id, tee_box_id, status, game_mode, created_by, started_at, ended_at)
  values ('00000000-0000-4000-a000-0000000000a1'::uuid, 'RLS Guest Metrics Game',
          torny_rls.course_id(), torny_rls.tee_box_id(), 'finished', 'solo_strokeplay',
          torny_rls.admin_id(), now(), now());

insert into public.game_players (game_id, user_id, team_number, flight_number) values
  ('00000000-0000-4000-a000-0000000000a1'::uuid, torny_rls.admin_id(),      1, 1),
  ('00000000-0000-4000-a000-0000000000a1'::uuid, torny_rls.active_id(),     1, 1),
  ('00000000-0000-4000-a000-0000000000a1'::uuid, torny_rls.flightmate_id(), 1, 1);

-- ═════════════════════════════════════════════════════════════════════════════
-- FORBIDDEN — a non-admin cannot flag themselves as guest
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.active_id());

select ok(
  not torny_rls.try_set_is_guest(torny_rls.active_id(), true),
  'non-admin user is BLOCKED from setting their OWN is_guest = true (0127 guard)'
);

select is(
  (select is_guest from public.users where id = torny_rls.active_id()),
  false,
  'is_guest stayed false after the self-flag attempt'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- FORBIDDEN — a guest cannot clear their own flag (claim-clearing is
-- service-role only)
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_service();
update public.users set is_guest = true where id = torny_rls.active_id();

select torny_rls.as_user(torny_rls.active_id());

select ok(
  not torny_rls.try_set_is_guest(torny_rls.active_id(), false),
  'guest user is BLOCKED from clearing their OWN is_guest (0127 guard, both directions)'
);

select is(
  (select is_guest from public.users where id = torny_rls.active_id()),
  true,
  'is_guest stayed true after the self-clear attempt'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- ALLOWED — admin and service role keep their write-paths
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.admin_id());

select ok(
  torny_rls.try_set_is_guest(torny_rls.active_id(), false),
  'global admin CAN flip another user''s is_guest (admin write-path preserved)'
);

select torny_rls.as_service();

select ok(
  torny_rls.try_set_is_guest(torny_rls.active_id(), false),
  'service role bypasses the guard trigger (guest creation / first-login clearing path)'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- Metrics exclusion — guests leave users_ge1/ge2 but stay in gjeng-fingerprints
-- ═════════════════════════════════════════════════════════════════════════════
-- Baseline BEFORE flagging (as admin — the RPC gate requires it). Stashed in a
-- transaction-local GUC so the diff below needs no temp objects.
select torny_rls.as_user(torny_rls.admin_id());
select set_config('torny.metrics_before', public.admin_key_metrics()::text, true);

select torny_rls.as_service();
update public.users set is_guest = true where id = torny_rls.submitted_id();

select torny_rls.as_user(torny_rls.admin_id());
select set_config('torny.metrics_after', public.admin_key_metrics()::text, true);

select is(
  (current_setting('torny.metrics_after')::jsonb ->> 'users_ge1')::int
    - (current_setting('torny.metrics_before')::jsonb ->> 'users_ge1')::int,
  -1,
  'flagging a participant as guest removes exactly 1 from users_ge1'
);

select is(
  (current_setting('torny.metrics_after')::jsonb ->> 'users_ge2')::int
    - (current_setting('torny.metrics_before')::jsonb ->> 'users_ge2')::int,
  0,
  'users_ge2 unchanged (the guest had only 1 finished game; the others keep their 2)'
);

select is(
  (current_setting('torny.metrics_after')::jsonb ->> 'gjenger_ge2')::int
    - (current_setting('torny.metrics_before')::jsonb ->> 'gjenger_ge2')::int,
  0,
  'gjenger_ge2 unchanged — guest KEPT in fingerprints (game 1 does not collapse into game 2''s set)'
);

select * from finish();
rollback;
