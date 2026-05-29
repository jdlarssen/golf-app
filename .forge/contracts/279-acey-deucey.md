# Spec: Acey Deucey — lavest tar, høyest gir

**Issue:** [#279](https://github.com/jdlarssen/golf-app/issues/279)
**Parent epic:** [#270](https://github.com/jdlarssen/golf-app/issues/270)
**Batch:** Kompis-runde format (sekundær under `kompis`-intent)
**Avhenger av:** F1 ([#271](https://github.com/jdlarssen/golf-app/issues/271)) — landet.

## Problem

Tørny støtter i dag 12 game_modes. Acey Deucey er en klassisk kompis-runde-arketype for **eksakt 4 spillere**: på hvert hull tar den med lavest score («ace») poeng fra de tre andre, mens den med høyest score («deuce») gir poeng til de tre andre. Netto-effekten per hull er **+3 til ace, −3 til deuce, 0 til de to i midten**. Delt lavest eller delt høyest → den siden deles ikke ut. Løpende total kan bli **negativ**.

Til forskjell fra Bingo Bango Bongo ([#277](https://github.com/jdlarssen/golf-app/issues/277)) — som introduserte prestasjons-poeng utenfor slag og krevde egen tabell + scorekort-UI + server-action + realtime — er Acey Deucey **rent slag-derivert**: poengene regnes ut fra slagene spillerne allerede taster. Ingen ny input, ingen ny tabell, ingen ny scorekort-seksjon.

## Research Findings

Ingen ekstern library-research relevant — dette er ren TypeScript-scoring + etablerte in-repo Next.js-mønstre. «Library»-en er Tørnys egen scoring-ramme, fullt kartlagt:

- **`lib/scoring/modes/skins.ts`** er den nærmeste fulle malen: per-hull slag-sammenligning, `gross`/`net`-bryter via `effectiveFor(scoringMode, gross, courseHandicap, strokeIndex)` (bruker `strokesForHole` fra `strokeAllocation.ts`), egen `SkinsResult`-type, View + Podium, `renderSkins` i leaderboard-`page.tsx`.
- **`lib/scoring/modes/modifiedStableford.ts`** viser løpende total som kan bli **negativ**, og prosesserer hvert hull **uavhengig** (null gross → 0 poeng for hullet, fortsetter) — i motsetning til Skins som **fryser** fra første uferdige hull (fordi skins ruller over sekvensielt). Acey Deucey har ingen carryover → uavhengig hull-prosessering (Modified Stableford-modellen), ikke frys.
- **`ScoringContext.scores: ScoringHoleScore[]`** (`{ userId, holeNumber, gross: number | null }`) eksponerer slag. Moduler bygger `Map<"userId#holeNumber", number|null>` og slår opp per (spiller, hull). Netto regnes on-the-fly: `gross - strokesForHole(courseHandicap, strokeIndex)`.
- **Eksisterende bryter-presedens:** `skins_scoring`, `wolf_scoring`, `nassau_scoring` i `mode_config` (`'gross' | 'net'`). Acey Deucey følger nøyaktig dette mønstret.

## Prior Decisions

Fra epic #270 + F1-kontrakt ([271](271-f1-data-model.md)):
- Nytt format introduseres via egen migrasjon som seeder `formats`-row + `format_intent_mapping`. Ingen FK mellom `games.game_mode` og `formats.slug`.
- `is_active = false` skjuler fra wizard; slug fortsetter å funke i historiske games.
- Server-action-validering (ikke DB CHECK) håndhever game_mode.

Fra Skins-kontrakt ([275](275-skins.md)) + Wolf ([274](274-wolf.md)):
- `gross`/`net`-bryter lever i `mode_config` (`*_scoring`-felt), parses fra eget form-felt, vises i wizard.
- Individuell modus: `team_size: 1`, `team_number`/`flight_number` nulles på `game_players`.
- Hver modus eksporterer `compute(ctx): ModeResult` (discriminated union på `kind`). Pure logic, full Type A test-disiplin per [`lib/scoring/AGENTS.md`](../../lib/scoring/AGENTS.md).
- Leaderboard: `renderXxx()` i `app/games/[id]/leaderboard/page.tsx` → `<XxxView>` (aktiv) / `<XxxPodium>` (finished). `LeaderboardTabs` er **kun** side-turnering-overlay, ikke mode-routing — routing skjer i `page.tsx` via if-kjede.

Fra Bingo Bango Bongo ([277](277-bingo-bango-bongo.md)):
- Filnavn camelCase (`bingoBangoBongo.ts`); slug i DB beholder snake_case (`acey_deucey`).
- Engelske sportstermer beholdes bevisst (Bingo/Bango/Bongo, Turkey/Snowman) → «Ace»/«Deuce» beholdes som per-hull-etiketter; format-navn «Acey Deucey» beholdes engelsk.

## Key Architectural Decision: rent slag-derivert — ingen ny tabell/UI/server-action

Acey Deucey-poeng utledes utelukkende fra slagene spillerne allerede taster i det eksisterende scorekortet. Derfor:

- **Ingen ny tabell** (i motsetning til BBB/Wolf sine kategori-tabeller). Alt regnes fra `scores`.
- **Ingen ny scorekort-seksjon, server-action eller realtime-sub.** Slag-flyten er uendret; live-oppdatering kommer gratis via eksisterende slag-sync.
- **Full stack = Skins minus tabell/UI-input:** scoring-modul + types + index-case + validator + wizard-bryter + leaderboard View/Podium + migrasjon + mode-guide.

Dette matcher issue-ets «Kompleksitet: LOW · Standard strokeplay-input».

## Design

### 1. Scoring-modul — `lib/scoring/modes/aceyDeucey.ts`

**Discriminator:** `game_mode: 'acey_deucey'`, `mode_config.kind: 'acey_deucey'`.

**Algoritme (`compute(ctx): AceyDeuceyResult`):**

```
scoring = ctx.game.mode_config.acey_deucey_scoring   // 'gross' | 'net'
grossByKey = Map<`${userId}#${holeNumber}`, number|null>

for each hole (sortert på number):
  eff = for each player:
      gross = grossByKey.get(`${userId}#${hole.number}`) ?? null
      effective = (gross === null) ? null
                : scoring === 'gross' ? gross
                : gross - strokesForHole(courseHandicap, hole.strokeIndex)

  scored = alle 4 spillere har effective !== null
  pointsByPlayer = { alle spillere: 0 }
  aceUserId = null, deuceUserId = null

  if scored:
     minEff = min(effective), maxEff = max(effective)
     aceCandidates  = spillere med effective === minEff
     deuceCandidates = spillere med effective === maxEff
     if aceCandidates.length === 1:   pointsByPlayer[ace] = +3;  aceUserId = ace
     if deuceCandidates.length === 1: pointsByPlayer[deuce] = -3; deuceUserId = deuce
     // alle-like → begge length === 4 → verken ace eller deuce (faller naturlig ut)

  push holeRow { holeNumber, par, strokeIndex, scored, aceUserId, deuceUserId, pointsByPlayer }

per spiller: total = Σ pointsByPlayer (kan bli negativ); aces = #hull som unik ace; deuces = #hull som unik deuce
rank: total desc → ved lik total: flest aces desc → fortsatt lik: delt rank (tiedWith satt)
```

**Sentrale regler:**
- **Ace (+3)** deles kun ut når **nøyaktig én** spiller har strengt lavest effective score på hullet.
- **Deuce (−3)** deles kun ut når **nøyaktig én** spiller har strengt høyest effective score.
- Delt lavest → ingen ace. Delt høyest → ingen deuce. **Uavhengig** av hverandre (issue: «Tied lavest/høyest = ingen utdeling»). F.eks. `[3,3,4,5]` → ingen ace, deuce = −3 til 5-spilleren.
- Alle fire like → verken ace eller deuce (begge sider delt).
- **Hull må være fullt scoret (alle 4)** for å dele ut poeng. Uferdig hull → 0 til alle dette hullet, men senere hull prosesseres uavhengig (ikke frys, jf. Modified Stableford).
- Netto: sammenligner handikap-justerte slag (`gross - strokesForHole(...)`). To spillere kan bli like på netto selv med ulik brutto → delt → ingen utdeling.

### 2. Typer — `lib/scoring/modes/types.ts`

```ts
export interface AceyDeuceyHoleRow {
  holeNumber: number;
  par: number;
  strokeIndex: number;
  scored: boolean;                       // alle 4 har score
  aceUserId: string | null;              // unik lavest, ellers null
  deuceUserId: string | null;            // unik høyest, ellers null
  pointsByPlayer: Record<string, number>;// +3 / 0 / −3 per spiller dette hullet
}

export interface AceyDeuceyPlayerLine {
  userId: string;
  aces: number;        // hull som unik ace
  deuces: number;      // hull som unik deuce
  total: number;       // Σ poeng (kan være negativ)
  rank: number;
  tiedWith: string[];
}

export interface AceyDeuceyResult {
  kind: 'acey_deucey';
  scoring: 'gross' | 'net';
  holes: AceyDeuceyHoleRow[];
  players: AceyDeuceyPlayerLine[];
}
```

Union-utvidelser (alle exhaustive — bygget feiler ellers):
- `GameMode`: `| 'acey_deucey'`
- `GameModeConfig`: `| { kind: 'acey_deucey'; team_size: 1; acey_deucey_scoring: 'gross' | 'net' }`
- `ModeResult`: `| AceyDeuceyResult`
- `MODE_LABELS`: `acey_deucey: 'Acey Deucey'`

### 3. Mode-registrering — `lib/scoring/index.ts`

- `import * as aceyDeucey from './modes/aceyDeucey';`
- `case 'acey_deucey': return aceyDeucey.compute(ctx);`
- Re-eksporter `AceyDeuceyResult`, `AceyDeuceyHoleRow`, `AceyDeuceyPlayerLine`.

### 4. Validator — `lib/games/gamePayload.ts`

Ny `validateAceyDeucey(formData, mode)` (mal: `validateSkins` for scoring-bryter + `validateWolf` for eksakt-4):
- Parse spillere (`player_0_id`..`player_7_id`), dedup (`duplicate_player`).
- `mode === 'publish'`: **eksakt 4** — `< 4` → `min_players_for_mode`, `> 4` → `too_many_players_for_mode`.
- `team_number: null, flight_number: null` per spiller.
- `parseAceyDeuceyScoring(formData)` (mal: `parseSkinsScoring`), default `'net'`.
- `mode_config: { kind: 'acey_deucey', team_size: 1, acey_deucey_scoring }`.
- Wire i `parseGameMode` (`raw === 'acey_deucey'`) + `modeValidators`-mappen.

### 5. Wizard — brutto/netto-bryter

Wizarden må rendre `acey_deucey_scoring`-bryteren (brutto/netto) for acey_deucey, **eksakt** som Skins viser `skins_scoring`. Finn Skins-bryterens render-sted (`grep -rn "skins_scoring" app/ components/`) og speil for acey_deucey. Default «netto» (Tørny er handikap-sentrisk; kompis-grupper har oftest blandet nivå). Spiller-utvalget bruker standard eksakt-4-utvalg (ingen lag).

### 6. Leaderboard — `AceyDeuceyView` + `AceyDeuceyPodium`

- `app/games/[id]/leaderboard/page.tsx`: ny `renderAceyDeucey(...)` (mal: `renderSkins`). Bygg `ScoringContext` (game_mode `'acey_deucey'`, `mode_config`), `computeLeaderboard` → narrow `result.kind === 'acey_deucey'` (ellers `notFound()`). Finished → `<AceyDeuceyPodium>` + chromeless `<AceyDeuceyView>`; aktiv → `<AceyDeuceyView>`. Legg `if (game.game_mode === 'acey_deucey')`-grenen sammen med de andre mode-grenene før best_ball-fallback.
- `AceyDeuceyView.tsx` (NY, mal: `SkinsView` to-seksjons-struktur):
  - **Seksjon 1 — totaler:** per spiller, rank-medalje topp-3, displayName, undertekst «X ace · Y deuce», stor **total** med fortegn (`+5` / `−3`), `tabular-nums`. Sortert total desc.
  - **Seksjon 2 — per-hull-tabell:** Hull N · Par · SI, hvem som var **ace (+3)** og **deuce (−3)** (navn), eller «Delt» (ingen utdeling) / «Venter» (uferdig hull).
  - Respekter `scoreVisibility === 'reveal'` (skjul til `finished`, samme `isRevealHidden`-mønster som SkinsView).
- `AceyDeuceyPodium.tsx` (NY, mal: `SkinsPodium`): 1./2./3.-plass med total; champagne-gull kun på vinner.

### 7. Mode-guide — `lib/formats/modeGuide.ts`

Legg til `acey_deucey`-entry i `MODE_GUIDE` (exhaustive `Record<GameMode, ModeGuide>` — bygget feiler uten):
```ts
acey_deucey: {
  summary: 'Fire spillere. På hvert hull tar den med lavest score tre poeng — ett fra hver av de andre. Den med høyest gir tre poeng fra seg.',
  points: [
    'Lavest score alene gir +3. Høyest score alene gir −3. De to i midten står i ro.',
    'Deler to eller flere lavest (eller høyest), deles ikke den siden ut det hullet.',
    'Du kan spille det brutto eller netto med handikap, alt etter hva som er valgt. Totalen kan bli negativ.',
  ],
},
```
(Copy gjennomgås med `humanizer:humanizer` før commit.)

### 8. Migrasjon — `supabase/migrations/0054_acey_deucey.sql`

Ingen ny tabell. Kun seeding:
```sql
insert into public.formats
  (slug, display_name, icon_key, short_description, scoring_module, is_active, is_cup_eligible)
values
  ('acey_deucey', 'Acey Deucey', 'acey_deucey',
   '4 spillere. Lavest tar (+3), høyest gir (−3), midten 0. Delt = ingen utdeling.',
   '@/lib/scoring/modes/aceyDeucey', true, false);

insert into public.format_intent_mapping
  (format_slug, intent, is_visible, is_primary, sort_order)
values
  ('acey_deucey', 'kompis', true, false, 100);
```
(`sort_order = 100` — neste ledige etter bingo_bango_bongo=90 for `intent='kompis'`. Bekreft mot eksisterende rader ved bygging.)

## Edge Cases & Guardrails

- **Uferdig hull (ikke alle 4 har score):** ingen utdeling det hullet (`scored: false`), 0 til alle, men senere hull prosesseres uavhengig (ikke frys). UI: «Venter».
- **Delt lavest** (f.eks. `[3,3,4,5]`): ingen ace; deuce gjelder fortsatt (5 → −3). Uavhengige sider.
- **Delt høyest** (`[3,4,5,5]`): ace gjelder (3 → +3); ingen deuce.
- **Begge delt** (`[3,3,5,5]`): verken ace eller deuce — alle 0.
- **Alle fire like** (`[4,4,4,4]`): verken ace eller deuce — alle 0 (faller naturlig ut av `length === 1`-sjekken).
- **Tre like lavest** (`[3,3,3,5]`): ingen ace; deuce −3 til 5-spilleren.
- **Tre like høyest** (`[3,5,5,5]`): ace +3 til 3-spilleren; ingen deuce.
- **Netto-likhet:** to ulike brutto kan gi lik netto → delt → ingen utdeling den siden.
- **Negativ total:** lovlig og forventet; vises med fortegn, `tabular-nums`.
- **Eksakt 4 håndheves ved publish**, ikke draft. `< 4` og `> 4` avvises med egne koder.
- **`games.status === 'finished'`:** ingen spesial-låsing nødvendig (slag-baserte; slag-flyten har egen lås). Leaderboard ruter til Podium.
- **`score_visibility === 'reveal'`:** totaler/per-hull skjules til `finished` (samme mønster som SkinsView).
- **Spiller forsvinner mid-runde:** ikke støttet (som øvrige modes).

## Key Decisions

- **Brutto/netto-bryter** (`acey_deucey_scoring: 'gross' | 'net'`, default netto) — brukerens valg; speiler Skins/Wolf/Nassau. Netto hindrer at høy-handikapperen alltid blir «deuce».
- **Leaderboard: totaler + per-hull-tabell** — brukerens valg; å se hvem som tok/ga hvert hull er hele poenget. Speiler SkinsView to-seksjons-struktur.
- **Rent slag-derivert — ingen ny tabell/UI/server-action** — matcher issue (LOW, standard strokeplay-input); minimal blast-radius.
- **Uavhengig tie-tolkning** — delt lavest voider ace, delt høyest voider deuce, hver for seg (issue-ordlyd + standard Acey Deucey-regel).
- **Uavhengig hull-prosessering** (ikke frys ved uferdig hull) — Acey Deucey har ingen carryover; Modified Stableford-modellen, ikke Skins-frys.
- **Eksakt 4 spillere** — per issue; håndheves i validator ved publish.
- **Sekundær under kompis-intent** (`is_primary: false`, kun `kompis`) — per issue.
- **Engelske «Ace»/«Deuce»-etiketter beholdt** — bevisste sportstermer (som Bingo/Bango/Bongo).

**Claude's Discretion:**
- Ikon `icon_key: 'acey_deucey'` i `lib/formats/icons.tsx` — legg til en passende SVG hvis tid; ellers faller den tilbake til generisk flagg (som skins/nassau/wolf gjør i dag). Ikke build-breaking.
- Sekundær tiebreak utover «total desc → flest aces» — hold minimal; full 5-tier-cascade gjelder ikke (ikke slag-rangering).
- Test-organisering: én `aceyDeucey.test.ts` eller split — velg lesbart.
- Eksakt kolonneform/labels i View — start fra SkinsView, juster for ±-fortegn og per-hull ace/deuce-navn.
- Om Podium får egen minimal smoke-test eller dekkes implisitt — én Type C på View er påkrevd (test-disiplin: maks én render-test per komponent).

## Success Criteria

- [ ] **Migrasjon `0054_acey_deucey.sql`** seeder format-row + intent-mapping. Verifiser: `select count(*) from formats where slug='acey_deucey'` = 1, `select count(*) from format_intent_mapping where format_slug='acey_deucey' and intent='kompis'` = 1.
- [ ] **`lib/scoring/modes/aceyDeucey.ts`** eksporterer `compute(ctx): AceyDeuceyResult`; respekterer `acey_deucey_scoring` (brutto/netto).
- [ ] **`lib/scoring/modes/aceyDeucey.test.ts`** — Type A `it.each`: unik ace+deuce (+3/0/0/−3), delt lavest (ingen ace), delt høyest (ingen deuce), begge delt, alle like, tre like lavest/høyest, uferdig hull (ingen utdeling), netto vs brutto flipper ace/deuce, negativ total, ranking + tiebreak (flest aces). Alle grønne.
- [ ] **`lib/scoring/index.ts`** har `acey_deucey`-case + type-re-eksport.
- [ ] **`lib/scoring/modes/types.ts`** har AceyDeucey-typene + utvidet `GameMode`/`GameModeConfig`/`ModeResult`/`MODE_LABELS`.
- [ ] **`lib/games/gamePayload.ts`** har `validateAceyDeucey` (eksakt 4, brutto/netto) wired i `parseGameMode` + `modeValidators`; Type A i `gamePayload.test.ts` for player-count-grensene (3 avvist, 4 ok, 5 avvist).
- [ ] **`lib/formats/modeGuide.ts`** har `acey_deucey`-entry i `MODE_GUIDE`.
- [ ] **Wizard** rendrer brutto/netto-bryteren for acey_deucey (speiler Skins).
- [ ] **`AceyDeuceyView.tsx`** viser per-spiller totaler (med fortegn) + per-hull ace/deuce-tabell fra fixture (Type C render-test); **`AceyDeuceyPodium.tsx`** viser 1/2/3.
- [ ] **`renderAceyDeucey`** i leaderboard-`page.tsx` ruter acey_deucey-games korrekt (aktiv→View, finished→Podium).
- [ ] Norsk copy gjennomgått med `humanizer:humanizer`-skill.
- [ ] **CHANGELOG-oppføring + minor-bump 1.49.0 → 1.50.0** (verifiser nåværende ved bygging).

## Gates

Etter hver chunk (scoped til det som endret seg):
- [ ] `npx tsc --noEmit` — 0 nye errors
- [ ] `npx vitest run lib/scoring/modes/aceyDeucey` — Type A grønn
- [ ] `npx vitest run lib/games/gamePayload` — validator-tester grønne
- [ ] `npx vitest run` — full suite grønn (regresjonsbeskyttelse)
- [ ] `npm run lint` — 0 errors
- [ ] `npm run build` — grønn (fanger exhaustive-switch/Record-gaps: `MODE_LABELS`, `MODE_GUIDE`, `modeValidators`, `ModeResult`-narrowing, index-switch — jf. minne om tsc-gate-fellen)
- [ ] Manuell iPhone-Safari-sjekk av leaderboard-View hvis frontend rørt (Playwright valgfritt)

## Files Likely Touched

**Nye:**
- `supabase/migrations/0054_acey_deucey.sql`
- `lib/scoring/modes/aceyDeucey.ts` + `aceyDeucey.test.ts`
- `app/games/[id]/leaderboard/AceyDeuceyView.tsx` + `AceyDeuceyView.test.tsx`
- `app/games/[id]/leaderboard/AceyDeuceyPodium.tsx`

**Endrede:**
- `lib/scoring/modes/types.ts` — AceyDeucey-typer + union-utvidelser + `MODE_LABELS`
- `lib/scoring/index.ts` — case + re-eksport
- `lib/games/gamePayload.ts` (+ `.test.ts`) — `validateAceyDeucey` + `parseGameMode` + `modeValidators` + `parseAceyDeuceyScoring`
- `lib/formats/modeGuide.ts` — `acey_deucey`-entry
- `app/games/[id]/leaderboard/page.tsx` — `renderAceyDeucey` + routing-gren
- Wizard-fil(er) som rendrer Skins brutto/netto-bryter — speil for acey_deucey (finn via `grep skins_scoring`)
- `lib/formats/icons.tsx` — `acey_deucey`-ikon (valgfritt; faller tilbake til generisk)
- `lib/games/registration.ts` — verifiser `gameModeSupportsTeams` returnerer false for acey_deucey
- `CHANGELOG.md` + `package.json` — minor-bump 1.50.0

## Out of Scope

- **Slag-/netto-leaderboard ved siden av poeng** — poengene ER slag-derivert; egen slag-standing er redundant. Defer hvis ønsket.
- **Variabel innsats / penger-modus** (klassisk Acey Deucey er ofte penge-spill) — kun poeng i v1.
- **Annet spillerantall enn 4** — eksakt 4 per issue.
- **Honnør-/rekkefølge-håndheving** — ikke relevant (rent slag-basert).
- **Achievements/sesong-statistikk** (f.eks. «flest aces») utover kategori-tellerne i leaderboard.
- **Mid-round player-swap, 9-hulls-variant, push** — som øvrige modes, defer.
