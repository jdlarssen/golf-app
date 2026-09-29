-- 0192_delivery_reminder_sweep_cron.sql
-- =============================================================================
-- #2200 (part 2) - a sweep every five minutes that sends the delivery reminder
-- to whoever keeps the card.
--
-- !! APPLY AFTER THE CODE DEPLOY, NEVER BEFORE. The job POSTs to
-- /api/cron/delivery-reminder; until that route is deployed every fire is a 404.
-- Same apply-after-deploy rule as 0094 and 0170.
--
-- Why: the reminder used to fire only when the player themselves opened the
-- game page (and never for guests). The players who did not deliver had almost
-- never keyed a stroke themselves, so it rarely reached anyone who could act.
-- The route finds the cards that have been full for a quarter of an hour and
-- reminds whoever can deliver them; the rule lives in
-- lib/games/deliveryReminderSweep.ts, the claim and the send per game in
-- lib/notifications/deliveryReminder.ts. The game page no longer sends it.
--
-- Why pg_cron and not a Vercel cron: the Hobby tier gives one run per day
-- (#502, app/api/cron/start-scheduled-games/route.ts). POST because pg_net can
-- only issue POST requests.
--
-- Cadence: '*/5 * * * *'. The reminder is due 15 minutes after the last hole
-- (the owner's answer 2026-09-27: «Et kvarter, én gang»), so five minutes of
-- slack is well inside it.
--
-- ONE RULE, TWO HOMES (AGENTS.md trap #4). The gate below is the route's
-- candidate query written a second time
-- (app/api/cron/delivery-reminder/route.ts). Change one predicate, change both
-- in the same commit:
--   games.status = 'active'                  the round is on
--   games.source_game_id is null             derived games never hold scores
--   games.started_at > now() - 2 days        a round runs over one day; an
--                                            active game nobody finishes has
--                                            cards that never fill, and without
--                                            a window it would keep the gate
--                                            open (and hold a route batch slot)
--                                            for good. Same reason as 0094's
--                                            window.
--   a game_players row with submitted_at, withdrawn_at and
--   deliver_reminder_sent_at all null        a card that may still need one
-- The gate is open for the whole round while cards are undelivered, so a
-- round costs a call every five minutes until its cards are delivered or
-- reminded. The route decides which cards are due. No index: game_players is
-- small (hundreds of rows), and a partial index can follow if it grows.
--
-- #2246 / 0188: every cron.schedule is wrapped in a check that cron_secret
-- exists in Vault. Only prod has it. Staging and the Migrations gate database
-- have none, so there this migration schedules nothing and is a ledger-only
-- no-op (supabase/tests/cron_jobs_require_secret_test.sql keeps it that way).
-- To test the sweep on staging, run the app locally with your own CRON_SECRET
-- and POST /api/cron/delivery-reminder by hand (lib/cron/AGENTS.md).
--
-- cron.schedule upserts on the job name, so this migration is re-runnable.
-- =============================================================================

do $do$
begin
  if exists (select 1 from vault.secrets where name = 'cron_secret') then
    perform cron.schedule(
      'delivery-reminder-sweep',
      '*/5 * * * *',
      $job$
      -- Apex, not www: www 308-redirects at the Vercel edge and pg_net does
      -- not follow redirects (0146).
      select net.http_post(
        url := 'https://tornygolf.no/api/cron/delivery-reminder',
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
        join public.game_players gp on gp.game_id = g.id
        where g.status = 'active'
          and g.source_game_id is null
          and g.started_at > now() - interval '2 days'
          and gp.submitted_at is null
          and gp.withdrawn_at is null
          and gp.deliver_reminder_sent_at is null
      );
      $job$
    );
  end if;
end
$do$;
