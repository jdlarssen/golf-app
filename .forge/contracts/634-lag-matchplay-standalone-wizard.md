# Spec: Lag-matchplay i frittstående veiviser (2v2 side-tildeling)

**Issue:** [#634](https://github.com/jdlarssen/golf-app/issues/634)
**Branch:** `claude/forge-issue-command-2g5niz`
**Kompleksitet:** MEDIUM
**Type:** MINOR (ny bruker-synlig opprettings-vei for 5 formater)
**Dato:** 2026-06-15
**Bruker-beslutning:** Støtt side-tildeling frittstående (ikke skjul, ikke henvisning).

## Problem

Lag-matchplay-formatene `fourball_matchplay`, `foursomes_matchplay`, `greensome_matchplay`, `chapman_matchplay`, `gruesome_matchplay` tilbys i den frittstående veiviseren (de er `is_visible='t'` for `kompis`-intent, migrasjon `0081`), men er en dead-end på steg 4: «Neste» er permanent deaktivert UTEN side-/lag-tildelings-UI og UTEN «Mangler»-melding (verre UX enn #633). Rot-årsak: `useGameFormState.isMatchplay` er kun `=== 'singles_matchplay'`, og side-grid-en i `TeamsAssignmentSection` rendres kun for singles (1 spiller per side). Disse er 2v2 (to sider, to spillere per side, eksakt 4 spillere). Brukeren har valgt at de SKAL kunne opprettes frittstående.

## Research / Ground truth (fra kode-scout)

- **Side = `team_number` (1 eller 2).** De to makkerne på en side deler samme `team_number`; de skilles IKKE på `flight_number`. (`fourballMatchplay.ts:106-116`, `foursomesMatchplay.ts:138-148` filtrerer `p.teamNumber === 1/2`, krever eksakt 2 per side. Greensome/Chapman/Gruesome delegerer til foursomes-core, samme gruppering.)
- **Cup-pathen** (`app/[locale]/admin/cup/[id]/generer/actions.ts:204-220`) emitter 4 rader: side1→`team_number:1`, side2→`team_number:2`, `flight_number:1` (konstant). `mode_config = {kind, team_size:2, teams_count:2, allowance_pct}`.
- **Validatorene finnes allerede** og er registrert (`gamePayload.ts:2199-2203`): `validateFourball/Foursomes/Greensome/Chapman/GruesomeMatchplay`. Hver leser `player_${i}_id`/`player_${i}_team`, krever `team_number ∈ {1,2}` (ellers `bad_team`), setter selv `flight_number = team_number`, og ved publish: eksakt 4 spillere med 2 på side 1 og 2 på side 2 (ellers `team_balance`). Allowance-felt: `<format>_allowance_pct`, heltall 0..100, draft-defaults (fourball 100, foursomes 50, greensome 100, chapman 100, gruesome 50). **→ Ingen `gamePayload.ts`-endring nødvendig** — den frittstående payloaden trenger bare å emitte de samme 4 radene (`team_number` 1/2, 2 per side, `flight_number` satt).
- **DB CHECK `game_players_team_flight_consistency`** (`0030_game_modes.sql:38-40`): krever kun at `team_number` og `flight_number` begge er NULL eller begge satt — ikke at de er like. `flight = team` (1/2) er trygt.
- **`orderedPayload` matchplay-grenen** (`useGameFormState.ts:964-986`) emitter allerede `{user_id, team_number: side, flight_number: side}` for ALLE pid med `teamByPlayer[pid]===side` — håndterer N-per-side korrekt. Den generiske lag-grenen (994-1012) gjør det samme via `playersByTeam`.
- **Chapman-allowance mangler i `GameWizard.tsx`**: ingen `AllowanceField`, ikke i submit-payload (403-407 har fourball/foursomes/greensome/gruesome), ingen hidden input (1024-1051). `state.chapmanAllowancePct` finnes i hooken men rendres/submittes aldri.

## Design

**Kjernevalg: gjenbruk lag-slot-grid-maskineriet (`assignPlayerToSlot`/`playersByTeam`/`slotOptions`), rendret som to «Side 1/2»-kort à 2 slots, for de 5 lag-matchplay-formatene** — i stedet for å skrive om singles `assignPlayerToSide`-swap-logikken (som antar én okkupant per side). Dette speiler nøyaktig hvordan Texas (lag à 2, eksakt 2 lag) allerede fungerer og valideres, og gir lavest risiko.

### Nytt derived flag (`useGameFormState.ts`)

`isTeamMatchplay` = gameMode ∈ {fourball, foursomes, greensome, chapman, gruesome}_matchplay. Gjenbruk gjerne `isMatchplayMode` fra `lib/games/matchplaySides.ts` (lister alle 6): `isTeamMatchplay = isMatchplayMode(gameMode) && gameMode !== 'singles_matchplay'`. `teamSize` for disse er 2 (allerede `defaultTeamSizeForMode`/`ENABLED_COMBOS`), så `requiresTeams` (teamSize≥2) er allerede true.

### Validitet (`useGameFormState.ts`)

`teamMatchplayPlayersValid` (speiler texas, men eksakt 2 sider à 2):
- `selectedPlayerIds.length === 4`
- alle 4 har `teamByPlayer[pid] !== undefined`
- `playersByTeam[1].length === 2 && playersByTeam[2].length === 2`
- `playersByTeam[3].length === 0 && playersByTeam[4].length === 0`

Koble inn i `playersValidForMode` (ny `isTeamMatchplay`-gren), `canPublish` (allowance-pct dekkes av validatoren; ingen `hcp_allowance`-krav — legg `isTeamMatchplay` i unntakslista som texas/patsome på linje 1274 og 1458), og `orderedPayload` flight=team (legg `isTeamMatchplay` i `isParStableford || isTexas || ...`-betingelsen på 1002 så flight=team; validatoren overskriver uansett).

### `missingForPublish`-gren (`useGameFormState.ts`)

Ny `else if (isTeamMatchplay)`-gren med tydelig 2v2-copy (speiler texas-mønsteret, men sider):
- `< 4` → «X spiller(e) til» (eller en `teamMatchplayUnderMin`-nøkkel)
- `> 4` → «for mange spillere (2 per side)» (`teamMatchplayTooMany`)
- ellers `!teamMatchplayPlayersValid` → «side-fordeling (2 per side)» (`teamMatchplayAssign`)

### Side-grid UI (`TeamsAssignmentSection.tsx`)

Rendre lag-slot-grid-en (samme `assignPlayerToSlot`/`slotOptions`-maskineri) for `isTeamMatchplay`, men:
- Vis kun 2 kort (lag/side 1 og 2): `if (isTeamMatchplay && team > 2) return null` (samme mønster som Texas-4 skjuler lag 3/4).
- `slotCount = 2` (faller gjennom til `: 2`).
- Kort-overskrift «Side {team}» (ny i18n-nøkkel `sideTeamLabel`) i stedet for «Lag {team}» når `isTeamMatchplay`.
- `teamsDescription()`: ny `isTeamMatchplay`-gren → `teamsDescTeamMatchplay` («To sider à 2 spillere. Hver side må ha eksakt 2 spillere.»).
- «Tøm lag»-knapp: legg `isTeamMatchplay` i betingelsen (linje ~215).
- Per-spiller-tee-seksjon + prefiks: legg `isTeamMatchplay` (linje ~366 + ~81) — 2v2 trenger per-spiller-tee/kjønn for korrekt CH (fourball er per-spiller; foursomes/greensome/chapman/gruesome bruker side-handicap fra de to spillernes CH).
- Render-betingelsen for grid-seksjonen (linje ~179): legg `(isTeamMatchplay && selectedPlayerIds.length >= 2)`.
- Destrukturer `isTeamMatchplay` fra state.

**NB:** singles `isMatchplay`-side-grid (linje 113) forblir UENDRET — den dekker kun `singles_matchplay`. De to grenene er gjensidig utelukkende (`isMatchplay` = singles, `isTeamMatchplay` = de 5).

### `GameWizard.tsx`

- **Skjul `TeamSizeSelector`** for `isTeamMatchplay` (linje 582-betingelsen) — alltid lag à 2, ingen størrelses-valg (som patsome/shamble).
- **Legg til Chapman-allowance-wiring** (mangler i dag): `AllowanceField` for `chapman_matchplay` i steg 2 (default 100, speil greensome-blokken 685-696); `chapman_allowance_pct` i submit-payloaden (403-407); hidden input (1024-1051). Bruk `state.chapmanAllowancePct`/`setChapmanAllowancePct` (finnes allerede).
- `canAdvance` steg 4 er allerede `playersStepOptional || playersValidForMode` — dekkes av ny `isTeamMatchplay`-gren i `playersValidForMode`.

## Edge Cases & Guardrails

- **Eksakt 4 spillere, 2+2:** håndheves av `teamMatchplayPlayersValid` (UI) + validatoren (publish). Draft tolererer partial (validatoren skipper balanse i draft).
- **Oddetall / 3 / 5 spillere:** grid vises ved ≥2; publish-gaten + `missingForPublish` melder mangel. `> 4` blokkeres.
- **Lag 3/4 skjult:** umulig å tilordne en 3. side (`team > 2` return null), så payloaden kan ikke få team_number 3/4.
- **`registration_type`:** disse formatene støtter ikke selv-påmelding-lag-flyt i v1 — la `gameModeSupportsTeams` styre som i dag (matchplay → solo-registrering force-resettes i `handleModeChange`). Side-tildeling er admin-only her (invite_only-flyt).
- **Edit-flyt:** samme `TeamsAssignmentSection` → fungerer for rediger også. `initialValues.game_mode = <format>` + 4 pre-tilordnede spillere round-tripper via `deriveAssignmentsFromInitial`.
- **Allowance-defaults:** fourball 85, foursomes 50, greensome 100, gruesome 50, chapman 100 (matcher hook-defaults + validator-draft-defaults). Verifiser at hook-default (`fourballAllowancePct` init 85) og GameWizard-AllowanceField-default er samkjørte.
- **Ingen regresjon for singles_matchplay:** `isMatchplay` urørt; ny logikk er additiv bak `isTeamMatchplay`.

## Key Decisions

- **Gjenbruk lag-slot-grid (ikke singles side-grid) for 2v2**, relabel «Side N». Begrunnelse: `assignPlayerToSlot`/`playersByTeam` håndterer 2-per-side robust (Texas-bevist); singles `assignPlayerToSide` antar 1 okkupant og swap-logikken ville måtte skrives om.
- **Ingen `gamePayload.ts`-endring** — validatorene finnes og leser `player_${i}_team` generisk. Standalone-payloaden gjenbruker lag-payload-grenen (team_number 1/2, flight=team).
- **Fyll Chapman-allowance-hullet** i samme PR (ellers er Chapman fortsatt uopprettelig — manglende allowance-input → publish-validator får `null` → `bad_allowance`).
- **Side = team_number 1/2, flight = team_number** (validatoren overskriver uansett; DB-CHECK-trygt).

**Claude's Discretion:**
- Eksakt copy på «Side N», `teamsDescTeamMatchplay`, missing-meldingene (humanizer-pass).
- Om side-grid-en får en egen «Tøm»-knapp eller gjenbruker den eksisterende.
- Rekkefølge `isTeamMatchplay` settes inn i boolske kjeder.

## Success Criteria

- [ ] For hvert av de 5 formatene: Kompis-runde → format → bane/tee → 4 spillere → side-grid med to «Side 1/2»-kort à 2 slot-dropdowns rendres. (Render-test: mount GameForm med `initialValues.game_mode` + 4 spillere, finn 4 side-slot-`<select>` + «Side»-overskrifter.)
- [ ] Med 2+2 fordelt blir «Neste»/«Publiser» aktiv (`teamMatchplayPlayersValid` true); 3 eller 5 spillere → deaktivert med tydelig «Mangler»-melding (ikke tom dead-end).
- [ ] Chapman: `AllowanceField` vises i steg 2, `chapman_allowance_pct` submittes (hidden input finnes). (Render/DOM-sjekk.)
- [ ] `TeamSizeSelector` rendres IKKE for de 5 (kode-lesing `GameWizard.tsx:582` + evt. assertion).
- [ ] Payload for et publisert spill: 4 `game_players`-rader, `team_number` 1/1/2/2, `flight_number` satt — validatoren aksepterer (ingen `team_balance`/`bad_team`/`bad_allowance`). (Verifiseres via `gamePayload`-validator-kall i test eller eksisterende validator-suite + ny wizard-payload-test.)
- [ ] `npm run build` exit 0; full vitest grønn (ingen singles_matchplay-regresjon).

## Gates

- [ ] `npm run build` passerer (autoritativ for uttømmende `GameMode`-maps).
- [ ] `npx vitest run "app/[locale]/admin/games/new" lib/games/gamePayload.test.ts` passerer (wizard + payload-validatorer).
- [ ] Type C render-test for den nye side-grid-grenen (maks én per komponent; ikke re-assert scoring-tall).
- [ ] `humanizer`-skill på all ny norsk copy (Side-labels, beskrivelse, missing-meldinger, CHANGELOG-tagline) FØR commit.

## Files Likely Touched

- `app/[locale]/admin/games/new/useGameFormState.ts` — `isTeamMatchplay`-flag, `teamMatchplayPlayersValid`, `playersValidForMode`/`canPublish`/`missingForPublish`/`orderedPayload`-grener, eksporter flag.
- `app/[locale]/admin/games/new/sections/TeamsAssignmentSection.tsx` — destrukturer + side-grid-variant (Side-labels, 2 kort, 2 slots), beskrivelse, tøm-knapp, per-spiller-tee.
- `app/[locale]/admin/games/new/GameWizard.tsx` — skjul `TeamSizeSelector`; legg til Chapman `AllowanceField` + submit-felt + hidden input.
- `messages/no.json` + `messages/en.json` — `sideTeamLabel`, `teamsDescTeamMatchplay`, `teamMatchplayUnderMin`/`TooMany`/`Assign`.
- `app/[locale]/admin/games/new/GameForm.test.tsx` — Type C render-test (én av de 5 representativt + Chapman-allowance-render).
- `package.json` + `CHANGELOG.md` — MINOR-bump + oppføring (5 formater kan nå opprettes frittstående).

## Out of Scope

- **`gamePayload.ts`-validatorer** — finnes allerede, urørt.
- **Scoring-modulene** — urørt (leser `teamNumber` 1/2).
- **Cup-pathen** — urørt.
- **Selv-påmelding-lag-flyt for lag-matchplay** — admin-only side-tildeling i v1.
- **#633 (Patsome)** — egen PR (#650). **#635 (vinner uten skår)** — egen forge-runde.
- **Singles `assignPlayerToSide`-refaktor** — bevisst unngått; team-slot-grid gjenbrukes i stedet.
