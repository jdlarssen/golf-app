-- 0242_evening_before_cron.sql
-- =============================================================================
-- #2483 - a sweep every 15 minutes that tells the organiser, the evening before
-- a scheduled round, how many have confirmed and who has not answered
-- (`organizer_evening_status`, the owner's answer 2026-11-16: «Kl. 18»).
--
-- !! APPLY AFTER THE CODE DEPLOY, NEVER BEFORE. The job POSTs to
-- /api/cron/evening-before; until that route is deployed every fire is a 404.
-- Same apply-after-deploy rule as 0094, 0170, 0192, 0205 and 0218. 0241 (the
-- claim column this gate reads) must be on first.
--
-- Why pg_cron and not a Vercel cron: the Hobby tier gives one run per day
-- (#502, app/api/cron/start-scheduled-games/route.ts), and the varsel is due
-- at a set hour. POST because pg_net can only issue POST requests.
-- vercel.json does not change.
--
-- Cadence: '*/15 * * * *'. The varsel is due from 18:00 Oslo, so it lands
-- within a quarter of an hour. The gate below is closed outside 18:00-24:00
-- Oslo, so the job makes no call for the rest of the day. The name is general
-- so the players' own reminder the evening before (#2450) can join this job.
--
-- ONE RULE, THREE PLACES (AGENTS.md trap #4). `isEveningNoticeDue` in
-- lib/games/eveningBeforeRules.ts decides; the route's candidate query
-- (app/api/cron/evening-before/route.ts) and the gate below select the games
-- it can say yes to. Change one predicate, change all three in the same commit
-- (EVENING_NOTICE_HOUR is 18; eveningBeforeRules.test.ts reads it here):
--   games.status = 'scheduled'                  the round is set up, not begun
--   games.tournament_id is null                 not a cup match
--   games.source_game_id is null                not a derived game
--   games.league_round_id is null               not a league flight
--   games.created_by is not null                someone to tell
--   games.organizer_evening_notice_sent_at is null   once per round
--   tee-off on tomorrow's Oslo date             the evening before
--   Oslo clock at or after 18:00                the varsel is due
--   created_at before 18:00 Oslo today          a round set up later that
--                                               evening gets nothing
--   another player on the list than the         a solo round has nobody to
--   organiser, not withdrawn, not a guest       wait for
--
-- #2246 / 0188: every cron.schedule is wrapped in a check that cron_secret
-- exists in Vault. Only prod has it. Staging and the Migrations gate database
-- have none, so there this migration schedules nothing and is a ledger-only
-- no-op (supabase/tests/cron_jobs_require_secret_test.sql keeps it that way).
-- To test the sweep on staging, run the app locally with your own CRON_SECRET
-- and POST /api/cron/evening-before by hand (lib/cron/AGENTS.md).
--
-- cron.schedule upserts on the job name, so this migration is re-runnable.
-- =============================================================================

do $do$
begin
  if exists (select 1 from vault.secrets where name = 'cron_secret') then
    perform cron.schedule(
      'evening-before-sweep',
      '*/15 * * * *',
      $job$
      -- Apex, not www: www 308-redirects at the Vercel edge and pg_net does
      -- not follow redirects (0146).
      select net.http_post(
        url := 'https://tornygolf.no/api/cron/evening-before',
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
      where extract(hour from now() at time zone 'Europe/Oslo') >= 18
        and exists (
          select 1
          from public.games g
          where g.status = 'scheduled'
            and g.tournament_id is null
            and g.source_game_id is null
            and g.league_round_id is null
            and g.created_by is not null
            and g.organizer_evening_notice_sent_at is null
            and (g.scheduled_tee_off_at at time zone 'Europe/Oslo')::date
                = (now() at time zone 'Europe/Oslo')::date + 1
            and g.created_at
                < ((now() at time zone 'Europe/Oslo')::date + time '18:00') at time zone 'Europe/Oslo'
            and exists (
              select 1
              from public.game_players gp
              join public.users u on u.id = gp.user_id
              where gp.game_id = g.id
                and gp.user_id <> g.created_by
                and gp.withdrawn_at is null
                and not u.is_guest
            )
        );
      $job$
    );
  end if;
end
$do$;
