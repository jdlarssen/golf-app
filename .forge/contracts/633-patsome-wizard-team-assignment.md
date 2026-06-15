# Spec: Patsome — gjenopprett lag-tildelings-UI i opprett-veiviseren

**Issue:** [#633](https://github.com/jdlarssen/golf-app/issues/633)
**Branch:** `claude/forge-issue-command-2g5niz`
**Kompleksitet:** LOW (lokalisert wizard-render-bug)
**Type:** PATCH (bug-fix — format helt ute av funksjon i prod)
**Dato:** 2026-06-15

## Problem

Patsome kan ikke opprettes i det hele tatt. I opprett-veiviseren (Kompis-runde → Patsome) krever steg 4 (Spillere) lag-fordeling (lag à 2), men det rendres **ingen** lag-tildelings-UI — verken «Lag 1/2»-seksjon, slot-dropdowns eller «Tøm lag»-knapp. «Neste» er permanent deaktivert med «Mangler: lag-fordeling (lag à 2)». Andre lag-format (Texas/Ambrose/Florida/Shamble/par-stableford) viser denne UI-en korrekt. Hull-laget (`PatsomeSegmentBanner`, scoring, leaderboard) er ferdig bygget fra #286 — kun veiviser-tildelingen ble aldri wiret inn. Resultat: hele Patsome-formatet er umulig å spille i prod.

## Rot-årsak (funnet i kode)

Hele state-laget er allerede Patsome-bevisst — gapet er **utelukkende i presentasjons-komponenten** `app/[locale]/admin/games/new/sections/TeamsAssignmentSection.tsx`. Den lister hver lag-modus eksplisitt i sine render-betingelser, og `isPatsome` ble aldri lagt til noen av dem:

- **`useGameFormState.ts`** eksponerer allerede `isPatsome` (l. 659), `patsomePlayersValid` (l. 1197), `requiresTeams` (teamSize=2 → true), patsome-grenen i `missingForPublish` (l. 1440), `canPublish` (l. 1274) og `orderedPayload` (flight = team for patsome, l. 1002). Alt stemmer.
- **`GameWizard.tsx`** rendrer `PatsomeSetup` i steg 2 (l. 652) og `TeamsAssignmentSection` i steg 4 (l. 857). `canAdvance` for steg 4 = `playersStepOptional || playersValidForMode` (l. 341) — gater korrekt, men det finnes ingen UI å gjøre fordelingen med.
- **`TeamsAssignmentSection.tsx`** — `isPatsome` er ikke destrukturert, og mangler i: lag-grid-betingelsen (l. 179–185), `teamsDescription()` (l. 92–104), «Tøm lag»-knappen (l. 215), og per-spiller-tee-seksjonen (l. 366–372 + prefiks l. 81–90).

Sekundær-funn: per-spiller-tee-seksjonen rendrer de skjulte `player_<id>_gender`-inputtene. Siden Patsome aldri når den seksjonen, sendes ingen per-spiller-tee/kjønn — som 4BBB-segmentet (#286: full CH + per-spiller par) trenger. Texas (mekanisk identisk lag-format) viser denne seksjonen; Patsome må også. Og `TeamSizeSelector` (GameWizard l. 582) vises for Patsome med én ikke-handlingsbar «Par»-flis — alle andre formater med dedikert setup-steg (shamble/wolf/nassau/…) er ekskludert.

## Prior Decisions

- **#286 (Patsome-kontrakt):** «lag-tilordning (2-per-lag, N lag — gjenbruk `TeamsAssignmentSection`-mønstret fra best_ball/texas)» var alltid intensjonen. Lag à 2 eksakt, 2+ lag, ingen fast øvre grense (payload-laget kapper på 8 slots → maks 4 lag à 2). Denne fixen fullfører den wiringen.
- Patsome er **standalone klubb-format** (ikke cup-only), så den frittstående veiviseren ER opprettings-veien — ingen cup-template-sti involvert (skiller seg fra #634).

## Design

Behandle Patsome i `TeamsAssignmentSection` nøyaktig som par-stableford: lag à 2, inntil 4 lag, grid vises så snart ≥2 spillere er valgt (admin fordeler progressivt), «Tøm lag»-knapp, og per-spiller-tee-seksjon. Mekanisk er Patsome lag à 2 med flight = team (allerede i `orderedPayload`), så par-stableford-grenen er rett mal.

Konkrete endringer i `TeamsAssignmentSection.tsx`:

1. **Destrukturer `isPatsome`** fra `state`.
2. **Lag-grid-betingelsen** (l. 179–185): legg til `(isPatsome && selectedPlayerIds.length >= 2)`. Slot-antall faller korrekt til `2` (Patsome ikke i `isTexas||isAmbrose||isFlorida||isShamble`-grenen for `slotCount`), og ingen lag skjules → alle 4 lag à 2 vises.
3. **`teamsDescription()`** (l. 92–104): legg til `if (isPatsome) return t('teamsDescPatsome');`.
4. **«Tøm lag»-knappen** (l. 215): legg til `|| isPatsome` i betingelsen.
5. **Per-spiller-tee-seksjonen** (l. 366–372) + **`teePerPlayerPrefix`** (l. 81–90): legg til `isPatsome` i begge betingelsene (gir steg-5-prefiks i stacked-form + rendrer kjønn-toggles og skjulte gender-inputs).

i18n (`messages/no.json` + `messages/en.json`), under `wizard.sections.teams`:
6. **Ny nøkkel `teamsDescPatsome`** — speiler `teamsDescParStableford`:
   - no: `"Inntil 4 lag à 2 spillere. Hvert lag må ha enten 0 eller 2 spillere. Tomme lag publiseres ikke."`
   - en: `"Up to 4 teams of 2. Each team must have either 0 or 2 players. Empty teams are not published."`

`GameWizard.tsx`:
7. **Skjul `TeamSizeSelector` for Patsome** (l. 582): legg til `&& !state.isPatsome` i ekskluderings-betingelsen — konsistent med shamble/wolf/nassau (dedikert setup-steg, ingen reell størrelses-valg; Patsome er alltid lag à 2). `teamSize` forblir 2 via `defaultTeamSizeForMode`/`handleModeChange`.

## Edge Cases & Guardrails

- **Grid-terskel ≥2, publish-gate ≥4:** grid vises ved 2 valgte (progressiv fordeling), men `patsomePlayersValid` krever ≥4 + partall + balanserte lag à 2. Ingen regresjon — gaten lever allerede i state-laget.
- **Oddetall / ubalanserte lag:** håndteres uendret av `missingForPublish` patsome-grenen (`patsomeUnderMin`/`patsomeOdd`/`patsomeAssign`).
- **8 spillere = 4 lag à 2:** alle 4 lag-kort vises (ingen lag skjules for Patsome — riktig, i motsetning til Texas-4 som kapper til 2 lag).
- **Edit-flyt (stacked `GameForm`):** bruker samme `TeamsAssignmentSection` → fixen gjelder både opprett og rediger uten ekstra arbeid. `teePerPlayerPrefix` gir korrekt «5.»-nummerering der.
- **Ingen «Trekk tilfeldig» for Patsome:** kun best-ball har den; Patsome speiler par-stableford (kun «Tøm lag»). Bevisst.
- **Ingen regresjon for andre format:** alle endringer er additive `isPatsome`-grener; eksisterende format-betingelser urørt.

## Key Decisions

- **Patsome = par-stableford-mønsteret i TeamsAssignmentSection:** lag à 2, grid ved ≥2, «Tøm lag», per-spiller-tee. Begrunnelse: mekanisk identisk lag-struktur (flight=team, 2-per-lag), allerede reflektert i `orderedPayload`.
- **Dedikert `teamsDescPatsome`-nøkkel** (ikke gjenbruk av `teamsDescParStableford`): følger filens per-format-nøkkel-mønster og lar copy divergere senere. Innhold identisk med par-stableford for nå.
- **Skjul TeamSizeSelector for Patsome:** konsistens med alle andre dedikert-setup-format + fjerner forvirrende lone-flis.

**Claude's Discretion:**
- Eksakt rekkefølge `isPatsome` settes inn i hver boolsk kjede (kosmetisk).
- Om `teamsDescPatsome` skal nevne segment-strukturen senere (utenfor scope nå — identisk med par-stableford).

## Success Criteria

- [ ] I veiviseren (Kompis-runde → Patsome → bane/tee → 4 spillere) rendres lag-grid-en med «Lag 1/2»-kort à 2 slot-dropdowns. Verifiseres: render-test som monterer wizard/`TeamsAssignmentSection` med `gameMode='patsome'` + ≥2 valgte spillere og finner lag-slot-`<select>`-ene.
- [ ] Med 4 spillere fordelt 2+2 blir «Neste» (steg 4) aktiv (`playersValidForMode` true) — `missingForPublish` tom for spiller-delen. Verifiseres: behaviour i render-test eller `useGameFormState`-assertion.
- [ ] Per-spiller-tee-seksjonen rendrer kjønn-toggles + skjulte `player_<id>_gender`-inputs for Patsome. Verifiseres: `getByDisplayValue`/hidden-input-sjekk i render-test.
- [ ] `TeamSizeSelector` rendres IKKE for Patsome i steg 2. Verifiseres: kode-lesing (`GameWizard.tsx:582`) + evt. render-assertion.
- [ ] Ingen regresjon: `npm run build` exit 0; full vitest-suite grønn.

## Gates

- [ ] `npx tsc --noEmit` (eller `npm run build`) passerer — autoritativ for uttømmende `GameMode`-maps.
- [ ] `npx vitest run "app/[locale]/admin/games/new"` passerer (wizard/section/state-tester, inkl. ny/utvidet Patsome-render-test).
- [ ] Playwright-/render-dekning for den nye UI-grenen (Type C — maks én render-test per komponent, ikke re-assert scoring-tall).
- [ ] `humanizer`-skill på `teamsDescPatsome` (no) FØR commit, per CLAUDE.md (kort streng — speiler eksisterende godkjent par-stableford-copy).

## Files Likely Touched

- `app/[locale]/admin/games/new/sections/TeamsAssignmentSection.tsx` — destrukturer + 5 `isPatsome`-grener (grid, beskrivelse, tøm-knapp, per-spiller-tee, prefiks).
- `app/[locale]/admin/games/new/GameWizard.tsx` — skjul `TeamSizeSelector` for Patsome (l. 582).
- `messages/no.json` + `messages/en.json` — ny `teamsDescPatsome`-nøkkel under `wizard.sections.teams`.
- `app/[locale]/admin/games/new/GameForm.test.tsx` (eller ny/utvidet section-test) — Type C render-test for Patsome-lag-grid.
- `package.json` + `CHANGELOG.md` — PATCH-bump + oppføring (bruker-synlig fix: Patsome kan nå opprettes).

## Out of Scope

- **#634 (lag-matchplay dead-end i veiviseren):** separat rot-årsak (`isMatchplay` kun singles) + produktbeslutning (skjul vs støtt). Egen forge-runde.
- **#635 (lag/spiller uten skår kåres som vinner):** scoring/leaderboard-bug, urelatert. Egen forge-runde.
- **Endring av Patsome-scoring, segment-grenser, tee-starter-laget** — alt ferdig fra #286, urørt.
- **«Trekk tilfeldig lag»-knapp for Patsome** — ikke i par-stableford-mønsteret; ikke etterspurt.
