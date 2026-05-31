# Spec: Gruesome matchplay — motstander velger din tee shot

Issue: [#291](https://github.com/jdlarssen/golf-app/issues/291)
Epic: [#270](https://github.com/jdlarssen/golf-app/issues/270) (format-katalog + intent-wizard)
Avhengighet: F1 [#271](https://github.com/jdlarssen/golf-app/issues/271) (formats-katalog) — **levert** (migrasjon 0047, CLOSED).

---

## ⚠️ REVISJON v2 — rebaset på v1.58.0 (2026-05-31)

Mens v1-kontrakten ble skrevet shippet bruker **Greensome (#289)**, **Chapman (#290)**, Patsome (#286) og Florida Scramble (#283) til main. Branchen er reset til `origin/main` (1.58.0) og gruesome bygges på den nye arkitekturen. Konkrete endringer fra v1:

- **Scoring-motor finnes allerede.** `foursomesMatchplay.ts` eksporterer nå `computeFoursomesCore(ctx, allowancePct, sideHcp: SideHandicapFn)` + strategiene `combinedSideHandicap` (sum, brukt av foursomes) og `chapmanSideHandicap` (60/40, brukt av chapman+greensome). **Gruesome bruker samme WHS-diff-handicap som foursomes** (motstander velger verste ball endrer ikke handicapet) → delegat: `computeFoursomesCore(ctx, pct, combinedSideHandicap)`, default allowance **50** (som foursomes). Dropp v1s egen `computeFoursomesMatch`-ekstraksjon — den er superseded.
- **Family-helper finnes allerede.** `isAlternateShotMatchplay(mode)` (`types.ts:102`) = `foursomes | greensome | chapman`. **Utvid den** med `gruesome_matchplay`. Dropp v1s `isFoursomesFamily`.
- **Tee-starter-banner:** greensome/chapman viser INGEN (begge teer ut). Gruesome også → ingen banner, ingen tee-starter-kolonner. (Kun foursomes har dem.)

### «Hva mangler» for standalone-spill (diagnostisert)

Bruker har gjort foursomes-familien valgbar standalone (kompis/klubb-intents via admin formats-manager). Diagnose av create→play→view-løypa:

| Stadium | Standalone-status |
| --- | --- |
| **Create-wizard** (2v2 side-tildeling via `TeamsAssignmentSection` + `AllowanceField`) | ✅ Funker allerede — leser form-felt, ingen cup-avhengighet. Validator (`validateFoursomesMatchplay`) leser `foursomes_allowance_pct` fra form, default 50. |
| **Scorekort** (Layout B via `isAlternateShotMatchplay`, leser `mode_config.allowance_pct`) | ✅ Funker allerede standalone. |
| **Individuell-spill-leaderboard** | ❌ **DEN ENESTE GAPEN** — `app/games/[id]/leaderboard/page.tsx` har ingen foursomes-familie-dispatch-gren; faller gjennom til best-ball-aggregatoren (meningsløst for matchplay — viser «Lag 1: −5» i stedet for «Lag 1 vinner 3&2», ingen per-hull win/loss-grid). Gjelder HELE familien (foursomes/greensome/chapman), ikke bare gruesome. |

### Ny scope-beslutning (bruker bekreftet)

**Standalone + cup for hele familien, gjort rett.** Siden leaderboard-gapet er delt infra, fikser én løsning alle fire formatene: bygg `FoursomesMatchplayView` (adaptér `FourballMatchplayView` til foursomes-result-shape: `side1Net/side2Net/side1Gross/side2Gross`, side-nivå `effectiveExtraHandicap`, ingen contributor-konsept) + `renderFoursomesMatchplay` + dispatch-gren **rutet via `isAlternateShotMatchplay`** → foursomes/greensome/chapman/gruesome får alle en ekte individuell matchplay-leaderboard. Side-labels: `tournaments.team_1/2_name` ved cup-kobling, ellers «Lag 1»/«Lag 2» (mirror `renderFourballMatchplay`). Dette er nå **kjernen** i issuet, eksplisitt i scope (bruker-krav: «få det til rett for familien»).

Mal for ALT dette: `fourball_matchplay` (dispatch linje 345 + `renderFourballMatchplay` ~1563 + `FourballMatchplayView`) er fullt standalone-komplett — speil det.

### Revidert chunk-plan

- **A — Scoring + mode-registrering:** types (union, MODE_LABELS, GameModeConfig-variant, utvid `isAlternateShotMatchplay`), `gruesomeMatchplay.ts` (delegat → `computeFoursomesCore` + `combinedSideHandicap`), `index.ts` case, validator (`validateGruesomeMatchplay` + `parseGruesomeAllowancePct` + modeValidators), modeGuide-entry + alle exhaustive maps. TDD (Type A). Build grønn.
- **B — Familie-leaderboard (kjerne):** `FoursomesMatchplayView` + `renderFoursomesMatchplay` + dispatch via `isAlternateShotMatchplay`. Én Type C render-test. Fikser foursomes/greensome/chapman/gruesome.
- **C — Wizard + cup-wiring:** gruesome i GameForm/GameWizard allowance-gren + `useGameFormState` + `ENABLED_COMBOS` + `ReadyStep` + `CupGameMode`/`parseCupGameMode`/`loadCupContext`/`buildModeConfigFromCup` + cup-side-lenke + label-sjekker + icons/spillformer.
- **D — Migrasjon + release:** `0065_gruesome_matchplay.sql` (format-row is_cup_eligible=true + intent-mapping `kompis` + `tournaments.gruesome_allowance_pct` default 50; INGEN tee-starter-kolonner) + version-bump til **1.59.0** + CHANGELOG + humanizer. `feat`-commit. Migrasjon appliseres POST-deploy.

Resten av v1-kontrakten under gjelder fortsatt i ånd (problem, edge cases, mekanikk-beslutning = describe-only). Der v1 sier `computeFoursomesMatch`/`isFoursomesFamily`/«ny FoursomesMatchplayView fordi foursomes manglet», les det som over: `computeFoursomesCore`/`isAlternateShotMatchplay`/«delt familie-view som fikser alle fire».

---

## Problem

Tørny har **Foursomes matchplay** (#218): 2v2 alternate shot, én ball per lag, partnerne alternerer slag, lavest lag-score vinner hullet (matchplay). **Gruesome** er den «slemme» varianten av foursomes som golfere kjenner: **begge** spillere på et par slår tee shot, og **motstanderlaget velger hvilken av de to ballene paret må fortsette med** (typisk den verste). Deretter alternate shot derfra — akkurat som foursomes.

Vi vil tilby Gruesome som eget gjenkjennbart format i wizarden, uten å duplisere matchplay-maskineriet.

## Research findings

Søk gjennomført mai 2026. «Gruesome» (også kalt «Pinehurst Gruesome» / «Yellow Ball Gruesome») er en alternate-shot-variant:

- Begge partnere teer ut på hvert hull.
- **Motstanderlaget velger** hvilken av de to driverne paret må spille videre med (vanligvis den verste — derav «gruesome»).
- Partneren til den som eier den valgte ballen slår neste slag, og paret alternerer derfra.
- Lavest par-score vinner hullet (matchplay, som foursomes).

Kilder: [Golf Compendium — Gruesome](https://www.golfcompendium.com/2019/09/gruesome-golf-format.html), generelle alternate-shot-konvensjoner.

### ⚠️ Den avgjørende observasjonen: tee-valget endrer ikke tallet appen lagrer

Foursomes registrerer **én brutto lag-score per hull** (kaptein-eid, `foursomesMatchplay.ts:165-166`). Gruesome registrerer **nøyaktig det samme tallet** — laget ender opp med én ball og én score per hull uansett hvilken tee shot motstanderen valgte. «Motstander velger din tee shot» er en **fysisk/honor-system-regel** med **null scoring-impact**: tallet er identisk med foursomes.

→ Beslutning (bekreftet i kontrakt-diskusjon): appen **sporer ikke** valget. Den **forklarer regelen** i format-infoen. Issue-kriteriene «Scorecard-UI: motstanderens valg» + «Sync-strategi for offline opponent-choice» tolkes som **mode-info-forklaring**, ikke async kryss-par-input-sporing. Se [Key decisions].

Som foursomes/matchplay er Gruesome **ikke handicaptellende** mot WHS — ren konkurranse-modus.

## Prior decisions (carry forward)

- **Ambrose-mønsteret** (`ambrose.ts:39-45`, #284): en ny `game_mode` kan returnere et *eksisterende* result-`kind` fra `compute()` slik at all leaderboard-/podium-/scorekort-/mail-visning gjenbrukes uendret. Gruesome følger dette 1:1: `gruesomeMatchplay.compute()` returnerer `kind: 'foursomes_matchplay'`. Format-navnet «Gruesome» kommer fra `game_mode` → `MODE_LABELS`, ikke fra result-kind.
- **`isScrambleFamily(mode)`-helper** (`types.ts:72`) er presedensen for å rute to game_modes gjennom felles `game_mode`-baserte UI-/scorekort-/leaderboard-greiner, mens mode-spesifikke greiner beholdes der copy/oppførsel avviker. Gruesome introduserer den parallelle **`isFoursomesFamily(mode)`** (true for `foursomes_matchplay | gruesome_matchplay`).
- **Foursomes-storage** (#218): lag-kaptein (lex-min userId via `pickTeamCaptain`) eier scores-radene; non-captain-partneren skriver til samme rad via UI-routing. Scoring leser kun kapteinens rad per hull. Gjenbrukes 1:1 — Gruesome endrer ingenting her.
- **Foursomes-allowance-pipeline** (`foursomesMatchplay.ts:118-131`): diff-formel `highSideExtraHCP = round(|side1CombinedCH − side2CombinedCH| × pct/100)`, lavlag 0 strokes, høylag får extra via SI. WHS-default pct = 50. Gjenbrukes 1:1.
- **Datadreven format-registrering** (F1, migrasjon 0047): nytt format = INSERT i `public.formats` (+ `format_intent_mapping` for wizard-synlighet). INGEN `games_mode_check`-CHECK (droppet i 0047) — server-action-validering (`gamePayload.ts`) er gaten. Mal: `0048_foursomes_matchplay.sql` (matchplay-cup-format) + `0055_round_robin.sql` (standalone intent-mapping).
- **Standalone team-format-presedens** (Ambrose/Texas): wizarden rendrer manuell lag-tildeling for standalone team-formater (ikke bare cup-pre-fill). Gruesome gjenbruker denne for sine 2v2-sider.

## ⚠️ Scope-realitet oppdaget i recon (ærlig flagg)

Foursomes ble **kun bygget for cup** og fikk derfor **aldri en individuell-spill-leaderboard**: `app/games/[id]/leaderboard/page.tsx` har INGEN `foursomes_matchplay`-gren (dispatch verifisert linje 320-497). Foursomes-cup-matches rendres via *cup*-leaderboarden (`app/cup/[id]/page.tsx` → `computeCupLeaderboard`, gjenbruker fourball-rendering). En direkte foursomes-spill-leaderboard-URL faller gjennom til generisk best-ball — feil for et matchplay-format, men praktisk talt aldri truffet siden foursomes er cup-only.

Siden Gruesome er **frittstående**, MÅ et standalone gruesome-spill ha en ekte individuell matchplay-leaderboard. `FourballMatchplayView` kan **ikke** gjenbrukes direkte (verifisert: `FoursomesHoleRow` har `side1Net/side2Net/side1Gross/side2Gross`, IKKE fourball-ens `side1BestNet/contributorIds`; `FoursomesSidePlayer` mangler `effectiveHandicap`). Derfor: bygg en tynn **`FoursomesMatchplayView`** (~50 linjer netto ny logikk; status-banner/meta/side-kort/konfetti kopieres verbatim) + `renderFoursomesMatchplay` + dispatch-gren, **rutet via `isFoursomesFamily` for BÅDE foursomes OG gruesome**. Dette fikser incidentelt foursomes' latente leaderboard-hull (strikt forbedring — gammel oppførsel var feil best-ball-fallthrough).

«Minimal kodeendring fra foursomes» holder for **scoring-motoren** (12-linjers delegat). Leaderboard-viewet er reelt nytt fordi foursomes etterlot det ubygget.

## Design

### 1. Typer & config (`lib/scoring/modes/types.ts`)

- Utvid `GameMode`-union (linje 5-21) med `| 'gruesome_matchplay'`.
- `MODE_LABELS` (linje 29): `gruesome_matchplay: 'Gruesome'` (eller 'Gruesome matchplay' — humanizer/discretion; foursomes bruker kort «Foursomes»).
- Ny `GameModeConfig`-variant, **samme shape som foursomes** (linje 156-170), ny `kind`:

```ts
| {
    kind: 'gruesome_matchplay';
    team_size: 2;
    teams_count: 2;
    /** HCP-allowance for gruesome matchplay (0..100). WHS-default = 50 %.
     *  Diff-formel identisk med foursomes (round(|s1CH−s2CH| × pct/100)).
     *  0 = brutto, 100 = full diff. Defensivt fallback 100. */
    allowance_pct: number;
  }
```

- Ny helper, eksportert via `index.ts`:

```ts
export function isFoursomesFamily(mode: GameMode): boolean {
  return mode === 'foursomes_matchplay' || mode === 'gruesome_matchplay';
}
```

### 2. Scoring-engine (`lib/scoring/modes/foursomesMatchplay.ts` refactor + `gruesomeMatchplay.ts` ny)

Ekstrahér den delte matchplay-kjernen slik at allowance-pct kommer inn som parameter (speiler `computeScramble`-ekstraksjonen i Texas/Ambrose):

```ts
// foursomesMatchplay.ts
export function computeFoursomesMatch(ctx: ScoringContext, allowancePct: number): FoursomesMatchplayResult {
  /* dagens compute()-body, men allowancePct fra param i stedet for readAllowancePct(ctx) */
}
export function compute(ctx: ScoringContext): FoursomesMatchplayResult {
  return computeFoursomesMatch(ctx, readAllowancePct(ctx)); // readAllowancePct beholdes for foursomes
}
```

```ts
// gruesomeMatchplay.ts (ny, ~12 linjer)
import { computeFoursomesMatch } from './foursomesMatchplay';
import type { ScoringContext, FoursomesMatchplayResult } from './types';

/** Gruesome = foursomes-mekanikk (begge teer ut, motstander velger ballen,
 *  så alternate shot). Tee-valget endrer ikke lag-scoren → ren delegat til
 *  foursomes-kjernen. Returnerer kind:'foursomes_matchplay' → all visning
 *  (leaderboard/scorekort/mail) gjenbrukes. Ambrose→scramble-mønsteret (#284). */
export function compute(ctx: ScoringContext): FoursomesMatchplayResult {
  const pct =
    ctx.game.mode_config.kind === 'gruesome_matchplay'
      ? ctx.game.mode_config.allowance_pct
      : 100; // defensivt fallback, speiler foursomes' readAllowancePct
  return computeFoursomesMatch(ctx, pct);
}
```

Router (`lib/scoring/index.ts`): ny `case 'gruesome_matchplay': return gruesomeMatchplay.compute(ctx);` + import. Eksportér `isFoursomesFamily` via index.

### 3. Validator (`lib/games/gamePayload.ts`)

- `parseGameMode` (~linje 228): legg til `raw === 'gruesome_matchplay'` i discriminator-listen.
- Ny `validateGruesomeMatchplay` — **kopi av `validateFoursomesMatchplay`** (linje ~975-1034) med: `kind: 'gruesome_matchplay'`, leser form-feltet `gruesome_allowance_pct` (default 50 i draft), samme eksakt-4-spillere + 2+2-balance + `flight_number = team_number`-regler, samme allowance-range 0..100.
- `modeValidators`-Record (~linje 1547): `gruesome_matchplay: validateGruesomeMatchplay`.

### 4. Migrasjon (`supabase/migrations/00NN_gruesome_matchplay.sql`)

Mal: `0048_foursomes_matchplay.sql`. Sjekk siste migrasjonsnummer ved build (`ls supabase/migrations/`) og bruk neste ledige.

```sql
-- 1. Format-row (cup-eligible OG intent-mappet for standalone)
insert into public.formats (slug, display_name, icon_key, short_description, scoring_module, is_active, is_cup_eligible)
values ('gruesome_matchplay', 'Gruesome matchplay', 'gruesome_matchplay',
  '<norsk beskrivelse — humanizer: begge teer ut, motstander velger ballen, så alternate shot>',
  '@/lib/scoring/modes/gruesomeMatchplay', true, true);

-- 2. Intent-mapping → standalone-synlig i wizarden (foursomes hadde INGEN; gruesome får én)
insert into public.format_intent_mapping (format_slug, intent, is_visible, is_primary, sort_order)
values ('gruesome_matchplay', '<intent — se discretion>', true, false, <sort_order>);

-- 3. Cup-level allowance default (parallelt med foursomes_allowance_pct)
alter table public.tournaments
  add column gruesome_allowance_pct smallint not null default 50
    check (gruesome_allowance_pct between 0 and 100);
comment on column public.tournaments.gruesome_allowance_pct is
  'Handicap-allowance for gruesome-matches i cupen. 0 = brutto, 1..100 = netto '
  '(WHS-standard 50 % av lag-HCP-differansen). Pre-fyller wizard ved gruesome-match-create.';
```

**Intent-valg (discretion):** issuet sier «Placement (default): Cup (cup-eligible, sekundær)». Siden gruesome også skal være standalone (bruker-beslutning), trengs en intent-mapping så formatet vises i wizard-grid-en. Velg intent `kompis` (gruesome er normalt et casual 4-spiller-spill) is_primary=false, ELLER `cup` hvis det finnes en cup-intent som rendrer standalone — verifiser hvilke intents som finnes (`getFormatsForIntent`/0047) og hva som gir best plassering. Sett `sort_order` etter eksisterende rader i samme intent.

⚠️ **Migrasjon appliseres POST-deploy** (per memory `project_format_migration_post_deploy`): wizard-grid er DB-drevet. Seed raden FØR koden er deployet → ødelagt kort på live wizard. Korrekt rekkefølge: merge PR → main deployer → DERETTER `apply_migration` via Supabase MCP + verifiser med `execute_sql`.

### 5. Admin-form / wizard — standalone 2v2

Speil foursomes' form-grein + Ambrose' standalone-team-tildeling:

- `TeamSizeSelector.tsx` (~linje 53): `ENABLED_COMBOS.gruesome_matchplay = new Set<TeamSize>([2])`.
- `GameForm.tsx` (linje 355-443) + `GameWizard.tsx` (linje 492-514, 750-762): gruesome-grein med `gruesome_allowance_pct`-felt (default 50, samme `AllowanceField` som foursomes). Bruk `isFoursomesFamily` for struktur (2v2-sider, lag-grid), men hold gruesome-spesifikk helper-tekst (forklar tee-valg-regelen kort).
- `useGameFormState.ts`: `gruesomeAllowancePct` state-init (default 50).
- `sections/ReadyStep.tsx` (`MODE_SUMMARY_LABELS`-Record ~linje 46): gruesome-label.
- `app/admin/games/new/page.tsx`: `CupGameMode`-union (linje 39-42) + `parseCupGameMode` (linje 44-48) + cup pre-fill (linje 297-302) → gruesome-greiner som leser `gruesome_allowance_pct` fra tournaments.
- `[id]/edit/page.tsx`: mode_config → form-felt-mapping for gruesome (om edit-pathen har per-mode-greiner).

**Verifiser under build:** at den standalone wizard-flyten faktisk rendrer manuell 2v2-side-tildeling for `gruesome_matchplay` (Ambrose/Texas beviser at standalone team-tildeling fungerer; matchplay-2-siders-tildeling kan kreve at lag-grid-en begrenses til eksakt 2 sider à 2). Hvis standalone-side-tildeling viser seg å kreve uforholdsmessig plumbing → **FLAGG til bruker** og fall tilbake til cup-only (per kontrakt-diskusjonens forbehold).

### 6. Individuell-spill leaderboard — NY `FoursomesMatchplayView` (delt foursomes+gruesome)

Per [Scope-realitet] over. Bygg:

- `app/games/[id]/leaderboard/FoursomesMatchplayView.tsx` (ny): nær-kopi av `FourballMatchplayView.tsx`. Endringer: prop `result: FoursomesMatchplayResult`; `SideRow` viser side-nivå `effectiveExtraHandicap` (ikke per-spiller `effectiveHandicap`); hull-grid bruker `side1Net/side2Net` (+ evt. `side1Gross/side2Gross`) i stedet for `side1BestNet`/`contributorIds` (foursomes har ingen «contributor»-konsept — én ball per lag). Status-banner/meta/side-kort/konfetti/shell kopieres verbatim. Format-label kommer fra **prop** (default «Foursomes»), satt til `MODE_LABELS[game_mode]` av render-funksjonen → gruesome viser «Gruesome».
- `renderFoursomesMatchplay` i `leaderboard/page.tsx` (mirror `renderFourballMatchplay` linje 1563-1665): `computeModeResult(ctx)`, bygg `playerInfo` + side-labels (`tournaments.team_1_name/team_2_name` ved cup-kobling, ellers «Lag 1»/«Lag 2»), guard `result.kind !== 'foursomes_matchplay' → notFound()`.
- Dispatch-gren (~linje 354, etter fourball): `if (isFoursomesFamily(game.game_mode)) return renderFoursomesMatchplay({...})`.

Bruk `data-testid`-er konsistent med fourball-viewet (`foursomes-status-banner`, `foursomes-sides`, osv.) for E2E/Type-C-stabilitet.

### 7. Scorekort / hull-page — family-gating

- `lib/games/scorecardLayout.ts` (foursomes-gren ~linje 155-262): inkluder `gruesome_matchplay` via `isFoursomesFamily` (eller eksplisitt OR). Layout B 2-kolonne, kaptein-eier-routing identisk.
- `app/games/[id]/holes/[holeNumber]/page.tsx`:
  - `isFoursomes`-flagg (linje 103): innfør `isFoursomesFamily`-basert flagg for **struktur** (Layout B, lag-scoring) + WHS-diff-handicap (linje 425-436, les allowance fra `gruesome_matchplay`- ELLER `foursomes_matchplay`-config).
  - **Behold strikt `=== 'foursomes_matchplay'` for tee-starter-banneret** (linje 508-538): `FoursomesTeeStarterBanner`/`FoursomesTeeHint` (alternerende odde/par-tee) er FEIL for gruesome (begge teer ut). Gruesome viser IKKE dette banneret. Valgfritt lett gruesome-hint på hull 1 («Begge teer ut. Motstanderlaget velger ballen dere spiller videre med.») — discretion; ellers lever forklaringen i modeGuide.
- `app/games/[id]/page.tsx` (game-home, lokal `game_mode`-union linje 81-97): legg til `'gruesome_matchplay'`; lag-grid + «Format: Gruesome» via MODE_LABELS.

### 8. Cup-leaderboard — automatisk gjenbruk

Gruesome cup-matches aggregerer i `computeCupLeaderboard`/`getCupSnapshot` automatisk: resultatet er `kind: 'foursomes_matchplay'`, og cup-leaderboarden leser den format-agnostiske match-streng-en («3&2 til {team}»). Verifiser ingen `kind`-eksklusjon stenger gruesome ute. `app/admin/cup/[id]/page.tsx`: legg til «Legg til gruesome-match»-lenke (mirror foursomes linje 214) + match-type-label-sjekker (linje 249-256) → `isFoursomesFamily` eller eksplisitt OR.

### 9. Mail — gjenbruk generisk/foursomes-path

`gameFinishedNotification.ts` + `gameFinishedRecipients.ts`: foursomes faller til generisk body («leaderboardet er åpent») i dag. Rut `gruesome_matchplay` samme vei (via `isFoursomesFamily` der det gates på game_mode). Ingen ny mail-variant, ingen ny snapshot (unngår duplikat per test-disiplin Type B).

### 10. Format-helpers / oppdagbarhet

- `lib/formats/modeGuide.ts` (`MODE_GUIDE`-Record, compile-time exhaustive): ny gruesome-oppføring (norsk, humanizer). **Her bor forklaringen av tee-valg-regelen** (summary + points: begge teer ut, motstander velger ballen, så alternate shot, lavest vinner hullet). `modeGuide.test.ts` håndhever ikke-tom content.
- `lib/formats/icons.tsx` (om filen har en hardkodet map): `gruesome_matchplay`-ikon (gjenbruk foursomes-ikon eller distinkt — discretion).
- `lib/games/formatLabel.ts` + `allowanceCopy.ts`: gruesome-gren (allowance-copy forklarer WHS-diff 50 %-default, identisk med foursomes — bruk `isFoursomesFamily`).
- `app/spillformer/page.tsx` (`CATALOG`): `{ key: 'gruesome_matchplay', mode: 'gruesome_matchplay' }`.

### 11. Norsk copy — humanizer-pass (før commit)

format short_description, modeGuide-oppføring (tee-valg-forklaring), allowanceCopy, helper-tekst i wizard, evt. gruesome-hint, ModeSummary-label. Kjør `humanizer:humanizer`-skill. Unngå AI-tells; «Gruesome matchplay» beholdes engelsk (som Foursomes/Fourball/Acey Deucey — etablert presedens for format-navn).

## Edge cases & guardrails

- **`allowance_pct = 0`**: gyldig — brutto-matchplay (laveste lag-gross vinner hullet, ingen strokes).
- **`allowance_pct = 50`** (default): WHS-standard, diff-formel som foursomes.
- **≠ 4 spillere / ikke 2+2**: scoring → defensiv empty shell (`foursomesMatchplay.ts:39-62`, arves via delegat); validator avviser ved publish (eksakt 4, 2 per side).
- **Tee-valg spores ikke**: bevisst (null scoring-impact). Ingen `gruesome_*_tee_starter`-kolonner — i motsetning til foursomes' `foursomes_side1/2_tee_starter_user_id` (de styrer alternerende tee, irrelevant for gruesome).
- **Foursomes tee-starter-banner vises IKKE for gruesome**: strikt `game_mode === 'foursomes_matchplay'`-gate beholdt for banneret.
- **Foursomes' individuelle leaderboard fikses incidentelt**: ny dispatch-gren rutet via `isFoursomesFamily` erstatter den feilaktige best-ball-fallthrough-en for foursomes også. Strikt forbedring; verifiser ingen cup-regresjon.
- **Defensiv fallback**: `gruesome.compute` med feil `mode_config.kind` → pct 100 (speiler foursomes' `readAllowancePct`-default).
- **tsc exhaustive-switches** (per memory `feedback_tsc_gate_preexisting_trap`): nytt `GameMode`-medlem MÅ treffe ALLE exhaustive `switch` + `Record<GameMode,...>`-maps. Kjør `npm run build` (ikke filtrert tsc) per chunk.

## Key decisions

- **Eget format, delt motor** (Ambrose-mønsteret) — bekreftet av bruker. Eget `game_mode`/format-kort/mode-info; scoring er 12-linjers delegat til `computeFoursomesMatch`, returnerer `kind: 'foursomes_matchplay'`. IKKE en toggle under foursomes (usynlig i format-katalog #270), IKKE en full klon (gjenbruk via delegat).
- **Tee-valget forklares, ikke spores** — bekreftet av bruker. Null scoring-impact; async kryss-par-input-sporing droppet. Issue-kriterier «motstanderens valg»-UI + offline-sync reint tolket som mode-info-forklaring.
- **Frittstående + cup** — bekreftet av bruker (avviker fra issuets «cup-default»). Standalone via intent-mapping (gruesome er normalt casual 4-spiller); `is_cup_eligible=true` for cup-leg. Forbehold: hvis standalone 2v2-wizard-tildeling krever uforholdsmessig plumbing → flagg + fall tilbake til cup-only.
- **`isFoursomesFamily`-helper** for `game_mode`-struktur-gating; mode-spesifikke greiner kun der copy/oppførsel avviker (tee-banner: foursomes-only; format-label/hint: per mode).
- **Ny `FoursomesMatchplayView`** (delt foursomes+gruesome) — foursomes etterlot individuell-leaderboard ubygget; `FourballMatchplayView` ikke direkte gjenbrukbar (ulike hull-row-felt). Fikser foursomes-hullet incidentelt.
- **Datadreven registrering** (formats-row + intent-mapping + tournaments-kolonne), migrasjon appliseres POST-deploy.

**Claude's Discretion:**
- Intent-valg + `sort_order` for mapping (kompis vs cup — velg beste standalone-plassering etter å ha verifisert hvilke intents finnes).
- Ikon-valg for `gruesome_matchplay` (gjenbruk foursomes vs distinkt).
- MODE_LABEL-ordlyd («Gruesome» vs «Gruesome matchplay»).
- Om gruesome-hint på hull 1 legges til vs forklaring kun i modeGuide.
- Eksakt norsk ordlyd (humanizer avgjør).
- Migrasjonsnummer (neste ledige).

## Success criteria

- [ ] `gruesomeMatchplay.compute(ctx)` returnerer `kind: 'foursomes_matchplay'`, leser `allowance_pct` fra gruesome-config, og gir identisk matchplay-resultat som foursomes for samme input. `computeLeaderboard` ruter `game_mode==='gruesome_matchplay'` dit. **Evidence:** ny `gruesomeMatchplay.test.ts` (Type A) grønn + `lib/scoring/index.ts` case.
- [ ] `foursomesMatchplay.compute` gir uendret resultat etter `computeFoursomesMatch`-ekstraksjonen (ingen regresjon). **Evidence:** `foursomesMatchplay.test.ts` grønn (uendret).
- [ ] `validateGruesomeMatchplay` produserer `mode_config {kind:'gruesome_matchplay', team_size:2, teams_count:2, allowance_pct}`; avviser ≠4 spillere / ubalanserte sider / pct utenfor 0–100. **Evidence:** `gamePayload`-test-blokk (Type A) grønn.
- [ ] Migrasjon skrevet (format-row `is_cup_eligible=true` + intent-mapping + `tournaments.gruesome_allowance_pct`), verifisert mot 0048-malen. **Appliseres POST-deploy** via Supabase MCP + verifisert med `execute_sql`. (Markeres `[~]` til post-deploy, som ambrose-presedens.)
- [ ] Admin kan opprette et **frittstående** gruesome-spill (4 spillere, 2v2) via wizarden; vises med label «Gruesome». Hvis standalone-tildeling ikke lar seg gjøre rimelig → cup-only + flagg. **Evidence:** wizard-grein + `validateGruesomeMatchplay` + `npm run build` grønn; visuell smoke via Playwright/preview.
- [ ] Individuell-spill-leaderboard for et gruesome-spill rendrer matchplay-viewet (status-banner, sider, hull-grid, «X up / 3&2»), format-label «Gruesome». Foursomes ruter samme vei uten regresjon. **Evidence:** `FoursomesMatchplayView` + dispatch-gren; én Type C render-test (label + grunnstruktur, IKKE re-assert av Type-A-tall).
- [ ] Scorekort viser foursomes Layout B (2 kolonner) for gruesome; INGEN foursomes tee-starter-banner vises. **Evidence:** `scorecardLayout` + holes-page family-gating; Playwright/preview-smoke.
- [ ] mode-info/guide forklarer gruesome-regelen (begge teer ut, motstander velger). **Evidence:** `modeGuide.ts`-oppføring + `modeGuide.test.ts` grønn.
- [ ] `npm run build` (tsc) grønn — alle exhaustive switches/maps dekker `'gruesome_matchplay'`. **Evidence:** build-output.
- [ ] Versjons-bump (minor, ny bruker-synlig feature) + CHANGELOG-oppføring i den bruker-synlige `feat`-commiten. **Evidence:** `package.json` + CHANGELOG.

## Gates (etter hver chunk)

- [ ] `npm run build` (tsc — fanger manglende exhaustive-switch/Record-cases; IKKE filtrert)
- [ ] `npm test -- lib/scoring/modes/gruesomeMatchplay` (når engine bygget)
- [ ] `npm test -- lib/scoring/modes/foursomesMatchplay` (regresjon etter refactor)
- [ ] `npm test -- lib/games/gamePayload` (når validator bygget)
- [ ] `npm test -- lib/formats/modeGuide` (exhaustive guide-map)
- [ ] `npm test` (full suite) før PR-merge
- [ ] `humanizer:humanizer` på alle nye norske strenger
- [ ] `.githooks/commit-msg` aksepterer commits (bump+CHANGELOG på feat)
- [ ] Playwright/preview-smoke: opprett gruesome-spill + tast et par hull + se leaderboard (når UI bygget)

## Files likely touched

**Nye:** `lib/scoring/modes/gruesomeMatchplay.ts`, `lib/scoring/modes/gruesomeMatchplay.test.ts`, `app/games/[id]/leaderboard/FoursomesMatchplayView.tsx`, `supabase/migrations/00NN_gruesome_matchplay.sql`. (Evt. egen `gamePayload`-gruesome-test-fil per repo-konvensjon.)

**Scoring/typer:** `lib/scoring/modes/types.ts` (GameMode, MODE_LABELS, GameModeConfig, isFoursomesFamily), `lib/scoring/modes/foursomesMatchplay.ts` (ekstrahér computeFoursomesMatch), `lib/scoring/index.ts` (router-case + eksport).

**Validator:** `lib/games/gamePayload.ts` (parseGameMode, validateGruesomeMatchplay, modeValidators).

**Admin-form/wizard:** `TeamSizeSelector.tsx`, `GameForm.tsx`, `GameWizard.tsx`, `useGameFormState.ts`, `sections/ReadyStep.tsx`, `app/admin/games/new/page.tsx` (CupGameMode + parseCupGameMode + pre-fill), `[id]/edit/page.tsx`.

**Spill-flater:** `app/games/[id]/leaderboard/page.tsx` (renderFoursomesMatchplay + dispatch), `app/games/[id]/holes/[holeNumber]/page.tsx`, `app/games/[id]/page.tsx`, `lib/games/scorecardLayout.ts`.

**Cup:** `app/admin/cup/[id]/page.tsx` (gruesome-match-lenke + label-sjekker), `lib/cup/actions.ts` (parse gruesome_allowance_pct), evt. `computeCupLeaderboard`/`getCupSnapshot`-verifisering.

**Mail:** `gameFinishedNotification.ts`, `gameFinishedRecipients.ts` (rut via isFoursomesFamily).

**Helpers/discoverability:** `lib/formats/modeGuide.ts`, `lib/formats/icons.tsx`, `lib/games/formatLabel.ts`, `lib/games/allowanceCopy.ts`, `app/spillformer/page.tsx`.

**Versjon:** `package.json`, `CHANGELOG.md`.

## Out of scope

- **Sporing av motstanderens tee-valg + offline async-input** — bevisst droppet (null scoring-impact). Forklares i mode-info.
- **Egen gruesome result-`kind` / egne view-komponenter** — gjenbruker foursomes-result-kind + delt FoursomesMatchplayView.
- **Drive-distribusjon / faktisk shot-håndhevelse** — honor-system (som all annen Tørny-scoring).
- **Endring av foursomes' tee-starter-mekanikk** — gruesome bruker den ikke; foursomes uendret.
- **Greensome (#289) / Chapman (#290)** — egne issues i alternate-shot-familien.
