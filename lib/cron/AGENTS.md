# lib/cron — scheduled sweeps and how to read their health

> Written for #2246, after `succeeded` rows in `cron.job_run_details` were read as "the call reached Vercel" and a staging job's 401s were read as prod autostart being broken. Neither was true.

## The chain

pg_cron (every minute) → EXISTS gate in the job body → `net.http_post` (pg_net, async) → `POST /api/cron/*` on the prod apex → `requireCronAuth` (`lib/cron/auth.ts`) → the route's own query and work.

| Job | Migrations | Gate (the call only goes out when…) | Route |
|---|---|---|---|
| `start-scheduled-games` | 0094, 0146 (apex URL) | a `scheduled` game has `scheduled_tee_off_at` in the last 7 days | `app/api/cron/start-scheduled-games/route.ts` |
| `finish-pipeline-sweep` | 0170 | a finished non-cup, non-derived game has `finish_pipeline_at is null` | `app/api/cron/finish-pipeline/route.ts` |
| `delivery-reminder-sweep` (every 5 min) | 0192 | an active, non-derived game has a player with `submitted_at`, `withdrawn_at` and `deliver_reminder_sent_at` all null | `app/api/cron/delivery-reminder/route.ts` |

`/api/cron/product-update-digest` is not pg_cron: it is the one Vercel Cron in `vercel.json` (daily, GET). Both transports send the same `Authorization: Bearer <CRON_SECRET>`.

## Three signals — do not mix them up

1. **The gate ran:** `cron.job_run_details.status = 'succeeded'` only means the job's SQL ran. `return_message` tells you what it did: `'0 rows'` = nothing was due and no request was made; `'1 row'` = a request was queued (verified on staging 2026-09-27). A healthy prod job shows `'0 rows'` nearly all the time.
2. **The call went out and was answered:** `net._http_response` holds the real status codes, but it is not history. `pg_net.ttl` is 6 hours and old rows are purged when the worker next runs, so an empty or tiny table means "no calls lately", not "calls are failing".
3. **The game actually started or finished:** the data-level proof. This is the one to trust.

```sql
-- 1. Did the gate open?
select j.jobname, d.start_time, d.status, d.return_message
from cron.job_run_details d join cron.job j using (jobid)
where d.return_message <> '0 rows'
order by d.start_time desc limit 20;

-- 2. What did the route answer? (recent calls only: rows older than
--    pg_net.ttl go the next time pg_net sends something)
select id, created, status_code, left(content, 80) as body
from net._http_response order by id desc limit 20;

-- 3a. Start delay per scheduled game
select id, scheduled_tee_off_at, started_at, started_at - scheduled_tee_off_at as delay
from public.games
where scheduled_tee_off_at is not null and started_at is not null
order by scheduled_tee_off_at desc limit 20;

-- 3b. Finish-tail delay (the sweep catches what the finish action left behind).
--     Games finished before 0169 got a backfilled marker, so their
--     tail_delay means nothing - read only games finished after it.
select id, ended_at, finish_pipeline_at, finish_pipeline_at - ended_at as tail_delay
from public.games
where status = 'finished' and tournament_id is null and source_game_id is null
order by ended_at desc limit 20;
```

```sql
-- 3c. Delivery reminder (#2200): when each card was reminded, against its last
--     hole. Due 15 minutes after the last hole; the sweep runs every 5.
select gp.game_id, gp.user_id, gp.deliver_reminder_sent_at,
       (select max(s.updated_at) from public.scores s
         where s.game_id = gp.game_id and s.user_id = gp.user_id) as last_hole
from public.game_players gp join public.games g on g.id = gp.game_id
where g.status = 'active' and gp.deliver_reminder_sent_at is not null
order by gp.deliver_reminder_sent_at desc limit 20;
```

A start within ~2 minutes of tee-off and a tail within ~1 minute of `ended_at` mean the chain works, whatever signals 1 and 2 look like. A reminder lands between 15 and 20 minutes after a card's last hole (in the one-ball formats the last hole sits on the captain's rows).

## Staging has no cron jobs (#2246)

Every job POSTs to a hardcoded prod URL with `cron_secret` from Vault. Only prod has that secret, and staging has no URL cron could reach (the staging app runs locally). 0188 unschedules the jobs wherever `cron_secret` is missing, so staging's `cron.job` is empty.

- A scheduled test game on staging starts when someone opens it (the game page's fallback), or when you POST the start route by hand.
- To test a sweep: run the app locally with your own `CRON_SECRET` and `curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/<route>`.

## The rule for new jobs

Wrap every `cron.schedule` in a migration in:

```sql
do $$
begin
  if exists (select 1 from vault.secrets where name = 'cron_secret') then
    perform cron.schedule('<name>', '* * * * *', $job$ … $job$);
  end if;
end
$$;
```

`supabase/tests/cron_jobs_require_secret_test.sql` enforces it: the Migrations gate database has no secret, so any job a migration leaves in `cron.job` there turns the gate red.
