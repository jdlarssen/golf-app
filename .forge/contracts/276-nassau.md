# Spec: Nassau — front 9 + back 9 + total 18

**Issue:** [#276](https://github.com/jdlarssen/golf-app/issues/276)
**Parent epic:** [#270](https://github.com/jdlarssen/golf-app/issues/270)
**Batch:** Kompis-runde format #2 av 7 (etter Wolf #274)

## Problem

Tørny mangler det enkleste sosiale point-game-formatet — Nassau: tre konkurranser i én runde (front 9, back 9, total 18). Det er kompis-rundens klassiker. Spilleren med best score på hver av de tre delene vinner den; de tre vinstene representerer tre separate "units" som tradisjonelt veddes på, men i Tørny vises som rene wins. En spiller som tar alle tre kalles en sweep.

Nassau er strukturelt enkelt sammenlignet med Wolf — ingen dynamiske lag, ingen per-hull-valg, ingen ny tabell. Det er **tre lag av soloStrokeplay-scoring stablet oppå hverandre**. Verdien ligger i leaderboard-flatens evne til å vise tre samtidige rangeringer + et aggregert unit-podium som fanger Nassau-DNA-en.

## Prior Decisions

Fra epic #270 (godkjent 2026-05-27):
- Nassau er primary under `kompis`-intent
- Format-row + intent-mapping seedes via egen migrasjon (F1-pattern)
- `formats.is_cup_eligible = false` for Nassau (kun for kompis-runder)
- Eksisterende games er upåvirket — Nassau legges til som ny game_mode, ingen breaking endringer

Fra denne diskusjonsrunden (2026-05-28):
- **Unit-count podium**: hver seksjon-vinst = 1 unit, 0-3 units per spiller. Aggregert podium rangerer på units desc med total18-cascade som tiebreak. Sweep-feiring når noen tar alle 3.
- **Gross/net-toggle** (Wolf-style): admin velger i wizard step 2 via `mode_config.nassau_scoring: 'gross' | 'net'`. Default 'net'.
- **Push på tie (klassisk Nassau-regel)**: tied seksjon = ingen unit deles ut. Total 18 bruker `rankTeams`-cascade, men rank-1-tie etter cascade = også push (ingen unit). Visuelt: T1 + flere navn.

Fra `lib/scoring/`-arkitektur ([modes/types.ts](../../lib/scoring/modes/types.ts), [modes/soloStrokeplay.ts](../../lib/scoring/modes/soloStrokeplay.ts)):
- Hver modus eksporterer `compute(ctx: ScoringContext): ModeResult`
- `ModeResult` er discriminated union på `kind`
- Pure logic, ingen side-effects, full Type A test-disiplin per [`lib/scoring/AGENTS.md`](../../lib/scoring/AGENTS.md)
- `rankTeams` 5-tier cascade brukes for total18-rangering (samme mønster som soloStrokeplay)
- `UNPLAYED_PADDING = 999` for unplayed-hull i ranking-arrays

Fra [F1-kontrakt](271-f1-data-model.md):
- `is_active = false` skjuler fra wizard, men game_mode-slug-en fortsetter å funke i historiske games
- Ingen FK mellom `games.game_mode` og `formats.slug`

Fra [Wolf-kontrakt](274-wolf.md):
- Gross/net-toggle-mønster: `mode_config.<format>_scoring: 'gross' | 'net'`; netto = `gross − strokesForHole(courseHandicap, strokeIndex)`. `games.hcp_allowance_pct` brukes IKKE.
- Wizard-seksjon-pattern: ny komponent under `app/admin/games/new/sections/<Format>Setup.tsx`, rendret betinget i `GameWizard.tsx` på `game_mode`.
- Per-hull-modal NB: Nassau har INGEN per-hull-modal (eneste forskjell fra Wolf).

## Design

### 1. Datamodell — kun migrasjon, ingen ny tabell

Filnavn: `supabase/migrations/0050_nassau.sql`

```sql
-- 0050_nassau.sql
-- Nassau — front 9 + back 9 + total 18 (kompis-batch i epic #270, issue #276).
--
-- Tre konkurranser i én runde med klassiske Nassau-regler. Ingen ny tabell —
-- scoring leser eksisterende scores. Push på tie er standard (ingen unit
-- deles ut når seksjonen er tied etter cascade).

insert into public.formats (
  slug, display_name, icon_key, short_description, scoring_module, is_active, is_cup_eligible
) values (
  'nassau',
  'Nassau',
  'nassau',
  'Tre konkurranser i én: front 9, back 9, total 18.',
  '@/lib/scoring/modes/nassau',
  true,
  false
);

insert into public.format_intent_mapping (
  format_slug, intent, is_visible, is_primary, sort_order
) values (
  'nassau', 'kompis', true, true, 60
);
```

Sort_order = 60 (etter Wolf på 50, så de to kompis-formatene står ved siden av hverandre i wizarden, Wolf først, Nassau rett etter).

### 2. Scoring-modul — `lib/scoring/modes/nassau.ts`

**Discriminator:** `game_mode: 'nassau'`, `mode_config.kind: 'nassau'`.

**Inn-shape:** standard `ScoringContext` — 2-4 spillere med `teamNumber: null` (solo, ikke lag), `scores[]` per-spiller gross per hull. Ingen ny prop trengs.

**Hovedalgoritme (`compute(ctx): NassauResult`):**

```
const scoringMode = ctx.game.mode_config.nassau_scoring; // 'gross' | 'net'

const front9Holes = ctx.holes.filter(h => h.number >= 1 && h.number <= 9);
const back9Holes  = ctx.holes.filter(h => h.number >= 10 && h.number <= 18);
const total18Holes = ctx.holes; // alle

const front9 = computeSection('front9', front9Holes, ctx.players, ctx.scores, scoringMode);
const back9  = computeSection('back9',  back9Holes,  ctx.players, ctx.scores, scoringMode);
const total18 = computeSection('total18', total18Holes, ctx.players, ctx.scores, scoringMode);

const players = aggregateUnits([front9, back9, total18], ctx.players);
```

`computeSection(name, holes, players, scores, scoringMode)` returnerer en `NassauSection`:
- Per-spiller `totalNetStrokes` (eller `totalGrossStrokes` hvis scoringMode='gross') summert kun for spilte hull
- Per-spiller `holesPlayed`
- Rangering via `rankTeams` på per-hull netto-arrays padded til 18 (samme UNPLAYED_PADDING-strategi som soloStrokeplay)
- `winnerUserIds`: spillere med rank=1 etter cascade. Lengde 1 = ren vinner, lengde >1 = tied (push, ingen unit deles ut)
- `isPending`: `true` hvis ingen spiller har spilt ALLE hullene i seksjonen ennå (front9 = 9 hull, back9 = 9 hull, total18 = 18 hull). Når pending, `winnerUserIds: []` (ikke noe unit-utdeling ennå)

`aggregateUnits(sections, players)` bygger `NassauUnitLine[]`:
1. Per spiller: `units = sum(1 if section.winnerUserIds.length === 1 && section.winnerUserIds[0] === userId, else 0)` over de tre seksjonene
2. `unitBreakdown: { front9: boolean; back9: boolean; total18: boolean }` — true for hver seksjon spilleren tok alene
3. **Ranking**: units desc, så total18-cascade som tiebreak (gjenbruker total18-sectionens ranking-array via padded per-hull-netto). Hvis fortsatt tied → userId ASC (deterministisk).

### 3. Output-typer — utvid `lib/scoring/modes/types.ts`

```ts
export interface NassauSectionLine {
  userId: string;
  /** Sum av effective-strokes (net hvis scoring='net', gross hvis 'gross'). */
  totalEffectiveStrokes: number;
  /** Sum av gross-strokes (vises ved siden av effective på leaderboard). */
  totalGrossStrokes: number;
  /** Antall hull spilt i seksjonen (0-9 for front/back, 0-18 for total). */
  holesPlayed: number;
  rank: number;
  tiedWith: string[];
}

export interface NassauSection {
  name: 'front9' | 'back9' | 'total18';
  /** Hullnumre i seksjonen: [1..9], [10..18], eller [1..18]. */
  holeNumbers: number[];
  players: NassauSectionLine[];
  /**
   * Vinnernes userIds for denne seksjonen.
   *  - Lengde 1: ren vinner, får 1 unit
   *  - Lengde >1: push (tied etter cascade) — ingen unit deles ut
   *  - Lengde 0: pending (ikke alle hull spilt ennå)
   */
  winnerUserIds: string[];
  /** True = ingen spiller har spilt alle hull i seksjonen ennå. */
  isPending: boolean;
}

export interface NassauUnitLine {
  userId: string;
  /** 0-3. Antall seksjoner spilleren vant alene. */
  units: number;
  unitBreakdown: { front9: boolean; back9: boolean; total18: boolean };
  /** Total18-cascade som tiebreak ved units-tie. */
  total18EffectiveStrokes: number;
  rank: number;
  /** Spillere med eksakt samme (units, total18-cascade). */
  tiedWith: string[];
}

export interface NassauResult {
  kind: 'nassau';
  scoring: 'gross' | 'net';
  sections: {
    front9: NassauSection;
    back9: NassauSection;
    total18: NassauSection;
  };
  /** Aggregert unit-ranking — primær leaderboard-row på podium. */
  players: NassauUnitLine[];
}
```

Utvid `GameMode`-union: legg til `'nassau'`.
Utvid `GameModeConfig`-union:
```ts
| {
    kind: 'nassau';
    team_size: 1;
    /**
     * Brutto vs netto for Nassau. 'net' = hver spillers per-hull-score er
     * gross − strokesForHole(courseHandicap, strokeIndex). 'gross' = ren
     * gross-score (HCP ignoreres). Speiler Wolf-mønstret.
     */
    nassau_scoring: 'gross' | 'net';
  }
```
Utvid `MODE_LABELS`: `nassau: 'Nassau'`.
Utvid `ModeResult`-union: legg til `NassauResult`.

### 4. Router — `lib/scoring/index.ts`

Legg til ny case:
```ts
case 'nassau':
  return nassauCompute(ctx);
```

### 5. Validator — `lib/games/gamePayload.ts`

Ny `validateNassau(formData, mode)`:
- Krever 2-4 spillere ved publish (min 2, max 4)
- Alle spillere har `team_number = null` (solo, ikke lag)
- `mode_config` output: `{ kind: 'nassau', team_size: 1, nassau_scoring: 'gross' | 'net' }`
- Valider `nassau_scoring` field: må være 'gross' eller 'net', default 'net' hvis ikke satt

Gjenbruker `wrong_player_count_for_mode` eller `min_players_for_mode` / `too_many_players_for_mode` (samme pattern som andre validators). Wire opp i `parseGameMode` (legg til `raw === 'nassau'`) og `modeValidators`-mappen.

### 6. Allowance-copy — `lib/games/allowanceCopy.ts`

Legg til `case 'nassau':` som speiler `'wolf':`-case (HCP via Wolf-mønstret, ikke `games.hcp_allowance_pct`).

### 7. Wizard step 2 — Nassau-spesifikk seksjon

`app/admin/games/new/sections/NassauSetup.tsx` (NY):
- Radio for `nassau_scoring`: "Med handicap (netto)" / "Brutto" (default: netto)
- Kort hjelpetekst: "Nassau-runden består av tre konkurranser — front 9, back 9, og hele 18. Hver vinner gir en seier."
- Speiler `WolfSetup.tsx`-strukturen for scoring-toggle, men uten shuffle-knappen (ingen rotasjon)

Wire i `GameWizard.tsx`: `{game_mode === 'nassau' && <NassauSetup ... />}`.

Player-count UI (step 3) bruker eksisterende 2-4-spiller-flow — ingen Nassau-spesifikk player-selection.

### 8. Scorecard UI — ingen endringer

Nassau bruker standard score-input fra solo-format. Ingen per-hull modal, ingen badge, ingen banner. Eksisterende `HoleClient.tsx` rendrer som soloStrokeplay.

**Mulig polish (Claude's Discretion, defer hvis kompliserer):** vis en mini "Front 9 ferdig"-banner på hull 10 og "Back 9 ferdig"-banner på hull 18 hvis seksjonen nettopp ble komplettert. Hyggelig micro-moment men ikke essensielt for v1.

### 9. Leaderboard — `NassauView.tsx` + `NassauPodium.tsx`

`app/games/[id]/leaderboard/NassauView.tsx` (NY):
- Tre stacked sections (mobil-først): "Front 9", "Back 9", "Totalt (18 hull)"
- Hver seksjon: per-spiller-rad med rank, navn, holesPlayed, effective-strokes, gross (sekundær)
- Vinner-rad highlightes med champagne-gold border eller crown-ikon
- Push-vis: "T1" + flere navn, ingen highlight
- Pending-vis: "Venter på flere hull spilt"
- Bruk `SoloStrokeplayView.tsx`-struktur som mal for per-spiller-rad

`app/games/[id]/leaderboard/NassauPodium.tsx` (NY):
- 1./2./3. plass på aggregert unit-count
- Unit-badges per spiller: tre små runde indicators (front 9 / back 9 / total) som fylles inn når spilleren vant seksjonen
- Sweep-feiring: hvis en spiller har `units === 3`, vis "🎉 Sweep!" eller lignende celebration-string (kompis-ethos)
- Bruk `SoloStrokeplayPodium.tsx`-struktur som mal

`LeaderboardTabs.tsx`: legg til nassau-case som routes til `<NassauView>` + `<NassauPodium>`. Reveal-modus respekteres (skjul totals til `status === 'finished'` hvis `score_visibility === 'reveal'`) — samme som SoloStrokeplay.

### 10. Server-helpers + caching

Ingen nye server-helpers. Eksisterende `getGameWithPlayers` cached helper håndterer alt (ingen `wolf_choices`-ekvivalent for Nassau). Scoring kjører fra eksisterende `scores`-tabell.

## Edge Cases & Guardrails

- **Færre enn 9 hull spilt i en seksjon**: `isPending: true`, `winnerUserIds: []`, ingen unit deles ut. UI viser "Venter på alle hull spilt".
- **Partial play (en spiller har spilt 7/9 i front, andre har spilt 9/9)**: spilleren med 7 hull rangerer bak via UNPLAYED_PADDING-strategien. Front 9 er IKKE pending (minst én spiller har fullført), men den partielle spilleren får ikke unit (de er ikke rank 1 etter cascade).

  Korreksjon: `isPending` er kun true når INGEN har spilt alle 9 hull. Når én har fullført, vinner-utdelingen fortsetter — den som har 9/9 og er rank 1 får unit-en. Andre som ikke har fullført alle hull rangerer bak via padding.

- **Push på alle tre seksjoner**: ingen units deles ut, alle spillere har `units: 0`. Podium viser "Ingen vinner ennå" eller "Tied" (Claude's Discretion). Sjeldent men mulig (4-spillere som spiller eksakt samme runde).
- **Sweep med 4 spillere**: en spiller vinner alle 3 seksjoner. `units: 3`, `unitBreakdown: { front9: true, back9: true, total18: true }`. Trigger sweep-celebration på podium.
- **Re-opening en finished game**: scoring-modul ignorerer status — game-state-management lever utenfor scoring-laget (samme som soloStrokeplay).
- **9-hulls baner**: Nassau gir ikke mening. Validatoren bør håndheve at banen har 18 hull. Hvis bane endres post-publish, fall tilbake til "ikke nok hull"-melding i view-laget. **Defer 9-hulls Nassau** til oppfølgings-issue.
- **Tie etter full 5-tier cascade**: spillerne deler T1, push, ingen unit. Veldig sjeldent (krever identisk score per hull i alle 18).
- **Mode_config mangler `nassau_scoring`**: scoring-laget faller defensivt tilbake til 'net' (samme defensive pattern som fourball/foursomes allowance_pct).
- **Spiller har 0 hull spilt**: rangerer bak via padding, `totalEffectiveStrokes: 0`, `holesPlayed: 0`. UI viser em-dash istedenfor "0" (samme som soloStrokeplay).
- **Course har skewed SI-distribusjon**: irrelevant for Nassau — strokesForHole-allokering håndterer per-hull, og front/back/total grupperer ferdig-allokerte verdier.

## Key Decisions

- **Strokeplay per seksjon, ikke matchplay** — issue-en signaliserer det ("gjenbruker eksisterende strokeplay-scoring per del"), og strokeplay støtter 2-4 spillere mens matchplay krever 1v1. Vi mister matchplay-Nassauens hull-for-hull-drama, men vinner enkelhet og kompatibilitet med 3+ spillere.
- **Push på tie (klassisk Nassau-regel)** — tied seksjon = ingen unit. Bevarer Nassau-DNA-en og unngår fake-resolution via tiebreak-cascade på Front 9 (som ville hatt rar semantikk på 9-hulls-bit).
- **Unit-count som primær ranking** — fanger Nassau-spillets essens (3 separate bets) og gir gamified moment (sweep!). Total18-cascade som tiebreak gir definitiv ranking.
- **Gross/net-toggle som Wolf** — admin valgfrihet, default netto. Konsistent mønster gjør det lett å bygge.
- **Ingen ny DB-tabell** — i motsetning til Wolf trengs ingen per-hull-state. Scoring kjører fra eksisterende `scores`-tabell. Migrasjonen er kun seed.
- **Sort_order = 60** — etter Wolf (50) i kompis-intent. Wolf først (spennende ny modus), Nassau like etter (tradisjonell klassiker).

**Claude's Discretion:**
- Eksakt visuell layout for stacked-section-leaderboard (gap, headers, divider-stiler)
- Sweep-celebration-tekst (norsk idiom): "🎉 Sweep!" eller "Tre på rad!" eller "Hele tavla!" — finn det som ligger best i Tørny's stemme. Kjør `humanizer:humanizer` på alle nye strenger.
- Unit-badge-visualisering på podium: tre runde dots med checkmark/krone-ikon, eller tekst "F9 ✓ B9 ✓ T18 ✓"
- Om "Front 9 ferdig"/"Back 9 ferdig"-banner på hull 10/18 implementeres — defer hvis det kompliserer scope
- Test-organisering: én `nassau.test.ts` med it.each-cases for alle tre seksjoner + units, eller split i `nassauScoring.test.ts` + `nassauUnits.test.ts`. Velg det som er mest lesbart.
- Pending-state-tekst i view: "Venter på spillede hull" / "Front 9 ikke ferdig" / "Spillet pågår" — velg det som er klarest på norsk
- Icon-key for nassau (i `icon_key`-feltet i formats-tabellen) — 'nassau' er stub. Hvis vi har en lett tilgjengelig "tre-stjerne" eller "trio"-ikon i lucide-bibliotek, bruk det

## Success Criteria

- [ ] Migrasjon `0050_nassau.sql` kjører grønt, seeder format-row + intent-mapping (verifiseres med `select * from public.formats where slug = 'nassau'` returnerer 1 rad og `select * from public.format_intent_mapping where format_slug = 'nassau'` returnerer 1 rad med `intent='kompis'`)
- [ ] `lib/scoring/modes/nassau.ts` finnes og eksporterer `compute(ctx): NassauResult`
- [ ] `lib/scoring/modes/nassau.test.ts` har Type A unit-tester (≥18 cases via `it.each`): ren vinner per seksjon, tie/push per seksjon, sweep, alle tre tied, gross vs net, pending-state for færre enn 9 hull, partial play, 4-spillere med ulik unit-fordeling
- [ ] `lib/scoring/index.ts` router har nassau-case som returnerer `kind: 'nassau'`
- [ ] `lib/scoring/modes/types.ts` har `NassauResult`, `NassauSection`, `NassauSectionLine`, `NassauUnitLine` + utvidet `GameMode`/`GameModeConfig`/`MODE_LABELS`/`ModeResult`
- [ ] `lib/games/gamePayload.ts` har `validateNassau` med player-count (2-4) + `nassau_scoring`-validering
- [ ] `lib/games/allowanceCopy.ts` har `case 'nassau':` (samme behandling som wolf)
- [ ] Wizard step 2 viser Nassau-spesifikk seksjon med scoring-toggle (`NassauSetup.tsx` + Type C render-test)
- [ ] `NassauView.tsx` viser tre stacked sections (front 9 / back 9 / total 18) med per-spiller-rader (Type C render-test fra fixture med 4 spillere, blandet utfall)
- [ ] `NassauPodium.tsx` viser 1./2./3. plass på unit-count med unit-badges per seksjon
- [ ] Sweep-celebration trigges når en spiller har `units === 3` (verifiseres i podium-test)
- [ ] Push-på-tie verifiseres i scoring-test: `winnerUserIds: ['user-a', 'user-b']` → ingen unit deles ut til noen av dem
- [ ] E2E golden-path: 3 spillere, 18 hull, blandet utfall (ulike vinnere per seksjon), leaderboard-totalene stemmer overens med scoring-modulens output
- [ ] Norsk copy gjennomgått med `humanizer:humanizer`-skill
- [ ] CHANGELOG-oppføring + minor-bump til `1.44.0`
- [ ] Manuell verifikasjon i iPhone Safari: tre stacked sections er lesbare på mobil, unit-badges er touch-friendly hvis interaktive

## Gates

Etter hver chunk:
- [ ] `npx tsc --noEmit` — 0 nye errors
- [ ] `npx vitest run lib/scoring/modes/nassau` — alle Type A tester grønne
- [ ] `npx vitest run` — full suite grønn (regresjonsbeskyttelse)
- [ ] `npm run lint` — 0 errors
- [ ] Mobile Playwright-spec for ny leaderboard-flate grønn (hvis E2E inkluderes)

## Files Likely Touched

**Nye:**
- `supabase/migrations/0050_nassau.sql`
- `lib/scoring/modes/nassau.ts`
- `lib/scoring/modes/nassau.test.ts`
- `app/admin/games/new/sections/NassauSetup.tsx`
- `app/admin/games/new/sections/NassauSetup.test.tsx`
- `app/games/[id]/leaderboard/NassauView.tsx`
- `app/games/[id]/leaderboard/NassauView.test.tsx`
- `app/games/[id]/leaderboard/NassauPodium.tsx`
- `app/games/[id]/leaderboard/NassauPodium.test.tsx`
- `e2e/nassau-golden-path.spec.ts`

**Endrede:**
- `lib/scoring/modes/types.ts` — utvid `GameMode`, `GameModeConfig`, `MODE_LABELS`, `ModeResult`; nye Nassau-typer
- `lib/scoring/index.ts` — nassau-case i router
- `lib/games/gamePayload.ts` — `validateNassau`, utvid `parseGameMode`, registrer i `modeValidators`
- `lib/games/allowanceCopy.ts` — nassau-case (samme som wolf)
- `app/games/[id]/leaderboard/LeaderboardTabs.tsx` — nassau-case som routes til `<NassauView>` + `<NassauPodium>`
- `app/admin/games/new/GameWizard.tsx` — render `<NassauSetup>` når `game_mode === 'nassau'`
- `CHANGELOG.md` — ny `[1.44.0]`-oppføring under nytt `## 1.44.y — Nassau`-tema-heading (wrap Wolf-serien i `<details>`)
- `package.json` — minor-bump til 1.44.0
- `lib/supabase/types.ts` — regenerert hvis nødvendig (formats/format_intent_mapping har nye rader, men ingen schema-endring)

## Out of Scope

- **Presses (tilleggsbets innenfor en seksjon)** — eksplisitt out per issue. Defer til oppfølgings-issue hvis bruker etterspør.
- **Match-play-variant av Nassau** — 1v1 strict-Nassau. Solo strokeplay-versjonen er primary; matchplay-Nassau ville kreve separat scoring-modul og blir et eget format.
- **5+ spillere** — Nassau gir ikke mening med større felt. Validatoren håndhever max 4.
- **9-hulls baner** — Nassau krever 18 hull. Validator bør håndheve, men defer 9-hulls-variant til oppfølgings-issue.
- **Variabel section-grenser** (split etter hull 12 i stedet for hull 9) — Nassau-tradisjonen er 9/9. Defer.
- **"Press"-knapp i scorecard** ("Du ligger 2 ned, vil du prøve å innhente?") — krever press-state-modell. Defer.
- **Front 9 / Back 9 ferdig-banner på hull 10/18** — Claude's Discretion, implementer hvis trivielt, ellers defer.
- **Achievement-strip på podium** (utover sweep-celebration) — defer.
- **Nassau-spesifikke notifikasjoner** ("Front 9 avgjort!") — defer til oppfølgings-issue om push-notifikasjoner generelt.
- **Side-tournaments på nassau-games** — fungerer ut av boksen via eksisterende `sideTournament.ts` (Nassau har gross-scores per hull). Ingen ekstra arbeid.

## Deferred Ideas

- **Press-mekanikk** ("automatic press at 2-down") — eget issue. Krever ny state-modell og scorecard-knapper.
- **Variabel scoring per seksjon** (front 9 = stableford, back 9 = strokeplay) — eget issue. Spennende men marginal.
- **Konfigurabelt unit-tabell** ("front 9 verd 2 units i stedet for 1") — eget issue.
- **"Skins-style"-Nassau** der hver section deles på per-hull-basis i stedet for totalsum — eget issue.
- **Nassau-statistikk-side** ("Mest swept-runder", "Mest Front 9-vinster") — eget issue.
