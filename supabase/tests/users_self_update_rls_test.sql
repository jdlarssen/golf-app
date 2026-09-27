-- supabase/tests/users_self_update_rls_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- RLS / trigger integration test: users.is_admin self-promotion guard (#0107),
-- end-to-end against real Postgres roles. Verifies migration 0107's BEFORE UPDATE
-- trigger `guard_users_self_update`, and the users.email lock added in 0185
-- (#2207, asserts 5–8).
--
-- The "users update own" RLS policy WITH CHECK is (is_admin() OR id = auth.uid()):
-- it validates row ownership only, never WHICH columns changed, and `authenticated`
-- holds an UPDATE grant on is_admin. Before 0107 there was no trigger on
-- public.users, so any registered user could PATCH their own row to is_admin = true
-- and inherit the full global-admin cascade (vertical privilege escalation). The
-- guard blocks a non-admin from changing is_admin while leaving every other
-- self-edit (name, hcp_index, …) and the admin write-path untouched.
--
--   FORBIDDEN (a non-admin, via a direct PATCH on their OWN row):
--     1. set is_admin = true on own row       → REJECTED (privilege escalation)
--     2. (sanity) is_admin stays false afterwards
--
--   ALLOWED (must keep working):
--     3. global admin sets another user's is_admin → PASS (admin write-path)
--
--   Negative control:
--     4. service role bypasses the trigger     → PASS  (proves the authenticated
--        assert above is real enforcement, not a silent bypass)
--
--   users.email (0185, #2207) — the address is an identity key for club
--   invitations and invite lookups, and the app never lets a player change it:
--     5. non-admin changes own email           → 42501
--     6. (sanity) own email unchanged afterwards (read as the service role)
--     7. global admin changes another user's email → PASS
--     8. service role changes a user's email   → PASS
--
-- Runs as the `authenticated` role with a forged JWT `sub` claim — the same
-- runtime path the app uses. See supabase/tests/README.md for how to run.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

\ir fixtures/rls_helpers.psql

-- Seed reuses the shared rig: admin_id (is_admin = true) + active_id/outsider_id
-- (is_admin = false) all exist in auth.users + public.users.
select torny_rls.as_service();
select torny_rls.seed_active_game();

-- su_try_set_email(target, email): the current impersonated user UPDATEs
-- target's email. Returns whether a row was updated (42501 → false).
create or replace function torny_rls.su_try_set_email(p_target uuid, p_email text) returns boolean
  language plpgsql
  as $$
  declare v_rows int;
  begin
    update public.users set email = p_email where id = p_target;
    get diagnostics v_rows = row_count;
    return v_rows > 0;
  exception
    when insufficient_privilege then return false;  -- 0185 trigger 42501 or RLS reject
  end;
  $$;

grant execute on all functions in schema torny_rls to authenticated, anon, service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- FORBIDDEN — a non-admin cannot self-promote to global admin
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.active_id());

select ok(
  not torny_rls.try_set_is_admin(torny_rls.active_id(), true),
  'non-admin user is BLOCKED from setting their OWN is_admin = true (0107 privilege-escalation guard)'
);

select is(
  (select is_admin from public.users where id = torny_rls.active_id()),
  false,
  'is_admin stayed false after the self-promotion attempt'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- ALLOWED — a global admin may still manage another user's is_admin
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.admin_id());

select ok(
  torny_rls.try_set_is_admin(torny_rls.active_id(), true),
  'global admin CAN set another user''s is_admin (admin write-path preserved)'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- Negative control — service role bypasses the trigger (sanity)
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_service();

select ok(
  torny_rls.try_set_is_admin(torny_rls.outsider_id(), true),
  'service role bypasses the guard trigger (sanity — confirms the authenticated assert is real)'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- users.email (0185) — only admins and the service role change it
-- ═════════════════════════════════════════════════════════════════════════════
-- flightmate_id, submitted_id and withdrawn_id: asserts 3 and 4 above made
-- active_id and outsider_id admins.
select torny_rls.as_user(torny_rls.flightmate_id());

select throws_ok(
  $$ update public.users set email = 'rls-flightmate-new@example.test' where id = torny_rls.flightmate_id() $$,
  '42501',
  null,
  'non-admin user is BLOCKED from changing their OWN email (0185)'
);

-- Separate statement, read as the service role: since 0186 authenticated cannot
-- select the column at all.
select torny_rls.as_service();

select is(
  (select email from public.users where id = torny_rls.flightmate_id()),
  'rls-flightmate@example.test',
  'own email stayed unchanged after the attempt'
);

select torny_rls.as_user(torny_rls.admin_id());

select ok(
  torny_rls.su_try_set_email(torny_rls.submitted_id(), 'rls-submitted-new@example.test'),
  'global admin CAN change another user''s email (admin player page preserved)'
);

select torny_rls.as_service();

select ok(
  torny_rls.su_try_set_email(torny_rls.withdrawn_id(), 'rls-withdrawn-new@example.test'),
  'service role changes email (claim flow preserved)'
);

select * from finish();
rollback;
