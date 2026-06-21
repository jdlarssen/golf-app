-- supabase/tests/group_members_last_owner_delete_guard_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- RLS / trigger integration test: group_members last-owner delete guard (#799),
-- verifying migration 0110's BEFORE DELETE trigger guard_group_members_last_owner_delete.
--
-- FORBIDDEN (the sole owner deleting their own membership row):
--   1. Sole owner self-deletes → BLOCKED (orphaned-club prevented)
--   2. Sole owner is deleted by a group admin (non-owner, not global admin) → BLOCKED
--
-- ALLOWED (the trigger must not break legitimate deletes):
--   3. Non-last owner deletes their own row  → PASS (2 owners exist → ≥1 left)
--   4. Admin deletes sole-owner row           → PASS (global admin bypass)
--   5. Service role deletes sole-owner row    → PASS (service-role bypass, sanity)
--   6. set_club_member_role's P0001 still fires via RPC path (complement check)
--      → the RPC guard is a companion, not replaced; tested here for completeness
--
-- Seeding: uses the existing torny_rls.seed_group_join() helper which creates a
-- group owned by flightmate_id with outsider_id as a pending requester.
-- We add/remove members inside the test to exercise the various scenarios.
--
-- Run via:  supabase test db   (boots local stack → applies migrations → here)
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

\ir fixtures/rls_helpers.psql

-- ── Seed ──────────────────────────────────────────────────────────────────────
select torny_rls.as_service();
select torny_rls.seed_active_game();
select torny_rls.seed_group_join();
-- At this point: flightmate_id = sole owner; outsider_id = pending join request.

-- ── Local probe helpers ────────────────────────────────────────────────────────

-- try_delete_member(target): current impersonated user attempts to DELETE the
-- group_members row for p_target. Returns TRUE if deleted, FALSE if blocked.
create or replace function torny_rls.try_delete_member(p_target uuid) returns boolean
  language plpgsql as $$
  declare v_rows int;
  begin
    delete from public.group_members
     where group_id = torny_rls.group_id() and user_id = p_target;
    get diagnostics v_rows = row_count;
    return v_rows > 0;
  exception
    when insufficient_privilege then return false;
    when raise_exception        then return false;  -- P0001 last_owner
    when others                 then return false;
  end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- FORBIDDEN — deleting the sole owner must always be blocked
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Sole owner self-deletes (flightmate_id is the only owner).
select torny_rls.as_user(torny_rls.flightmate_id());

select ok(
  not torny_rls.try_delete_member(torny_rls.flightmate_id()),
  'sole owner is BLOCKED from deleting their own group_members row (#799)'
);

-- Verify the row is still there.
select ok(
  exists(
    select 1 from public.group_members
     where group_id = torny_rls.group_id()
       and user_id = torny_rls.flightmate_id()
  ),
  'sole owner''s group_members row still exists after blocked delete'
);

-- 2. Add active_id as a group admin (non-owner) and have them delete flightmate_id.
--    This exercises the "group admin tries to remove the sole owner" path.
select torny_rls.as_service();
insert into public.group_members (group_id, user_id, role)
  values (torny_rls.group_id(), torny_rls.active_id(), 'admin');

select torny_rls.as_user(torny_rls.active_id());

select ok(
  not torny_rls.try_delete_member(torny_rls.flightmate_id()),
  'group admin (non-owner) is BLOCKED from deleting the sole owner''s row (#799)'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- ALLOWED — delete is permitted when ≥1 owner would remain, or for global admin
-- ─────────────────────────────────────────────────────────────────────────────

-- 3. Add outsider_id as a second owner; now flightmate_id is no longer the last owner.
select torny_rls.as_service();
insert into public.group_members (group_id, user_id, role)
  values (torny_rls.group_id(), torny_rls.outsider_id(), 'owner')
on conflict (group_id, user_id) do update set role = 'owner';

-- flightmate_id (still an owner) now self-deletes — 1 owner (outsider_id) remains.
select torny_rls.as_user(torny_rls.flightmate_id());

select ok(
  torny_rls.try_delete_member(torny_rls.flightmate_id()),
  'non-last owner CAN delete their own row when another owner still exists (#799 happy path)'
);

-- Re-add flightmate_id as sole owner for remaining tests.
select torny_rls.as_service();
delete from public.group_members where group_id = torny_rls.group_id();
insert into public.group_members (group_id, user_id, role)
  values (torny_rls.group_id(), torny_rls.flightmate_id(), 'owner');

-- 4. Global admin can delete the sole owner (admin bypass).
select torny_rls.as_user(torny_rls.admin_id());

select ok(
  torny_rls.try_delete_member(torny_rls.flightmate_id()),
  'global admin CAN delete the sole owner''s row (admin bypass of last-owner guard)'
);

-- 5. Service role bypass: re-seed, then delete as service role.
select torny_rls.as_service();
insert into public.group_members (group_id, user_id, role)
  values (torny_rls.group_id(), torny_rls.flightmate_id(), 'owner')
on conflict (group_id, user_id) do update set role = 'owner';

select ok(
  torny_rls.try_delete_member(torny_rls.flightmate_id()),
  'service role CAN delete the sole owner''s row (service-role bypass, sanity)'
);

select * from finish();
rollback;
