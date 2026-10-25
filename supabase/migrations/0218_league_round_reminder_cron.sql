-- 0218_league_round_reminder_cron.sql
-- =============================================================================
-- #2638 Del 3 - an hourly sweep that tells a league's players when a round
-- opens, and reminds the ones who have not played it 48 hours before it
-- closes (the owner's answer 2026-10-25: «48 t før + når runden åpner»).
--
-- !! APPLY AFTER THE CODE DEPLOY, NEVER BEFORE. The job POSTs to
-- /api/cron/league-round-reminder; until that route is deployed every fire is
-- a 404. Same apply-after-deploy rule as 0094, 0170, 0192 and 0205. 0217 (the
-- claim columns this gate reads) must be on first.
--
-- Why pg_cron and not a Vercel cron: the Hobby tier gives one run per day
-- (#502, app/api/cron/start-scheduled-games/route.ts), and a reminder that is
-- due 48 hours before the deadline cannot wait a day. POST because pg_net can
-- only issue POST requests. vercel.json does not change.
--
-- Cadence: '41 * * * *', hourly. The opening message comes within the hour
-- after a round opens (rounds open at 00:00 Oslo), the reminder between 47 and
-- 48 hours before the deadline. Minute 41 keeps it off the minutes the other
-- sweeps use (stale-game-reminder runs at :17).
--
-- ONE RULE, THREE PLACES (AGENTS.md trap #4). `dueNotices` in
-- lib/league/roundNotices.ts decides; the route's candidate query
-- (app/api/cron/league-round-reminder/route.ts) and the gate below select the
-- rounds it can say yes to. Change one predicate, change all three in the
-- same commit:
--   leagues.status = 'active'               a draft has not started, a
--                                           finished league is done
--   opens_at <= now() < closes_at           the round is open
--   opening_notice_sent_at is null          → the opening message
--   or (closing_reminder_sent_at is null
--       and closes_at < now() + 48 hours)   → the reminder
-- A round where everyone has played still opens the gate once per message:
-- the route claims the stamp and sends nothing, and then it is closed.
--
-- #2246 / 0188: every cron.schedule is wrapped in a check that cron_secret
-- exists in Vault. Only prod has it. Staging and the Migrations gate database
-- have none, so there this migration schedules nothing and is a ledger-only
-- no-op (supabase/tests/cron_jobs_require_secret_test.sql keeps it that way).
-- To test the sweep on staging, run the app locally with your own CRON_SECRET
-- and POST /api/cron/league-round-reminder by hand (lib/cron/AGENTS.md).
--
-- cron.schedule upserts on the job name, so this migration is re-runnable.
-- =============================================================================

do $do$
begin
  if exists (select 1 from vault.secrets where name = 'cron_secret') then
    perform cron.schedule(
      'league-round-reminder-sweep',
      '41 * * * *',
      $job$
      -- Apex, not www: www 308-redirects at the Vercel edge and pg_net does
      -- not follow redirects (0146).
      select net.http_post(
        url := 'https://tornygolf.no/api/cron/league-round-reminder',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            select decrypted_secret from vault.decrypted_secrets
            where name = 'cron_secret'
          )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000
      ) as request_id
      where exists (
        select 1
        from public.league_rounds r
        join public.leagues l on l.id = r.league_id
        where l.status = 'active'
          and r.opens_at <= now()
          and r.closes_at > now()
          and (
            r.opening_notice_sent_at is null
            or (r.closing_reminder_sent_at is null
                and r.closes_at < now() + interval '48 hours')
          )
      );
      $job$
    );
  end if;
end
$do$;
