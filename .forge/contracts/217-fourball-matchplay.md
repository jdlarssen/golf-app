# Spec: Ryder Cup fase 2 — four-ball matchplay (2v2 best-ball-matchplay)

**Issue:** [#217](https://github.com/jdlarssen/golf-app/issues/217)
**Parent epic:** [#47](https://github.com/jdlarssen/golf-app/issues/47) (lukket ved fase 1-merge)
**Type:** MINOR (ny bruker-synlig feature)
**Anchor-doc:** [.forge/contracts/47-phase-2-fourball-anchor.md](47-phase-2-fourball-anchor.md)

## Problem

Tørny fikk Ryder Cup-grunnmuren i fase 1 ([#47](https://github.com/jdlarssen/golf-app/issues/47)) — `tournaments`-tabell, `games.tournament_id`-FK, `computeCupLeaderboard`-aggregator og master-leaderboard på `/cup/[id]`. Men kun **singles matchplay** er støttet som match-format. Fase 2 leverer **four-ball matchplay** (2v2 best-ball-matchplay): hver match har 4 spillere fordelt 2v2, hver spiller har egen ball, lagets score per hull = lavest netto-score av de to partnerne, og lagene møtes som matchplay (3&2, 2up, AS).

Fase 1 ble bevisst åpen for nye match-formater: cup-aggregatoren tar generisk `result: { winnerSide: 1|2|'tied'; formatted: string } | null` ([lib/cup/computeCupLeaderboard.ts:19-26](lib/cup/computeCupLeaderboard.ts:19)) uten å anta singles-shape. Fase 2 bygger på det fundamentet — vi legger til scoring-modulen, validator, DB-CHECK-utvidelse, wizard-pre-fill og cup-detalj-UI for å la admin opprette fourball-matches.

## Research Findings

Verifisert via scout mot da-eksisterende fase 1-kode (commit `5297ad5`):

- **Cup-aggregator allerede åpen for nye result-shapes** ([lib/cup/computeCupLeaderboard.ts:19-26](lib/cup/computeCupLeaderboard.ts:19)): `CupMatchInput.result` er generisk på `{ winnerSide: 1|2|'tied'; formatted: string }`. Fourball må produsere samme shape.
- **`singlesMatchplay.computeMatchResult(holesUp, holesPlayed, holesRemaining)`** ([lib/scoring/modes/singlesMatchplay.ts:69-112](lib/scoring/modes/singlesMatchplay.ts:69)) virker uendret for fourball — match-result-formateringen er identisk når vi mater den med side-best-numre.
- **`classifyMatchplayHole(side1Net, side2Net)`** ([lib/scoring/modes/singlesMatchplay.ts:125-133](lib/scoring/modes/singlesMatchplay.ts:125)) er allerede markert som «utvides til å akseptere lag-best-netto i stedet for individuell-netto» (kommentar i koden refererer til issue #205). Vi mater den med side-best-netto fra `bestBallForHole` — ingen kode-endring i selve helperen.
- **`bestBallForHole(players)`** ([lib/scoring/modes/bestBallNetto.ts:17-29](lib/scoring/modes/bestBallNetto.ts:17)) gir oss «laveste netto av en gruppe» rett ut av boksen. For en fourball-side er det 2 spillere; helperen tåler n=2 trivielt.
- **`parFor(hole, teeGender)`** og per-spiller `teeGender` på `ScoringPlayer` ([lib/scoring/modes/types.ts:100-114](lib/scoring/modes/types.ts:100)) lar oss støtte blandet-kjønn-par uendret — gjenbrukes fra singles-mønsteret.
- **`applyAllowance(courseHandicap, percent)`** ([lib/scoring/courseHandicap.ts:13](lib/scoring/courseHandicap.ts:13)) anvender allowance-prosent før SI-allokering. Eksisterende helper, ingen endring.
- **DB-CHECK `games_mode_check`** ([supabase/migrations/0033_texas_scramble.sql:12-22](supabase/migrations/0033_texas_scramble.sql:12)) lister 5 verdier i dag. Må utvides til 6 med ny migrasjon.
- **`getCupSnapshot.ts`** ([lib/cup/getCupSnapshot.ts:216-250](lib/cup/getCupSnapshot.ts:216)) bruker `side1 = gPlayers.find((p) => p.team_number === 1)` — én spiller per side. Må generaliseres til to spillere per side for fourball.
- **Cup-detalj-side** ([app/admin/cup/[id]/page.tsx:200-205](app/admin/cup/%5Bid%5D/page.tsx:200)) har én hardkodet `+ Opprett match`-lenke til `/admin/games/new?tournament_id=${id}`. Må splittes i to.

## Prior Decisions

- **Fra fase 1-kontrakten ([.forge/contracts/47-ryder-cup-phase-1-foundation.md](47-ryder-cup-phase-1-foundation.md)):** cup-aggregator `computeCupLeaderboard` er bevisst åpen for nye result-shapes via `winnerSide`-enum. Vi utnytter det her.
- **Fra anker-doc-en ([.forge/contracts/47-phase-2-fourball-anchor.md](47-phase-2-fourball-anchor.md)):** matchplay-result-format («3&2», «AS», «2up») er identisk med singles. Per-spiller-tee støttes. Validator krever 2v2.
- **Fra mode-router-arkitekturen ([lib/scoring/index.ts](lib/scoring/index.ts)):** ny mode = ny modul i `lib/scoring/modes/` + utvidet `ModeResult`-union + switch-case i router.
- **Fra Texas-scramble-mønsteret ([lib/games/gamePayload.ts:608-668](lib/games/gamePayload.ts:608)):** mode-spesifikk validator returnerer `{ ok: true, players, mode_config }` eller `{ ok: false, errorCode }`. Speil dette.

## Design

### 1. Datamodell

Ny migrasjon `0045_fourball_matchplay.sql`:

```sql
-- 1. Utvid games_mode_check til 6 verdier
alter table public.games drop constraint games_mode_check;
alter table public.games
  add constraint games_mode_check
    check (game_mode in (
      'best_ball_netto',
      'stableford',
      'singles_matchplay',
      'solo_strokeplay_netto',
      'texas_scramble',
      'fourball_matchplay'
    ));

-- 2. Cup-bredt allowance-felt for fourball-matches
alter table public.tournaments
  add column fourball_allowance_pct smallint not null default 85
    check (fourball_allowance_pct between 0 and 100);
```

**Hvorfor felt på `tournaments` og ikke per match:** brukeren bestemte at allowance styres av cup-reglene. En cup som spilles med WHS-standard 85% bør ha konsistent allowance på tvers av sine fourball-matches uten at admin må sette det på nytt per match. Per-match `games.hcp_allowance_pct` finnes fortsatt og pre-fylles fra cup-rad-en i wizard — kan overstyres manuelt om nødvendig.

**Hvorfor `smallint` med default 85:** WHS-standard for four-ball matchplay er 85%, samme verdi som NGF anbefaler. Eksisterende cuper fra fase 1 får 85 via default uten backfill-bekymring.

### 2. Scoring-modul

Ny `lib/scoring/modes/fourballMatchplay.ts`:

```ts
export interface FourballSide {
  sideNumber: 1 | 2;
  /** Begge partnere, sortert deterministisk for stabil UI. */
  players: [FourballSidePlayer, FourballSidePlayer];
}

export interface FourballSidePlayer {
  userId: string;
  courseHandicap: number;       // raw CH før allowance
  effectiveHandicap: number;    // etter applyAllowance(ch, allowancePct)
  teeGender?: ScoringGender;
}

export interface FourballHoleRow {
  holeNumber: number;
  strokeIndex: number;
  /** Per-side par (fra parFor på første medlem). */
  side1Par: number;
  side2Par: number;
  /** Bevart for backward-compat med UI som leser én par. */
  par: number;
  /** Per-spiller-detalj for begge sider. */
  side1Players: FourballPlayerCell[];   // alltid 2
  side2Players: FourballPlayerCell[];   // alltid 2
  /** Lag-best netto = min av partnernes netto. Null hvis ingen partner har gross. */
  side1BestNet: number | null;
  side2BestNet: number | null;
  /** UserIds som hadde lag-best netto (kan være begge ved tie). */
  side1ContributorIds: string[];
  side2ContributorIds: string[];
  result: MatchplayHoleResult;  // 'side1_wins' | 'side2_wins' | 'tied' | 'unplayed'
}

export interface FourballPlayerCell {
  userId: string;
  gross: number | null;
  extraStrokes: number;
  net: number | null;
  isContributor: boolean;        // hadde lag-best på dette hullet
}

export interface FourballMatchplayResult {
  kind: 'fourball_matchplay';
  sides: [FourballSide, FourballSide];
  holes: FourballHoleRow[];
  holesUp: number;
  holesPlayed: number;
  holesRemaining: number;
  result: MatchplayMatchResult | null;  // gjenbruker singles-typen
}
```

**Algoritme per hull:**
1. For hver spiller: hent gross fra `scoresByKey`, regn extraStrokes via `strokesForHole(effectiveHandicap, strokeIndex)`, netto = gross − extra.
2. Per side: kall `bestBallForHole(players)` for å få `{ teamNet, contributors }` — gjenbruker eksisterende helper.
3. Match-resultat per hull: `classifyMatchplayHole(side1BestNet, side2BestNet)` — direkte gjenbruk.
4. Aggregér holesUp/holesPlayed på samme måte som singles.
5. Returner via `computeMatchResult(holesUp, holesPlayed, holesRemaining)` — direkte gjenbruk.

**Allowance-pipeline:** modul leser `ctx.game.mode_config` for å hente allowance-prosent (lagret per game), kaller `applyAllowance(player.courseHandicap, pct)` for å få effektiv HCP per spiller før SI-allokering.

**Empty-shell-fallback:** hvis kontekst mangler 4 spillere fordelt 2v2 (draft-state, validator-feil tidligere i pipeline), returner shell med `holesUp: 0, holesPlayed: 0, result: null` — samme defensive pattern som singles. Scoring-laget skal aldri kaste.

### 3. Validator

Ny `validateFourballMatchplay` i `lib/games/gamePayload.ts`:

```ts
function validateFourballMatchplay(formData: FormData, mode: PayloadMode): ModeValidationResult {
  // Les opp til 8 player-slots fra GameForm
  // - Hver spiller: team_number ∈ {1, 2}
  // - flight_number = team_number (DB-CHECK)
  // Publish-regler:
  // - Eksakt 4 spillere
  // - 2 på side 1, 2 på side 2
  // Draft tolererer partial state
  // Mode_config-output: { kind: 'fourball_matchplay', team_size: 2, teams_count: 2 }
}
```

`parseGameMode` utvides med `'fourball_matchplay'`. `modeValidators` registreres. `MODE_LABELS['fourball_matchplay'] = 'Fourball'`. Ny `GameModeConfig`-variant `{ kind: 'fourball_matchplay'; team_size: 2; teams_count: 2 }`.

Feilkode-mapping ved publish:
- 0–3 spillere → `min_players_for_mode`
- 5+ spillere → `too_many_players_for_mode`
- 4 spillere men ikke 2-2-fordeling → `team_balance`

### 4. Cup-create-form

`/admin/cup/new`-form får et nytt seksjon **«Scoring for fourball-matches»** med to-trinns kontroll:

1. **Netto/brutto-toggle** (radio eller tabs):
   - **Netto** (default): vis allowance-input
   - **Brutto**: skjul allowance-input, lagre 0 ved submit
2. **Allowance-input** (kun synlig når netto er valgt): number-input, 0..100, default 85, helper-tekst: «Andel av spillerens handicap som teller. Standard er 85% for four-ball matchplay.»

DB-mapping: `tournaments.fourball_allowance_pct = 0` betyr brutto, `1..100` betyr netto med den allowance-prosenten. Én kolonne dekker begge tilstander uten ny enum/boolean — toggle er ren UI-konstruksjon over allowance-feltet.

`lib/cup/actions.ts` `createTournamentDraft` leser feltet, validerer 0..100, persisterer til `tournaments.fourball_allowance_pct`. Cup-edit-flyten (hvis den finnes i fase 1 — verifiseres i build) får samme kontroll.

**Cross-wizard utrulling defer-es til [#266](https://github.com/jdlarssen/golf-app/issues/266):** netto/brutto-toggle på de andre wizards (best_ball, stableford, texas_scramble, singles_matchplay, solo_strokeplay) etablerer samme UX-mønster der. Holder fase 2 fokusert på fourball-leveransen.

### 5. Cup-detalj-side — to-knapper

`app/admin/cup/[id]/page.tsx` erstatter dagens hardkodede `+ Opprett match`-link med to:

```
+ Singles match   → /admin/games/new?tournament_id={id}&game_mode=singles_matchplay
+ Fourball match  → /admin/games/new?tournament_id={id}&game_mode=fourball_matchplay
```

Visuelt: rad med to lenker side om side (eller stacked på mobil), samme typografi som dagens link.

### 6. Wizard pre-fill og netto/brutto-toggle

`app/admin/games/new/GameWizard.tsx` (og evt. `GameForm.tsx`) håndterer:
- `?tournament_id={id}` → marker matchen som cup-medlem
- `?game_mode={singles_matchplay|fourball_matchplay}` → pre-fyll mode-velgeren
- **Når `game_mode=fourball_matchplay`:**
  - Hent `tournament.fourball_allowance_pct` fra DB
  - Vis netto/brutto-toggle i wizarden:
    - Pre-valg «Brutto» hvis `fourball_allowance_pct === 0`
    - Pre-valg «Netto» ellers, allowance-input pre-fylt med verdien fra cup
  - Admin kan overstyre toggle og/eller allowance-verdi for denne matchen
  - Ved submit: lagre til `games.hcp_allowance_pct` (0 hvis brutto, allowance-verdi hvis netto)

Ingen ny route — eksisterende `/admin/games/new` håndterer både singles og fourball via mode-pre-fill. Netto/brutto-toggle vises kun når `game_mode=fourball_matchplay` i denne fasen; rulles ut på andre wizards i en oppfølger-issue.

### 7. Cup-snapshot

`lib/cup/getCupSnapshot.ts` utvides:
- Per match: identifiser om `game_mode === 'fourball_matchplay'` eller `singles_matchplay`
- For fourball: hent alle 4 spillere, kjør `computeFourballMatchplay`, ekstrahér result
- `team1PlayerName`/`team2PlayerName` for fourball: join med «/» (f.eks. «Per/Knut»)

Match-result-formatering: cup-leaderboard viser **lag-fokusert** tekst — «3&2 til Lag Skog» (henter `tournament.team_1_name`/`team_2_name`), ikke par-navn. Par-navnene står allerede i raden over som «Per/Knut mot Lise/Eva».

### 8. Mode-router

`lib/scoring/index.ts`:
```ts
case 'fourball_matchplay':
  return fourballMatchplay.compute(ctx);
```

`ModeResult`-union utvides med `FourballMatchplayResult`.

### 9. Scorekort-UX (Claude's Discretion innenfor disse rammer)

Gjenbruk best-ball-scorekort-flatens layout (4 spillere på ett scorekort, 2 fordelt på hver side). I header: per-side bestes-totalsum + match-status («Lag Skog 2 up etter 5» / «AS etter 7»). Per-hull-rad: 4 input-felt for gross, per-side bestes netto med subtilt highlight (font-bold + champagne-tint?), match-hull-utfall som chip («Lag Skog 1up» / «Halvert»).

Detaljer (highlight-farge, chip-stil, spacing) overlater jeg til build-fasen — speilar best-ball-flaten med matchplay-overlay i header.

## Edge Cases & Guardrails

- **Match med 0–3 spillere ved scoring-kall (draft):** scoring-laget returnerer defensiv empty-shell. Validator stopper publish.
- **Begge partnere har null gross på et hull:** lag-best er null, `classifyMatchplayHole` returnerer 'unplayed', hullet bidrar ikke til match-status. Samme regel som singles.
- **Én partner har gross, den andre null:** lag-best er den ene partnerens netto. Best-ball-tradisjon. Match-hull avgjøres når begge sider har minst én score.
- **Allowance 0% (gross-only):** legalt input. Effectiv HCP for alle spillere blir 0, scoring blir gross-only matchplay. Forventet oppførsel for admin som vil simulere scratch-Ryder Cup.
- **Allowance 100%:** legalt input. Full HCP for alle. Matcher Tørny-default for andre modi.
- **Mat-em før 18:** samme som singles — `|holesUp| > holesRemaining` → format `${marginUp}&${remainingAtDecision}`.
- **AS etter 18:** result.winner = 'tied', formatted = 'AS', `winnerSide: 'tied'` i `CupMatchInput.result` → halvert point (0,5 til hvert lag i cup).
- **Blandet-kjønn-par (mens + ladies):** `parFor(hole, side.teeGender)` plukker riktig par per spiller. SI-allokering og netto-beregning per spiller. Lag-best beregnes på netto, så blandet-tee-par konkurrerer rettferdig.
- **Spiller fjernet fra match mid-game:** game_players-relasjonen vinner. Validatoren tillater ikke fjerning av spillere fra publisert spill (eksisterende guard).
- **Duplikat-spiller (samme userId to ganger):** validator avviser med `duplicate_player`.
- **Cup-rad mangler fourball_allowance_pct (gammel data):** DB-default 85 dekker det. Nye queries bruker kolonne-verdien direkte.
- **Wizard åpnes uten `?game_mode`:** default-mode behold dagens oppførsel (best_ball_netto). Ingen regresjon.
- **Wizard åpnes med `?game_mode=fourball_matchplay` men uten `?tournament_id`:** legalt — admin kan opprette en fourball-match utenfor en cup. Allowance defaulter til 100% (Tørny-default) siden det ikke er noen cup å hente fra. Sub-tekst i wizard nevner det.

## Key Decisions

- **`tournaments.fourball_allowance_pct`-kolonne, default 85, range 0–100:** styres av cup-reglene (brukerens valg). Pre-fyller wizard ved fourball-match-create. Admin kan overstyre per match via eksisterende `games.hcp_allowance_pct`-felt. **`0` betyr brutto, `1..100` betyr netto med den prosenten** — én kolonne dekker begge tilstander, netto/brutto-toggle er ren UI-konstruksjon.
- **Netto/brutto-toggle i fourball-wizarden (kun for fourball i denne fasen):** UI-toggle over allowance-feltet. Brutto = `hcp_allowance_pct = 0`. Cross-wizard-utrulling for andre modi defer-es til egen oppfølger-issue.
- **To-knapper på cup-detaljside:** «+ Singles match» og «+ Fourball match» (brukerens valg). Klart valg, ingen ekstra wizard-steg.
- **Per-spiller-tee støttet:** gjenbruker `parFor` + `teeGender` fra singles. Tillater blandet-kjønn-fourball (Ryder Cup-tradisjon).
- **Lag-fokusert result-tekst i cup-leaderboard:** «3&2 til Lag Skog», ikke «3&2 til Per/Knut». Par-navnene står i raden over.
- **`computeMatchResult` + `classifyMatchplayHole` gjenbrukes uendret:** scoring-laget får ny modul, ingen endring i delte matchplay-helpere.
- **Cup-aggregatoren `computeCupLeaderboard` rører vi ikke:** den er allerede åpen for `{ winnerSide, formatted }` fra alle modi.
- **Match-label-konvensjon:** Claude's Discretion — foreslår auto-suggest «Fourball N» / «Singles N» basert på antall eksisterende matches av samme mode i cupen, redigerbart av admin.
- **Scorekort-UX bygger på best-ball-flate:** ingen ny scorekort-route. Best-ball-scorekortet konsumerer ny mode via mode-router.
- **Versjons-bump:** MINOR (`1.32.0` → `1.33.0`, eller neste ledige minor).

**Claude's Discretion:**
- Eksakt copy på cup-create-form (allowance-felt-label, helper-tekst). Humanizer-pass.
- Match-label-auto-suggest-format («Fourball 1», «Match 1»). Default: «Fourball N» basert på antall eksisterende.
- Scorekort-highlight-farge for bestes netto per hull. Foreslår subtilt accent-tint (champagne-gold på dark, subtle bold på light).
- Match-status-chip-stil i scorekort-header. Speil StatusChip-tonene.
- CHANGELOG-tagline (skrives sist, humanizer-pass).
- Om mode-router-cases skal sorteres alfabetisk vs. kronologisk-shipped. Konsistens med eksisterende rekkefølge.
- `data-testid`-konvensjon for fourball-spesifikke UI-elementer (hvis E2E skrives).

## Success Criteria

- [ ] **Migrasjon `0045_fourball_matchplay.sql` lagt til + `lib/database.types.ts` regenerert.** Verifikasjon: `grep "fourball_matchplay" lib/database.types.ts` returnerer treff i game_mode-litteraltyper; `grep "fourball_allowance_pct" lib/database.types.ts` returnerer treff i tournaments-typene.
- [ ] **Scoring-modul `lib/scoring/modes/fourballMatchplay.ts` implementert med full TDD-dekning.** Verifikasjon: `npm test -- fourballMatchplay` ≥ 12 grønne tester som dekker (a) basic 2v2 med kjent gross/SI/HCP, (b) mat-em før 18, (c) AS etter 18, (d) one-side-unplayed-hole, (e) one-partner-unplayed-still-counts, (f) allowance 0% / 85% / 100%, (g) blandet-kjønn-tees med parByGender, (h) empty-shell ved 0/3-spiller-context.
- [ ] **`fourball_matchplay` ligger i `GameMode`-union, `MODE_LABELS`, `GameModeConfig`, `ModeResult` og mode-router-en.** Verifikasjon: `npx tsc --noEmit` passerer; `grep "fourball_matchplay" lib/scoring/` returnerer treff i types.ts, index.ts og modes/fourballMatchplay.ts.
- [ ] **`validateFourballMatchplay` håndhever 4 spillere fordelt 2v2 ved publish.** Verifikasjon: `npm test -- gamePayload` har nye cases for fourball — `min_players_for_mode` (≤3), `too_many_players_for_mode` (≥5), `team_balance` (4 spillere men ikke 2-2), happy-path (4 spillere 2-2 → ok).
- [ ] **`tournaments.fourball_allowance_pct` lagres via cup-create-form og brukes som default i wizard.** Verifikasjon: opprett cup via `/admin/cup/new` med netto+85 → DB-rad har `fourball_allowance_pct = 85`; opprett fourball-match fra cup → wizard viser netto-toggle valgt + allowance pre-fylt med 85.
- [ ] **Netto/brutto-toggle i cup-create-form og fourball-wizard fungerer.** Verifikasjon: (a) cup-create med brutto valgt → DB-rad har `fourball_allowance_pct = 0`; (b) wizard for fourball-match fra en brutto-cup → toggle pre-valgt på brutto, allowance-input skjult; (c) admin bytter til netto i wizarden → allowance-input vises, default 85 (eller cup-verdi om ulik 0).
- [ ] **Cup-detalj-side viser to separate match-create-knapper.** Verifikasjon: `/admin/cup/[id]` har lenker både til `?game_mode=singles_matchplay` og `?game_mode=fourball_matchplay`, hver med `?tournament_id` satt.
- [ ] **`getCupSnapshot.ts` håndterer fourball-matches korrekt.** Verifikasjon: cup med én fourball-match (4 spillere, noen scores) returnerer `team1PlayerName: 'Per/Knut'`, `team2PlayerName: 'Lise/Eva'`, og korrekt `result.winnerSide` + `formatted` når matchen er ferdig.
- [ ] **Cup-leaderboard rendrer lag-fokusert result-tekst for fourball-matches.** Verifikasjon: manuell preview-test eller snapshot — ferdig fourball-match med side 1-vinner viser «3&2 til {team_1_name}», ikke «3&2 til Per/Knut».
- [ ] **Wizard kan opprette en fourball-match som havner med riktig `game_mode` + `tournament_id` i DB.** Verifikasjon: opprett fourball-match via `/admin/games/new?tournament_id=X&game_mode=fourball_matchplay` → DB-rad har `game_mode = 'fourball_matchplay'`, `tournament_id = X`, `mode_config = { kind: 'fourball_matchplay', team_size: 2, teams_count: 2 }`.
- [ ] **Manuelt røyk-test i preview passerer:** (a) opprett cup med allowance 85, lag-roster 4 vs 4; (b) opprett en singles-match og en fourball-match fra cup-siden; (c) spill noen hull i fourball-matchen, sjekk at netto-best og match-status oppdateres; (d) avslutt matchen, sjekk at cup-leaderboard reflekterer riktig point + result-tekst.
- [ ] **CHANGELOG-oppføring + MINOR-bump i `package.json`.** Verifikasjon: pre-commit-hook for commit-msg passerer på `feat(...)`-commit som inkluderer `package.json` + `CHANGELOG.md`.

## Gates

- [ ] `npx tsc --noEmit` passerer
- [ ] `npm test -- fourballMatchplay gamePayload computeCupLeaderboard getCupSnapshot` passerer (eksisterende tester må ikke breke)
- [ ] `npm run lint` passerer
- [ ] `.githooks/pre-commit` ingen humanizer-advarsler på nye norske strenger
- [ ] `.githooks/commit-msg` passerer på `feat(cup): four-ball matchplay …` med pakke-bump + CHANGELOG
- [ ] Manuell røyk-test på Vercel-preview: opprett cup → fourball-match → spill 5–7 hull → cup-leaderboard speiler riktig

## Files Likely Touched

- `supabase/migrations/0045_fourball_matchplay.sql` — ny migrasjon (DB-CHECK + tournaments-kolonne)
- `lib/database.types.ts` — regenerert
- `lib/scoring/modes/fourballMatchplay.ts` — **NY** scoring-modul
- `lib/scoring/modes/fourballMatchplay.test.ts` — **NY** unit-tester
- `lib/scoring/modes/types.ts` — `GameMode`-union, `MODE_LABELS`, `GameModeConfig`, `ModeResult`, nye Fourball-interfaces
- `lib/scoring/index.ts` — switch-case for ny mode + re-export
- `lib/games/gamePayload.ts` — `parseGameMode`, `validateFourballMatchplay`, `modeValidators`
- `lib/games/gamePayload.test.ts` — nye validator-tester
- `lib/cup/getCupSnapshot.ts` — fourball-handling (4 spillere per side, ny mode-route)
- `lib/cup/actions.ts` — cup-create/edit-form lese `fourball_allowance_pct`
- `app/admin/cup/new/page.tsx` — nytt allowance-felt + helper-tekst
- `app/admin/cup/[id]/page.tsx` — to-knapper for match-create
- `app/admin/cup/[id]/edit/page.tsx` (hvis eksisterer) — allowance-felt
- `app/admin/games/new/GameWizard.tsx` / `GameForm.tsx` — mode-pre-fill, allowance-pre-fill fra cup
- `app/admin/games/new/actions.ts` — verifisere mode-routing
- `components/scorecard/` (best-ball-flate) — utvide for fourball-modus (matchplay-overlay i header)
- `package.json` + `CHANGELOG.md` — MINOR bump, ny CHANGELOG-oppføring
- `docs/email-templates.md` (optional) — hvis cup-start-mail nevner spillformat

## Out of Scope

- **Foursomes (alt-shot)** — fase 3 ([#218](https://github.com/jdlarssen/golf-app/issues/218) hvis det eksisterer, ellers ny issue ved fase 3-start).
- **Match-templating / format-presets** — fase 4.
- **Egen `fourball_match`-tabell eller annen normalisering** — match er en `games`-rad som før.
- **Brukerdefinerte preset for «Ryder Cup mini»-format** — fase 4.
- **Auto-generere match-schedule fra cup-format** — fase 4.
- **Lag-kapteiner som egen rolle** — defer til konkret behov.
- **Mer enn 2 lag i cup** — Solheim Cup-stil. Krever skjema-endring.
- **Concessions (give-the-hole-knapp)** — egen UX-utvidelse, ikke kritisk for fourball MVP.
- **Live-streaming-WebSocket for fourball-scorekort** — eksisterende sync + revalidateTag dekker behovet.
- **Scratch-only-modus uten allowance** — kan oppnås ved å sette `fourball_allowance_pct = 0`. Egen UI-toggle for «scratch-modus» defer-es.
- **Statistikk på tvers av fourball-matches** — krever egen feature.
- **Endring av `computeCupLeaderboard`-aggregator** — den er allerede åpen; fase 2 endrer den ikke.
- **Mode-velger-UI i ren game-create-flyt (uten cup-kontekst)** — defer til fase 4 / egen mode-selector-feature.
- **Netto/brutto-toggle på andre wizards** (best_ball, stableford, texas_scramble, singles_matchplay, solo_strokeplay) — spawnet til [#266](https://github.com/jdlarssen/golf-app/issues/266), etablerer samme UI-mønster der. Holder fase 2 fokusert på fourball.
