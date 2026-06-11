# Evaluering: #502 — tidsstyrt auto-start av planlagte spill (pg_cron)

**Verdict: ACCEPT**

Null ship-blockers (SF). Tre ikke-blokkerende nits (NIT-1/2/3). Alle gates kjørt på nytt med fersk kontekst og bestått. Migrasjonen (0094) er gransket kritisk og prod-state verifisert (deploy-gated kriterier 6/7 er legitimt utestående).

Kontrakt: `.forge/contracts/502-scheduled-start-cron.md`
Branch: `claude/tender-rosalind-4e6233` · 5 commits over `origin/main` (1.110.2 → 1.111.0)

---

## Gates (re-kjørt av evaluator)

| Gate | Resultat | Evidens |
|---|---|---|
| `npx tsc --noEmit` | PASS | `TSC_EXIT=0`, ingen output |
| `npx vitest run lib/games lib/notifications components/notifications "app/[locale]/admin/games/[id]/actions.test.ts"` | PASS | 31 filer, **563/563** grønne (3.22s) |
| `npm run build` | PASS | `✓ Compiled successfully`; route-lista viser `ƒ /api/cron/start-scheduled-games`; 81 ◐ PPR-ruter intakt |
| `npx vitest run` (full) | PASS | 256 filer, **3119/3119** grønne (30s) |
| Auth-gate (dev-server `CRON_SECRET=evaltest`, port 4503) | PASS | se under |

### Auth-gate curl-matrise (korrekt bearer ALDRI sendt)

```
POST no auth:        401
POST wrong bearer:   401
POST empty bearer:   401
GET  (no handler):   405
PUT  (no handler):   405
```

500-stien (manglende `CRON_SECRET`) ikke kjørt mot levende server (ingen `.env*`-fil definerer `CRON_SECRET` utenom `.env.example`; Next laster .env-filer ufrivillig), men koden er en linje-for-linje-kopi av den eksisterende, testede `product-update-digest/route.ts:17-21` (`if (!secret) return 500`). Verifisert ved direkte fil-sammenligning. PASS (struktur-bevis).

---

## Per kriterium

### 1. POST uten/feil bearer → 401; uten env → 500 — **PASS**
`route.ts:39-49`: `if (!secret) return 500`, deretter `if (authHeader !== `Bearer ${secret}`) return 401`. Curl-matrise bekrefter 401 på no/wrong/empty bearer, 405 på GET/PUT (ingen handler eksportert). Speiler `product-update-digest/route.ts:17-25` eksakt.

### 2. Due scheduled-spill startes av sweepen — **PASS**
`route.ts:61-67` selecter `status='scheduled' AND scheduled_tee_off_at <= now() AND >= now()-7d`. `route.ts:83` kaller `startScheduledGame(admin, game.id)` (eksisterende frys+flip-helper). `route.ts:90` `revalidateTag(`game-${id}`, 'max')` for vinnere. Service-role-klient (`getAdminClient`, route.ts:54) — samme RLS-bypass-begrunnelse som E1.

### 3. `startScheduledGame` returnerer `started: true` kun for flip-vinneren — **PASS**
`startScheduledGame.ts:170-178`: flip-UPDATE har `.eq('status','scheduled').select('id')`; `started = (flipped?.length ?? 0) > 0`. Allerede-aktiv-tidlig-retur (`startScheduledGame.ts:82-84`) gir `started: false`. Tester (`startScheduledGame.test.ts:226-272`): vinner `[{id}]`→true; 0-raders flip `[]`→false; allerede-aktiv→false. Additivt — eksisterende callere (admin/E1/league) kompilerer (tsc rent).

### 4. `game_started`-varsel komplett — **PASS**
- Kind+zod: `types.ts:204-207` (`gameStartedSchema`), i `NotificationKind`-union (`types.ts:28`) og `schemas`-map (`types.ts:240`).
- CHECK: migrasjon `0094:73`.
- Rendering: `NotificationCard.tsx:269-275` («Runden er i gang» + game_name), emoji `⛳` (`NotificationCard.tsx:43`).
- Deeplink: `InboxClient.tsx:201-204` → `/games/[game_id]`.
- Fan-out gated på `started === true` på alle tre stier: cron `route.ts:86`, E1 `page.tsx:333` (inne i `after()`, ekskl. besøkende via `p.user_id !== userId`), admin `actions.ts:107` (ekskl. admin via `p.user_id !== user.id`).
- Helper `notifyPlayersGameStarted` (`events.ts:58-81`): `Promise.allSettled`, best-effort, kun in-app (ingen mail). Test `events.test.ts:243-281`.

### 5. `auto_start_blocked`-varsel én gang, kun strukturelle årsaker — **PASS**
- `autoStartBlocked.ts:60-67`: atomisk vinn-raden-update (`.is('auto_start_blocked_notified_at', null).eq('status','scheduled').select('id').maybeSingle()`) — deliveryReminder-mønster. Ingen rad → return før notify.
- Strukturell-filter `STRUCTURAL_BLOCK_REASONS` (`autoStartBlocked.ts:12-18`): `incomplete_sides, pending_players, no_players, tee_missing, tee_missing_rating`. Transiente (`db_players, db_game, not_found, not_scheduled`) gir ingen DB-touch (`autoStartBlocked.ts:49`).
- `created_by` null → skip + log (`autoStartBlocked.ts:50-56`).
- Fyres KUN fra cron (`route.ts:120-131`).
- Tester `autoStartBlocked.test.ts`: 9 cases — filter begge veier, vant/tapte raden, transient-rører-ikke-DB, null-creator.

### 6. Migrasjon komplett + applisert i prod — **DEPLOY-GATED (fil komplett)**
Fil `0094_scheduled_start_cron.sql` gransket (se «Migrasjon» under) — komplett og korrekt. Prod-state verifisert via MCP `execute_sql`: `pg_cron_installed=0, pg_net_installed=0, col_exists=0, idx_exists=0` → migrasjonen er IKKE applisert ennå, korrekt per kontraktens rekkefølge (PR merges → deploy → applisering).

### 7. `cron.job` scheduled i prod + kjøringer — **DEPLOY-GATED**
Kan ikke verifiseres før applisering (pg_cron ikke installert). Cron-jobb-SQL gransket og korrekt (se under).

---

## Migrasjon 0094 — kritisk gransking

**Extensions (0094:27-31):** `create extension if not exists pg_cron with schema pg_catalog` + `grant usage on schema cron to postgres` + `grant all privileges on all tables in schema cron to postgres`; `create extension if not exists pg_net with schema extensions`. Matcher Supabase-docs-resepten. MCP bekrefter pg_cron 1.6.4 + pg_net 0.20.0 begge available (installed_version null), supabase_vault 0.3.1 installert i `vault`. Merk: pg_cron lager alltid sitt eget `cron`-skjema uavhengig av `with schema pg_catalog`, så `cron.schedule`/`cron.job` finnes. Korrekt.

**Kolonne (0094:37-38):** `add column if not exists auto_start_blocked_notified_at timestamptz` — idempotent. Speilet i `database.types.ts` Row(622)/Insert(655)/Update(688), alle `string | null` / `?: string | null`. Korrekt i alle tre blokker.

**Partiell indeks (0094:43-45):** `on games (scheduled_tee_off_at) where status='scheduled'`, `if not exists`. Speiler EXISTS-gaten. Korrekt.

**CHECK-constraint (0094:50-75):** Drop (uten `if exists` — konsistent med 0035/0068/0069/0075/0076/0077/0079/0082-presedens) + re-add. **Verifisert mot LEVENDE prod-constraint** via `pg_get_constraintdef`: prod har nøyaktig 19 kinds; migrasjonen reproduserer alle 19 + de 2 nye (`game_started`, `auto_start_blocked`) = 21. Krysset mot `NotificationKind`-unionen (`types.ts:8-29`) — komplett match, ingen kind droppet, ingen ekstra. **Dette er den mest kritiske verifikasjonen og den holder.**

**Cron-jobb (0094:86-109):** `cron.schedule('start-scheduled-games', '* * * * *', $job$ ... $job$)`. Dollar-quoting: nøyaktig to `$job$`-markører (open 89, close 108), ingen nestet same-tag dollar-quote, body bruker kun enkle anførselstegn — gyldig. `net.http_post(url, headers := jsonb_build_object(...), body := '{}'::jsonb, timeout_milliseconds := 30000)` — korrekt navngitt-parameter-API for pg_net 0.20.0. Vault-oppslag `(select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')` — standard mønster. EXISTS-gate speiler route-vinduet (status='scheduled', tee passert, ≥now()-7d). `cron.schedule` upserter på jobbnavn → re-kjørbar.

---

## Edge Cases & Guardrails (kontrakt-seksjon, punkt for punkt)

| Guardrail | Status | Verifikasjon |
|---|---|---|
| Kappløp cron/E1/admin → exactly-once fan-out | PASS | `started`-flagg gater alle tre (`route.ts:86`, `page.tsx:333`, `actions.ts:107`); flip `.eq('status','scheduled').select('id')` → kun én vinner |
| Permanent blokkert → 7-d-vindu stopper evig retry | PASS | EXISTS-gate (mig. 105-106) + route `.gte(windowStart)` (route.ts:57-66) — belt-and-suspenders |
| Re-planlagt → notified_at IKKE nullstilt | PASS (kjent begrensning) | Dokumentert `autoStartBlocked.ts:35-36` + mig.-kommentar |
| `created_by` null → hopp over + logg | PASS | `autoStartBlocked.ts:50-56` |
| Vault/endepunkt mangler → 401/404 logges, ingen flyt | PASS | EXISTS-gate + kontrakt-dokumentert |
| Varsel-feil velter aldri sweep | PASS (m/NIT-1) | `notifyPlayersGameStarted` allSettled (events.ts:63); roster-feil håndtert (route.ts:101); se NIT-1 |
| Ingen ny mail-fallback | PASS | `notifyPlayersGameStarted` ignorerer `shouldAlsoSendMail`; `autoStartBlocked` kaller `notify` direkte uten mail |
| E1 `notify()` i `after()` render-safe | PASS | `page.tsx:337` wrapper i `after()`; `notify()` kaller `revalidateTag` (notify.ts:66) som kaster i render — samme `after()`-mønster som linje 325 |
| vercel.json / proxy.ts urørt | PASS | begge fraværende fra diff |
| League-flight-sti urørt | PASS | ingen league-fil i diff |

---

## Funn

### Ship-blockers (SF)
Ingen.

### Nits (NIT — ikke-blokkerende)

**NIT-1 — `getAdminClient()` utenfor try/catch i `maybeNotifyAutoStartBlocked`.**
`lib/notifications/autoStartBlocked.ts:58` kaller `const admin = getAdminClient();` FØR try-blokken (linje 59). `getAdminClient` kaster hvis `SUPABASE_SERVICE_ROLE_KEY` mangler (`lib/supabase/admin.ts:12-14`). Docstring (linje 38) lover «svelger alle feil … kaster aldri». I praksis uoppnåelig: cron-routens egen `getAdminClient()` (route.ts:54) har allerede kastet før loopen nås, så env-varen er garantert satt. Ufarlig, men docstring overlover marginalt. Vurder å flytte inn i try, eller stram docstringen.

**NIT-2 — `maybeNotifyAutoStartBlocked` lager en NY admin-klient i stedet for å gjenbruke routens.**
Routen har allerede `admin` (route.ts:54) men sender den ikke videre; helperen kaller `getAdminClient()` på nytt (autoStartBlocked.ts:58). To klient-instanser per blokkert spill. Mikroskopisk overhead, ingen funksjonell effekt. Konsistent med deliveryReminder-presedensen (selvstendig helper), så defensibelt.

**NIT-3 — `started_at` settes ved auto-start, men intet test-assert på verdien.**
`startScheduledGame.ts:172` skriver `started_at: new Date().toISOString()` i flip-UPDATE. Testene asserter `{ ok: true, started: true }` men ikke at `started_at` ble satt i update-payloaden. Lav verdi — kolonnen er ikke ny i dette issuet og flippen er allerede dekket — men hvis `started_at` regresjons-fjernes fanges det ikke her. Ikke verdt en egen test per test-disiplin (én logikk-test per spørsmål).

---

## Oppsummering
Implementasjonen følger kontrakten tett: cron-endepunkt med korrekt auth-gate, `started`-flagg som garanterer exactly-once `game_started`-fan-out på tvers av tre kappløpende start-stier, atomisk én-gangs `auto_start_blocked`-guard, komplett migrasjon med prod-verifisert CHECK-paritet (19→21 kinds), og urørt vercel.json/proxy.ts/league-sti. Alle 5 ikke-deploy-gatede kriterier PASS, begge deploy-gatede kriterier legitimt utestående med komplett+korrekt migrasjonsfil. Null ship-blockers.

**ACCEPT.**
