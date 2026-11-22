-- supabase/tests/group_join_requests_requester_timestamps_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- RLS / trigger integration test for migration 0255: a club join request's
-- timestamps are the server's, not the requester's. The owner's «Etter 7
-- dager» counts the wait from decided_at (lib/clubs/joinRequestCooldown.ts),
-- so a requester must not be able to backdate a row or withdraw without a
-- close time.
--
--   HOSTILE (the requester, via direct PostgREST writes):
--     1. backdated INSERT with forged decision columns → created_at = now(),
--        decided_at / decided_by_user_id null
--     2. created_at PATCH on a pending row             → REJECTED (RLS WITH
--        CHECK pins status = 'withdrawn' on the self branch)
--     3. self-withdraw that also backdates created_at  → created_at kept,
--        decided_at = now(), decided_by_user_id = the requester
--     4. forged decided_by_user_id on withdraw         → REJECTED (0107 rule,
--        unchanged)
--
--   Negative control:
--     5. service role still writes created_at          → PASS (bypass)
--
-- Runs as the `authenticated` role with a forged JWT `sub`. The club is owned
-- by flightmate_id (not a global admin); outsider_id is the requester.
-- See README.md for how to run.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

\ir fixtures/rls_helpers.psql

select torny_rls.as_service();
select torny_rls.seed_active_game();
select torny_rls.seed_group_join();
-- seed_group_join() leaves a pending request from outsider_id; start without it.
delete from public.group_join_requests
 where group_id = torny_rls.group_id() and user_id = torny_rls.outsider_id();

select torny_rls.as_user(torny_rls.outsider_id());

-- 1. Backdated insert with forged decision columns.
insert into public.group_join_requests (group_id, user_id, status, created_at, decided_at, decided_by_user_id)
  values (torny_rls.group_id(), torny_rls.outsider_id(), 'pending',
          '2000-01-01', '2000-01-01', torny_rls.flightmate_id());

select ok(
  (select created_at > now() - interval '1 minute' and decided_at is null and decided_by_user_id is null
     from public.group_join_requests
    where group_id = torny_rls.group_id() and user_id = torny_rls.outsider_id()),
  'requester INSERT: created_at is forced to now() and the decision columns are cleared (0255)'
);

-- 2. created_at PATCH on a pending row.
select throws_ok(
  $$ update public.group_join_requests set created_at = '2000-01-01'
      where group_id = torny_rls.group_id() and user_id = torny_rls.outsider_id() $$,
  '42501',
  null,
  'requester cannot PATCH created_at on a pending request (RLS WITH CHECK)'
);

-- 4 before 3: the forged withdraw must be refused while the row is pending.
select ok(
  not torny_rls.try_gjr_set('withdrawn', torny_rls.flightmate_id()),
  'requester is still BLOCKED from forging decided_by_user_id on self-withdraw (0107 rule kept)'
);

-- 3. Self-withdraw that also backdates created_at.
update public.group_join_requests
   set status = 'withdrawn', created_at = '2000-01-01'
 where group_id = torny_rls.group_id() and user_id = torny_rls.outsider_id();

select ok(
  (select status = 'withdrawn'
          and created_at > now() - interval '1 minute'
          and decided_at > now() - interval '1 minute'
          and decided_by_user_id = torny_rls.outsider_id()
     from public.group_join_requests
    where group_id = torny_rls.group_id() and user_id = torny_rls.outsider_id()),
  'requester self-withdraw: created_at kept, decided_at = now(), decided_by_user_id = requester (0255)'
);

-- 5. Negative control: the service role is not touched by the guards.
select torny_rls.as_service();
update public.group_join_requests set created_at = '2000-01-01'
 where group_id = torny_rls.group_id() and user_id = torny_rls.outsider_id();

select ok(
  (select created_at < '2001-01-01'
     from public.group_join_requests
    where group_id = torny_rls.group_id() and user_id = torny_rls.outsider_id()),
  'service role still writes created_at (bypass — confirms the authenticated asserts are real)'
);

select * from finish();
rollback;
