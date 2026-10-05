-- 0205_stale_game_reminder_cron.sql
-- =============================================================================
-- #2203 - an hourly sweep that reminds the organiser once when an active round
-- has stood still for a day.
--
-- !! APPLY AFTER THE CODE DEPLOY, NEVER BEFORE. The job POSTs to
-- /api/cron/stale-game-reminder; until that route is deployed every fire is a
-- 404. Same apply-after-deploy rule as 0094, 0170 and 0192. 0204 (the claim
-- column this gate reads) must be on first.
--
-- Why: nothing finishes a round by itself (the owner's choice 2026-09-25: the
-- game never finishes itself), and one game stood «Pågående» for over two
-- weeks with nobody noticing. The route finds the rounds where nothing has
-- happened for 24 hours (no score, delivery, approval or withdrawal) and sends
-- the organiser one `game_stale_reminder`. The rule lives in
-- lib/games/organizerNoticeRules.ts (`isStale`), the claim and the send per
-- game in lib/notifications/organizerNotices.ts.
--
-- Why pg_cron and not a Vercel cron: the Hobby tier gives one run per day
-- (#502, app/api/cron/start-scheduled-games/route.ts), and a day late is too
-- late for a reminder that is due after a day. POST because pg_net can only
-- issue POST requests. vercel.json does not change.
--
-- Cadence: '17 * * * *', hourly. The reminder is due 24 hours after the last
-- activity, so an hour of slack is fine; minute 17 keeps it off the minute
-- the other sweeps share.
--
-- ONE RULE, TWO HOMES (AGENTS.md trap #4). The gate below is the route's
-- candidate query written a second time
-- (app/api/cron/stale-game-reminder/route.ts). Change one predicate, change
-- both in the same commit:
--   games.status = 'active'                       the round is on
--   games.source_game_id is null                  derived games never hold
--                                                 deliveries of their own
--   games.tournament_id is null                   a cup finishes as a whole
--                                                 (finishTournament), not
--                                                 match by match
--   games.created_by is not null                  someone to remind
--   games.organizer_stale_reminder_sent_at is null   once per game
--   games.started_at < now() - 24 hours           a round younger than a day
--                                                 cannot have stood still for
--                                                 one
-- The gate stays open while such a round is still being played (it has
-- activity, so the route sends nothing), at the cost of one call an hour.
--
-- #2246 / 0188: every cron.schedule is wrapped in a check that cron_secret
-- exists in Vault. Only prod has it. Staging and the Migrations gate database
-- have none, so there this migration schedules nothing and is a ledger-only
-- no-op (supabase/tests/cron_jobs_require_secret_test.sql keeps it that way).
-- To test the sweep on staging, run the app locally with your own CRON_SECRET
-- and POST /api/cron/stale-game-reminder by hand (lib/cron/AGENTS.md).
--
-- cron.schedule upserts on the job name, so this migration is re-runnable.
-- =============================================================================

do $do$
begin
  if exists (select 1 from vault.secrets where name = 'cron_secret') then
    perform cron.schedule(
      'stale-game-reminder-sweep',
      '17 * * * *',
      $job$
      -- Apex, not www: www 308-redirects at the Vercel edge and pg_net does
      -- not follow redirects (0146).
      select net.http_post(
        url := 'https://tornygolf.no/api/cron/stale-game-reminder',
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
        from public.games g
        where g.status = 'active'
          and g.source_game_id is null
          and g.tournament_id is null
          and g.created_by is not null
          and g.organizer_stale_reminder_sent_at is null
          and g.started_at < now() - interval '24 hours'
      );
      $job$
    );
  end if;
end
$do$;
