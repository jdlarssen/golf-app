# Spec: Acey-Deucey — format-bevisst «Hull for hull» (PR 5 av epic #496)

**Issue:** [#496](https://github.com/jdlarssen/golf-app/issues/496)
**Scope:** Kun Acey-Deucey (Stream A). Ingen head-to-head — Acey-Deucey er nøyaktig 4 spillere (validator i `lib/games/gamePayload.ts`), så det blir aldri 1-mot-1.
**Bump:** MINOR (ny bruker-synlig flate) → 1.99.0.

## Problem

«Hull for hull» forgrener på `game_mode` etter PR 1–4 (Skins, Wolf, Nines, Round Robin), men Acey-Deucey treffer fortsatt det generiske best-ball lag-scorekortet ([holes/page.tsx](../../app/games/%5Bid%5D/leaderboard/holes/page.tsx) `DrilldownBody`). For Acey-Deucey er det feil: fire spillere spiller individuelt og deler ut +3 til unik lavest (ace), −3 til unik høyest (deuce), 0 til midten — per hull. PR 5 gir Acey-Deucey sin egen per-hull-flate.

**Ekstra steg vs. forrige PR-er:** `AceyDeuceyHoleRow` eksponerer **ikke** per-spiller-score i dag (kun `aceUserId`/`deuceUserId`/`pointsByPlayer`). Scoring-laget regner allerede ut hver spillers effective-score (`effByPlayer`) for å finne ace/deuce, men kaster den. PR-en starter derfor med en **TDD scoring-utvidelse** som eksponerer det som allerede regnes ut.

## Prior Decisions (fra PR 1–4 + epic #496)

- **Arkitektur:** branch i `LeaderboardHolesPage` på `game.game_mode`, egen `<Format>HolesBody` (async server-comp, Suspense-wrappet), bygg `ScoringContext` via delt `buildXContext`-helper, kjør `computeModeResult`, narrow på `result.kind`, rendr `<Format>HolesView` (server-comp).
- **Server-comp** for visningen; gjenbruk `AppShell`/`Card`/`Kicker`/`PullQuote`/`LeaderboardBackdrop`/`formatRevealName`. Back-lenke → `/games/${gameId}`.
- **Reveal-modus:** skjul når `scoreVisibility==='reveal'` && ikke ferdig (samme `isRevealHidden`-mønster).
- **Ingen front-9-clip:** vis alle hull.
- **Delt context-helper** brukt av både `renderX` og `XHolesBody`.
- **Format-bevisst, grunnet i formatet** (eierens direktiv): per-hull-flaten tar utgangspunkt i mekanikken. For Acey-Deucey = ace/deuce-poengfordelingen.
- **Plassering-først / score-rangert** (fra Nines): rader sortert på effective-score, vinner uthevet. Acey-Deucey gjenbruker dette mønstret (Nines er nærmeste analog).
- **`lib/scoring/`-endring krever ny test først** (CLAUDE.md). Scoring-utvidelsen er strikt TDD.
- **Ingen nye farge-tokens** uten diskusjon — deuce-markeringen bruker eksisterende palett.

## Research / kode-funn

`AceyDeuceyResult.holes` (`AceyDeuceyHoleRow[]`, [types.ts:1841](../../lib/scoring/modes/types.ts)): `holeNumber`, `par`, `strokeIndex`, `scored` (alle 4 har score), `aceUserId` (unik lavest, ellers null), `deuceUserId` (unik høyest, ellers null), `pointsByPlayer` (+3/0/−3). **Mangler per-spiller gross/effective-score.**

`aceyDeucey.compute()` ([aceyDeucey.ts:132](../../lib/scoring/modes/aceyDeucey.ts)) bygger `effByPlayer: Array<{userId, eff: number|null}>` per hull (linje 134–142) og `grossByKey` (linje 119–122), men eksponerer dem ikke. Ace/deuce settes kun ved **unik** ekstrem (delt lavest → ingen ace; delt høyest → ingen deuce).

`AceyDeuceyView.HoleRow` ([AceyDeuceyView.tsx:304](../../app/games/%5Bid%5D/leaderboard/AceyDeuceyView.tsx)) viser i dag KUN: ace-navn «+3», deuce-navn «−3» (eller «Delt»), eller «Venter» når ikke scoret. **Ingen per-spiller-score, ingen midt-spillere.** Den nye flaten er den rike: alle 4 spillere med score + poeng + ace/deuce-markering.

`renderAceyDeucey` ([leaderboard/page.tsx:2913](../../app/games/%5Bid%5D/leaderboard/page.tsx)) bygger `ScoringContext` inline med `teamNumber: null` (solo, som Skins/Nines). Ingen injeksjon, ingen ekstra fetch. `AceyDeuceyView` eksporterer `AceyDeuceyPlayerInfo`. Minus-tegnet i UI er U+2212 (`−`), ikke bindestrek (eksisterende konvensjon i AceyDeuceyView).

## Design

### 0. Scoring-utvidelse (TDD FØRST) — `lib/scoring/modes/aceyDeucey.ts` + `types.ts`
Utvid `AceyDeuceyHoleRow` med `perPlayer: Array<{ userId: string; gross: number | null; effectiveScore: number | null; points: number }>` (speil `NinesHoleRow.perPlayer`-formen). I `compute`, bygg `perPlayer` fra `effByPlayer` (har `userId`+`eff`) + `grossByKey` + `pointsByPlayer`, i `ctx.players`-rekkefølge. **Ingen endring i poeng/ranking** — ren additiv eksponering av det som allerede regnes ut. Test først: ny case i `aceyDeucey.test.ts` som asserter `perPlayer` (gross, effectiveScore=netto, points +3/0/−3) for et scoret hull, og null-effective + 0 points for et uferdig hull.

### 1. Delt context — `lib/scoring/context/buildAceyDeuceyContext.ts`
Speil `buildNinesContext` (solo, `teamNumber: null`, `game_mode: 'acey_deucey'`, ingen injeksjon). Interface `AceyDeuceyContextPlayerRow = { user_id, course_handicap, tee_gender, users }`. **Refaktorer `renderAceyDeucey`** til å bruke den (erstatt inline ctx-map). Brukes også av `AceyDeuceyHolesBody`.

### 2. `AceyDeuceyHolesView` (server-comp) — `app/games/[id]/leaderboard/holes/AceyDeuceyHolesView.tsx`
Header «Hull for hull» + undertittel «Acey Deucey · {Netto|Brutto}». Per hull-kort (fra `result.holes`):
- **Hode:** «Hull N · Par P · SI X» venstre. Pending: «Venter» (muted) der pott-badgen ellers står.
- **Per-spiller-rader** (det AceyDeuceyView mangler), sortert på `effectiveScore` ASC (best/lavest øverst):
  - **Ace** (`cell.userId === hole.aceUserId`): champagne accent-ramme + ★ + «+3»-chip i accent.
  - **Deuce** (`cell.userId === hole.deuceUserId`): **kald/dempet markering** (eksisterende tokens — subtil border + «−3» i en kjølig/muted tone, f.eks. eksisterende over-par-tone eller muted; ingen nye tokens). **Symmetrisk drama** (eierens valg): topp OG bunn spilles på.
  - **Midten** (points 0): nøytral rad, «0» dempet.
  - Hver rad: navn, brutto diskret når `scoring==='net'` og `gross !== effectiveScore` («brutto X»), netto/effective prominent (`score-num`), poeng-chip (+3 / 0 / −3).
- **Pending hull** (`scored===false`): rader i `ctx.players`-rekkefølge, score `–` der effective er null, ingen ace/deuce-markering, ingen poeng-chip. «Venter» i hodet.
- Reveal-skjul + dark mode + `tabular-nums` + ≥44px (back-lenke). Minus-tegn = U+2212.

Ace/deuce-markeringen drives av `aceUserId`/`deuceUserId` (ikke «laveste score»), så **delt lavest/høyest gir INGEN ace/deuce-utheving** selv om noen har ekstrem-scoren — poeng er da 0 (korrekt fra `pointsByPlayer`).

### 3. Branch — `holes/page.tsx`
Etter Round Robin-branchen: `if (game.game_mode === 'acey_deucey') return <Suspense…><AceyDeuceyHolesBody … /></Suspense>`. `AceyDeuceyHolesBody` speiler `NinesHolesBody` (Promise.all uten injeksjon), bygg via `buildAceyDeuceyContext`, narrow `kind==='acey_deucey'`, `playersById` (`AceyDeuceyPlayerInfo`), rendr `AceyDeuceyHolesView`.

## Edge Cases & Guardrails
- **Pending hull** (`scored===false`, minst én mangler gross): ingen poeng, ingen ace/deuce, «Venter», score `–`.
- **Delt lavest** → `aceUserId===null`, alle på den siden får 0 → ingen champagne-utheving selv om de har laveste score. Tilsvarende **delt høyest** → `deuceUserId===null`, ingen deuce-markering.
- **Negativ løpende total** er normalt (deuce på flere hull) — men dette er per-hull-flaten, så ikke relevant her; total vises på leaderboardet.
- **Aldri 2 spillere** → ingen H2H-gren (Acey-Deucey er nøyaktig 4).
- **Reveal-modus** midt-runde → venterom-melding.
- **Blandet kjønn:** `effectiveScore` er allerede kjønns-korrekt fra scoring-laget; hode-par fra `hole.par`.
- Andre solo-format urørt (kun `'acey_deucey'` legges til branchen). Skins/Wolf/Nines/Round Robin uendret.

## Key Decisions
- **TDD scoring-utvidelse først:** eksponer `perPlayer` på `AceyDeuceyHoleRow` (test → feil → impl). Ingen poeng/ranking-endring.
- **Symmetrisk drama** (eierens valg): ace champagne+★, deuce kald/dempet markering (eksisterende tokens), midten nøytral.
- **Score-rangert** (gjenbruk Nines-mønstret): rader sortert på effective-score ASC.
- **Markering drives av `aceUserId`/`deuceUserId`**, ikke rå min/max — så delt ekstrem gir ingen utheling.
- **Ingen H2H** (nøyaktig 4 spillere). **Ingen nye farge-tokens.**
- **`buildAceyDeuceyContext`** speiler `buildNinesContext`; `AceyDeuceyHolesBody` speiler `NinesHolesBody`.

**Claude's Discretion:**
- Eksakt «kald» deuce-treatment innen eksisterende tokens (muted vs. over-par-tone; ramme vs. kun chip-tone); om «0» vises for midten eller utelates; celle-tetthet.
- Om brutto vises diskret ved netto-avvik (speil Nines/Skins).
- Eksakt undertittel-detalj.

## Success Criteria
- [x] `AceyDeuceyHoleRow.perPlayer` eksponerer per-spiller `{gross, effectiveScore, points}`, dekket av ny `aceyDeucey.test.ts`-case (scoret + uferdig hull). Poeng/ranking uendret. → 3 nye cases grønne; eksisterende 16 uendret (19/19). Commit 18db402.
- [x] «Hull for hull» på et Acey-Deucey-spill viser per hull alle 4 spillere med **score + poeng (+3/0/−3) + ace/deuce-markering** — ikke lag-scorekortet. → `holes/page.tsx` acey_deucey-branch + `AceyDeuceyHolesBody` + `AceyDeuceyHolesView`.
- [x] AceyDeuceyHolesView er rikere enn AceyDeuceyView sin PER HULL (kun ace/deuce-navn) — viser også midt-spillerne + alle scorer. → `AceyDeuceyHolesView` HoleCard rendrer hele `perPlayer`; AceyDeuceyView.HoleRow viser kun aceName/deuceName.
- [x] Deuce får symmetrisk «kald» markering (eksisterende tokens); ace champagne+★. Delt lavest/høyest gir INGEN ace/deuce-utheving. → ace `border-accent/40 bg-accent/[0.06]`+★; deuce `border-border bg-surface-2`+muted; markering drevet av `aceUserId`/`deuceUserId` (null ved delt). Render-test asserter card2 (delt lavest) har ingen `border-accent`.
- [x] `buildAceyDeuceyContext` brukes av både `renderAceyDeucey` og `AceyDeuceyHolesBody` (ingen duplisert ctx-map). → `lib/scoring/context/buildAceyDeuceyContext.ts`; inline-map slettet i commit b763723.
- [x] Andre format uendret «Hull for hull». Reveal/dark/`tabular-nums`/≥44px respektert. → Kun `'acey_deucey'`-gren lagt til; reveal-blokk + tokens + `h-11 w-11`.
- [x] Type C render-test for AceyDeuceyHolesView (1 normalt + 1 delt-ekstrem + 1 pending). → `AceyDeuceyHolesView.test.tsx` (1 test, grønn).
- [x] CHANGELOG + MINOR-bump (1.99.0) i feature-commit. Norsk copy via `humanizer`. → `package.json` 1.99.0 + CHANGELOG 1.99.y-tema (1.98.y foldet) i commit 86859dc; humanizer-sjekk på tagline ren.

## Gates
- [x] `npx tsc --noEmit` — 0 nye errors → clean
- [x] `npx vitest run lib/scoring/modes/aceyDeucey` — scoring-utvidelse + eksisterende → 19/19 grønne
- [x] `npx vitest run "app/games/[id]/leaderboard"` — nye + AceyDeuceyView-tester → 172/172; holes-dir 5/5
- [x] `npx vitest run` — full suite → én ren kjøring 2947/2947 grønn. NB: `GameForm/GameWizard.test` flaker intermitterende under full-suite parallell-last (timeout, urelatert til denne PR-en — passerer 61/61 i isolasjon); filt som [#506](https://github.com/jdlarssen/golf-app/issues/506).
- [x] `npm run lint` — 0 errors → 0 errors (nye filer 0 issues)
- [x] `npm run build` → exit 0, success
- [x] E2E auth-gate for holes-ruta på Acey-Deucey (ny `e2e/games/acey-deucey.spec.ts`) → opprettet (3 auth-gate-tester), commit 4081c87

## Files Likely Touched
**Nye:** `app/games/[id]/leaderboard/holes/AceyDeuceyHolesView.tsx` (+ `.test.tsx`), `lib/scoring/context/buildAceyDeuceyContext.ts`, `e2e/games/acey-deucey.spec.ts`
**Endrede:** `lib/scoring/modes/types.ts` (`perPlayer` på AceyDeuceyHoleRow), `lib/scoring/modes/aceyDeucey.ts` (populer perPlayer), `lib/scoring/modes/aceyDeucey.test.ts` (ny case), `app/games/[id]/leaderboard/holes/page.tsx` (acey_deucey-branch + body), `app/games/[id]/leaderboard/page.tsx` (`renderAceyDeucey` bruker buildAceyDeuceyContext), `CHANGELOG.md` + `package.json`

## Out of Scope
- De gjenværende formatene (BBB = achievement-injeksjon; Nassau/solo-strokeplay/solo-stableford = result-utvidelse) — egne PR-er.
- H2H-kortet (Acey-Deucey kan ikke være 2 spillere).
- Endring av Acey-Deucey poeng/ranking (kun additiv perPlayer-eksponering + ren visning).
- Ny PER HULL på AceyDeuceyView-leaderboardet.
