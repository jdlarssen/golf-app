-- supabase/tests/game_registration_requests_self_update_rls_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- RLS integration test: a player withdrawing their own request to join a round
-- (#2837, «Trekk forespørselen»), end-to-end against real Postgres roles.
--
-- The app withdraws through the service role (`withdrawRequestCore`), behind its
-- own filter. A direct PostgREST PATCH meets the "game_reg_requests admin update"
-- policy from 0042 instead: the player's own row, only while it is `pending`
-- (USING), and only to `withdrawn` (WITH CHECK). This file proves that policy is
-- all a hostile client gets.
--
--   FORBIDDEN (outsider_id, via a direct PATCH):
--     1. withdraw another player's request       → REJECTED (USING: not your row)
--     2. approve their own request               → REJECTED (WITH CHECK)
--     3. reopen their own withdrawn request      → REJECTED (USING: not pending)
--     4. approve their own withdrawn request     → REJECTED (USING: not pending)
--
--   ALLOWED (must keep working):
--     5. withdraw their own pending request      → PASS
--
--   Negative control:
--     6. service role reopens the withdrawn row  → PASS (the asserts above are
--        real enforcement, not a silent bypass)
--
-- Runs as the `authenticated` role with a forged JWT `sub`. See README.md for
-- how to run.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

\ir fixtures/rls_helpers.psql

-- try_grr_set(user, status): PATCH that user's request on the fixture game to
-- `status`. True when a row changed; false on 0 rows or an RLS reject.
create or replace function torny_rls.try_grr_set(p_user uuid, p_status text) returns boolean
  language plpgsql
  as $$
  declare v_rows int;
  begin
    update public.game_registration_requests
       set status = p_status::public.registration_request_status
     where game_id = torny_rls.game_id() and user_id = p_user;
    get diagnostics v_rows = row_count;
    return v_rows > 0;
  exception
    when insufficient_privilege then return false;  -- RLS WITH CHECK reject (42501)
  end;
  $$;
grant execute on function torny_rls.try_grr_set(uuid, text) to authenticated, service_role;

-- Seed: the fixture game and users, and two waiting requests: outsider_id (the
-- attacker) and submitted_id (someone else).
select torny_rls.as_service();
select torny_rls.seed_active_game();
insert into public.game_registration_requests (game_id, user_id, status, is_team_captain)
values
  (torny_rls.game_id(), torny_rls.outsider_id(), 'pending', false),
  (torny_rls.game_id(), torny_rls.submitted_id(), 'pending', false);

-- ═════════════════════════════════════════════════════════════════════════════
-- FORBIDDEN — someone else's request, and any status but withdrawn
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.outsider_id());

select ok(
  not torny_rls.try_grr_set(torny_rls.submitted_id(), 'withdrawn'),
  'a player is BLOCKED from withdrawing another player''s request (USING)'
);

select ok(
  not torny_rls.try_grr_set(torny_rls.outsider_id(), 'approved'),
  'a player is BLOCKED from approving their own request (WITH CHECK)'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- ALLOWED — withdrawing their own waiting request
-- ═════════════════════════════════════════════════════════════════════════════
select ok(
  torny_rls.try_grr_set(torny_rls.outsider_id(), 'withdrawn'),
  'a player CAN withdraw their own pending request'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- FORBIDDEN — a withdrawn request does not come back through PostgREST
-- (the app reopens it through the service role, behind signupOffer)
-- ═════════════════════════════════════════════════════════════════════════════
select ok(
  not torny_rls.try_grr_set(torny_rls.outsider_id(), 'pending'),
  'a player is BLOCKED from reopening their own withdrawn request (USING: not pending)'
);

select ok(
  not torny_rls.try_grr_set(torny_rls.outsider_id(), 'approved'),
  'a player is BLOCKED from approving their own withdrawn request'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- Negative control — the service role bypasses RLS (sanity)
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_service();

select ok(
  torny_rls.try_grr_set(torny_rls.outsider_id(), 'pending'),
  'service role reopens the withdrawn request (sanity: the asserts above are real enforcement)'
);

select * from finish();
rollback;
