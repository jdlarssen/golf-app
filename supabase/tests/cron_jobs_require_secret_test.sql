-- supabase/tests/cron_jobs_require_secret_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Catalog test: a database without cron_secret in Vault has no pg_cron jobs
-- (#2246).
--
-- Every pg_cron job in this project POSTs to a hardcoded production URL with
-- 'Bearer ' || <cron_secret from Vault>. On a database without that secret the
-- header resolves to NULL and production answers 401 — staging did exactly
-- that once a minute whenever it held a due scheduled game, which made the
-- prod logs look like autostart was broken. The rule since 0188: a migration
-- only calls cron.schedule inside
--   if exists (select 1 from vault.secrets where name = 'cron_secret') then … end if;
--
-- The Migrations gate (.github/workflows/migrations-gate.yml) applies every
-- migration to a fresh local Postgres that has no secret, then runs
-- `supabase test db` over this folder. So cron.job must be empty there: a
-- future migration that schedules a job without the guard turns this red,
-- whatever the job is called.
--
-- cron.job has RLS (rows visible to their owner). The gate applies migrations
-- as postgres, so any job a migration creates is visible here.
--
-- Catalog state only — no fixtures, no role impersonation, no seed.
-- Run via:  supabase test db
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(2);

-- ── 1. Precondition: this database has no cron secret ───────────────────────
-- Without it the assertion below proves nothing (a database WITH the secret is
-- supposed to keep its jobs), so fail loudly instead of passing for no reason.
select ok(
  not exists (select 1 from vault.secrets where name = 'cron_secret'),
  '#2246 precondition: cron_secret is absent from vault.secrets'
);

-- ── 2. No secret → no cron jobs ─────────────────────────────────────────────
select is_empty(
  $$ select jobname from cron.job order by jobid $$,
  '#2246: no pg_cron job is scheduled on a database without cron_secret'
);

select * from finish();

rollback;
