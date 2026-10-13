-- 0207_purge_cron_run_history.sql
-- =============================================================================
-- #2558 - keep pg_cron's run log from filling the database.
--
-- Why: pg_cron writes one row to cron.job_run_details per run, and nothing
-- ever deleted them. Four jobs (two every minute, one every five minutes, one
-- hourly) add about 3,200 rows a day. By 2026-10-13 the log held 240,000 rows
-- going back to June: 596 MB of a 617 MB prod database, over the 500 MB the
-- Supabase Free plan allows before it may turn the project read-only.
--
-- 1. One TRUNCATE frees the space now. A DELETE would not: the file only
--    shrinks with VACUUM FULL, which cannot run inside a migration. The
--    history is only a health log (lib/cron/AGENTS.md); no app code reads it.
-- 2. A nightly job deletes rows older than 7 days, so the table stays at about
--    22,000 rows and autovacuum reuses the space. Seven days is enough to read
--    the «did the gate open?» signal in lib/cron/AGENTS.md after a weekend.
--
-- #2246 / 0188: the job is scheduled only where cron_secret is in Vault, like
-- every other job. That is where jobs run and the log grows (prod). Staging
-- and the Migrations gate database get no job, so
-- supabase/tests/cron_jobs_require_secret_test.sql stays green. The TRUNCATE
-- runs everywhere: on staging it clears the history left from before #2246.
--
-- Cadence: '43 3 * * *', 03:43 UTC daily. Minute 43 keeps it off the minutes
-- the other sweeps share.
--
-- cron.schedule upserts on the job name, so this migration is re-runnable.
-- =============================================================================

truncate cron.job_run_details;

do $do$
begin
  if exists (select 1 from vault.secrets where name = 'cron_secret') then
    perform cron.schedule(
      'purge-cron-run-history',
      '43 3 * * *',
      $job$delete from cron.job_run_details where start_time < now() - interval '7 days'$job$
    );
  end if;
end
$do$;
