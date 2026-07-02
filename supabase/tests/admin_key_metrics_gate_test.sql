-- supabase/tests/admin_key_metrics_gate_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Catalog-based test for migration 0126 (#1010): the admin_key_metrics RPC
-- must be locked down per the 0076-template + 0104-hardening:
--   1. The function exists in public
--   2. It is SECURITY DEFINER
--   3. It has an explicit search_path in pg_proc.proconfig
--   4. anon has NO EXECUTE grant
--   5. PUBLIC has NO EXECUTE grant
--   6. authenticated HAS EXECUTE (the in-body is_admin() gate does the rest)
--
-- Catalog state only — no runtime seed, no role impersonation. The runtime
-- gate (player-JWT call raises not_authorized) is probed on staging per the
-- contract. Run via: supabase test db
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

-- ── 1. Function exists ────────────────────────────────────────────────────────
select ok(
  exists(
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'admin_key_metrics'
  ),
  '#1010: public.admin_key_metrics exists after 0126'
);

-- ── 2. SECURITY DEFINER ───────────────────────────────────────────────────────
select ok(
  (
    select p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'admin_key_metrics'
  ),
  '#1010: admin_key_metrics is SECURITY DEFINER'
);

-- ── 3. Explicit search_path in proconfig ──────────────────────────────────────
select ok(
  exists(
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'admin_key_metrics'
      and exists(
        select 1 from unnest(p.proconfig) as cfg
        where cfg like 'search_path=%'
      )
  ),
  '#1010: admin_key_metrics has an explicit search_path (proconfig)'
);

-- ── 4. anon must NOT have EXECUTE ─────────────────────────────────────────────
select ok(
  not exists(
    select 1
    from information_schema.role_routine_grants
    where routine_schema = 'public'
      and routine_name   = 'admin_key_metrics'
      and grantee        = 'anon'
      and privilege_type = 'EXECUTE'
  ),
  '#1010: anon does NOT have EXECUTE on admin_key_metrics'
);

-- ── 5. PUBLIC must NOT have EXECUTE ───────────────────────────────────────────
select ok(
  not exists(
    select 1
    from information_schema.role_routine_grants
    where routine_schema = 'public'
      and routine_name   = 'admin_key_metrics'
      and grantee        = 'PUBLIC'
      and privilege_type = 'EXECUTE'
  ),
  '#1010: PUBLIC does NOT have EXECUTE on admin_key_metrics'
);

-- ── 6. authenticated HAS EXECUTE ──────────────────────────────────────────────
select ok(
  exists(
    select 1
    from information_schema.role_routine_grants
    where routine_schema = 'public'
      and routine_name   = 'admin_key_metrics'
      and grantee        = 'authenticated'
      and privilege_type = 'EXECUTE'
  ),
  '#1010: authenticated has EXECUTE on admin_key_metrics (in-body is_admin() gates further)'
);

select * from finish();
rollback;
