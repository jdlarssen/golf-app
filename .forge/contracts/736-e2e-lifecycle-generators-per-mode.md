# Forge-kontrakt #736 — e2e full cup/liga-livssyklus via ekte generatorer + per-modus finish-and-validate

**Issue:** [#736](https://github.com/jdlarssen/golf-app/issues/736)
**Branch:** `claude/charming-curie-837959`
**Type:** Test-infrastruktur (additiv). Ingen produksjons-oppførsel endres bortsett fra nye `data-testid`-attributter.
**Versjon:** Ingen bump (rene tester + test-id-er; `test(...)`-prefiks passerer commit-msg-hooken). Test-id-tillegg er ikke bruker-synlige.

---

## Kontekst (verifisert mot koden)

#674 leverte en 3-test `@gate`-smoke (golden-path score→lever→godkjenn, seedet cup-render, seedet liga-standings-render) som kjører før hver merge. Det er gulvet. To reelle hull gjenstår, begge i flyter som har knekt i prod gjentatte ganger:

1. **Generatorene drives aldri e2e.** `e2e/cup/cup-lifecycle.spec.ts` *seeder* match-radene manuelt fordi cup-veiviseren (5 steg) mangler test-id-er. Den ekte `createCupMatchesFromPlan` (`app/[locale]/admin/cup/[id]/generer/actions.ts`) — den ikke-atomiske insert-løkka som faktisk produserte #641/#642 — har null e2e-dekning av sin reelle output. Liga (`startLeagueRoundFlight`, `lib/league/actions.ts`, drevet av `RoundStartClient.tsx`) er i samme situasjon.
2. **Modus-spec-ene er smoke, ikke livssyklus.** F.eks. `e2e/games/nassau.spec.ts` har bare 3 «utlogget → redirect»-tester. Ingen modus asserterer leaderboard-TALL mot en uavhengig orakel-beregning, så en aggregerings-regresjon (jf. #683/#707) ville passert hele suiten grønn.

### Bekreftede fakta som styrer designet

- **CI kjører KUN `npm run e2e:gate`** (`.github/workflows/ci.yml:90`, `--grep @gate`). Den fulle suiten kjøres aldri i CI. ⇒ Lanes som skal blokkere en dårlig merge MÅ være `@gate`-taggede.
- **CI er serialisert** (`workers: 1`, `retries: 1`, `playwright.config.ts`) og kjører mot **staging** (`snwmueecmfqqdurxedxv`), aldri prod (#717/#698).
- **`signInViaOtp`** (`e2e/_helpers/games.ts`) logger inn via verify-only (mint OTP via service-role `admin.generateLink`) for å unngå rate-limit. All auth i nye lanes bruker denne.
- **Cup-veiviseren** (`GenerateMatchesWizard.tsx`, 35KB, 5 steg, `'use client'`) har **ingen `data-testid`**. Den er en PPR-tung admin-side; headless hydrering kan være treg (dokumentert i minnenotater).
- **Liga round-start** (`RoundStartClient.tsx`) er et enkelt checkbox-skjema + submit-knapp som kaller den ekte `startLeagueRoundFlight` → robust å drive via UI.
- **`buildModeResultForGame.ts` importerer `server-only`** (linje 1) ⇒ kan IKKE importeres i en Playwright node-prosess. De underliggende `computeLeaderboard` + context-builderne i `lib/scoring/` er rene og importerbare (brukes til å utlede orakel-tall i dev, ikke i den committede asserten).
- **Leaderboard-tall** rendres som synlig tekst (`score-num`-klasse, ICU-labels) under container-test-id-er (`stableford-leaderboard`, `skins-podium`, `podium-rank-N`, …). Per-spiller numeriske test-id-er finnes ikke ennå — legges til kirurgisk der hovedtallet ikke er rent selekterbart.
- **Kun 2 seedede test-brukere** finnes (`E2E_ADMIN_EMAIL`, `E2E_PLAYER_EMAIL`). ⇒ Round 1 dekker kun 2-spiller-kapable moduser; ≥3-spiller-formater (nines/wolf/round-robin/BBB/acey) krever en multi-bruker-seeding-harness og utsettes.

---

## Beslutninger (gray-area discussion → eier deferret til min ekspertise)

1. **Generator-driving = ekte server-action via UI**, ikke programmatisk Next-Action-fetch (skjør action-hash) og ikke fortsatt seeding. Begrunnelse: bug-klassen levde i den ekte insert-løkka + lese-stien; UI-driving treffer den ekte server-action via dens ekte inngang. Robusthet beskyttes ved `@gate`-evidens-gating (under).
2. **Per-modus = representativt subset, round 1 = 4 mest-divergente 2-spiller-familier**: `solo_strokeplay` (brutto/netto-stroke), `singles_matchplay` (hull-for-hull match-resultat), `skins` (carryover/push), `nassau` (3-segment front/back/total). Stableford er allerede dekket av golden-path. ≥3-spiller-formater utsettes til oppfølgings-issue (ingen stille cap — issue opprettes før merge).
3. **Orakel = hardkodede uavhengige forventede tall**, kryss-sjekket mot de rene `lib/scoring`-funksjonene under utvikling. En scoring-regresjon kan da ikke maskere seg selv.
4. **`@gate` der CI-dekning trengs.** Cup-veiviser-lane evidens-gates: tag `@gate` kun hvis grønn over ≥3 staging-kjøringer; ellers `@lifecycle` (full-suite/lokal, ingen CI-blokk) mens den seedede smoke-testen forblir `@gate`-lese-sti-vakt. Stretch adversarial rolle-replay utsettes (RLS-mid-flow allerede dekket av #731/#440 hostile-PATCH-rig).

---

## Scope (ready-to-implement)

### Del A — Cup-livssyklus via ekte generator
- Legg `data-testid` på de 5 stegene i `GenerateMatchesWizard.tsx`: hvert stegs nøkkel-input + «Neste»/«Generer»-knapp + roster-tilordning. Konvensjon: `data-testid="cup-wizard-step{N}"` på container, `cup-wizard-next` / `cup-wizard-generate` på knapper, `cup-wizard-assign-{userId}-team{1|2}` på roster-toggle, `cup-wizard-course` / `cup-wizard-tee` på select-er.
- Ny e2e i `e2e/cup/cup-lifecycle.spec.ts`: seed en **draft**-cup med 2 lagmedlemmer (admin=lag1, player=lag2) via service-role, drive veiviseren via UI → ekte `createCupMatchesFromPlan`, og assert:
  - Produserte `game_players`-rader er gyldige: `flight_number=1`, `team_number` ∈ {1,2}, `accepted_at` satt, ingen `status`-kolonne-feil, ≥1 spiller per match (ingen #641-foreldreløs game-rad).
  - Cup-leaderboard (`/cup/{id}`) rendrer cup-navnet + ingen «Noe gikk galt».
- Den eksisterende seedede `@gate`-smoke-testen beholdes (lese-sti-vakt for #642).

### Del B — Liga-livssyklus via ekte generator
- Legg `data-testid` på `RoundStartClient.tsx`: `liga-round-start-player-{userId}` på checkbox, `liga-round-start-submit` på knapp.
- Ny e2e i `e2e/league/liga.spec.ts`: seed en aktiv liga + åpen runde + 2 deltakere via service-role, naviger til `/liga/{id}/runde/{roundId}/spill`, velg medspiller, klikk start → ekte `startLeagueRoundFlight`, og assert:
  - Produsert flight-game har `league_round_id` satt, `game_mode='solo_strokeplay'`, og `game_players` med `flight_number` satt + `team_number` null (ingen #647-constraint-feil).
  - Etter at flighten leveres+godkjennes (seed scores + approve via service-role), rendrer standings-tabellen TALL.
- Den eksisterende seedede `@gate`-smoke-testen beholdes.

### Del C — Per-modus finish-and-validate (round 1: 4 moduser)
- Ny harness i `e2e/_helpers/games.ts`: `seedFinishedModeGame(mode, scores, opts)` som seeder et `status='finished'`-spill med kjente scores for 2 spillere, mode-spesifikk `mode_config`, og `approved_at` satt.
- Ny `e2e/games/lifecycle-validate.spec.ts` (eller per-modus-fil) som per modus:
  - Seeder et ferdig spill med en **fast, kjent score-matrise**.
  - Logger inn som deltaker, navigerer til `/games/{id}/leaderboard`.
  - Asserter at mode-container-test-id-en er synlig OG at **hovedtallet** matcher det hardkodede orakelet (skins vunnet / netto-poeng / match-resultat / nassau-total).
- Legg til minimale numeriske test-id-er der hovedtallet ikke er rent selekterbart (f.eks. `data-testid="skins-winner-total"`), maks ett per view.
- Scenarier (hardkodet orakel, 2 spillere, banens hull-par/SI fra valgt tee):
  - **solo_strokeplay**: kjent brutto/netto → assert leder-rad + tall.
  - **singles_matchplay**: delvis runde (front-9) → «avgjort»-resultat (X&Y), assert resultat-streng mot orakel (hensyntar #800-oppførsel: full 18 gir «Nup», delvis gir «X&Y»).
  - **skins**: scorematrise med ≥1 carryover + ≥1 push → assert vinnerens skins-antall.
  - **nassau**: front/back/total med kjent netto → assert segment-utfall.

### Ut av scope (oppfølgings-issues opprettes FØR merge)
- **≥3-spiller-formater** (nines, wolf, round-robin, BBB, acey-deucey) finish-and-validate — krever multi-bruker-seeding-harness.
- **Adversarial rolle-replay** (withdrawn/ikke-admin/anon midt i livssyklus) — RLS-mid-flow allerede dekket av #731/#440; egen issue.

---

## Suksess-kriterier (evidens før avkrysning)

- [ ] **C1.** `GenerateMatchesWizard.tsx` har `data-testid` på alle 5 steg + Neste/Generer/roster/course/tee. *Evidens: `grep -c data-testid` på fila + filnavn:linje.*
- [ ] **C2.** Cup-livssyklus-e2e driver den ekte `createCupMatchesFromPlan` via UI og asserter gyldige `game_players`/flight-rader + leaderboard-render. *Evidens: testen kjører grønn mot staging; spec-utdrag som viser DB-assert + render-assert.*
- [ ] **C3.** `RoundStartClient.tsx` har `data-testid` på checkbox + submit. *Evidens: filnavn:linje.*
- [ ] **C4.** Liga-livssyklus-e2e driver den ekte `startLeagueRoundFlight` via UI og asserter gyldig flight-game + standings-tall. *Evidens: grønn mot staging; spec-utdrag.*
- [ ] **C5.** `seedFinishedModeGame`-harness finnes og brukes av per-modus-spec. *Evidens: filnavn:linje.*
- [ ] **C6.** Per-modus finish-and-validate for **alle 4 round-1-moduser** asserterer leaderboard-DOM mot hardkodet uavhengig orakel. *Evidens: 4 grønne lanes; for hver modus: scenariet + det hardkodede tallet + matchende DOM-assert.*
- [ ] **C7.** Nye `@gate`-lanes (cup + liga livssyklus, og evt. per-modus) kjører grønt via `npm run e2e:gate` mot staging. Cup-veiviser-lane: ≥3 grønne kjøringer dokumentert ELLER nedgradert til `@lifecycle` med begrunnelse. *Evidens: kommando-utdata.*
- [ ] **C8.** Hele suiten passerer portene: `tsc --noEmit`, `eslint`, `vitest run` (eksisterende co-located tester urørt grønne). *Evidens: kommando-utdata.*
- [ ] **C9.** Oppfølgings-issues opprettet for utsatt scope (≥3-spiller-moduser; rolle-replay) med milestone. *Evidens: issue-nummer.*

---

## Gates (kjøres scoped til det som endret seg)

```bash
# Type/lint/unit (alltid)
npx tsc --noEmit
npx eslint e2e/ "app/[locale]/admin/cup/[id]/generer/GenerateMatchesWizard.tsx" "app/[locale]/liga/[id]/runde/[roundId]/spill/RoundStartClient.tsx"
npx vitest run

# E2E mot staging (Node 22 + .env.staging.local). Driv via gate-tag.
source ~/.nvm/nvm.sh && nvm use 22
# Last staging-env, så kjør:
npm run e2e:gate          # de @gate-taggede (inkl. nye livssyklus-lanes)
npx playwright test --grep @lifecycle   # evt. nedgraderte lanes
```

**Robusthets-port for cup-veiviser-lane:** kjør den nye cup-lane ≥3 ganger; kun `@gate` hvis 3/3 grønn, ellers `@lifecycle`.

---

## Risiko

- **PPR-veiviser-hydrering treg/flaky headless** → mitigeres med `test.slow()`, web-first-asserts, `retries:1`, og evidens-gating av `@gate`-medlemskap.
- **Staging-DB delt på tvers av worktree-sesjoner** → all seeding bruker `TEST-`-prefiks + unik `Date.now()`-stamp + `afterAll`-cleanup scoped til egne id-er.
- **#800 matchplay-resultat-format** er kjent oppførsel, ikke en bug å fikse her — orakelet asserterer faktisk motor-output (delvis runde → «X&Y», full 18 → «Nup»).
- **Lav regresjonsrisiko totalt**: rent additive tester + test-id-er; ingen scoring-/RLS-/skjema-endring.
