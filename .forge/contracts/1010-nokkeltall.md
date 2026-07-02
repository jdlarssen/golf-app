# Contract: #1010 — Nøkkeltall: mål gjenger som spiller runde nummer to

**Issue:** https://github.com/jdlarssen/golf-app/issues/1010 (del 4 av 4 i epic #1006)
**Branch:** `claude/golf-app-issue-1006-n0bjm5` (kontrakten ble skrevet på `claude/xenodochial-poincare-63b7de`, postet som issue-kommentar 2026-07-02; den branchen ble slettet ved #1008-merge — issue-kommentaren er sannhets-ankeret)
**PR body:** `Closes #1010` + `Part of #1006`

## Goal

Admin-flaten («Sekretariatet», `/admin`) får et «Nøkkeltall»-kort som viser om rundene sår nye runder: (1) antall brukere med ≥2 fullførte spill + andel av brukere med ≥1, (2) antall gjenger med ≥2 fullførte spill, (3) fullførte spill per uke siste 8 uker (Oslo-uker). Kun admin — håndhevet i databasen, ikke bare UI. Ingen ny tracking, ingen nye skriveveier.

## Gray-area decisions (recorded assumptions)

| # | Question | Decision | Rationale |
|---|---|---|---|
| 1 | «Gjeng»-definisjon | **(b) distinkt spillersett**: fingerprint = sortert liste av ikke-trukne `user_id` per fullført spill med ≥2 spillere; en gjeng = fingerprint med ≥2 fullførte spill. Ingen konfigurerbarhet. | Issue: «enkleste ærlige varianten vinner». Exact-set er deterministisk og forklarbar; kjent begrensning (én ny spiller = ny gjeng) dokumenteres i RPC-kommentaren. (a) per-arrangør måler arrangøren, ikke gjengen; (c) 50 %-overlapp er konfigurerbarhets-krattet issuet forbyr. |
| 2 | DB-håndhevelse | **SECURITY DEFINER-RPC `admin_key_metrics()`** med `if not public.is_admin() then raise exception 'not_authorized'`, `set search_path = ''`, `revoke execute from anon, public` + `grant execute to authenticated`. 0076-malen + 0104-herdingen (#671). | Issue-krav «håndhevet i RLS — ikke bare UI». Ingen read-only admin-RPC finnes fra før; 0076 `admin_create_club` er nærmeste mal. App-lag-varianten (unstable_cache + service-role) har ingen DB-side sjekk og forkastes. |
| 3 | Ukeinndeling | I Postgres: `date_trunc('week', ended_at AT TIME ZONE 'Europe/Oslo')`, siste 8 uker inkl. inneværende, null-fylt serie fra RPC-en. | Postgres håndterer DST korrekt (osloYearWindow-trikset i TS er trygt kun for årsgrenser); `ended_at` er ferdig-tidspunktet, ikke created_at. |
| 4 | Aggregering hvor | **Alt i én RPC, ett rundtur, returns jsonb**: `{ users_ge1, users_ge2, gjenger_ge2, weeks: [{week_start, finished}] }`. Ingen cache — spørringen er billig på dagens volum (hundretalls spill). | Issue: «enkleste løsning som tåler dagens datavolum uten indeks-akrobatikk». |
| 5 | Plassering + form | Egen label-seksjon «Nøkkeltall» på `/admin` mellom TilesGrid og Aktivitet-seksjonen, som Suspense-child à la ActionItemsStripe. `components/ui/Card`-primitiv, tre tall-rader + kompakt 8-ukers rad, `tabular-nums`. Presentasjons-komponent skilles fra data-fetch-wrapper (PlayerKlubbhus-test-mønsteret). | Etablerte primitiver; testbarhet. |
| 6 | Telle-detaljer | Brukere: `game_players` × `games.status='finished'`, `withdrawn_at is null`. Gjeng-fingerprint: samme filter + spill med ≥2 ikke-trukne spillere. Trend: alle fullførte spill uansett spillerantall. | Trukne spillere fullførte ikke runden. |
| 7 | CHANGELOG | Kort Funksjoner-linje (admin-synlig funksjon er bruker-synlig for eieren) — avgjøres endelig mot presedens ved ship. | |

## Architecture

- **Migrasjon `0126_admin_key_metrics.sql`**: RPC per beslutning 2+4+6, header med issue-ref + staging-først-advarsel. Staging → verifiser (manuell SQL-kontroll + hostile probe med spiller-JWT) → prod. Types: Functions-seksjonen i `lib/database.types.ts` oppdateres for hånd i generator-stil (drift-gaten er fasit).
- **UI**: `app/[locale]/admin/KeyMetricsCard.tsx` (async Suspense-child, `getAdminContext()`-klient → `.rpc('admin_key_metrics')` med adminens JWT) + presentational `KeyMetricsView` med `data-testid`. Render `null` ved RPC-feil (ActionItemsStripe-disiplinen). Catalog-nøkler i begge språk.
- **Tester**: én Type C-rendertest på KeyMetricsView (data-testid, aldri norsk copy). Aggregerings-logikken bor i SQL → verifiseres mot manuell SQL på staging (issue-kriterium); pgTAP-fil for grants/gate (kjøres lokalt, `npm run test:rls`-mønsteret) hvis friksjonsfritt — ellers dokumentert hostile-probe på staging.

## Success criteria

- [x] Admin ser kortet med de tre tallene + 8-ukers trend på `/admin` — RPC kjørt på staging med ekte admin-JWT-claims (samme GUC-miljø som PostgREST): korrekt payload `{users_ge1: 2, users_ge2: 0, gjenger_ge2: 0, weeks: 8 × {week_start, finished}}`; payload-formen matcher `parseMetrics`-kontrakten i `KeyMetricsCard.tsx`; Type C-rendertest grønn + `npm run build` grønn. **Avvik:** browser-klikkrunden på staging ble ikke kjørt i denne sesjonen — sandbox-policyen nektet autonom staging-innlogging (passord-/cookie-mint). Wiring-mønsteret (Suspense-child + getAdminContext) er identisk med ActionItemsStripe. Eieren bør åpne `/admin` på staging/prod som visuell sisteverifisering.
- [x] Ikke-admin får ikke dataene — staging-probet: spiller-JWT (`sub` = ikke-admin) → `P0001 not_authorized`; tom claims (anon-ekvivalent auth.uid()=null) → `not_authorized`; `has_function_privilege('anon', …)` = false; ingen PUBLIC-grant; SECURITY DEFINER + `search_path` bekreftet i katalogen. pgTAP-fil `supabase/tests/admin_key_metrics_gate_test.sql` låser tilstanden.
- [x] Tallene stemmer mot manuell SQL-kontroll på staging — uavhengig formulert kontroll-SQL ga eksakt match (users_ge1=2, users_ge2=0, gjenger_ge2=0, inneværende uke=1, 0 finished-spill uten ended_at). ≥2-grenene bekreftet med syntetisk probe (klonet det fullførte spillet i en transaksjon som alltid ruller tilbake via raise): users_ge2=2, gjenger_ge2=1, uke-telling 2 — null residue etterpå.
- [x] Oslo-uker — `date_trunc('week', … at time zone 'Europe/Oslo')` i RPC-en; staging-payload ga korrekt mandagsstart 2026-06-29 for inneværende uke (2026-07-02).
- [x] Maks én Type C-rendertest (én `it` i `KeyMetricsView.test.tsx`, kun data-testid/tall); ingen nye skriveveier (RPC-en er ren SELECT/STABLE); ingen ny tracking.
- [x] Gates grønne — `npx tsc --noEmit` clean, `npx eslint .` 0 errors, full `npx vitest run` 352 filer / 4463 tester grønne, `npm run build` exit 0. Drift-gate: migrasjonen påført staging → verifisert → prod; håndskrevet Functions-oppføring diffet byte-identisk mot friskt genererte prod-typer.
- [x] Versjon 1.164.0 → 1.165.0 (minor) på feat-commiten + CHANGELOG Funksjoner-rad med `↳ /admin · «Se tallene»` (presedens: 1.161, admin-synlig funksjon får rad).

## Out of scope

- Historisk baseline-eksport, grafer/chart-bibliotek, konfigurerbar gjeng-definisjon, caching/materialisering, klubb-scoping
