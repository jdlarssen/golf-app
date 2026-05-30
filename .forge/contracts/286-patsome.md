# Forge-kontrakt: Patsome — 6 hull 4BBB → 6 greensome → 6 foursomes

**Issue:** [#286](https://github.com/jdlarssen/golf-app/issues/286) · del av format-epic [#270](https://github.com/jdlarssen/golf-app/issues/270) · avhenger av F1 [#271](https://github.com/jdlarssen/golf-app/issues/271) (ferdig)
**Branch:** `issue-286-patsome`
**Kompleksitet:** MEDIUM-HIGH
**Dato:** 2026-05-30
**Type:** MINOR (ny bruker-synlig spillform)

## Sammendrag

Nytt **klubb-format**: **Patsome** — et rotasjons-format der 18 hull deles i tre 6-hulls-segmenter, hvert med sin egen lagspill-form:

- **Hull 1–6: 4BBB** — begge på laget spiller egen ball, beste stableford-resultat per hull teller.
- **Hull 7–12: Greensome** — begge slår ut, laget velger beste drive, deretter alternate shot. Én ball.
- **Hull 13–18: Foursomes** — ekte alternate shot fra tee. Én ball.

Lagets resultat = **summen av stableford-poeng på tvers av alle tre segmentene**. Høyest sammenlagt vinner. Et felt av lag à 2 rangeres på leaderboard.

### Arkitektur-kjerne: felles valuta + selvstendig orchestrator

Den arkitektoniske nøkkelen er at de tre segmentene har **ulikt antall baller** (2 baller i 4BBB, 1 ball i greensome/foursomes), så de kan ikke summeres i slag direkte. **Stableford-poeng per lag per hull** er den felles valutaen — den håndterer både to-ball- og én-ball-segmentene, og «pickup»/uspilte hull faller naturlig til 0 poeng.

`patsome.compute()` er en **selvstendig orchestrator** som regner stableford-poeng per hull direkte og bytter lag-poeng-regel etter hull-segment. Den **avhenger ikke** av separate `greensome_strokeplay`- eller `foursomes`-scoring-moduler (se «Avvik fra issue»). Den gjenbruker den eksisterende `computeStablefordPoints({par, netStrokes})`-helperen ([lib/scoring/modes/stableford.ts:61](lib/scoring/modes/stableford.ts:61)) og `strokesForHole`-allokeringen for alle tre segmentene.

## Avvik fra issue

Issuet foreslår «Avhengigheter på `4bbb_stableford`, `greensome_strokeplay`, og `foursomes`-modulene (kan kreve nye sub-moduler)» og «Anbefalt: vent på Foursomes matchplay og Greensome matchplay-issues».

**Vi bygger IKKE på separate sub-moduler.** Begrunnelse:

1. **Foursomes finnes kun som _matchplay_** ([lib/scoring/modes/foursomesMatchplay.ts](lib/scoring/modes/foursomesMatchplay.ts)) — den produserer match-status (3&2/AS/2up), ikke aggregerbare poeng. Patsome er aggregat-strokeplay, ikke matchplay, så modulen passer ikke.
2. **Greensome strokeplay finnes ikke** ([#289](https://github.com/jdlarssen/golf-app/issues/289) er greensome _matchplay_, ikke bygget). Å bygge en frittstående greensome-strokeplay-modul kun for å konsumere den her ville være over-engineering.
3. **Stableford-poeng-helperen dekker alle tre segmentene** med en MAX-regel (4BBB) eller en single-ball-regel (greensome/foursomes). En 80-liners orchestrator er enklere, mer testbar og mer ærlig enn tre sub-moduler + en koblings-modul.

Konsekvens: ingen nye filer i `lib/scoring/modes/` utover `patsome.ts` + test. Issuet sin «orchestrator over 3 sub-formats»-intensjon er bevart; implementasjonen er bare flatere.

## Låste beslutninger (fra gray-area-diskusjon)

| # | Beslutning | Valg | Begrunnelse |
|---|-----------|------|-------------|
| 1 | Felles valuta | **Stableford-poeng per lag per hull**, summert over 18 hull | Eneste valutaen som forener 2-ball- (4BBB) og 1-ball-segmentene (greensome/foursomes) + pickups. Matcher at Tørnys 4BBB allerede ER stableford ([#282](https://github.com/jdlarssen/golf-app/issues/282)). |
| 2 | Handicap-modell | **Brutto/netto-bryter, default netto** (`patsome_scoring: 'gross' \| 'net'`) | Bruker valgte dette. Speiler Wolf/Nassau/Skins/Nines-mønstret. Netto = riktige WHS-allowances per segment (se under). Brutto = rå gross-stableford. |
| 3 | Netto-allowances | 4BBB: **full CH per spiller**; Greensome: **60 % lav + 40 % høy** CH; Foursomes: **50 % av lagets sum** CH | 4BBB matcher Tørnys eksisterende stableford-team (full CH). Greensome/foursomes følger WHS-standard for de respektive 1-ball-formene. |
| 4 | Leaderboard | **Delsum per segment + total** + per-hull-rutenett + podium | Bruker valgte dette. «4BBB 14 · Greensome 11 · Foursomes 9 · Totalt 34» — de tre segmentene er formatets sjel. |
| 5 | Lag-struktur | **Lag à 2, 2+ lag (felt)**, ingen fast øvre grense | Bruker valgte dette. Issuet sier «minimum 4 spillere». `teams_count: number` (som Texas), `team_size: 2` eksakt. |
| 6 | Tee-starter | **Kun foursomes-segmentet (13–18)**: per-lag én-gangs-velger på hull 13 + «X slår ut»-hint. Greensome (7–12): kun forklarings-banner. | Bruker valgte dette. Greensome har ingen enkelt tee-starter (begge slår ut hvert hull). Foursomes har ekte alternate shot fra tee → appen kan vite hvem som teer. |
| 7 | Placement | **Klubb-intent, sekundær** (`is_primary: false`), **ikke** cup-eligible | Issue: «Klubb-turnering (sekundær)». 18-hulls aggregat, ikke en Ryder Cup-matchplay-match → ikke cup-eligible. |
| 8 | Flis-navn | **«Patsome»** | Ekte golf-navn, som Wolf/Nassau/Skins. Issuet bruker navnet direkte. |
| 9 | Score-inntasting | **Hybrid per segment**: hull 1–6 per-spiller (begge taster egen ball), hull 7–18 lag-ball (kaptein-eid rad, som foursomes/Texas) | Intrinsisk til formatet. Utvider eksisterende `if (isTexas \|\| isFoursomes)`-collapse med en hull-nummer-betingelse. |

## Arkitektur

### `mode_config`-shape (ny variant i `GameModeConfig`)

```typescript
| {
    kind: 'patsome';
    team_size: 2;
    /** Antall lag (2+). Som texas_scramble. */
    teams_count: number;
    /**
     * 'net' = WHS-allowance per segment (4BBB full CH, greensome 60/40,
     * foursomes 50 % av sum). 'gross' = rå gross-stableford (ingen strokes).
     * Default 'net'. Speiler Wolf/Nassau/Skins/Nines-mønstret.
     */
    patsome_scoring: 'gross' | 'net';
  }
```

Defensiv fallback i `compute()` (som skins/nines): manglende/feil felt → `patsome_scoring: 'net'`.

### Segment-grenser (hardkodet)

```
holeNumber <= 6  → 'fourball'   (4BBB)
holeNumber <= 12 → 'greensome'
else             → 'foursomes'
```

Patsome forutsetter en **18-hulls bane**. På baner med færre hull degraderer det grasiøst (manglende hull = 0 poeng), men formatet er designet for 18. Dokumenteres i JSDoc.

### Scoring-algoritme (`lib/scoring/modes/patsome.ts`)

Grupper spillere på `teamNumber` (filtrer ut `null` defensivt). Per lag:

1. **Velg kaptein** = `pickTeamCaptain(memberUserIds)` (lex-min userId, [lib/games/teamCaptain.ts:14](lib/games/teamCaptain.ts:14)). Kapteinen eier lag-ball-radene for hull 7–18.
2. **Per hull**, bestem `segment` fra hull-nummer, og regn `teamPoints`:
   - **4BBB (1–6):** for hver av de 2 spillerne: `net = scoring==='net' ? gross − strokesForHole(player.courseHandicap, SI) : gross`; `points = computeStablefordPoints({par: parFor(hole, player.teeGender), netStrokes: net})`. `teamPoints = MAX(partnernes points)` (better-ball-stableford). `contributorIds` = spillere med MAX-poeng som faktisk spilte (samme regel som stableford-team).
   - **Greensome (7–12):** lag-ball-gross = kaptein-eid rad. `teamHandicap = scoring==='net' ? round(0.6×minCH + 0.4×maxCH) : 0`. `net = gross − strokesForHole(teamHandicap, SI)`. `teamPoints = computeStablefordPoints({par, netStrokes: net})`.
   - **Foursomes (13–18):** lag-ball-gross = kaptein-eid rad. `teamHandicap = scoring==='net' ? round(0.5×(chA+chB)) : 0`. `net = gross − strokesForHole(teamHandicap, SI)`. `teamPoints = computeStablefordPoints(...)`.
3. **Segment-delsummer:** sum av `teamPoints` per segment (`fourball`/`greensome`/`foursomes`), pluss `holesPlayed` per segment.
4. **Total:** sum av alle 18 hull-poeng.

**Par per hull:** for 1-ball-segmentene brukes kapteinens `teeGender` som lag-representant (samme forenkling som Texas/foursomes, [#240](https://github.com/jdlarssen/golf-app/issues/240)). For 4BBB bruker hver spiller-celle sin egen `parFor(hole, p.teeGender)`.

**Rounding:** `Math.round` på allowance-handicapene (WHS runder til nærmeste heltall; .5 → opp). Dokumenteres.

**Ranking:** høyest `totalPoints` vinner. Gjenbruk `rankTeams` med negerte per-hull-poeng-arrays (samme mønster som stableford-team, [lib/scoring/modes/stableford.ts:317](lib/scoring/modes/stableford.ts:317)) — gir 5-tier tie-break-cascade (total → back-9 → back-6 → back-3 → hull-18) gratis. `tiedWith` = lag med eksakt samme cascade.

**Robusthet for n≠2-per-lag (draft-state):** lag med 0/1/3 medlemmer → `compute()` krasjer ikke (MAX over tom array → 0, manglende kaptein-rad → null gross → 0 poeng). Validatoren håndhever 2-per-lag ved publish.

### Resultat-typer (i `types.ts`)

```typescript
export type PatsomeSegment = 'fourball' | 'greensome' | 'foursomes';

export interface PatsomePlayerCell {
  userId: string;
  gross: number | null;
  /** net = gross − extra (eller = gross i brutto). null hvis ikke spilt. */
  netStrokes: number | null;
  points: number;
  /** Kun meningsfull i 4BBB (MAX-bidragsyter). false i 1-ball-segmentene. */
  isContributor: boolean;
}

export interface PatsomeHoleRow {
  holeNumber: number;
  par: number;
  strokeIndex: number;
  segment: PatsomeSegment;
  /** 4BBB: begge spiller-celler. greensome/foursomes: tom (bruk teamGross). */
  players: PatsomePlayerCell[];
  /** 4BBB: userIds med MAX-poeng. greensome/foursomes: tom. */
  contributorIds: string[];
  /** greensome/foursomes: lag-ball-gross. 4BBB: null. */
  teamGross: number | null;
  /** Lag-strokes på hullet for 1-ball-segmentene (0 i brutto / i 4BBB). */
  teamExtraStrokes: number;
  /** greensome/foursomes: lag-ball-netto. 4BBB: null. */
  teamNetStrokes: number | null;
  /** Lag-hull-poeng (valutaen). 4BBB: MAX. 1-ball: lag-ballens poeng. */
  teamPoints: number;
}

export interface PatsomeSegmentSubtotal {
  segment: PatsomeSegment;
  points: number;
  holesPlayed: number;
}

export interface PatsomeTeamLine {
  teamNumber: number;
  playerIds: string[];
  captainUserId: string;
  holes: PatsomeHoleRow[];
  segments: {
    fourball: PatsomeSegmentSubtotal;
    greensome: PatsomeSegmentSubtotal;
    foursomes: PatsomeSegmentSubtotal;
  };
  totalPoints: number;
  rank: number;
  tiedWith: number[];
}

export interface PatsomeResult {
  kind: 'patsome';
  scoring: 'gross' | 'net';
  teams: PatsomeTeamLine[];
}
```

Legges til i `ModeResult`-unionen.

### Tee-starter-lagring (foursomes-segmentet)

Ny tabell (Patsome støtter N lag → de to hardkodede `foursomes_sideN_*`-kolonnene fra [#218](https://github.com/jdlarssen/golf-app/issues/218) holder ikke):

```sql
create table public.patsome_tee_starters (
  game_id             uuid     not null references public.games(id) on delete cascade,
  team_number         smallint not null,
  tee_starter_user_id uuid     not null references public.users(id) on delete cascade,
  updated_at          timestamptz not null default now(),
  primary key (game_id, team_number)
);
```

- **RLS:** lese = enhver deltaker i spillet (`game_players` der `user_id = auth.uid()`) eller admin. Skrive = medlem av det aktuelle laget (`game_players` der `game_id`, `team_number`, `user_id = auth.uid()`) eller admin.
- **Server-action** `setPatsomeTeeStarter(gameId, teamNumber, userId)`: authz-sjekk (bruker er medlem av laget) → `upsert` → `revalidateTag('game-${gameId}', 'max')`. Ikke via Dexie/sync (det er en innstilling, ikke en score).
- **Hint-logikk (hull 13–18):** oddetallshull (`holeNumber % 2 === 1` → 13/15/17) = tee-starter; partall (14/16/18) = makkeren. Samme paritets-konvensjon som foursomes matchplay.
- **Rent UI-hint:** påvirker IKKE scoring-laget. `patsome.compute()` leser aldri denne tabellen.

## Filendringer (eksakt wiring)

### Scoring-laget
- **`lib/scoring/modes/types.ts`** — `patsome` i `GameMode`-union; `patsome: 'Patsome'` i `MODE_LABELS`; ny `patsome`-variant i `GameModeConfig`; `PatsomeSegment`/`PatsomePlayerCell`/`PatsomeHoleRow`/`PatsomeSegmentSubtotal`/`PatsomeTeamLine`/`PatsomeResult`-interfaces; `PatsomeResult` i `ModeResult`-union.
- **`lib/scoring/modes/patsome.ts`** — ny modul: `compute(ctx): PatsomeResult`.
- **`lib/scoring/index.ts`** — `import * as patsome`; `case 'patsome': return patsome.compute(ctx);` i switchen; re-eksporter Patsome-typene i type-blokken.

### Game-payload
- **`lib/games/gamePayload.ts`** — `|| raw === 'patsome'` i `parseGameMode`; `parsePatsomeScoring()` (speiler `parseSkinsScoring`); `validatePatsome()` (lag à 2, 2+ lag, `flight_number === team_number`-konsistens, duplikat-sjekk; bygger `mode_config`); `patsome: validatePatsome` i `modeValidators`.
- **`lib/games/allowanceCopy.ts`** — `case 'patsome':` i `bruttoHelperFor`.
- **`lib/formats/modeGuide.ts`** — `patsome`-oppføring i `MODE_GUIDE` (`{ summary, points }`): forklar de tre segmentene + poeng-summering.

### Migrasjon
- **`supabase/migrations/0061_patsome.sql`** — (a) `insert into public.formats` (slug `'patsome'`, display `'Patsome'`, icon_key `'patsome'`, short_description, scoring_module `'@/lib/scoring/modes/patsome'`, `is_active true`, `is_cup_eligible false`); (b) `insert into public.format_intent_mapping` (`'patsome'`, `'klubb'`, visible, **ikke** primary, sort_order ~neste ledige i klubb); (c) `create table public.patsome_tee_starters` + RLS-policies + `updated_at`-trigger (speil eksisterende tabell-mønster).
- **`lib/database.types.ts`** — regenerert (ny tabell + format-row).

### Wizard
- **`app/admin/games/new/sections/PatsomeSetup.tsx`** — ny komponent (speiler `SkinsSetup`): netto/brutto-radio (default netto) + kort forklaring av de tre segmentene. Skjult input `patsome_scoring`.
- **`app/admin/games/new/GameWizard.tsx`** — `state.patsomeScoring` + setter; betinget render av `<PatsomeSetup>`; lag-tilordning (2-per-lag, N lag — gjenbruk `TeamsAssignmentSection`-mønstret fra best_ball/texas).
- **`app/admin/games/new/TeamSizeSelector.tsx`** — `patsome: new Set<TeamSize>([2])` i `ENABLED_COMBOS`.
- **`app/admin/games/new/sections/ReadyStep.tsx`** — `patsome`-oppføring i `MODE_SUMMARY_LABELS`.
- **Ikon-map for ModeSelector/format-flis** — registrer `'patsome'`-ikon (speil hvordan `nines` ble lagt til).
- Spillerantall-hint: «lag à 2, minst 2 lag». Validatoren er den harde gaten.

### Scorekort — hybrid inntasting + bannere
- **`app/games/[id]/holes/[holeNumber]/page.tsx`** — `const isPatsome = game.game_mode === 'patsome'`; utvid collapse-betingelsen: `if (isTexas || isFoursomes || (isPatsome && currentHole >= 7))` → hull 1–6 = per-spiller-kort, hull 7–18 = lag-ball (kaptein-collapse). Hent lagets tee-starter (for foursomes-segmentet).
- **`app/games/[id]/holes/[holeNumber]/HoleClient.tsx`** (eller `components/hole/HoleClient.tsx`) — `isPatsome`-flagg; segment-banner per hull (4BBB / greensome / foursomes med hull-range + kort regel); submit-label («Lever din» 1–6 vs «Lever lagets» 7–18).
- **`app/games/[id]/holes/[holeNumber]/PatsomeTeeStarter*.tsx`** — ny komponent (adapter foursomes' tee-starter-banner/hint): på hull 13–18, vis per-lag velger hvis ikke satt, ellers «X slår ut»-hint. Bruker `setPatsomeTeeStarter`-action.
- **`app/games/[id]/holes/[holeNumber]/patsomeActions.ts`** — ny server-action `setPatsomeTeeStarter`.
- **`lib/games/scorecardLayout.ts`** — `patsome`-gren i `resolveScorecardLayout()` så `/scorecard`-oversikten ikke krasjer; rendrer lagets per-hull-poeng (segment-aware, ensartet poeng-rendering uavhengig av ball-antall — unngår blandet gross-grid).
- **`app/games/[id]/scorecard/page.tsx`** — Patsome-gren: rendrer viewerens eget lags per-hull-poeng + segment-delsummer (slim PatsomeView scoped til ett lag).

### Leaderboard
- **`app/games/[id]/leaderboard/PatsomeView.tsx`** — ny: rangering + sammenlagt-poeng per lag + **segment-delsummer** + per-hull-rutenett (hull × lag, segment-skiller, `tabular-nums`), tied-rank-label, reveal-aware (skjul totaler når `scoreVisibility === 'reveal' && gameStatus !== 'finished'`).
- **`app/games/[id]/leaderboard/PatsomePodium.tsx`** — topp-3-podium + flat liste for resten, `totalPoints` som metrikk. Speiler `NinesPodium`/`BingoBangoBongoPodium`.
- **`app/games/[id]/leaderboard/page.tsx`** — `if (game.game_mode === 'patsome') return renderPatsome({...})`; `renderPatsome`-funksjon (bygger `ScoringContext`, kaller `computeLeaderboard`, `result.kind !== 'patsome'` → `notFound()`, returnerer View/Podium); imports.

### Type-speil (build-breaker per CLAUDE.md)
- **`app/games/[id]/page.tsx`** — `GameRow`-mirror-union må inkludere `'patsome'` (fanges av `npm run build`, ikke av scoped tsc — samme felle som nines K1).
- Søk etter alle øvrige `game_mode`-mirror-unions / eksisterende uttømmende `Record<GameMode, …>` ved build og oppdater (autoritativt: `npm run build`).

## Suksesskriterier

- [x] **K1 — Typer + uttømmende maps:** ✅ `npm run build` exit 0 (verifisert etter leaderboard-chunk). `patsome` i `GameMode`/`MODE_LABELS`/`GameModeConfig`/`ModeResult` (`2066062`), `computeLeaderboard`-switch (`2066062`), `modeValidators`+`bruttoHelperFor`+`MODE_GUIDE` (`2e9c0ea`), `TeamSizeSelector`/`ReadyStep`/`icons`/`registration` (`26dabf9`), `GameRow`-union + `scorecardTitle` isTeamMode (`79c9726`), `GameForHole`/scorecardLayout (`ad27abf`).
- [x] **K2 — Scoring-modul:** ✅ `lib/scoring/modes/patsome.ts` `compute()` — segment-bytte (1–6/7–12/13–18), 4BBB MAX, greensome `round(0.6·min+0.4·max)`, foursomes `round(0.5·sum)`, netto/brutto, segment-delsummer, total, ranking via `rankTeams` (negert). `2066062`.
- [x] **K3 — Type A unit-tester:** ✅ `patsome.test.ts` 36 tester grønne — shape, 4BBB MAX + contributor, greensome 60/40, foursomes 50 %, segment-overganger, netto/brutto-flip, delsummer+total, pending-hull, fler-lags-ranking+`tiedWith`, draft-state (n≠2 ingen krasj), kaptein lex-min. `2066062`.
- [x] **K4 — Validator + regresjon:** ✅ `validatePatsome` (<4 → `min_players_for_mode`, ujevne lag → `team_balance`, `bad_team`, `duplicate_player`) + `parseGameMode` + `modeValidators`. 14 nye cases i `gamePayload.test.ts` (166 grønne totalt). `2e9c0ea`.
- [x] **K5 — Migrasjon + tee-starter-tabell:** ✅ `0061_patsome.sql` seeder «Patsome» (Klubb, sekundær, sort 90) + oppretter `patsome_tee_starters` m/ RLS + trigger. `lib/database.types.ts` håndskrevet (regenereres ved DB-apply). `60dbf42` (renummerert fra `0055` til `0061` etter parallell-merge av round_robin). ⚠️ Migrasjon IKKE kjørt mot prod ennå (format-rad er `is_active` → application må koordineres med deploy).
- [x] **K6 — Hybrid scorekort-inntasting:** ✅ Collapse-betingelse `(isTexas || isFoursomes || (isPatsome && holeNumber >= 7))` ([page.tsx:431](app/games/[id]/holes/[holeNumber]/page.tsx)); hull 1–6 per-spiller, 7–18 kaptein-collapse m/ segment-handicap; `PatsomeSegmentBanner` per hull. `ad27abf`. Live preview-røyktest utsatt til migrasjon kjørt (single-DB-constraint), dekket av build + full suite.
- [x] **K7 — Tee-starter (foursomes-segment):** ✅ Per-lag velger på hull 13–18 til satt, deretter «X slår ut»-hint (oddetall=valgt/partall=makker); greensome kun banner. `setPatsomeTeeStarter` (authz: lag-medlemskap + game_mode + ikke finished) → upsert i `patsome_tee_starters`. `patsomeActions.test.ts` grønn. `ad27abf`.
- [x] **K8 — Leaderboard + podium:** ✅ `PatsomeView` (lag-rangering + segment-delsummer som signatur + per-hull-rutenett m/ skiller hull 7/13 + reveal-aware) + `PatsomePodium` (lag-podium) via `renderPatsome`. `PatsomeView.test.tsx` 11/11 (speiler `TeamStablefordView.test.tsx`). `79c9726`.
- [x] **K9 — CHANGELOG + versjon:** ✅ 1.50.0 → 1.51.0 (MINOR), package.json + package-lock.json + CHANGELOG.md (1.51.y-serie åpen, 1.50.y wrappet i `<details>`). commit-msg-hook passerte (`feat(formats)`). `64674ea`.

## Gates (kjøres scoped til det som endret seg)

```bash
# Type A + regresjon (raskest, kjør tidlig og ofte)
npx vitest run lib/scoring/modes/patsome.test.ts lib/games/gamePayload.test.ts

# Type C render-test
npx vitest run "app/games/[id]/leaderboard/PatsomeView.test.tsx"

# Uttømmende completeness + typer (AUTORITATIV — fanger manglende switch/Record-medlem)
npm run build
```

- **humanizer-skill** på all ny norsk copy (PatsomeSetup, segment-bannere, PatsomeView, modeGuide, CHANGELOG-tagline, allowanceCopy) FØR commit, per CLAUDE.md.
- **Worktree-hook-fix** (gjort): `git config --worktree core.hooksPath .githooks`.
- **Migrasjon mot DB:** brukeren/Supabase MCP kjører `0061_patsome.sql` før live preview-verifisering av wizard/scorekort (single-prosjekt-DB). Render-test + build dekker i mellomtiden.

## Edge Cases & Guardrails

- **Uspilt/pending hull:** `gross === null` → 0 poeng på hullet, teller ikke i `holesPlayed`. Ingen carryover (uavhengig per hull).
- **Lag mangler kaptein-rad på et 1-ball-hull (7–18):** `teamGross = null` → 0 poeng. Normalt under aktivt spill.
- **n≠2 per lag (draft):** MAX over tom array → 0; ingen krasj. Validator stopper publish.
- **9-hulls bane:** segmentene degraderer (manglende hull = 0 poeng). Formatet er for 18 hull — dokumenteres, ikke hard-blokkeres i v1.
- **Lik combined CH i greensome/foursomes:** allowance regnes uansett (min/max kan være like). Ingen spesial-case.
- **Brutto (`patsome_scoring='gross'`):** ingen strokes i noe segment; `teamExtraStrokes = 0`, `net = gross`.
- **Blandet-kjønn-lag:** kapteinens `teeGender` representerer laget for 1-ball-par-display (Texas/foursomes-forenkling, #240). 4BBB bruker per-spiller-par.
- **Tee-starter satt av feil lags medlem:** server-action returnerer 403 hvis `userId ∉ game_players(team_number)`.
- **Tee-starter for foursomes velges aldri:** hint vises ikke (kun banner); scoring upåvirket.
- **Eksisterende modi:** ingen regresjon — `patsome`-grenene er additive. `npm run build` + eksisterende tester verifiserer.

## Claude's Discretion

- Eksakt copy på segment-bannere, PatsomeSetup-forklaring, modeGuide, allowance-helpere (humanizer-pass).
- Eksakt kolonne-/rutenett-layout i `PatsomeView` og `/scorecard`-Patsome-grenen (segment-skiller-stil). Mål: ensartet poeng-rendering, ikke blandet gross-grid.
- Om tee-starter-velgeren vises som banner på hull 13 eller persisterer til alle foursomes-hull til satt (foreslår: vises til satt, deretter hint).
- `data-testid`-konvensjon for evt. E2E.
- CHANGELOG-tagline (skrives sist, humanizer-pass).
- Mode-router-case-rekkefølge (følg shipped-rekkefølge, etter `nines`).

## Ikke i scope

- **Egne `greensome_strokeplay`-/`foursomes`-strokeplay-scoring-moduler** — se «Avvik fra issue». Orchestrator regner poeng direkte.
- **Cup-eligibility / Ryder Cup-integrasjon** — Patsome er aggregat-strokeplay, ikke en matchplay-match.
- **Validering av faktisk alternate-shot-/drive-valg** — appen lagrer kun lag-scoren, stoler på spillerne (som foursomes matchplay).
- **Greensome tee-starter-hint** — begge slår ut; ingen enkelt starter. Kun banner.
- **Konfigurerbare segment-grenser/-rekkefølge** — fast 6/6/6 per issuet.
- **Per-segment ulik netto/brutto** — én bryter for hele runden.
- **Rikere tie-break utover 5-tier-cascaden** (allerede gratis via `rankTeams`).
- **Greensome (#289) / Chapman (#290) / Gruesome (#291) som egne formater** — separate issues.

## Test-disiplin-notater (per `docs/test-discipline.md`)

- **Type A** (`patsome.ts`): assertion-rik TDD, `it.each` for segment×scoring-kombinasjonene og allowance-utregningene. Ren funksjon — mock kun ved system-grenser (ingen her).
- **Type C** (`PatsomeView`): maks ÉN render-test. Ikke re-assert poeng fra Type A — verifiser kun struktur (rader, segment-delsummer, tied-label, reveal-skjul). Podium/Setup: lett valgfri render-test hver, ikke duplisert Type-A-assertering.
- Ingen «mens jeg var her»-tester. Delte fixtures/helpers i `patsome.test.ts`, ingen kopier-lim av mock-oppsett.
- Tee-starter-action: én test for authz-avvisning (ikke-medlem → feil).
