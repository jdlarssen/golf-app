-- 0146_cron_url_apex.sql
-- Issue #1304 — start-scheduled-games må treffe apex, ikke www.
--
-- 0094 pekte jobben på www.tornygolf.no fordi apex den gang 307-redirectet
-- til www på domenenivå, og pg_net følger ikke redirects. Det premisset er
-- snudd: siden ~2026-07-19 er apex primærvert og www 308-er til apex
-- (Vercel-edge, før appen). Kjeden pg_net → www → 308 → drop betyr at neste
-- forfalte planlagte spill aldri ville auto-startet. Siste vellykkede POST i
-- net._http_response er 2026-07-11 (status 200, FØR byttet) — EXISTS-gaten
-- har skjult feilen siden.
--
-- Fiks: re-deklarer jobben (cron.schedule upserter på jobbnavn, jf. 0094)
-- med apex-URL. Alt annet — schedule, EXISTS-gate, Vault-oppslag, timeout —
-- er uendret fra 0094. Jobben peker nå på kanonisk vert og er uavhengig av
-- redirect-oppsettet; #1277 gjør i tillegg www-api-stier direkte servbare
-- senere, men jobben skal ikke lene seg på det.

select cron.schedule(
  'start-scheduled-games',
  '* * * * *',
  $job$
  -- Apex = kanonisk vert siden 2026-07-19 (www 308-er hit). pg_net følger
  -- ikke redirects, så URL-en må treffe verten som server appen direkte
  -- (jf. #1304; historikken bak www-valget står i 0094).
  select net.http_post(
    url := 'https://tornygolf.no/api/cron/start-scheduled-games',
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
    where status = 'scheduled'
      and scheduled_tee_off_at <= now()
      and scheduled_tee_off_at >= now() - interval '7 days'
  );
  $job$
);
