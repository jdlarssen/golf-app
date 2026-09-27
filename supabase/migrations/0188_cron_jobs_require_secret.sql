-- 0188_cron_jobs_require_secret.sql
-- =============================================================================
-- #2246 - pg_cron jobs exist only on a database that holds cron_secret.
--
-- Both jobs (start-scheduled-games from 0094/0146, finish-pipeline-sweep from
-- 0170) POST to a hardcoded production URL with 'Bearer ' || <cron_secret from
-- Vault>. Only prod has that secret. Staging has neither the secret nor a URL
-- cron could reach (the staging app runs locally only, docs/staging-testing.md),
-- yet 0094 and 0146 were applied there. Whenever staging held a scheduled game
-- past its tee-off inside the 7-day window, its job fired once a minute, the
-- header resolved to NULL and production answered 401. The prod logs then looked
-- as if autostart was broken - the false alarm behind #2246. 0170's header called
-- the staging job "inert"; it was not.
--
-- Fix: where cron_secret is missing, unschedule the two known jobs. Where it
-- exists (prod), this block does nothing - prod keeps the same jobs, schedule
-- and command; the migration is a ledger-only no-op there.
--
-- RULE FOR FUTURE MIGRATIONS: wrap every cron.schedule in
--   if exists (select 1 from vault.secrets where name = 'cron_secret') then
--     perform cron.schedule(...);
--   end if;
-- supabase/tests/cron_jobs_require_secret_test.sql enforces it: the Migrations
-- gate database has no secret, so any job left in cron.job there turns it red.
--
-- Notes:
--   * cron.unschedule(name) raises when the job does not exist, and staging
--     never got finish-pipeline-sweep (0170 was not applied there), so each job
--     is removed separately and only if present.
--   * cron.job has RLS, but postgres has BYPASSRLS on Supabase, so the exists
--     check sees every job, while cron.unschedule(name) only matches jobs the
--     caller owns. Every job here was scheduled by a postgres-run migration
--     (verified on staging 2026-09-27: username = postgres). A same-named job
--     owned by another role would make this block raise - loud on purpose,
--     rather than skipping a job that keeps firing.
--   * A database without the vault schema counts as "no secret".
--   * Re-runnable: a second run finds no jobs and does nothing.
-- =============================================================================

do $$
declare
  has_secret boolean := false;
  job_name text;
begin
  if to_regclass('vault.secrets') is not null then
    select exists (select 1 from vault.secrets where name = 'cron_secret')
      into has_secret;
  end if;

  if has_secret then
    return;
  end if;

  foreach job_name in array array['start-scheduled-games', 'finish-pipeline-sweep'] loop
    if exists (select 1 from cron.job where jobname = job_name) then
      perform cron.unschedule(job_name);
    end if;
  end loop;
end
$$;
