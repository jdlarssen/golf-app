-- 0094_scheduled_start_cron.sql
-- Issue #502 — tidsstyrt auto-start av planlagte spill + start-/blokkert-varsler.
--
-- Før denne migrasjonen var auto-start lat: spill med scheduled_tee_off_at
-- flippet til 'active' først når noen åpnet spill-siden (E1-fallback). Nå
-- kaller en pg_cron-jobb hvert minutt et sikret Next.js-endepunkt
-- (/api/cron/start-scheduled-games) som kjører startScheduledGame per due
-- game. Handicap-frysingen kan ikke gjøres i ren SQL — derfor HTTP-kall til
-- appen i stedet for en plpgsql-jobb.
--
-- Fire deler:
--   1. Extensions: pg_cron (scheduler) + pg_net (async HTTP fra Postgres).
--   2. games.auto_start_blocked_notified_at — atomisk én-gangs-guard for
--      auto_start_blocked-varselet (deliveryReminder-mønsteret fra 0070).
--   3. Partiell indeks som gjør per-minutt EXISTS-gaten ~gratis.
--   4. To nye notification-kinds + selve cron-jobben.
--
-- Apply-rekkefølge: appliseres ETTER kode-deploy (cron-jobben POSTer til et
-- endepunkt som må finnes; før deploy gir den ufarlige 404-er, gated av
-- EXISTS). Etter applisering må eieren legge inn delt hemmelighet i Vault:
--   select vault.create_secret('<CRON_SECRET-verdien fra Vercel env>', 'cron_secret');
-- Inntil secreten finnes svarer endepunktet 401 (logges i net._http_response)
-- og lazy-start fungerer som før — ingen brukerflyt påvirkes.

-- 1. Extensions (per Supabase-docs: pg_cron i pg_catalog + grants, pg_net i
--    extensions-schemaet). idempotent via if not exists.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

create extension if not exists pg_net with schema extensions;

-- 2. Én-gangs-guard for auto_start_blocked-varselet. Settes atomisk av
--    maybeNotifyAutoStartBlocked (vinn raden-update); nullstilles bevisst
--    IKKE ved re-planlegging (kjent begrensning, jf. lib/notifications/
--    autoStartBlocked.ts).
alter table public.games
  add column if not exists auto_start_blocked_notified_at timestamptz;

-- 3. Partiell indeks for cron-gaten + endepunkt-sweepen. games-tabellen er
--    liten i dag, men gaten kjører hvert minutt for alltid — indeksen gjør
--    den til et oppslag uavhengig av tabellvekst.
create index if not exists games_scheduled_tee_off_idx
  on public.games (scheduled_tee_off_at)
  where status = 'scheduled';

-- 4a. Nye notification-kinds. Samme atomære drop+add-mønster som 0068/0069/
--     0077/0079. Gjeldende kind-sett verifisert mot prod-constrainten
--     2026-06-11 — hele settet bevares, kun de to nye legges til.
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in (
    'invite',
    'peer_approval_request',
    'scorecard_submitted',
    'scorecard_approved',
    'game_finished',
    'product_update',
    'team_invite',
    'registration_request',
    'registration_approved',
    'registration_rejected',
    'team_member_withdrew',
    'deliver_reminder',
    'cup_finished',
    'club_join_request',
    'club_role_changed',
    'friend_request',
    'friend_accepted',
    'cup_started',
    'player_added',
    -- Nye for #502:
    'game_started',             -- «runden er i gang»-varsel til alle spillere
    'auto_start_blocked'        -- «runden kom ikke i gang»-varsel til oppretter
  ));

-- 4b. Cron-jobben: hvert minutt, men HTTP-kallet fyres KUN når minst ett
--     spill faktisk er due (EXISTS-gaten) — ellers er jobben et rent
--     indeks-oppslag. 7-dagers-vinduet stopper evig retry for forlatte
--     blokkerte spill (lazy-start dekker dem fortsatt ved side-besøk).
--     Secret leses fra Vault ved kjøring; mangler den blir Authorization-
--     headeren null og endepunktet svarer 401 (ufarlig).
--     net.http_post er async (fyrer etter commit); default-timeouten på
--     2 s er for knapp for en sweep med flere spill, derfor 30 s.
--     cron.schedule upserter på jobbnavn, så migrasjonen er re-kjørbar.
select cron.schedule(
  'start-scheduled-games',
  '* * * * *',
  $job$
  -- NB: www-host, ikke apex — tornygolf.no 307-redirecter til www på
  -- domenenivå, og pg_net følger ikke redirects (Authorization ville
  -- uansett blitt strippet ved kryss-host-redirect). Verifisert med curl.
  select net.http_post(
    url := 'https://www.tornygolf.no/api/cron/start-scheduled-games',
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
