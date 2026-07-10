-- supabase/tests/security_definer_hardening_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Catalog-based test for migration 0104 (#671):
--   1. email_is_in_auth_users has NO EXECUTE grant to `anon` (revoked by 0104)
--   2. email_is_in_auth_users STILL has EXECUTE grant to `authenticated` (no regression)
--   3. email_is_invited          STILL has EXECUTE grant to `anon` (login gate must not break)
--   4–7. The 4 hardened RLS helpers all have SET search_path in their prosrc /
--        pg_proc.proconfig — verified via information_schema + pg_proc.
--        (same_flight was one of the original 5; dropped in 0139 / #1129.)
--
-- These tests assert catalog state only — no runtime seed required, no role
-- impersonation needed. They will fail if 0104 has not been applied, and pass
-- once it has. Run via: supabase test db
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

-- ── 1. email_is_in_auth_users: anon must NOT have EXECUTE ─────────────────────
select ok(
  not exists(
    select 1
    from information_schema.role_routine_grants
    where routine_schema  = 'public'
      and routine_name    = 'email_is_in_auth_users'
      and grantee         = 'anon'
      and privilege_type  = 'EXECUTE'
  ),
  '#671: anon does NOT have EXECUTE on email_is_in_auth_users after 0104'
);

-- ── 2. email_is_in_auth_users: authenticated STILL has EXECUTE ────────────────
select ok(
  exists(
    select 1
    from information_schema.role_routine_grants
    where routine_schema  = 'public'
      and routine_name    = 'email_is_in_auth_users'
      and grantee         = 'authenticated'
      and privilege_type  = 'EXECUTE'
  ),
  '#671: authenticated STILL has EXECUTE on email_is_in_auth_users (no regression)'
);

-- ── 3. email_is_invited: anon STILL has EXECUTE (login gate must not break) ───
select ok(
  exists(
    select 1
    from information_schema.role_routine_grants
    where routine_schema  = 'public'
      and routine_name    = 'email_is_invited'
      and grantee         = 'anon'
      and privilege_type  = 'EXECUTE'
  ),
  '#671: anon STILL has EXECUTE on email_is_invited (pre-login shouldCreateUser gate)'
);

-- ── 4–7. The 4 RLS helpers all have an explicit search_path in proconfig ──────
-- pg_proc.proconfig is an array of 'key=value' strings set via SET … in the
-- function definition. We assert each helper has at least one entry starting
-- with 'search_path='. This proves the SET search_path clause was applied.

select ok(
  exists(
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_admin'
      and p.proconfig::text like '%search_path%'
  ),
  '#671: is_admin() has SET search_path in proconfig'
);

select ok(
  exists(
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_in_game'
      and p.proconfig::text like '%search_path%'
  ),
  '#671: is_in_game() has SET search_path in proconfig'
);

select ok(
  exists(
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'can_score_for'
      and p.proconfig::text like '%search_path%'
  ),
  '#671: can_score_for() has SET search_path in proconfig'
);

select ok(
  exists(
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'same_flight_or_solo'
      and p.proconfig::text like '%search_path%'
  ),
  '#671: same_flight_or_solo() has SET search_path in proconfig'
);

select * from finish();
rollback;
