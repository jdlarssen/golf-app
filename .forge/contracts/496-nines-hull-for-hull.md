# Spec: Nines / Split Sixes — format-bevisst «Hull for hull» (PR 3 av epic #496)

**Issue:** [#496](https://github.com/jdlarssen/golf-app/issues/496)
**Scope:** Kun Nines / Split Sixes (Stream A). Ingen head-to-head — Nines er nøyaktig 3 spillere (validator i `lib/games/gamePayload.ts`), så det blir aldri 1-mot-1.
**Bump:** MINOR (ny bruker-synlig flate) → 1.97.0.

## Problem

«Hull for hull» forgrener på `game_mode` etter PR 1 (Skins) + PR 2 (Wolf), men kun Skins og Wolf har egne flater — Nines treffer fortsatt det generiske best-ball lag-scorekortet ([holes/page.tsx](../../app/games/%5Bid%5D/leaderboard/holes/page.tsx) `DrilldownBody`). For Nines er det feil: tre spillere spiller individuelt og deler ut en fast poeng-pott per hull etter plassering — det er ikke et lag-format. PR 3 gir Nines sin egen per-hull-flate, samme mønster som Skins/Wolf.

## Prior Decisions (fra PR 1 Skins + PR 2 Wolf + epic #496)

- **Arkitektur:** branch i `LeaderboardHolesPage` på `game.game_mode`, egen `<Format>HolesBody` (async server-comp, Suspense-wrappet) som henter rå-data, bygger `ScoringContext` via delt `buildXContext`-helper, kjører `computeModeResult`, narrow-er på `result.kind`, rendrer `<Format>HolesView` (server-comp).
- **Server-comp** for visningen; gjenbruk `AppShell`/`Card`/`Kicker`/`PullQuote`/`LeaderboardBackdrop`/`formatRevealName`. Back-lenke → `/games/${gameId}` (spill-hjem).
- **Reveal-modus:** skjul når `scoreVisibility==='reveal'` && ikke ferdig (samme `isRevealHidden`-mønster som Skins/WolfHolesView).
- **Behold XView sin PER HULL** på leaderboardet (additivt); den nye siden er den rike.
- **Delt context-helper** (`buildSkinsContext`/`buildWolfContext`) brukt av både `renderX` (leaderboard) og `XHolesBody` — ingen duplisert ctx-map.

## Research / kode-funn

Nines eksponerer allerede `NinesResult.holes` (`NinesHoleRow[]`) — **ingen scoring-endring**. Per-hull ([types.ts:1608](../../lib/scoring/modes/types.ts)): `holeNumber`, `par`, `strokeIndex`, `pending`, `perPlayer: Array<{ userId, gross, effectiveScore, points }>`, `pointsByPlayer: Record<string, number>`.

`renderNines` ([leaderboard/page.tsx:2710](../../app/games/%5Bid%5D/leaderboard/page.tsx)) bygger `ScoringContext` **inline** (linje 2728–2763) — Nines trenger ingen ekstra DB-fetch utover scores (poengfordeling er ren funksjon av scores). Til forskjell fra Wolf (`buildWolfContext` injiserer `wolfChoices`) trenger Nines **ingen ekstra injeksjon** — konteksten er identisk i form med `buildSkinsContext` (solo, `teamNumber: null`).

[NinesView.tsx](../../app/games/%5Bid%5D/leaderboard/NinesView.tsx) har allerede en PER HULL-seksjon (`HoleRow`, linje 300–364), men den viser **kun poeng-tallet + navn** per spiller — ingen score, ingen plassering, ingen vinner-utheving. Den nye flaten er den rike: legger til hver spillers brutto + netto-score, plasseringen på hullet (1./2./3.), poengene de fikk, og hvilken pott som var i spill.

Nines har **ingen choice/outcome-labels** å trekke ut (i motsetning til Wolf som trengte `lib/wolf/holeLabels.ts`). Ingen delt label-helper er nødvendig — en forenkling vs. Wolf-kontrakten.

`SkinsHolesView` ([holes/SkinsHolesView.tsx](../../app/games/%5Bid%5D/leaderboard/holes/SkinsHolesView.tsx)) er nærmeste analog (solo-format, per-spiller-rader med ★-vinner-utheving + accent-ramme). NinesHolesView speiler dens layout, men adapterer til Nines' poeng-per-plassering-mekanikk.

## Design

### 1. Delt context — `lib/scoring/context/buildNinesContext.ts`
Speil `buildSkinsContext` nøyaktig, men `game_mode: 'nines'`. Solo-format → `teamNumber: null`, `flightNumber: null`. Ingen ekstra param (ingen `wolfChoices`-analog). **Refaktorer `renderNines`** til å bruke den (erstatter inline ctx-map linje 2728–2763). Brukes også av `NinesHolesBody`. Interface `NinesContextPlayerRow` = `{ user_id, course_handicap, tee_gender, users }` (samme som Skins; `team_number` ignoreres for Nines, strukturell typing tolererer ekstra felt fra `gwp.players`).

### 2. `NinesHolesView` (server-comp) — `app/games/[id]/leaderboard/holes/NinesHolesView.tsx`
**Format-bevisst og Nines-spesifikk** (per eierens direktiv: «Hull for Hull skal ta utgangspunkt i formatet som spilles»). Nines = poeng-per-plassering, så kortet forteller plasserings-historien.

Header/undertittel speiler Skins/Wolf: «Hull for hull» + undertittel `{variant} · {Netto|Brutto}` der variant = `Split Sixes` | `Nines`.

Per hull-kort (fra `result.holes`, sortert på `holeNumber`):
- **Hode:** `Hull N · Par P · SI X` venstre. Høyre: **pott-badge** — `9 poeng` (Nines) / `6 poeng` (Split Sixes), champagne-toner (format-spesifikk kontekst). Ved pending: «Venter på score» i muted i stedet for pott-badge.
- **Per-spiller-rader** (det NinesView mangler), sortert på `effectiveScore` ASC (best/lavest øverst):
  - **Plasserings-merke** (1./2./3.) — standard competition ranking: en gruppe med EKSAKT lik `effectiveScore` på sorterte posisjoner `[i..j-1]` deler plassering `i+1`. Beste plassering (1.) får champagne-aksent (ramme + ★/uthevet, speil Skins-vinner-stil). Delte plasseringer viser samme tall (gjør tie-splitting lesbar).
  - Navn (`formatRevealName`).
  - Brutto diskret når `scoring==='net'` og `gross !== effectiveScore` («brutto X»); netto/effective prominent (`score-num`).
  - **`+N poeng`-chip** (champagne) — poengene fra `pointsByPlayer`. Format rent (drop `.0`; del-poeng ved tie er heltall for 3-spiller-tilfellet: (5+3)/2=4, (3+1)/2=2, alle tre 3).
- **Pending hull:** rader i `ctx.players`-rekkefølge (ingen meningsfull rangering), score `–` for manglende, ingen plasserings-merke, ingen poeng-chip. Pott-badge byttes til «Venter på score».
- Reveal-skjul + dark mode + `tabular-nums` + ≥44px (back-lenke).

Plasseringen beregnes i view-en fra `perPlayer` (NinesHoleRow lagrer ikke rank-on-hole), og stemmer per konstruksjon med `pointsByPlayer` (begge utledes av `effectiveScore`-rangering).

### 3. Branch — `holes/page.tsx`
Etter Wolf-branchen: `if (game.game_mode === 'nines') return <Suspense …><NinesHolesBody gameId={id} courseId={game.course_id} /></Suspense>`. `NinesHolesBody` henter `getGameWithPlayers` + `course_holes` + `scores` (Promise.all — INGEN `getWolfChoices`-analog), bygger via `buildNinesContext`, kjører `computeModeResult`, narrow `kind==='nines'`, bygger `playersById` (`NinesPlayerInfo`), rendrer `NinesHolesView`. Speiler `SkinsHolesBody` (ikke `WolfHolesBody` — Nines har ingen ekstra fetch).

## Edge Cases & Guardrails
- **Pending hull** (mangler minst én spillers gross): `pending=true`, alle poeng 0, ingen carryover (uavhengig per hull — skiller seg fra Skins). Vis scorer som tastet / `–`, ingen plassering/poeng, «Venter på score».
- **Tie på hullet:** delt plassering + delte poeng (heltall for 3 spillere). Plasserings-merke viser samme tall for delte; poeng-chip viser delt verdi. Helt likt (alle 3): alle plassering 1, 3 poeng hver.
- **Split Sixes-variant:** pott `6 poeng` (4/2/0); høyeste score kan få **0 poeng** → ikke vis `+0`-chip (kun `points > 0`), men vis fortsatt plassering + score.
- **Aldri 2 spillere** → ingen H2H-gren (Nines er nøyaktig 3).
- **Reveal-modus** midt-runde → venterom-melding, ingen tall.
- Andre solo-format urørt (kun `'nines'` legges til branchen). Skins + Wolf uendret.

## Key Decisions
- **Nines-spesifikk, plassering-først** (eierens valg): kortet er grunnet i Nines-mekanikken (pott + plassering + poeng-per-plassering + tie-split), ikke en generisk score-liste. Dette er kjernen i epic #496.
- **Ingen H2H** for Nines (nøyaktig 3 spillere).
- **NinesHolesView = rik** (per-spiller score + plassering + poeng + pott); NinesView PER HULL beholdes som kompakt poeng-sammendrag.
- **Ingen delt label-helper** (Nines har ingen choice/outcome-strenger — forenkling vs. Wolf).
- **`buildNinesContext`** speiler `buildSkinsContext` (solo, ingen injeksjon); `NinesHolesBody` speiler `SkinsHolesBody`.
- Ingen scoring-endring, ingen nye farge-tokens, ingen migrasjon.

**Claude's Discretion:**
- Eksakt visuell stil på plasserings-merket (tall-badge vs. medalje vs. ★ for 1.); celle-tetthet; om en pott-slot-legende («5 · 3 · 1») vises i tillegg til pott-totalen (lean mot NEI — `+N poeng`-chips + plassering gjør fordelingen selv-forklarende).
- Om brutto vises i parentes/diskret ved netto (speil Skins).
- Eksakt poeng-formatering for evt. ikke-heltall i degenererte n≠3-tilfeller.

## Success Criteria
- [ ] «Hull for hull» på et Nines-spill viser per hull: pott (9/6 poeng), og for hver spiller **plassering + brutto/netto-score + poeng** — ikke lag-scorekortet. (Naviger `/games/<id>/leaderboard/holes` for et Nines-spill.)
- [ ] NinesHolesView er **rikere** enn NinesView sin PER HULL (som kun viser poeng-tall + navn) — den viser også score + plassering + vinner-utheving.
- [ ] `buildNinesContext` brukes av både `renderNines` og `NinesHolesBody` (ingen duplisert ctx-map; inline-mappen i `renderNines` er fjernet).
- [ ] Andre format (inkl. Skins, Wolf, best-ball) uendret «Hull for hull».
- [ ] Reveal-modus, dark mode, `tabular-nums`, ≥44px respektert.
- [ ] Type C render-test for NinesHolesView (fra fixture m/ 1 normalt hull + 1 tie + 1 pending; verifiserer plassering + score + poeng — det NinesView.test ikke dekker).
- [ ] Norsk copy via `humanizer` på nye strenger («poeng», «Venter på score» er gjenbrukt/godkjent).
- [ ] CHANGELOG + MINOR-bump (1.97.0) i feature-commit.

## Gates
- [ ] `npx tsc --noEmit` — 0 nye errors
- [ ] `npx vitest run "app/games/[id]/leaderboard"` — nye + NinesView-tester grønne
- [ ] `npx vitest run` — full suite (regresjon)
- [ ] `npm run lint` — 0 errors
- [ ] `npm run build`
- [ ] E2E auth-gate for holes-ruta på Nines (ny `e2e/games/nines.spec.ts`, speil `e2e/games/wolf.spec.ts`)

## Files Likely Touched
**Nye:** `app/games/[id]/leaderboard/holes/NinesHolesView.tsx` (+ `.test.tsx`), `lib/scoring/context/buildNinesContext.ts`, `e2e/games/nines.spec.ts`
**Endrede:** `app/games/[id]/leaderboard/holes/page.tsx` (nines-branch + NinesHolesBody), `app/games/[id]/leaderboard/page.tsx` (`renderNines` bruker buildNinesContext), `CHANGELOG.md` + `package.json`

## Out of Scope
- De gjenværende solo-formatene (Acey-Deucey/BBB/Round Robin = har holes; Nassau/solo-strokeplay/solo-stableford = trenger result-utvidelse) — egne PR-er.
- H2H-kortet (Nines kan ikke være 2 spillere).
- Fjerning av NinesView PER HULL.
- Endring av Nines scoring/poeng-fordeling (ren visning).
