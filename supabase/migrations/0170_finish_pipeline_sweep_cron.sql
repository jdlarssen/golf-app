-- 0170_finish_pipeline_sweep_cron.sql
-- =============================================================================
-- #1856 (native N6c) - per-minute sweep that runs the finish pipeline for games
-- the native app finished on its own.
--
-- !! APPLY AFTER THE CODE DEPLOY, NEVER BEFORE. The job POSTs to
-- /api/cron/finish-pipeline; until that route is deployed every fire is a 404.
-- Harmless (the EXISTS gate keeps it quiet while no game owes a tail, and the
-- response only lands in net._http_response) but pointless - and it hides a real
-- failure behind expected noise. Same apply-after-deploy rule 0094 wrote down
-- for start-scheduled-games. Migration 0169 (the marker column) is the one that
-- can be applied at any time; this file waits.
--
-- Why pg_cron and not a Vercel cron: #502 deliberately left start-scheduled-games
-- out of vercel.json because the Hobby tier gives one run per day, and this sweep
-- needs minute granularity. app/api/cron/start-scheduled-games/route.ts:19-25
-- records that reasoning. This is the second pg_cron job in the project; before
-- it, cron.job held exactly one row (jobid 1, start-scheduled-games, active).
--
-- Why POST: pg_net can only issue POST requests, so the route is a POST handler.
--
-- Why its own job instead of extending start-scheduled-games: separate concerns,
-- separate EXISTS gate, separate [finishPipeline] log line, and a failure in one
-- sweep cannot take the other down. The usual argument for folding it in - that a
-- new cron.schedule means a prod DB migration behind the owner gate (#1074) -
-- does not apply here: 0169 already needs that gate, so a second job costs no
-- extra owner step. The Vault secret it reads (cron_secret) already exists and is
-- already in use by start-scheduled-games; nothing new is asked of the owner.
--
-- Cadence: '* * * * *', inherited from start-scheduled-games. One minute is far
-- under the 15-minute threshold the contract set for adding an opportunistic
-- after() fallback on the web game page, so no such fallback is built.
--
-- The gate is the sweep's candidate set verbatim, and matches
-- games_finish_pipeline_pending_idx (0169) so it stays an index lookup:
--   status = 'finished'          - the flip has happened
--   finish_pipeline_at is null   - but the tail has not run (0169 backfilled all
--                                  pre-existing finished games, so history is
--                                  invisible here)
--   tournament_id is null        - cup rounds are excluded; the cup flow owns its
--                                  own finish path and the suppressPerGameNotifi-
--                                  cations mechanics, and the app refuses to end
--                                  a cup round in the first place.
--
-- No time window, unlike 0094's 7-day one. That window exists because a blocked
-- scheduled game stays due forever; here the route claims the row (win-the-row
-- UPDATE ... IS NULL, see 0169) before it does any work, so a candidate leaves
-- the set on its first reachable pass whether the tail succeeds or fails. The
-- only way a row keeps matching is that the route itself is unreachable - and a
-- window would then permanently orphan any game finished during that outage.
--
-- VAULT / URL ASYMMETRY - verified live 2026-09-01, and NOT what the contract
-- assumed. cron_secret exists in PROD's vault (the only secret there) but
-- staging's vault is completely empty (0 rows), and the URL below is hardcoded
-- to the prod apex exactly like 0094/0146. Two consequences:
--   * This job belongs on PROD. Applied to staging it would resolve
--     'Bearer ' || NULL to a NULL header and POST at production - inert (the
--     route answers 401), and the same already-inert state start-scheduled-games
--     sits in on staging today, but pointless.
--   * The staging verification of the sweep therefore cannot go through pg_cron.
--     POST /api/cron/finish-pipeline directly with the CRON_SECRET value instead.
-- No new owner step is needed for prod: the secret is already there and already
-- in use by start-scheduled-games.
--
-- cron.schedule upserts on job name (jf. 0094/0146), so this migration is
-- re-runnable.
-- =============================================================================

select cron.schedule(
  'finish-pipeline-sweep',
  '* * * * *',
  $job$
  -- Apex, not www: www 308-redirects to the apex at the Vercel edge and pg_net
  -- does not follow redirects (it would also strip Authorization across a
  -- cross-host redirect). 0146 fixed exactly this for start-scheduled-games
  -- after 0094's www URL silently stopped working; the history is in 0146.
  select net.http_post(
    url := 'https://tornygolf.no/api/cron/finish-pipeline',
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
    select 1 from public.games
    where status = 'finished'
      and finish_pipeline_at is null
      and tournament_id is null
  );
  $job$
);
