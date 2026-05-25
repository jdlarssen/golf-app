# Evaluation — Bane-opprettelse mobile-first rework (Fase 1 av #223)

**Branch:** `claude/admiring-grothendieck-1a0b84`
**Commits:** `1090868` feat + `4be1d9b` em-dash chore
**Date:** 2026-05-25
**Verdict:** **ACCEPT** (med én notert manuell-verifiserings-rest)

---

## Sammendrag

Alle 7 success criteria verifisert mot faktisk kode. Alle 4 maskinelle gates passerer (`tsc`, `vitest` 20/20, `eslint`, pre-commit-hook). En 5. gate (manuell røyk-test på iPhone Safari + Vercel preview-deploy) krever bruker-verifikasjon — kan ikke kjøres av evaluator.

Ingen scope creep: alle 10 endrede filer (eks. package files) er innenfor "Files Likely Touched". Tilstøtende test-suiter (admin/games, 88 tester) er regresjon-frie. Downstream `par_total_*`-lesere (game-edit, scorecard, leaderboard, side-tournament, teeRating) er uberørt — bare form-input forsvant, ikke DB-kolonnen.

---

## Per-criterion verifikasjon

| # | Kriterium | Status | Evidens |
|---|---|---|---|
| 1 | Hull-par via tap-knapper [3][4][5], ingen number-input for par | PASS | `CourseForm.tsx:67` definerer `PAR_OPTIONS = [3, 4, 5]`. `ParTapButtons`-komponent (`CourseForm.tsx:411-454`) renderer `<button role="radio">` per par-verdi + hidden `<input name="hole_${n}_par">` (linje 447-451). Grep bekrefter: eneste `type="number"`-inputs i fila er SI (228), length_meters (299), slope (499), CR (514) — ingen for par. Test `CourseForm.test.tsx:34` («rendrer [3] [4] [5] som radio-group per hull») passerer. |
| 2 | Tee-blokken viser kun herre-rating som default; «+ Legg til dame-rating» utvider | PASS | `CourseForm.tsx:111-116` initialiserer `expandedLadies`/`expandedJuniors` via `initialTees.map(t => hasGenderData(t, ...))`. Default tee (`DEFAULT_TEE` linje 51-60) har tomme `slope_ladies`/`course_rating_ladies`, så `hasGenderData` returnerer false → kollapset. Tests: `CourseForm.test.tsx:114` («viser kun herre-rating som default») + `:124` («eksponerer dame-rating-blokk når knapp klikkes») begge passerer. |
| 3 | Par-total vises som read-only sum av hullene, ikke input | PASS | `CourseForm.tsx:118` `useMemo(() => sumHolePars(holes), [holes])`. `GenderRatingBlock`-komponent (`:527-533`) viser `<p>Par-total: <span>{parTotal}</span></p>` — ingen input-felt. `TeeBoxData`-typen (`:16-26`) inneholder ingen `par_total_*`-felter. Grep for `tee_X_par_g` returnerer 0 input-treff i form. Tests: `:67-110` (3 cases for auto-par-total) passerer, inkl. live re-rendring fra 72→73 ved par-endring. |
| 4 | Dupliser-knapp kopierer numre + tømmer navn | PASS | `duplicateTee` (`CourseForm.tsx:139-166`) gjør `{...source, id: undefined, name: ''}`, splice'er etter source-index, og oppdaterer parallel-arrays. Knapp rendres `:264-272` med skjul ved `MAX_TEE_BOXES`. Tests: `:186` («kopierte numre og blankt navn»), `:211` («skjuler ved MAX_TEE_BOXES»), `:238` («dupliserer dame-rating uavhengig av kollapset blokk») alle passerer. |
| 5 | Søk på /admin/courses filtrerer ledger client-side | PASS | Ny `CoursesLedgerClient.tsx` (`:22-110`) bruker `useState` for query + `useMemo` for filter. Substring case-insensitive (`name.toLowerCase().includes(trimmed)`, `:32`). Renderes fra `app/admin/courses/page.tsx:152` etter server-fetch via cached `getCourses()`. Empty-state «Ingen baner matcher «X»» (`:53-55`). 4/4 tester i `CoursesLedgerClient.test.tsx` passerer. |
| 6 | Edit-flyten viser eksisterende dame/junior-rating expand'et fra start | PASS | `hasGenderData` (`CourseForm.tsx:86-91`) returnerer true hvis tee har lagrede tall. Init-state `:111-116` bruker dette. Edit-page `:154-167` mapper DB-rad til form-state med strengified verdier (`'120'` ikke `''`). Test `:154` (edit-flyt med tee_1 + slope_ladies=120/cr=71.5) verifiserer at «Damer» rendres uten klikk. |
| 7 | Server-action lagrer par-total = sum(holes.par), tee-data uendret | PASS | Begge actions: `new/actions.ts:91` og `[id]/edit/actions.ts:91` beregner `parSum = holes.reduce((s, h) => s + h.par, 0)`. `par_total_<g>: isCompleteRating(...) ? parSum : null` per kjønn (new:152-158, edit:153-159). `parseGenderRating` (begge `:12-27`) returnerer kun `{slope, course_rating}` — ingen `par_total` fra FormData. Edit-flyten bevarer eksisterende tee-id (`:146`) for UPDATE, ellers INSERT — slett-håndtering ved fjernet id beholder FK-sjekk mot games (`:174-187`). DB-skriving i edit `:209-242` bruker `par_total_*` fra beregnet objekt. |

---

## Per-gate verifikasjon

| Gate | Status | Output |
|---|---|---|
| `npx tsc --noEmit` | PASS | Exit code 0, ingen output (clean). |
| `npx vitest run app/admin/courses/` | PASS | `Test Files 2 passed (2); Tests 20 passed (20)` — `Duration 1.11s`. Matcher kontraktens claim på 16 (CourseForm) + 4 (CoursesLedgerClient). |
| `npx eslint app/admin/courses/` | PASS | Exit code 0, ingen output. |
| Pre-commit-hook humanizer | PASS | `bash .githooks/pre-commit` exit 0 på ren tre. Commit `4be1d9b` ryddet em-dash-kjeden i `tee_partial_rating`-meldingen (`— eller ingen av dem —` → `(eller ingen av dem)`) på begge sider (`new/page.tsx:19`, `[id]/edit/page.tsx:25`). Diff bekreftet via `git show 4be1d9b`. |
| Manuell røyk-test (iPhone Safari) | DEFERRED | Krever bruker — evaluator har ikke nettleser-tilgang til preview-URL. Tests dekker DOM-state men ikke faktisk tap-target-touch-respons eller tastatur-popup-undertrykking. |
| Vercel preview-deploy grønn | DEFERRED | Krever push + bruker-observasjon. Branch ikke push'et ennå (task #16 i todos er pending). |

---

## Regresjons-sanity

- **admin/games-tester:** `npx vitest run app/admin/games/` → `Test Files 8 passed (8); Tests 88 passed (88)`. Den delte `MAX_TEE_BOXES`-importen og uendrede DB-kontrakten brøt ingenting nedstrøms.
- **par_total_-lesere:** Grep avdekker 11 nedstrøms-stier (game-edit page, game-active page, submit page, leaderboard via getGameWithPlayers, side-tournament via teeRating, newGameFormData, scorecardLayout, startScheduledGame, database.types) — alle leser fortsatt fra DB-kolonnen. Server-actions skriver fortsatt riktig verdi (`par_total_<g> = sum(holes.par)` ved komplett rating, ellers null). Ingen breaking-change.
- **CHANGELOG:** `1.25.0`-oppføring åpen øverst med stakeholder-tagline som blockquote (linje 19). `1.24.y`-serien wrappet i `<details><summary><strong>1.24.y — ... (2 oppføringer) — klikk for å vise</strong></summary>` (linje 49-50) — riktig per CHANGELOG-policy.
- **Versjons-bump:** `package.json` → `1.25.0` bekreftet (minor-bump fra 1.24.1 — synlig UX-omarbeiding er korrekt minor-klassifisering per CLAUDE.md).

---

## Mindre merknader (ikke blokkerende)

1. **CHANGELOG-historikk-avvik.** Linje 36 sier `Feilmelding tee_partial_rating oppdatert: «… — eller ingen av dem — per kjønn.»` — det er den *første* (em-dash) versjonen fra commit `1090868`. Commit `4be1d9b` endret videre til parens-form, men CHANGELOG-bullet ble ikke oppdatert. Faktisk meldings-tekst i prod (linje 19 + 25 i page-filene) er parens-formen — CHANGELOG-bullet er bare litt utdatert prosa. Anbefaling: oppdater bullet til «(eller ingen av dem)» for konsistens, men ikke blokkerende — tagline + sluttproduktet stemmer.

2. **`error=bad_par` validerer mot 3..6**, men nye tap-knappene tillater kun 3..5. Server-action (begge sider, `:72`/`:76`) godkjenner par=6 fortsatt. Dette er bevisst (gammel data-toleranse), ingen handling kreves, men det er en liten asymmetri mellom UI-constraint og server-constraint som tilfeldigvis ikke kan trigges via UI. Hvis admin redigerer en gammel bane med par=6, vil tap-knapp-UI ikke ha noen aktiv valgt — `isParOption(current)` returnerer false og ingen knapp er `aria-checked`. **Edge-case-spørsmål:** Vil edit-flyten på en eksisterende par-6-bane fungere? Hidden input bærer fortsatt `value="6"` videre, men brukeren ser ingen pre-valgt knapp og må klikke for å bytte. Per kontrakten («Par 6 finnes på enkelte par-6-hull i verden, men ikke på norske baner Tørny støtter i dag», `:67`) er dette akseptert risiko. Anbefaling: kun en mental note for fremtidig Fase 2.

3. **Søk-input i empty-state.** Ved 0 baner skjules både søk-input og ledger til fordel for ChampagneMedallion-empty-state (`page.tsx:135-148`). Per kontrakt («Empty-state ved 0 baner: uendret») er dette riktig oppførsel, men det betyr at søke-feltet kun vises hvis det finnes ≥ 1 bane. OK per spec.

---

## Beslutning

**ACCEPT.** Bygge-implementasjonen treffer alle 7 success criteria med konkret kode-evidens og 20 grønne tester. Maskinelle gates er rene. CHANGELOG + version-bump følger disiplinen. Ingen scope creep. Downstream-konsumenter er regresjon-sikret.

Manuell røyk-test på iPhone Safari + Vercel preview-deploy gjenstår som siste sjekkpunkt før PR-merge — disse må brukeren observere når PR pushes. Tagline-claim («tre tap per hull i stedet for 18 tastatur-popups») er hele poenget med endringen; den må bekreftes på faktisk telefon.

CHANGELOG-bullet om `tee_partial_rating` (merknad 1) kan ryddes i en oppfølgings-commit, men er ikke blokkerende for merge.
