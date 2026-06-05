# Forge-kontrakt: WD defense-in-depth — gate submit/scorekort/score-skriving på `withdrawn_at` (#387)

**Issue:** [#387](https://github.com/jdlarssen/golf-app/issues/387)
**Branch:** `claude/xenodochial-villani-4f50af`
**Flyt:** 5 — Kjør og avslutt spill
**Oppfølging fra:** #386 (WD/trekk spiller, shipped v1.65.0) — evaluator-funn
**Bump:** PATCH → `fix(security)` (lukker server-side smutthull; bruker-observerbar redirect)

## Problem

#386 ga oss WD («Trukket»): en spiller kan trekkes ut av rangeringen midt i et aktivt spill (`game_players.withdrawn_at` settes). Scorekort-låsen skjuler tasting på hull-siden for en trukket spiller — men **klienten er den eneste vakten**:

1. **Submit-ruten** (`/games/[id]/submit` + `submitScorecard`-action) er ikke gated. En trukket spiller kan levere scorekort via direkte URL eller direkte POST til server-action.
2. **Scorekort-ruten** (`/games/[id]/scorecard`) er read-only, men viser fortsatt kortet for en trukket spiller.
3. **Score-skriving** går klient → Dexie → `upsert_score_if_newer`-RPC (RLS-gated). Hull-låsen er ren `disabled`-attributt; en direkte `.from('scores')`-skriving eller devtools-bypass omgår den.

**Konsekvens i dag:** ingen rangerings-effekt (`withdrawn_at` ekskluderer dem fra leaderboard uansett, endGame-gaten hopper over dem, `submitted_at` beholdes bevisst). Dette er en løs ende, ikke en korrekthetsbug — men brukeren har bedt om full defense-in-depth.

## Beslutninger (avklart med bruker 2026-06-05)

1. **Gate-omfang:** FULL defense-in-depth — submit-ruten + scorekort-ruten + score-skriving server-side. (Ikke bare submit.)
2. **Scorekort-ruten:** trukket spiller redirectes bort til game-home (ikke bare låst read-only). Uniform «trukket = ute»-følelse.
3. **Redirect-mål:** game-home (`/games/[id]`) — som allerede rendrer «Du har trukket deg fra spillet»-banner + Angre-knapp (#386, `page.tsx:685`). Ingen ny query-param-banner trengs; målet forklarer seg selv.

### Bakte-inn gråsoner (mine beslutninger)

- **To-lags score-skriving-hardening.** Sync-workeren (`lib/sync/syncWorker.ts`) behandler en RPC-`error` som «retry» (blir liggende i køen → uendelig retry hver 30s), men `error == null && was_applied == false` som «konsumert» (køelement slettes pent). Derfor:
  - **Lag 1 — RPC-guard** i `upsert_score_if_newer`: trukket mål → returnér en graceful no-op (`was_applied = false`) UTEN å forsøke skriving. Sync-køen drenerer pent; ingen uendelig retry.
  - **Lag 2 — RLS `WITH CHECK`** på `scores` INSERT/UPDATE: blokkér enhver *direkte* (ikke-RPC) skriving til en trukket spillers scorer. Speiler den eksisterende `submitted_at`-frosne guarden (`0002_rls_policies.sql:113` / `:126`) — utvider `submitted_at is not null` til `(submitted_at is not null or withdrawn_at is not null)`.
  - De to lagene kolliderer ikke: RPC-guarden returnerer FØR skriving, så RLS-`WITH CHECK` evalueres aldri via RPC for trukne mål. Direkte skriving treffer RLS-rejecten (ønsket blokk; ingen sync-kø der → ingen retry-loop).
- **Eksisterende scorer bevares.** Hverken lag rører lagrede rader — kun nye skrivinger blokkeres. Angre (`withdrawn_at = null`) gjenåpner skriving umiddelbart.
- **Admin-bypass beholdt.** Den eksisterende RLS-guarden lar `is_admin()` skrive selv til submitted/trukne spillere; jeg speiler det (admin kan fortsatt korrigere ved behov).
- **Submit-action-redirect ≠ falsk suksess.** Jeg legger IKKE `withdrawn_at`-sjekk i selve UPDATE-`.is()`-kjeden (det ville gitt 0 rader = «allerede levert» → `?status=submitted`, som lyver til spilleren). I stedet eksplisitt `withdrawn_at`-select + redirect til game-home FØR UPDATE.
- **Backward-compatible migrasjon.** Både RPC-`create or replace` og RLS-policy-stramming påvirker kun trukne spillere; gammel klient skriver alltid via RPC. Trygt å kjøre FØR kode-deploy. Migrasjonen hentes mot LIVE `pg_policies` før skriving, så DROP+CREATE ikke reverterer en senere drift fra 0025/0031.

## Komponenter

1. **Submit-page-gate** (`app/games/[id]/submit/page.tsx`): etter `me`-oppslaget, `if (me.withdrawn_at) redirect(\`/games/${id}\`)`. Speiler nøyaktig den eksisterende `me.submitted_at`-redirecten (`:108`).
2. **Submit-action-gate** (`app/games/[id]/submit/actions.ts`): etter game-active-sjekken, et `game_players`-select for innlogget brukers `withdrawn_at`; hvis satt → `redirect(\`/games/${id}\`)` før UPDATE/notify. Dette er den sikkerhets-kritiske server-side-håndhevingen (direkte POST blokkeres).
3. **Scorekort-page-gate** (`app/games/[id]/scorecard/page.tsx`): etter `me`-oppslaget, `if (me.withdrawn_at) redirect(\`/games/${id}\`)`.
4. **Migrasjon `0073_block_withdrawn_score_writes.sql`:**
   - `create or replace function public.upsert_score_if_newer(...)` med WD-guard (lag 1). Bruk en eksplisitt `v_has_existing boolean := found`-flagg så guard-EXISTS-spørringen ikke skrur av `found` for den eksisterende `if not found then insert`-grenen.
   - DROP+CREATE «scores insert by flight» + «scores update by flight» med `withdrawn_at`-vilkåret lagt til (lag 2), basert på LIVE pg_policies-definisjon.
5. **Tester:** ny submit-action-test (trukket → game-home, ingen submit, ingen notify); de 4 eksisterende submit-action-testene som passerer en game-aktiv-sjekk får `{ data: { withdrawn_at: null }, error: null }` injisert i FIFO-køen rett etter game-select (mekanisk, nødvendig fordi den nye spørringen forskyver køen).
6. **Bump + CHANGELOG** (PATCH, `fix(security)`) — humaniser den norske taglinen.

## Akseptkriterier

- [ ] **AC1 — Submit-page gater trukket:** en trukket spiller som åpner `/games/[id]/submit` redirectes til game-home server-side, før skjemaet rendres. *(kode + build)*
- [ ] **AC2 — Submit-action refuser trukket:** `submitScorecard` redirecter en trukket spiller til game-home; ingen `submitted_at`-skriving, ingen notify, ingen mail. *(ny vitest-test grønn)*
- [ ] **AC3 — Scorekort-page gater trukket:** en trukket spiller som åpner `/games/[id]/scorecard` redirectes til game-home. *(kode + build)*
- [ ] **AC4 — RPC-guard (lag 1):** `upsert_score_if_newer` returnerer `was_applied = false` no-op for et trukket mål, uten insert/update; eksisterende rad bevares; ikke-trukket mål uendret. *(migrasjon applied + `pg_get_functiondef` viser guarden)*
- [ ] **AC5 — RLS `WITH CHECK` (lag 2):** `scores` INSERT + UPDATE blokkerer skriving til en trukket spillers scorer (speiler `submitted_at`-mønsteret); ikke-trukket skriving upåvirket. *(migrasjon applied + `pg_policies` viser `withdrawn_at` i begge policy-uttrykk)*
- [ ] **AC6 — Ingen regresjon:** de eksisterende submit-action-testene grønne etter FIFO-oppdatering; `tsc --noEmit` rent; `npm run build` grønt. *(gate-output)*
- [ ] **AC7 — Bump + CHANGELOG + commit-msg-hook:** PATCH-bump, humanisert CHANGELOG-tagline, `fix(security)`-commit passerer `.githooks/commit-msg`. *(commit-output)*

## Gates (scoped til det som endres)

1. `npx vitest run "app/games/[id]/submit/actions.test.ts"` → grønt
2. `npx tsc --noEmit` → rent
3. `npm run build` → grønt
4. Supabase MCP: `apply_migration` 0073 → `execute_sql` verifiserer (a) funksjonsdef inneholder WD-guarden, (b) begge scores-write-policies inneholder `withdrawn_at`
5. `.githooks/commit-msg` passerer på `fix(security)`-commit (bump + CHANGELOG staget)

## Ikke i scope (unngå gold-plating)

- Endring av hull-sidens #386-klientlås (allerede shipped; uendret).
- WD-semantikk for matchplay/pott-format (egne oppfølginger, jf. #386).
- Ny notify ved blokkert skriving — stille no-op er riktig (trukket spiller forventer ikke å skrive).
- Backfill / migrering av eksisterende data (ingen — kun nye skrivinger gates).

## Deploy-ordre (operasjonelt)

Backward-compatible (påvirker kun trukne spillere). Plan: skriv migrasjonsfil → hent live pg_policies → ferdigstill migrasjon → `apply_migration` via Supabase MCP (prosjekt `glofubopddkjhymcbaph`) som et bevisst verifisert steg → verifiser funksjon + policies → commit kode-PR. Migrasjons-apply skjer utenfor selve bygge-løkka, ikke stille inni.

## Commit-plan

Én atomisk commit (ett logisk fokus = «trukne spillere kan ikke skrive/levere»):

`fix(security): gate submit/scorekort/score-skriving på withdrawn_at (#387)` — submit-page + submit-action + scorekort-page-gater, migrasjon 0073 (RPC-guard + RLS), submit-action-tester, PATCH-bump + CHANGELOG. `Closes #387` i PR-body.
