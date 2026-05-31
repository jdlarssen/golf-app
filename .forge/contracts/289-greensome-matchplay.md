# Spec: Greensome matchplay — 2v2 velg-beste-tee + alternate (Cup-eligible)

**Issue:** [#289](https://github.com/jdlarssen/golf-app/issues/289)
**Parent epic:** [#270](https://github.com/jdlarssen/golf-app/issues/270) (Format-katalog) + [#47](https://github.com/jdlarssen/golf-app/issues/47) (Ryder Cup)
**Type:** MINOR (ny bruker-synlig feature)
**Precedent (blueprint):** [.forge/contracts/218-foursomes-matchplay.md](218-foursomes-matchplay.md) — greensome er foursomes med to forskjeller. Gjenbruk maksimalt.
**Mønster-presedens:** [.forge/contracts/284-ambrose.md](284-ambrose.md) — «ny game_mode returnerer et eksisterende result-`kind` fra `compute()`» slik at all leaderboard-/podium-/scorekort-/mail-visning gjenbrukes uendret.

## Problem

Tørny har foursomes matchplay ([#218](https://github.com/jdlarssen/golf-app/issues/218)) — 2v2 alternate shot der partnerne slår annethvert slag fra tee. Cup-en mangler fortsatt **greensome** (også kalt «Scotch foursomes» / «velg-beste-tee foursomes»): begge spillerne i et par slår tee shot, paret velger det beste utslaget, og spiller alternate shot derfra. Lavest par-score på hullet vinner — sammenliknes som matchplay (3&2, 2up, AS).

Arkitektonisk er greensome **nesten identisk med foursomes**: én ball per lag, lag-score per hull, matchplay-overlay. Vi gjenbruker hele foursomes-maskineriet (kaptein-storage, Layout B head-to-head-scorekort, cup-snapshot, leaderboard-view, mail) og endrer bare to ting:

1. **Lag-handicap-formel.** Foursomes summerer partnernes course-handicap. Greensome bruker WHS-greensome-blandingen **0,6 × laveste + 0,4 × høyeste**.
2. **Ingen tee-starter-feature.** I foursomes er tee-rotasjonen fast (én spiller odde hull, den andre like hull), så foursomes har en tee-starter-banner + per-hull-hint. I greensome slår BEGGE ut hvert hull — det finnes ingen fast «hvem slår ut»-rotasjon å spore. Greensome dropper tee-starter-banneret helt.

## Research Findings

- **Greensome lag-handicap = 0,6 × laveste handicap + 0,4 × høyeste handicap** per par. Dette er den etablerte CONGU/WHS-greensome-allowance-konvensjonen (lagets enkelt-tall spille-handicap). Bekreftet av bruker i kontrakt-diskusjon. Eksempel: par med CH 8 og 18 → 0,6 × 8 + 0,4 × 18 = 4,8 + 7,2 = **12**.
- **Matchplay-allowance på differansen:** siden lag-handicapet allerede er ett blandet tall (som en individuell spiller), bruker matchplay mellom to slike «spillere» **full forskjell (100 %)** som standard. Bekreftet av bruker (valgte 100 % over 50 %). Justerbart per cup via netto/brutto + prosent, identisk mekanikk som foursomes.
- **Greensome lagrer kun lag-scoren** (samme som foursomes/texas). Appen har ikke enkeltslag-modell, så «velg beste tee shot» er en spille-instruksjon uten datamodell-avtrykk — ingen tee-shot-velger på scorekortet (bekreftet av bruker: «rent scorekort»).
- Greensome er, som foursomes, **ikke et generelt wizard-format** — det er en cup-/matchplay-feature (`is_cup_eligible=true`, ingen `format_intent_mapping`-rader).

## Prior Decisions (carry forward)

- **Storage pattern A (kaptein-eier-scores, ingen skjema-endring på `scores`)** — fra [foursomes-kontrakten](218-foursomes-matchplay.md). Lex-min userId per side eier scores-radene via `pickTeamCaptain`. Greensome gjenbruker 1:1.
- **Reuse-result-kind-mønsteret** — fra [ambrose-kontrakten](284-ambrose.md): `greensomeMatchplay.compute()` returnerer `kind: 'foursomes_matchplay'` (samme `FoursomesMatchplayResult`-shape), slik at `FoursomesMatchplayView`/`Podium`, scorekort-layout, cup-snapshot og mail gjenbrukes uten nye komponenter. Format-label skiller via `MODE_LABELS` + `formatLabel`-prop (samme som Texas→Ambrose).
- **Family-helper for struktur-gating** — speiler `isScrambleFamily`/`isStablefordFamily`. Ny `isAlternateShotMatchplay(mode)` (true for `foursomes_matchplay | greensome_matchplay`) for routing-sjekker som ellers var `=== 'foursomes_matchplay'`. Behold mode-spesifikke greiner der oppførsel avviker (handicap-formel; tee-starter-banner gjelder KUN foursomes).
- **Allowance-storage** — cup-level default på egen `tournaments`-kolonne, pre-fyller wizard, lagres per-match i `mode_config.allowance_pct`. Greensome får egen `greensome_allowance_pct` (default 100), samme pattern som `foursomes_allowance_pct` (default 50).
- **Datadreven cup-format-registrering** — `getCupEligibleFormats()` driver cup-detalj-sidens match-create-knapper. En seedet `greensome_matchplay`-rad (`is_cup_eligible=true`) gir automatisk «+ Greensome match»-knapp; ingen hardkodet app-endring på cup-siden.
- **Ingen `games_mode_check`** (droppet i 0047). `isValidActiveGameMode` sjekker `formats`-tabellen — seedet rad gjør game_mode gyldig.

## Design

### 1. Datamodell — migrasjon `supabase/migrations/0058_greensome_matchplay.sql`

```sql
-- 0058_greensome_matchplay.sql
-- Greensome matchplay (#289) — 2v2 velg-beste-tee + alternate.
-- Gjenbruker foursomes-mønsteret: kaptein-eier-scores (ingen skjema-endring på
-- scores), Layout B head-to-head, cup-eligible uten intent-mapping.
-- INGEN tee-starter-kolonner: i greensome slår begge ut hvert hull.

-- 1. Seed greensome_matchplay i formats (cup-eligible, ingen intent-mapping)
insert into public.formats (slug, display_name, icon_key, short_description, scoring_module, is_active, is_cup_eligible) values
  ('greensome_matchplay', 'Greensome matchplay', 'greensome_matchplay',
   '2v2. Begge slår ut, velg beste utslag, så alternate shot.',
   '@/lib/scoring/modes/greensomeMatchplay', true, true);

-- 2. Cup-level allowance default for greensome-matches. Default 100 (full
--    forskjell av lagenes greensome-handicap; WHS-standard for blandet enkelt-tall).
alter table public.tournaments
  add column greensome_allowance_pct smallint not null default 100
    check (greensome_allowance_pct between 0 and 100);

comment on column public.tournaments.greensome_allowance_pct is
  'Handicap-allowance for greensome-matches i cupen. 0 = brutto (gross-only), '
  '1..100 = netto. Lag-handicap = 0,6*laveste + 0,4*høyeste; denne prosenten '
  'skalerer differansen mellom lagene. WHS-standard 100. Pre-fyller wizard.';
```

**Begrunnelse:** Egen `greensome_allowance_pct`-kolonne (default 100) — ulik default OG formel fra foursomes (50, sum-basert). Holdes separat. Ingen tee-starter-kolonner (greensome har ingen fast tee-rotasjon).

### 2. Scoring-modul `lib/scoring/modes/greensomeMatchplay.ts`

Tilnærmet kopi av `foursomesMatchplay.ts`. Eneste reelle forskjell: lag-handicap-beregningen.

```ts
import * as foursomes from './foursomesMatchplay'; // gjenbruk shared helpers om de finnes
import { pickTeamCaptain } from '@/lib/games/teamCaptain';
import { classifyMatchplayHole, computeMatchResult } from './singlesMatchplay';

/** Greensome lag-handicap: 0,6 × laveste + 0,4 × høyeste (WHS-greensome). */
export function greensomeSideHandicap(chA: number, chB: number): number {
  const low = Math.min(chA, chB);
  const high = Math.max(chA, chB);
  return 0.6 * low + 0.4 * high;
}

export function compute(ctx: ScoringContext): FoursomesMatchplayResult {
  // 1. Krev 2-2-fordeling, ellers empty-shell (kind: 'foursomes_matchplay').
  // 2. Kaptein per side (lex-min userId — pickTeamCaptain).
  // 3. side{1,2}Hcp = greensomeSideHandicap(p1.ch, p2.ch).
  // 4. allowancePct fra mode_config (default 100 defensivt).
  //    diff = |side1Hcp - side2Hcp|;
  //    extra = Math.round(diff * allowancePct / 100) til høyeste side, 0 til laveste.
  // 5. Per hull: gross (kaptein-eid), netto = gross - strokesForHole(extra, SI),
  //    classifyMatchplayHole(side1Net, side2Net), akkumulér holesUp/holesPlayed.
  // 6. computeMatchResult(holesUp, holesPlayed, holesRemaining).
  // RETURNERER kind: 'foursomes_matchplay' (gjenbruker FoursomesMatchplayResult).
}
```

**Detaljer:**
- **Returnerer `kind: 'foursomes_matchplay'`** — gjenbruker `FoursomesMatchplayResult` og all visning (ambrose-mønsteret). Ingen ny result-type, ingen ny view-komponent.
- **`combinedCourseHandicap`-feltet på `FoursomesSide`** settes til greensome-blandingen (ikke summen) for greensome — feltet brukes kun til display/intern beregning, så semantikken «lagets effektive handicap» holder.
- **`effectiveExtraHandicap`** = `Math.round(diff × pct/100)` på høyeste side, 0 på laveste — identisk allokerings-logikk som foursomes.
- **Refactor-mulighet:** hvis `foursomesMatchplay.ts` kan parametriseres med en `sideHandicap`-funksjon (slik texas→ambrose ekstraherte `computeScramble`), gjør det og la begge moduler dele kjernen. Hvis det blir for invasivt (matchplay-løkka er kort), er en fokusert kopi akseptabelt. Builder velger laveste risiko — IKKE bryt eksisterende foursomes-tester.

### 3. Type-utvidelser `lib/scoring/modes/types.ts`

```ts
export type GameMode = ... | 'foursomes_matchplay' | 'greensome_matchplay';

export const MODE_LABELS: Record<GameMode, string> = {
  ...,
  greensome_matchplay: 'Greensome',
};

// GameModeConfig-variant (egen kind, samme shape som foursomes)
| { kind: 'greensome_matchplay'; team_size: 2; teams_count: 2; allowance_pct: number; }

// Family-helper
export function isAlternateShotMatchplay(mode: GameMode): boolean {
  return mode === 'foursomes_matchplay' || mode === 'greensome_matchplay';
}
```

`ModeResult`-union trenger INGEN ny variant (greensome returnerer `FoursomesMatchplayResult`).

### 4. Mode-router `lib/scoring/index.ts`

```ts
import * as greensomeMatchplay from './modes/greensomeMatchplay';
// ...
case 'greensome_matchplay':
  return greensomeMatchplay.compute(ctx);
```
Eksportér `greensomeSideHandicap` om validator/form trenger den.

### 5. Validator `lib/games/gamePayload.ts` (+ `lib/games/validators/`)

Ny `validateGreensomeMatchplay` — kopi av `validateFoursomesMatchplay` med:
- `kind: 'greensome_matchplay'`, leser `greensome_allowance_pct` fra form-data (0..100 heltall; tom i draft → defensiv 100; tom i publish → bug → `bad_allowance`).
- Eksakt 4 spillere fordelt 2-2 (`team_number ∈ {1,2}`, `flight_number = team_number`).
- Feilkoder: `min_players_for_mode` (≤3), `too_many_players_for_mode` (≥5), `team_balance` (4 men ikke 2-2), `duplicate_player`, `bad_allowance`.
- `mode_config`-output: `{ kind: 'greensome_matchplay', team_size: 2, teams_count: 2, allowance_pct }`.

`parseGameMode` utvides med `'greensome_matchplay'`. `modeValidators[greensome_matchplay] = validateGreensomeMatchplay`. (Sjekk om foursomes-validatoren ligger i `lib/games/validators/foursomesMatchplay.ts` og speil filplasseringen.)

### 6. Scorekort — gjenbruk foursomes Layout B UTEN tee-starter

`lib/games/scorecardLayout.ts`: la greensome treffe samme Layout-B-gren som foursomes (to kolonner, én per side, kaptein-userId som score-target, `isMatchplay: true`). Bruk `isAlternateShotMatchplay(mode)` eller utvid `cfg.kind === 'foursomes_matchplay'`-sjekken til å inkludere `'greensome_matchplay'`.

**Tee-starter-banneret (`FoursomesTeeStarterBanner` + `setFoursomesTeeStarter` + per-hull-hint) skal IKKE vises for greensome.** Behold banner-gating på `game_mode === 'foursomes_matchplay'` (eksakt, ikke family-helper). Greensome-scorekortet er rent: to kolonner, én lag-score per hull, match-status-footer. Ingen ekstra UI.

### 7. Leaderboard / cup-snapshot / game-home — rute via family

Der foursomes rutes på `game_mode === 'foursomes_matchplay'`, bytt til `isAlternateShotMatchplay(game_mode)` (eller legg til en parallell greensome-gren) i:
- `app/games/[id]/leaderboard/page.tsx` — greensome → samme `renderFoursomesMatchplay`-vei, `formatLabel: MODE_LABELS['greensome_matchplay']`.
- `lib/cup/getCupSnapshot.ts` — greensome-gren (4 spillere 2-2 → `greensomeMatchplay.compute` → samme `winnerSide`/`formatted`). `team1PlayerName`/`team2PlayerName` join med «/».
- `app/games/[id]/page.tsx` (game-home), `app/games/[id]/holes/[holeNumber]/page.tsx` (hull-page), scorecard/submit-sider — rute greensome gjennom foursomes-strukturen via family-helper.
- `FoursomesMatchplayView`/`Podium` (eller hva foursomes-viewet heter): sørg for at det tar `formatLabel`-prop slik at greensome viser «Greensome», ikke «Foursomes». Hvis propen ikke finnes ennå, legg den til (default «Foursomes»).

### 8. Mail — gjenbruk foursomes/matchplay-path

`gameFinishedNotification.ts` + `gameFinishedRecipients.ts`: rut `'greensome_matchplay'` gjennom samme matchplay-gren som foursomes (body er format-agnostisk). Bruk family-helper. Ingen ny template, ingen ny snapshot (unngår duplikat per test-disiplin Type B).

### 9. Wizard + cup-create-form

- `app/admin/games/new/TeamSizeSelector.tsx`: `ENABLED_COMBOS.greensome_matchplay = new Set<TeamSize>([2])`.
- `app/admin/games/new/sections/ReadyStep.tsx`: `MODE_SUMMARY_LABELS.greensome_matchplay = 'Greensome matchplay'`.
- Wizard (`GameWizard.tsx`/`GameForm.tsx`/`useGameFormState.ts`): speil foursomes-greinen for `?game_mode=greensome_matchplay` + `?tournament_id=` — pre-fyll netto/brutto + allowance fra `tournament.greensome_allowance_pct`. Submit sender `greensome_allowance_pct` form-felt.
- Cup-create-form (`CupSetup.tsx`): ny `AllowanceField fieldName="greensome_allowance_pct" defaultPct={100}` med greensome-spesifikk helper-copy (humanizer-pass). Server-action (`lib/cup/actions.ts`) leser/validerer/persisterer til `tournaments.greensome_allowance_pct`.
- Cup-detalj-side: «+ Greensome match»-knapp kommer **automatisk** via `getCupEligibleFormats()` når raden er seedet — verifiser, ikke hardkod.

### 10. Format-helpers / oppdagbarhet

- `lib/formats/modeGuide.ts`: ny `greensome_matchplay`-guide (norsk forklaring: begge slår ut, velg beste, alternate; humanizer).
- `lib/games/allowanceCopy.ts`: greensome-gren (forklar 0,6/0,4-blanding + 100 %-default).
- `lib/formats/icons.tsx`: map `'greensome_matchplay'` → ikon (gjenbruk foursomes-ikon eller distinkt lucide — Claude's discretion).
- `app/spillformer/page.tsx`: Greensome i format-oversikten (hvis foursomes er der).

### 11. CHANGELOG + versjon

MINOR-bump `1.53.0 → 1.54.0`. Tagline-skisse (humanizer-pass før commit):

> Greensome matchplay er klar for cupen. Begge i paret slår ut, dere velger
> det beste utslaget, og spiller alternate derfra mot motstander-paret.

## Edge Cases & Guardrails

- **0/1/3-spiller-context (draft):** empty-shell (`holesUp:0, holesPlayed:0, result:null`). Validator stopper publish.
- **Begge sider mangler gross på et hull:** `unplayed`. Én side mangler: `unplayed` (matchplay krever begge).
- **Tie i lag-handicap (begge sider samme blanding):** `extra = 0` på begge → gross-only matchplay. `highSide` deterministisk side 1 (irrelevant når extra=0).
- **Allowance 0 % (brutto):** ingen strokes, gross matchplay.
- **Fraksjonell lag-handicap:** 0,6/0,4-blandingen gir ofte desimaler (12,0 / 9,6 / …). `diff` regnes på desimal-verdiene, `extra = Math.round(diff × pct/100)` → heltall strokes (konsistent med all annen netto-allokering i Tørny — per-hull SI, ikke fraksjonell subtraksjon).
- **Mat-em før 18:** `${marginUp}&${remainingAtDecision}`. **AS etter 18:** `formatted: 'AS'`.
- **Blandet-kjønn-par:** kaptein-userId's teeGender for lag-par-display (samme forenkling som foursomes/texas).
- **Tee-starter-banner må IKKE lekke til greensome:** verifiser at banneret er gated på eksakt `foursomes_matchplay`, ikke family-helper.
- **Cup uten greensome_allowance_pct (gammel data):** DB-default 100 dekker.
- **Wizard uten `?tournament_id`:** legalt, allowance defaulter til 100.
- **Eksisterende foursomes-matcher:** må rendres identisk etter greensome-tillegget (ingen regresjon fra family-helper-refactor).

## Key Decisions

- **Greensome lag-handicap = 0,6 × laveste + 0,4 × høyeste** (WHS-greensome). Default allowance **100 %** av differansen — bekreftet av bruker.
- **`compute()` returnerer `kind: 'foursomes_matchplay'`** (ambrose-mønsteret) → all view/leaderboard/podium/scorekort/mail gjenbrukes; ingen nye komponenter.
- **`isAlternateShotMatchplay`-family-helper** for struktur-gating; tee-starter-banner forblir foursomes-eksklusiv.
- **Rent scorekort, ingen tee-shot-velger** — bekreftet av bruker. Appen lagrer kun lag-score; en velger ville vært ikke-funksjonell.
- **Cup-only** (`is_cup_eligible=true`, ingen intent-mapping) — samme som foursomes/fourball.
- **Egen `greensome_allowance_pct`-kolonne (default 100)** — ulik default/formel fra foursomes.
- **Versjons-bump:** MINOR (1.54.0).

**Claude's Discretion:**
- Om scoring-kjernen deles via parametrisering av `foursomesMatchplay.ts` vs fokusert kopi — velg laveste risiko, ikke bryt foursomes-tester.
- Ikon-valg for `'greensome_matchplay'` (gjenbruk foursomes vs distinkt).
- Eksakt norsk copy (modeGuide, allowanceCopy, CupSetup helper-tekst, short_description) — humanizer-pass.
- Match-label-format på cup («Greensome N» foreslått).
- `data-testid`-konvensjon hvis E2E skrives.

## Success Criteria

- [ ] **Migrasjon `0058_greensome_matchplay.sql` skrevet** (formats-seed cup-eligible + `tournaments.greensome_allowance_pct` default 100, INGEN tee-starter-kolonner). `lib/database.types.ts` regenerert. Verifikasjon: `grep "greensome_matchplay" lib/database.types.ts` treff i formats-typer; `grep "greensome_allowance_pct" lib/database.types.ts` treff i tournaments-typer. (Prod-apply utsettes til post-deploy — se Gates.)
- [ ] **Scoring-modul `lib/scoring/modes/greensomeMatchplay.ts` med TDD-dekning.** Verifikasjon: `npx vitest run lib/scoring/modes/greensomeMatchplay` ≥ 12 grønne tester som dekker: (a) `greensomeSideHandicap(8,18)===12` og (10,10)===10, (b) basic 2v2 der høy side får `round(diff×100/100)` strokes via SI, (c) lav side 0 strokes, (d) tie i lag-HCP (begge 0), (e) mat-em før 18 («3&2»), (f) AS etter 18, (g) ferdig 18 («2up»), (h) one-side-unplayed («unplayed»), (i) allowance 0 % (gross-only), (j) returnerer `kind: 'foursomes_matchplay'`, (k) kaptein lex-min per side, (l) `holesPlayed` teller kun hull med begge siders gross, (m) fraksjonell blanding (9,6 vs 12,0 → diff 2,4 → round 2 strokes @100 %).
- [ ] **`greensome_matchplay` i `GameMode`-union, `MODE_LABELS`, `GameModeConfig`, mode-router, `isAlternateShotMatchplay`.** Verifikasjon: `npm run build` (tsc) grønn — alle exhaustive `Record<GameMode,…>` dekker greensome (TeamSizeSelector `ENABLED_COMBOS`, ReadyStep `MODE_SUMMARY_LABELS`, modeGuide `MODE_GUIDE`, allowanceCopy, gamePayload `modeValidators`).
- [ ] **`validateGreensomeMatchplay` håndhever 4 spillere 2-2 + allowance 0..100.** Verifikasjon: `npx vitest run lib/games/gamePayload` nye greensome-cases: `min_players_for_mode`, `too_many_players_for_mode`, `team_balance`, happy-path (mode_config `{kind:'greensome_matchplay',team_size:2,teams_count:2,allowance_pct}`), `bad_allowance`.
- [ ] **Greensome rutes gjennom foursomes-visning med riktig label.** Verifikasjon: `getCupSnapshot` for en greensome-match (4 spillere, scores) returnerer `team1PlayerName: 'A/B'`, `team2PlayerName: 'C/D'`, korrekt `result.winnerSide` + `formatted`; leaderboard-/view-ruting bruker `isAlternateShotMatchplay` og sender `formatLabel: 'Greensome'`.
- [ ] **Tee-starter-banner vises IKKE for greensome.** Verifikasjon: banner-rendering gated på eksakt `game_mode === 'foursomes_matchplay'` (les koden); greensome-hull-page har ingen banner.
- [ ] **Cup-detalj-side får «+ Greensome match» automatisk + cup-create lagrer `greensome_allowance_pct`.** Verifikasjon: `getCupEligibleFormats()` inkluderer greensome når seedet; `CupSetup` har `AllowanceField` for greensome; cup-create med netto+100 → `tournaments.greensome_allowance_pct=100` (verifiseres post-deploy / via unit der mulig).
- [ ] **Ingen regresjon på foursomes/øvrige modi.** Verifikasjon: `npx vitest run lib/scoring lib/games lib/cup` full grønn; eksisterende foursomes-tester uendret.
- [ ] **CHANGELOG-oppføring + MINOR-bump 1.53.0→1.54.0.** Verifikasjon: `.githooks/commit-msg` passerer på `feat(cup): greensome matchplay …` med pakke-bump + CHANGELOG.

## Gates (etter hver chunk)

- [ ] `npm run build` (tsc — fanger manglende exhaustive-switch-cases; IKKE filtrert tsc, per memory)
- [ ] `npx vitest run lib/scoring/modes/greensomeMatchplay lib/scoring/modes/foursomesMatchplay lib/games/gamePayload lib/cup/getCupSnapshot lib/games/scorecardLayout` (nye + regresjon)
- [ ] `npm run lint`
- [ ] `.githooks/pre-commit` ingen humanizer-advarsler på nye norske strenger
- [ ] `.githooks/commit-msg` passerer på `feat(cup): greensome matchplay …` med bump + CHANGELOG
- [ ] **Migrasjon mot prod: UTSATT til post-deploy** (format-seed-migrasjoner kjøres ETTER kode-deploy — wizard/cup-grid er DB-drevet, seeding før deploy viser et ødelagt kort). Rekkefølge: merge PR → main deployer → `apply_migration 0058` via Supabase MCP + `execute_sql`-verifisering (raden finnes, is_active=true) + regenerer `database.types.ts`.
- [ ] Manuell røyk-test på Vercel-preview (best-effort): opprett cup → greensome-match → spill 5-7 hull → cup-leaderboard speiler riktig + viser «Greensome».

## Files Likely Touched

**Nye:**
- `supabase/migrations/0058_greensome_matchplay.sql`
- `lib/scoring/modes/greensomeMatchplay.ts` + `greensomeMatchplay.test.ts`
- `lib/games/validators/greensomeMatchplay.ts` (hvis foursomes-validatoren ligger der) + test

**Scoring/typer:** `lib/scoring/modes/types.ts` (GameMode, MODE_LABELS, GameModeConfig, isAlternateShotMatchplay), `lib/scoring/index.ts` (router + eksport). Evt. `foursomesMatchplay.ts` (parametrisering hvis valgt).

**Validator:** `lib/games/gamePayload.ts` (parseGameMode, modeValidators, allowance-parse).

**Spill-flater:** `app/games/[id]/leaderboard/page.tsx`, `app/games/[id]/page.tsx`, `app/games/[id]/holes/[holeNumber]/page.tsx` (+ HoleClient), `scorecard/page.tsx`, `submit/page.tsx`, foursomes-view/podium-komponent (`formatLabel`-prop).

**Cup:** `lib/cup/getCupSnapshot.ts`, `lib/cup/actions.ts`, `app/admin/cup/[id]/page.tsx` (verifiser auto-knapp), `app/cup/[id]/page.tsx`.

**Wizard:** `app/admin/games/new/TeamSizeSelector.tsx`, `sections/ReadyStep.tsx`, `GameWizard.tsx`, `GameForm.tsx`, `useGameFormState.ts`, `CupSetup.tsx` (+ tester).

**Layout/mail/helpers:** `lib/games/scorecardLayout.ts`, `gameFinishedNotification.ts`, `gameFinishedRecipients.ts`, `lib/formats/modeGuide.ts`, `lib/games/allowanceCopy.ts`, `lib/formats/icons.tsx`, `app/spillformer/page.tsx`.

**Versjon:** `package.json` (1.54.0), `CHANGELOG.md`, `lib/database.types.ts`.

## Out of Scope

- **Chapman/Pinehurst ([#290](https://github.com/jdlarssen/golf-app/issues/290)), Gruesome ([#291](https://github.com/jdlarssen/golf-app/issues/291))** — egne kontrakter.
- **Tee-shot-velger / enkeltslag-tracking** — bevisst utelatt (bruker bekreftet rent scorekort; appen lagrer ikke enkeltslag).
- **Greensome stableford / greensome solo strokeplay** — kun matchplay-varianten.
- **Egen Greensome result-`kind` / egne view-komponenter** — gjenbruker foursomes.
- **Validering av faktisk velg-beste-tee-mønster i ekte spill** — honor-system, kun lag-scoren lagres.
- **Concessions, live-streaming, statistikk på tvers** — som foursomes out-of-scope.
- **Allowed-formats-filter på cup-detalj** (skjul knapp hvis admin un-checket greensome) — samme follow-up som foursomes/fourball.
