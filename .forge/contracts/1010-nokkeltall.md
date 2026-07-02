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

- [ ] Admin ser kortet med de tre tallene + 8-ukers trend på `/admin`
- [ ] Ikke-admin får ikke dataene: RPC med spiller-JWT feiler med `not_authorized` (staging-probet, ikke bare skjult UI); anon har ikke EXECUTE
- [ ] Tallene stemmer mot manuell SQL-kontroll på staging (dokumentert i evaluering)
- [ ] Oslo-uker: ukegrensene beregnes i `Europe/Oslo` (DST-trygg `AT TIME ZONE`-trunkering)
- [ ] Maks én Type C-rendertest; ingen nye skriveveier; ingen ny tracking
- [ ] Gates grønne: lint, build, full vitest; drift-gate grønn (Functions-typene matcher gen:types)
- [ ] Versjon + evt. CHANGELOG per beslutning 7

## Out of scope

- Historisk baseline-eksport, grafer/chart-bibliotek, konfigurerbar gjeng-definisjon, caching/materialisering, klubb-scoping
