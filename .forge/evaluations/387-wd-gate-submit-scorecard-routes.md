# Forge-evaluering: #387 — WD defense-in-depth (gate submit/scorekort/score-skriving på `withdrawn_at`)

**Verdict: ACCEPT**

Commit `25844d1` (`fix(security): gate submit/scorekort/score-skriving på withdrawn_at`). Branch `claude/xenodochial-villani-4f50af`. Alle akseptkriterier uavhengig re-verifisert mot kode, gates og LIVE database (prosjekt `glofubopddkjhymcbaph`). Migrasjon `0073` er applied i prod (`schema_migrations` version `20260605150716`, name `block_withdrawn_score_writes`).

---

## Per-AC

### AC1 — Submit-page gater trukket → PASS
`app/games/[id]/submit/page.tsx:107-110`: `if (me.withdrawn_at) redirect(\`/games/${id}\`)` ligger rett etter `me = players.find(...)` / `if (!me) notFound()` og FØR `me.submitted_at`-redirecten. Felt-eksistens verifisert: `lib/games/getGameWithPlayers.ts:154` selecter `withdrawn_at`, og typen (`:125`) har `withdrawn_at: string | null` — så `me.withdrawn_at` er ikke `undefined`-by-construction. Build grønt (se AC6).

### AC2 — Submit-action refuser trukket → PASS
`app/games/[id]/submit/actions.ts:50-61`: etter game-active-sjekken, eksplisitt `game_players`-select av `withdrawn_at` (`.maybeSingle()`), `if (meRow?.withdrawn_at) redirect(\`/games/${gameId}\`)` FØR UPDATE/notify. Dette er en EKSPLISITT sjekk — IKKE `.is('withdrawn_at', null)` lagt til UPDATE-`.is()`-kjeden (kontrakt-gråsone bekreftet: UPDATE-kjeden er uendret, fortsatt `.is('submitted_at', null)`). Ny test grønn:

```
✓ WD gate (#387): a withdrawn player is bounced to game-home, no submit, no notify
```
Testen asserter `lastRedirect() === '/games/game-1'`, `notifyMock` ikke kalt, `sendScorecardSubmittedNotificationMock` ikke kalt. FIFO-mock-rekkefølge korrekt: `[{game active}, {withdrawn_at: '...'}]` → `.maybeSingle()` popper rad 2, redirect kaster før UPDATE.

### AC3 — Scorekort-page gater trukket → PASS
`app/games/[id]/scorecard/page.tsx:105-108`: `if (me.withdrawn_at) redirect(\`/games/${id}\`)` etter `me`-oppslaget, FØR rating/layout-beregning. Samme felt-garanti som AC1.

### AC4 — RPC-guard (lag 1) → PASS (statisk + funksjonell probe)
**Statisk** (`pg_get_functiondef` mot live DB): funksjonen inneholder WD-guarden med korrekt `found`-håndtering:
- `v_has_existing := found;` fanges UMIDDELBART etter `select * into v_existing`, FØR `select exists(...) into v_withdrawn`. **Den høyest-risiko-regresjonen (`found`-clobber) er IKKE til stede** — insert-grenen bruker `if not v_has_existing` (ikke `if not found`).
- Alle tre originale grener intakte og verbatim mot `0004`: insert (ny rad), update (last-write-wins `p_client_updated_at > v_existing.client_updated_at`), no-op (eldre/lik). Ingen utilsiktet fjerning av LWW-logikk.

**Funksjonell probe** (rullet-tilbake `do $$ ... raise exception ... end $$`, ekte score-rad game `d6258d40…`, user `069cda6e…`, hull 17, orig strokes 7):
```
WITHDRAWN: was_applied=f  stored_after=7  (uendret)  ← guard no-op, ingen skriving
CONTROL  : was_applied=t  stored_after=6  (oppdatert) ← normal LWW-path virker
```
Alt rullet tilbake (P0001 fra egen RAISE). En tidlig probe med strokes=99 traff `scores_strokes_check`-violation KUN i CONTROL-grenen (funksjons-linje 59, UPDATE) — som ekstra bevis på at den ikke-trukne pathen FAKTISK forsøker skriving mens den trukne ikke gjør det.

### AC5 — RLS `WITH CHECK` (lag 2) → PASS (live pg_policies + klausul-probe)
Live `pg_policies` (tablename=`scores`):
- `scores insert by flight` (INSERT): `with_check` inneholder `((gp.submitted_at IS NOT NULL) OR (gp.withdrawn_at IS NOT NULL))` (`wc_has_wd=true`).
- `scores update by flight` (UPDATE): `qual` inneholder samme uttrykk (`qual_has_wd=true`); `with_check` uendret (`entered_by = auth.uid() OR is_admin()`).
- Begge ledende `is_admin() OR (...)` — admin-bypass bevart verbatim fra `0002`.

Klausul-probe (rullet-tilbake) på frozen-subquery-en:
```
guard_passes_when_withdrawn=f  (→ ikke-admin-grenen evaluerer false → blokkert)
guard_passes_when_active=t     (→ ikke-trukket, ikke-submitted skriver fritt)
```
Live-end-to-end RLS-test som ikke-admin-spiller på et AKTIVT spill var ikke mulig: prod har ingen scores fra en ikke-admin-spiller i et `active`-spill (`select … where g.status='active' and u.is_admin=false` → 0 rader), og jeg endret bevisst ikke game-status for å unngå prod-mutasjon. Klausul-probe + verbatim-policy-dump dekker korrektheten; full session-RLS-roundtrip er IKKE direkte observert (se Risks).

### AC6 — Ingen regresjon → PASS
- `npx vitest run "app/games/[id]/submit/actions.test.ts"` → **8 passed (8)**. De 4 eksisterende testene beholder originale assertions; hver fikk `{ data: { withdrawn_at: null }, error: null }` injisert i FIFO-posisjon 2 (etter game-`.single()`, før UPDATE) — korrekt mekanisk oppdatering, ikke svekkelse.
- `npx tsc --noEmit` → **exit 0**.
- `npm run build` → **exit 0** (full route-tre rendret, inkl. `/games/[id]/submit`).

### AC7 — Bump + CHANGELOG + commit-msg-hook → PASS
- `package.json` `1.78.1 → 1.78.2` (PATCH; origin/main = `1.78.1`). Korrekt: `fix(security)` lukker server-side smutthull, bruker-observerbar redirect.
- `CHANGELOG.md:24` `### [1.78.2] - 2026-06-05 · #387` ligger øverst i 1.78.y-serien (over `[1.78.1]` linje 43). Tre-lags struktur (tagline-blockquote + `<details>` Teknisk + Security/Changed-seksjoner). Tagline em-dash-fri, action-orientert.
- Commit `25844d1` har prefiks `fix(security)` og staget både `package.json` (endret version) + `CHANGELOG.md` → commit-msg-hooken passerte (commit eksisterer).

---

## Risks / correctness

- **Ingen infinite-retry-kø:** `lib/sync/syncWorker.ts:38-66` — `error` → `attemptCount++` + behold i kø (retry). `error == null && was_applied == false` → `rejected++` + `localDb.syncQueue.delete(item.id)` (drenert). Guarden returnerer `error=null, was_applied=false`, så et trukket mål drenerer pent. **Bekreftet trygt.**
- **Not-found-row-path (`updated_at = null`):** for et trukket mål uten eksisterende rad setter guarden `updated_at := null`. Workeren treffer da `else`-grenen (`was_applied=false`) og skriver `serverUpdatedAt: row.updated_at` (= null) til lokal Dexie — harmløst (overskrives ved neste vellykkede sync). Ingen krasj, ingen retry-loop.
- **`found`-clobber-regresjon:** IKKE til stede. `v_has_existing := found` fanges før EXISTS-spørringen. Verifisert i live funksjonsdef.
- **Falsk «levert»-suksess:** unngått. Action-en gjør eksplisitt select + redirect, ikke `.is()` i UPDATE-kjeden. UPDATE-kjeden uendret.
- **RLS bryter ikke normale skrivinger:** klausul-probe viser `guard_passes_when_active=t`. Build/test grønt.
- **Admin-bypass bevart:** `is_admin()` OR-ledd verbatim fra `0002` i live policies.
- **Ikke direkte observert:** en full ikke-admin session-RLS-roundtrip (sett `request.jwt.claims`, faktisk INSERT/UPDATE rejecteres) på et aktivt spill — pga. manglende egnet prod-data og bevisst unngåelse av prod-mutasjon. Dekket indirekte via verbatim-policy + isolert klausul-evaluering. Lav risiko, men flagges som ikke-end-to-end-verifisert.
- **UI-note (per oppdrag):** de to page-endringene er server-side `redirect()`-guards i server-komponenter; ingen ny klient-rendret WD-UI (gjenbruker #386 game-home-banner). Live Playwright-sjekk ville krevd en trukket test-spiller i prod — bevisst IKKE gjort (prod-data-forurensning). Verifisert via kode-lesing + build + unit-test, som spesifisert.

## Scope / gold-plating

- Diffen matcher kontraktens valgte scope (full defense-in-depth: submit-route + scorekort-route + score-skriving). Ingen out-of-scope-endringer: hull-sidens #386-klientlås urørt, ingen ny notify ved blokkert skriving, ingen data-backfill. 9 filer, +338/-3 — alle innenfor kontraktens komponentliste.
- Ett atomisk commit, ett logisk fokus. Commit-melding bruker `Refs #387` (PR-body får `Closes #387` per kontrakt) — konsistent med repo-PR-flyt.

## Gaps / recommendations

- **(Ikke-blokkerende, lav prioritet)** Full ikke-admin RLS-roundtrip er ikke end-to-end-verifisert mot live DB pga. manglende prod-fixture (ingen ikke-admin-score i aktivt spill). Hvis ønskelig kan dette dekkes av en pgTAP/integrasjonstest som setter opp en aktiv-spill-fixture i en rollback-tx — men det er en test-infrastruktur-investering utenfor #387s scope. Anbefales eventuelt som eget test-disiplin-issue, ikke som blokk for denne PR-en.
- Ingen andre funn. Migrasjonen er backward-compatible og påvirker kun trukne spillere som hevdet.
