# Evaluation: Fase 2 av #223 — Vedlikeholds-trygghet og filter på bane-admin

**Commit:** `e70b7c3` på `claude/admiring-grothendieck-1a0b84`
**Contract:** `.forge/contracts/223-courses-phase2-vedlikehold-og-filter.md`
**Evaluator-runde:** 2026-05-25
**Verdict:** **ACCEPT**

---

## Sammendrag

Alle åtte success-criteria er oppfylt med kode + tester + migrasjons-evidens. Alle gates passerer. Filer som ble berørt matcher kontraktens «Files Likely Touched» nøyaktig — null scope-creep. Soft-archive-logikken er trygt guard-et for tomme arrays. Historiske spill (`getGameWithPlayers`, `admin/games/[id]`, `admin/games/[id]/edit`, `startScheduledGame`) leser fortsatt tee_boxes uten `archived_at`-filter, slik kontrakten krever for å bevare bakover-kompatibilitet. Versjonering + CHANGELOG følger Tørny-disiplinen til punkt og prikke.

---

## Per-Success-Criterion-tabell

| # | Kriterium | Status | Evidens |
|---|---|---|---|
| 1 | Migration `0037_courses_audit_and_tee_archive` applisert i Supabase | PASS | `list_migrations` viser `20260525170257 / courses_audit_and_tee_archive`. `list_tables` bekrefter `courses.updated_at` (timestamptz, default now()), `courses.updated_by` (uuid, nullable, FK til `users.id`), og `tee_boxes.archived_at` (timestamptz, nullable). Lokal SQL i `supabase/migrations/0037_courses_audit_and_tee_archive.sql:18-40` matcher applikert state. Column-comments fra migrasjonen er tilstede i DB-en. |
| 2 | `updateCourse` setter `updated_at` + `updated_by` | PASS | `app/admin/courses/[id]/edit/actions.ts:64` destrukturerer `{ supabase, user } = await requireAdmin()`. Linje 199-206 oppdaterer courses med `updated_at: new Date().toISOString(), updated_by: user.id`. |
| 3 | Admin kan fjerne in-use tee uten error; in-use → soft-archive, ubrukt → hard-delete | PASS | `actions.ts:182-197` deler `toDelete` i `toArchive` (de som finnes i `games.tee_box_id`) og `toHardDelete` (resten). Linje 250-263 utfører hard-delete på `toHardDelete` og update `{ archived_at: now() }` på `toArchive`. Begge wrapped i `length > 0`-guards. Tidligere `tee_in_use`-error helt fjernet — `grep -rn "tee_in_use" app/ lib/` returnerer 0 hits. |
| 4 | Arkiverte tees skjules fra CourseForm + new-game-picker | PASS | `app/admin/courses/[id]/edit/page.tsx:188` legger på `.is('archived_at', null)` på tees-fetchen i `EditCourseFormBody`. `lib/games/newGameFormData.ts:67` filtrerer `t.archived_at === null` på embed-resultatet. |
| 5 | Historiske spill kan fortsatt rendres med arkivert tee | PASS | `grep -rn "tee_boxes" lib/games/ app/admin/games/` bekrefter at `getGameWithPlayers.ts:132`, `startScheduledGame.ts:58`, `app/admin/games/[id]/page.tsx:181`, og `app/admin/games/[id]/edit/page.tsx:237` alle leser tees via FK uten `archived_at`-filter. FK `games_tee_box_id_fkey` er fortsatt strikt — arkiverte rader beholdes for join. |
| 6 | Sort-dropdown endrer rekkefølgen til Sist endret / Flest aktive spill | PASS | `CoursesLedgerClient.test.tsx:172-185` — test «endrer rekkefølge når sort-dropdown velges» — bytter til `active_game_count`, asserter DOM-rekkefølge `c > a > b` (5 > 2 > 0). `CoursesLedgerClient.test.tsx:85-93` + `95-103` dekker `updated_at` og `active_game_count` med tiebreaker via `applySortAndFilter`. Sort-implementasjonen i `CoursesLedgerClient.tsx:78-90` er pure og bruker spread (ingen mutasjon av input). |
| 7 | Filter-chip «Har dame-tee» filtrerer ut baner uten dame-tee | PASS | `CoursesLedgerClient.test.tsx:187-199` — chip-toggle endrer `aria-pressed` fra `false` til `true`, viser kun de to ladies-banene (`Stiklestad`, `Trondheim`), skjuler `Sjø-bane Trondheim`. Test «AND-kombinerer flere chips» (linje 201-210) bekrefter to-chip-toggle. |
| 8 | «Endret DATO (av NAVN)» vises på liste + edit-flate etter første updateCourse | PASS | `CoursesLedgerClient.test.tsx:224-230` asserter at minst én rad har kicker som starter med «Endret» og minst én med «Lagt til». `rowKicker`-helperen (`CoursesLedgerClient.tsx:44-51`) bruker 60-sek buffer. På edit-flaten implementerer `buildAuditKicker` (`app/admin/courses/[id]/edit/page.tsx:64-82`) samme logikk, inkludert «av NAVN»-suffiks når `updated_by_user` er tilgjengelig, med fallback til ingen navn ved NULL. `displayName`-helperen (linje 57-62) håndterer både array- og objekt-form fra PostgREST. |

---

## Per-Gate-tabell

| Gate | Status | Output |
|---|---|---|
| `npx tsc --noEmit` | PASS | Ingen output (clean) |
| `npx vitest run app/admin/courses/` | PASS | `Test Files 2 passed (2), Tests 33 passed (33)` — 13 nye + 20 fra Fase 1 |
| `npx vitest run lib/games/` | PASS | `Test Files 10 passed (10), Tests 134 passed (134)` — newGameFormData-endringen forårsaker ingen regresjon |
| `npx vitest run` (full suite) | PASS | `Test Files 97 passed (97), Tests 1126 passed (1126)` — eksakt 1126 som hevdet (1113 baseline + 13 nye) |
| `npx eslint app/admin/courses/ lib/games/newGameFormData.ts app/admin/courses/[id]/edit/` | PASS | Ingen output (clean) |
| Pre-commit humanizer-hook | PASS | `git diff origin/main..HEAD -- '*.tsx' '*.ts'` på nye linjer matcher ingen kjente AI-tells (vennligst / tap kort / X-spillet / em-dash-kjeder). Hooken ville ikke ha advart. |
| Migration applisert via Supabase MCP | PASS | `list_migrations` returnerer `courses_audit_and_tee_archive` som siste migrasjon (versjon 20260525170257). `list_tables` med `verbose: true` bekrefter alle tre kolonner med korrekte typer + comments. |

---

## Sanity-sjekker

### Scope-creep
**Ingen.** `git diff --stat origin/main..HEAD` viser 12 filer endret:

- `supabase/migrations/0037_courses_audit_and_tee_archive.sql` — kontrakt §3 (filer)
- `app/admin/courses/[id]/edit/actions.ts` — kontrakt §3
- `app/admin/courses/[id]/edit/page.tsx` — kontrakt §3
- `app/admin/courses/page.tsx` — kontrakt §3
- `app/admin/courses/CoursesLedgerClient.tsx` — kontrakt §3
- `app/admin/courses/CoursesLedgerClient.test.tsx` — kontrakt §3
- `lib/games/newGameFormData.ts` — kontrakt §3
- `lib/database.types.ts` — kontrakt §3 (auto-regen)
- `package.json` + `package-lock.json` + `CHANGELOG.md` — kontrakt §3 (version bump)
- `.forge/contracts/223-courses-phase2-vedlikehold-og-filter.md` — selve kontrakten

Alt matcher «Files Likely Touched» 1:1.

### Andre lesere av nye kolonner
- `courses.updated_at` / `updated_by`: lesere er kun `app/admin/courses/page.tsx` (sort + kicker) og `app/admin/courses/[id]/edit/page.tsx` (kicker). Ingen andre stier leser disse kolonnene — sikkerhets-confirm via `grep -rn "updated_at\|updated_by" lib/database.types.ts` viser FK-bindingen `courses_updated_by_fkey`, og embeddet via `users!courses_updated_by_fkey` er korrekt brukt på edit-page.
- `tee_boxes.archived_at`: lesere er kun de tre nye stedene (`page.tsx`, `edit/actions.ts`, `edit/page.tsx`, `newGameFormData.ts`). Alle andre tee_boxes-readers (`getGameWithPlayers`, `startScheduledGame`, `admin/games/[id]/page.tsx`, `admin/games/[id]/edit/page.tsx`) leser uten filter — som er det kontrakten §3.2 eksplisitt krever (linje 108).

### Dead-code-sjekk for tee_in_use
`grep -rn "tee_in_use" app/ lib/` returnerer 0 hits. Errorkoden, hjelpe-teksten, og kontraktens advarsel-melding er alle fjernet fra `ERROR_MESSAGES`-maps i `actions.ts` og `edit/page.tsx`.

### Split-logikk edge cases
- **`toDelete = []`**: Wrapper-guarden på linje 184 hopper over hele split-utregningen; både `toHardDelete` og `toArchive` forblir `[]`. Linje 250 + 257 har egne `length > 0`-guards. Safe.
- **Bare in-use tees**: `toHardDelete = []`, `toArchive` har entries. Hard-delete-bloc hoppes (linje 250-256), archive-bloc kjører (linje 257-263).
- **Bare ubrukt-tees**: `toHardDelete` har entries, `toArchive = []`. Motsatt av forrige — safe.
- **Mix**: Begge kjøres uavhengig.
- **Race-condition** (admin lagrer to ganger raskt etter hverandre): Ikke et problem siden `toDelete` derives fra `existingTees` som filtrerer `archived_at IS NULL`. Andre lagring vil se den arkiverte tee-en som «ikke finnes lenger» (fordi den er filtrert ut), og den blir ikke gjenstand for handling. Konsistent.

### CHANGELOG
- Versjon `1.26.0` korrekt satt i `package.json:3`
- Ny `## 1.26.y` tema-heading med blockquote stakeholder-tagline (CHANGELOG.md:16-20)
- `1.25.y` wrapped i `<details><summary><strong>1.25.y — Mobile-first bane-admin (1 oppføring) — klikk for å vise</strong></summary>` (CHANGELOG.md:50-52)
- Tagline-en bruker action-orientert «du»-form på vanlig norsk: «Når du endrer en bane, husker Tørny nå hvem som endret hva og når...»
- Teknisk-seksjon wrapped i indre `<details><summary>Teknisk</summary>` med Added/Changed/Notes-underseksjoner

### Norsk-kvalitet
Spot-sjekket nye norske strenger i UI-kode:
- `SORT_LABELS` (`CoursesLedgerClient.tsx:35-39`): «Nyeste først», «Sist endret», «Flest aktive spill» — alle naturlige.
- Filter-chip-labels: «Har dame-tee», «Har junior-tee», «Aktive spill» — kompakte, norske.
- Empty-state-copy (`CoursesLedgerClient.tsx:178-182`): tre varianter (søk + filter, søk alene, filter alene). Bruker «matcher» (idiomatisk på norsk), «filteret» (definit form), guillemets rundt søke-streng.
- Kicker-tekst i `rowKicker`/`buildAuditKicker`: «Endret DATO», «Lagt til DATO», «Sist endret DATO av NAVN» — alle har norsk dato-format via `formatShortDateNb`.
- Migrasjons-comments er på norsk og forklarer både hvorfor (Fase 2-kontekst) og fremtidig håndtering (Fase 3 un-arkivér-UI).

Ingen humanizer-røde flagg.

---

## Avvik / utsatte ting (flagg til bruker)

1. **Manuell røyk-test gjenstår** (gate i kontrakten linje 216): Evaluator kan ikke teste Vercel preview-deploy direkte. Brukeren må manuelt:
   - Endre en bane → bekrefte «Endret»-tekst i edit-flaten og på `/admin/courses`-listen
   - Fjerne en in-use tee → bekrefte at det historiske spillet (game-detail) fortsatt fungerer
   - Toggle sort + filter på liste-siden
   Anbefales på preview-URL-en etter PR opprettes.

2. **Un-arkivér-UI mangler bevisst** (Fase 3-utsetting per kontrakten linje 110, 234). Hvis admin gjør en feil i Fase 2, må de SQL-resette `tee_boxes.archived_at = NULL` manuelt, eller rekonstruere tee-en. Dokumentert i CHANGELOG-Notes.

3. **Per-kjønn-hull-par utsatt til egen Fase** (kontrakten §Key Decisions linje 183, eskalert til bruker). Brukeren godkjente utsettelsen før kontrakten ble signert; ingen handling påkrevd.

4. **`updated_by = NULL` for eksisterende baner** (kontrakten Edge Cases linje 169): Eksisterende rader fra før migrasjonen får `now()` på `updated_at` og `NULL` på `updated_by`. `displayName`-helperen håndterer NULL ved å droppe «av NAVN»-suffikset. Akseptert overgangs-state per kontrakten.

---

## Anbefaling

**ACCEPT.** Implementasjonen treffer alle åtte success-criteria, alle gates passerer, det er null scope-creep, og koden følger Tørny-konvensjoner (norsk copy, mobile-first, tabular-nums på tall, pure helpers eksportert for testing). Audit-pattern matcher prior art i 0034. Soft-archive-tilnærmingen beholder FK-integritet for historiske spill — en pen løsning på «slett vs. behold»-dilemmaet kontrakten flagget.

Klar for PR + merge etter manuell røyk-test på Vercel preview-deploy.
