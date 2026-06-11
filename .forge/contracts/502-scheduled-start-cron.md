# Spec: Tidsstyrt auto-start av planlagte spill (pg_cron) + start-/blokkert-varsler

**Issue:** #502 · **Branch:** `claude/tender-rosalind-4e6233`

## Problem

Auto-start av planlagte spill er lat: et spill med `scheduled_tee_off_at` flippes til `active` først når en spiller åpner spill-siden (E1-fallback i `app/[locale]/games/[id]/(home)/page.tsx:287`). Mellom tee-tid og første side-besøk viser hjem-skjermen «Planlagt», og observert i prod startet et spill 5 min «sent» av denne grunn. Det finnes ingen bakgrunns-klokke. I tillegg får ingen beskjed når runden faktisk starter, og oppretteren får ingen beskjed hvis auto-start er blokkert (f.eks. ufullstendige matchplay-sider, #544).

## Research Findings

- `pg_cron` 1.6.4 og `pg_net` 0.20.0 er **tilgjengelige men ikke installert** i prosjektet (`glofubopddkjhymcbaph`); `supabase_vault` 0.3.1 er installert. Verifisert via MCP `list_extensions` 2026-06-11.
- Supabase-docs anbefaler mønsteret: `cron.schedule(..., '* * * * *', $$ select net.http_post(...) $$)` med secret lest fra Vault (`vault.decrypted_secrets`). Kilde: supabase.com/docs/guides/functions/schedule-functions.
- `net.http_post` har **2000 ms default-timeout** — må heves eksplisitt (`timeout_milliseconds := 30000`). pg_net er async (fyrer etter commit), kan kun POSTe JSON. Responser logges 6 t i `net._http_response`.
- pg_cron-install per docs: `create extension pg_cron with schema pg_catalog; grant usage on schema cron to postgres; grant all privileges on all tables in schema cron to postgres;`. pg_net: `create extension pg_net with schema extensions;`.
- Vercel Hobby-cron er maks 1×/dag → ubrukelig her; `vercel.json` røres IKKE. Eksisterende `/api/cron/product-update-digest` etablerer `CRON_SECRET`-bearer-mønsteret for endepunkt-auth.
- `proxy.ts`-matcheren ekskluderer `api/` — nytt endepunkt blir ikke auth-gatet eller locale-rewritet.

## Prior Decisions

- Issue #502 (eier 2026-06-08) skisserte selv pg_cron+pg_net+sikret endepunkt — handicap-frysingen kan ikke gjøres i ren SQL, så endepunktet må gjenbruke `startScheduledGame`.
- `cup_started` (migrasjon 0079) = presedens for ny notification-kind; `deliveryReminder.ts` (#376) = presedens for atomisk «vinn raden»-idempotens.
- In-app-first varsling (#377-presedens): nye varsler går i innboksen, mail er unntak.

## Design

### 1. Sikret sweep-endepunkt: `app/api/cron/start-scheduled-games/route.ts`

- **POST**-handler (pg_net kan kun POST). Auth: `Authorization: Bearer ${CRON_SECRET}` — samme env-var og 401/500-oppførsel som `product-update-digest/route.ts`.
- Bruker `getAdminClient()` (RLS-bypass, samme begrunnelse som E1: systemnivå-transisjon, `app/[locale]/games/[id]/(home)/page.tsx:298-305`).
- Sweep: `games` med `status='scheduled' AND scheduled_tee_off_at <= now() AND scheduled_tee_off_at >= now() - 7 dager` (vindu speiler cron-gaten). Select `id, name, created_by`.
- Per due game: `startScheduledGame(admin, id)`:
  - **Startet (vant flippen):** `revalidateTag(\`game-${id}\`, 'max')` + fan-out `game_started`-varsel (se 3).
  - **Blokkert strukturelt** (`incomplete_sides`, `pending_players`, `tee_missing`, `tee_missing_rating`, `no_players`): én-gangs `auto_start_blocked`-varsel til `created_by` (se 4). `console.log`, ikke error (forventet tilstand).
  - **Transient** (`db_players`, `db_game`, `not_found`): `console.error` med `[cron/start-scheduled-games]`-prefiks, intet varsel — neste minutt retryer.
- Respons-JSON: `{ ok, checked, started: [...], blocked: [{ id, reason }] }`.
- `export const maxDuration = 60` (sweep med flere spill > 10 s default).

### 2. `startScheduledGame` får `started`-flagg (vant flippen vs. allerede aktiv)

I dag returnerer både vinneren av status-flippen og no-op-tapere `{ ok: true }` — konkurrerende callere (cron + E1 i samme minutt) ville begge fan-oute varsler. Endre flip-UPDATE til `.select('id')` og returner `{ ok: true, started: boolean }` (`started = rows.length > 0`; early-return for allerede-aktiv gir `started: false`). Additiv endring; eksisterende callere (admin-action, E1, league) kompilerer uendret. **Type A-test først** i eksisterende `lib/games/startScheduledGame.test.ts`: vinner får `started: true`, konkurrent/allerede-aktiv får `started: false`.

### 3. Ny notification-kind `game_started` (eier-beslutning 2026-06-11)

- Payload-skjema som `game_finished`: `{ game_id, game_name }`. Inn i `NotificationKind`-union + zod-skjema (`lib/notifications/types.ts`), CHECK-constraint-migrasjon (mønster: 0079), rendering i `components/notifications/NotificationCard.tsx` (deeplink til `/games/[id]`), test-case etter filens etablerte mønster.
- Fan-out-helper i `lib/notifications/events.ts` à la `notifyParticipantsGameFinished`: alle ikke-trukkede spillere, `Promise.allSettled`, best-effort. Valgfri `excludeUserId` (aktør).
- **Fyres fra alle tre scheduled→active-stier**, kun når `started === true`:
  - Cron-endepunktet (ingen aktør — alle varsles)
  - E1-fallback (inne i eksisterende `after()`-mønster; ekskluder besøkende spiller)
  - Admin «Start runden nå» (`startScheduledGameAction`; ekskluder admin selv)
  - League-flight-stien (`lib/league/actions.ts:647`) røres IKKE — spillerne der starter selv.
- **Kun in-app** — `shouldAlsoSendMail` fra `notify()` ignoreres bevisst (ingen ny mail-template; se Out of Scope).

### 4. Ny notification-kind `auto_start_blocked` (eier-beslutning 2026-06-11)

- Payload: `{ game_id, game_name, reason }` (reason = string fra result-union). Til `created_by`, deeplink til spill-siden. NotificationCard-tekst per de to vanlige årsakene (ufullstendige sider / ventende spillere), generisk for resten — norsk, humanizer-kjørt.
- **Maks én gang per spill:** ny kolonne `games.auto_start_blocked_notified_at timestamptz`, atomisk «vinn raden»-update (mønster: `deliveryReminder.ts:60-92`) før notify. Helper i `lib/notifications/` med Type A-test på årsaks-filteret (strukturell vs. transient).
- Fyres KUN fra cron-endepunktet (E1-besøkende ser allerede #544-banneret).

### 5. Migrasjon `009X_scheduled_start_cron.sql` (appliseres via MCP `apply_migration`)

1. Enable `pg_cron` (pg_catalog + grants per docs) og `pg_net` (schema extensions).
2. `alter table games add column auto_start_blocked_notified_at timestamptz;`
3. Partiell indeks: `create index ... on games (scheduled_tee_off_at) where status = 'scheduled';`
4. Utvid `notifications`-CHECK med de to nye kindene.
5. `cron.schedule('start-scheduled-games', '* * * * *', ...)`: `select net.http_post(url := 'https://tornygolf.no/api/cron/start-scheduled-games', headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')), body := '{}'::jsonb, timeout_milliseconds := 30000) where exists (select 1 from public.games where status = 'scheduled' and scheduled_tee_off_at <= now() and scheduled_tee_off_at >= now() - interval '7 days');` — EXISTS-gaten gjør at Vercel kun kalles når noe faktisk skal startes.
6. Oppdater `lib/database.types.ts` for den nye games-kolonnen (håndredigér eller regenerér; jf. #488).

**Rekkefølge:** PR merges → Vercel deployer → migrasjon appliseres → eier legger `cron_secret` i Vault. Manglende secret før det gir bare 401-er i `net._http_response` (ufarlig, EXISTS-gatet).

### 6. Eier-steg (leveres kopier-lim-klart i avslutningsmeldingen)

Kopiere `CRON_SECRET`-verdien fra Vercel → kjøre `select vault.create_secret('<verdi>', 'cron_secret');` i Supabase SQL Editor. Ett steg; uten det forblir kun cron-stien død (lazy-start fungerer som før).

## Edge Cases & Guardrails

- **Kappløp cron vs. E1 vs. admin-knapp:** `startScheduledGame` er allerede idempotent + optimistisk låst; `started`-flagget sørger for at nøyaktig én caller fan-outer varsler.
- **Permanent blokkert spill:** cron retryer hvert minutt og starter spillet i sekundet blokkeringen løses; 7-dagers-vinduet stopper evig-retry for forlatte spill (lazy-start dekker dem fortsatt). Varsel til oppretter går maks én gang.
- **Re-planlagt spill etter blokkert-varsel:** `auto_start_blocked_notified_at` nullstilles IKKE ved tee-tid-endring — kjent begrensning, dokumenteres i koden.
- **`created_by` null** (gamle rader): hopp over blokkert-varsel, logg.
- **Vault-secret mangler / endepunkt ikke deployet:** 401/404 logges i `net._http_response`; ingen brukerflyt påvirkes.
- **Varsel-feil må aldri velte sweepen:** alt varsel-arbeid er best-effort bak `Promise.allSettled` (etablert mønster).
- **Ingen ny notification får mail-fallback** — bevisst, se Out of Scope.

## Key Decisions

- **pg_cron + pg_net + Next.js-endepunkt** (ikke Edge Function): handicap-frys-logikken bor i `lib/games/`/`lib/scoring/` — duplisering til Deno er forbudt terreng.
- **Per minutt med EXISTS-gate:** presisjon ≤60 s, men HTTP kun når due games finnes.
- **Gjenbruk `CRON_SECRET`:** én secret for all cron; eier slipper ny env-var + redeploy.
- **`game_started` til alle spillere på alle tre start-stier** (eier 2026-06-11, in-app nå, push når #24 bygges).
- **`auto_start_blocked` til oppretter, én gang, kun fra cron** (eier 2026-06-11).
- **Versjon: MINOR** (ny kapabilitet + to nye varsel-typer) + CHANGELOG per `docs/changelog-conventions.md`.

**Claude's Discretion:**

- Eksakt norsk varsel-copy (humanizer-kjørt), ikon/tone i NotificationCard.
- Navn/plassering av nye helpers, migrasjonsnummer (neste ledige).
- Om `checked=0`-sweeps skal logge eller returnere stille.

## Success Criteria

- [ ] `POST /api/cron/start-scheduled-games` uten/med feil bearer → 401; uten `CRON_SECRET`-env → 500 (verifiseres med curl mot lokal dev-server eller route-lesning)
- [ ] Due scheduled-spill startes av sweepen: handicap frosset + status `active` + `revalidateTag` (verifiseres via test eller kode-lesning av at sweepen kaller eksisterende `startScheduledGame` + tag-invalidering)
- [ ] `startScheduledGame` returnerer `started: true` kun for flip-vinneren — ny Type A-test grønn i `lib/games/startScheduledGame.test.ts`
- [ ] `game_started`-varsel: kind + zod + CHECK + NotificationCard-rendering + fan-out fra alle tre stier, gated på `started` (fil:linje-evidens per sti)
- [ ] `auto_start_blocked`-varsel: én gang per spill via atomisk guard, kun strukturelle årsaker — Type A-test på filteret grønn
- [ ] Migrasjon komplett (extensions, kolonne, indeks, CHECK, cron.schedule med Vault-oppslag + EXISTS-gate) og applisert i prod via MCP
- [ ] `cron.job` viser jobben scheduled i prod; `select * from cron.job_run_details order by start_time desc limit 5` viser kjøringer etter applisering

## Gates

- [ ] `npx tsc --noEmit` rent
- [ ] `npx vitest run lib/games lib/notifications components/notifications` grønt (+ co-located tester for alle endrede filer)
- [ ] `npm run build` grønt (NotificationKind-utvidelse treffer exhaustive maps)
- [ ] `npx vitest run` full suite grønn før PR
- [ ] Humanizer-skill kjørt på nye norske strenger før commit

## Files Likely Touched

- `app/api/cron/start-scheduled-games/route.ts` — nytt sweep-endepunkt
- `lib/games/startScheduledGame.ts` + `.test.ts` — `started`-flagg
- `lib/notifications/types.ts` + `.test.ts` — to nye kinds + zod
- `lib/notifications/events.ts` + `.test.ts` — `game_started`-fan-out
- `lib/notifications/autoStartBlocked.ts` (ny) + test — atomisk én-gangs-varsel
- `components/notifications/NotificationCard.tsx` + `.test.tsx` — rendering
- `app/[locale]/games/[id]/(home)/page.tsx` — E1-sti fan-out i `after()`
- `app/[locale]/admin/games/[id]/actions.ts` — admin-sti fan-out
- `supabase/migrations/009X_scheduled_start_cron.sql` — alt DB-arbeid
- `lib/database.types.ts` — ny games-kolonne
- `package.json` + `CHANGELOG.md` — MINOR-bump

## Out of Scope

- Ekte push-varsler (#24) — `game_started` blir push-kandidat når den bygges
- Mail-backup for de to nye varslene (evt. follow-up-issue)
- Varsel fra league-flight-start-stien (spillerne starter selv)
- Realtime live-flip av allerede-åpne sider ved statusendring
- Reset av blokkert-varsel ved re-planlegging
- `vercel.json`-cron (Hobby = 1×/dag, ubrukelig)
