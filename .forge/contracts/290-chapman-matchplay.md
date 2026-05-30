# Spec: Chapman matchplay — dobbel tee + bytt + velg + alternate

Issue: [#290](https://github.com/jdlarssen/golf-app/issues/290)
Epic: [#270](https://github.com/jdlarssen/golf-app/issues/270) (parallell format-utbygging)
Avhengighet: F1 [#271](https://github.com/jdlarssen/golf-app/issues/271) (formats-katalog) — levert (migrasjon 0047).
Familie: alternate-shot, andre format etter Foursomes [#218] (migrasjon 0048 navnga #290 eksplisitt som adopter av mønsteret).

## Problem

Tørny har Foursomes matchplay (2v2 alternate shot, én ball per lag). **Chapman** (også kjent som **Pinehurst**) er den 2v2-varianten klubbspillere kjenner der begge slår ut, bytter ball, velger beste, og spiller annenhver derfra. Vi vil tilby Chapman som eget gjenkjennbart Cup-format uten å duplisere matchplay-maskineriet — på samme måte som Ambrose gjenbruker Texas scramble.

## Scope-beslutning (avvik fra issue) ⚠️

Issue-en ber om å seede **to** format-rows (Chapman + Pinehurst, samme modul). **Research bekrefter at Chapman og Pinehurst er nøyaktig samme format** — to navn på samme spill (USGA-regelsiden heter «Chapman or Pinehurst», identisk 60/40-handicap; «Pinehurst» kommer fra resorten der ekteparet Chapman introduserte spillet på 1950-tallet). To identiske moduser ville vært ren duplisering (to format-kort, to MODE_GUIDE-entries, to migrasjons-rows, dobbel exhaustive-switch-flate) uten funksjonell forskjell.

**Bruker (Jørgen) bekreftet:** bygg **ÉN modus**, navngitt **«Chapman»**. «Også kjent som Pinehurst» nevnes i forklaringsteksten (SPILLFORM-kort + short_description) så folk finner formatet uansett navn. Kun `chapman_matchplay` seedes — ingen `pinehurst_matchplay`.

## Research findings

Søk gjennomført mai 2026. Kilder: [USGA RoH (Chapman or Pinehurst)](https://www.usga.org/content/usga/home-page/handicapping/roh/Content/rules/Committee%20Content/USGA/LG_R7h4.htm), [golfhandicapcalculator.co](https://golfhandicapcalculator.co/chapman-pinehurst-rules-whs-60-40/), [Golf Compendium](https://www.golfcompendium.com/2022/08/chapman-system-golf-format.html).

- **Mekanikk:** Begge partnere slår ut på hvert hull. Hver spiller slår partnerens ball som andreslag (bytt/swap). Etter de to andreslagene velges den beste ballen, og laget spiller annenhver derfra til hullet er i mål. Spilleren hvis ball IKKE ble valgt slår tredjeslaget.
- **Handicap (WHS):** Lag-handicap = **60 % av laveste Course Handicap + 40 % av høyeste**. Eks: HCP 10 + 20 → (10 × 0,6) + (20 × 0,4) = 14. (Samme allowance som Greensome.)
- **For scoring:** Resultatet på hvert hull er ÉN lag-gross-score (etter swap/velg/alternate). Appen lagrer/regner derfor identisk med Foursomes — bytt/velg/alternate er on-course-veiledning, ikke noe appen sporer slag-for-slag.

## Prior decisions (carry forward)

- **Ambrose-mønsteret (#284):** en ny `game_mode` kan returnere et *eksisterende* result-`kind` fra `compute()` slik at all leaderboard-/podium-/mail-/scorekort-visning gjenbrukes uendret. Chapman følger dette: `chapmanMatchplay.compute()` returnerer `kind: 'foursomes_matchplay'`.
- **`isScrambleFamily`-helper (`types.ts:72`, #284)** brukes for `game_mode`-baserte routing-sjekker. Chapman introduserer parallellen `isFoursomesFamily(mode)` (true for `foursomes_matchplay | chapman_matchplay`).
- **Foursomes-storage (#218):** lag-kaptein (lex-min userId via `pickTeamCaptain`) eier scores-radene; non-captain skriver til samme rad via UI-routing. Gjenbrukes 1:1.
- **Datadreven format-registrering (F1, 0047):** nytt format = INSERT i `public.formats`. Ingen `games_mode_check`-CHECK lenger — `gamePayload.ts`-validering er gaten. Cup-only matchplay-formater (foursomes, fourball) har **ingen** `format_intent_mapping`-row (kun tilgjengelig via cup-create-flow). Chapman speiler dette.
- **Format-seed migrasjoner appliseres POST-deploy** (memory): wizard-grid er DB-drevet; seeding FØR koden er deployet viser et ødelagt kort. Merge → deploy → DERETTER `apply_migration` via Supabase MCP.

## Design

### 1. Handicap-modell & config

Chapman skiller seg fra Foursomes på ÉN ting: hvordan en sides lag-handicap regnes.

- **Foursomes:** sideHcp = `combined` (sum av begge partneres CH); diff-allowance default 50 % (folder WHS-50%-av-combined inn i pct).
- **Chapman:** sideHcp = `round(0,6 × min(ch1,ch2) + 0,4 × max(ch1,ch2))` (60/40-allowance på side-nivå); matchplay gir 100 % av differansen mellom de to sidenes 60/40-handicap til høylaget. **Default allowance_pct = 100** (full diff etter 60/40-reduksjonen). Justerbar 0..100; **0 = brutto** (gross-only matchplay).

`GameModeConfig`-variant (mirror foursomes, ny `kind`, etter foursomes-blokken `types.ts:156-170`):

```ts
| {
    kind: 'chapman_matchplay';
    team_size: 2;
    teams_count: 2;
    /** HCP-allowance for Chapman matchplay (0..100). Default = 100 (full diff).
     *  Side-handicap = round(0.6×low + 0.4×high) (60/40 WHS-Chapman); høylaget
     *  får round(|side1Hcp − side2Hcp| × allowance_pct/100) strokes via SI.
     *  0 = brutto. Scoring-laget faller defensivt tilbake til 100. */
    allowance_pct: number;
  }
```

Utvid `GameMode`-union (`types.ts:5-21`) med `'chapman_matchplay'`, `MODE_LABELS` med `chapman_matchplay: 'Chapman'`.

### 2. Scoring-engine (`lib/scoring/modes/chapmanMatchplay.ts` + refactor av `foursomesMatchplay.ts`)

Ekstrahér en delt kjerne i `foursomesMatchplay.ts` slik at side-handicap-strategien kommer inn som parameter:

```ts
// foursomesMatchplay.ts
export type SideHandicapFn = (ch1: number, ch2: number) => number;
export const combinedSideHandicap: SideHandicapFn = (a, b) => a + b;            // foursomes
export const chapmanSideHandicap: SideHandicapFn = (a, b) =>                    // chapman
  Math.round(0.6 * Math.min(a, b) + 0.4 * Math.max(a, b));

// dagens body, parameterisert på sideHcp-fn + result-kind. combinedCourseHandicap
// settes til sideHcp-output (sum for foursomes, 60/40-verdi for chapman).
export function computeFoursomesCore(
  ctx: ScoringContext, allowancePct: number, sideHcp: SideHandicapFn,
): FoursomesMatchplayResult { /* ... */ }

export function compute(ctx: ScoringContext): FoursomesMatchplayResult {
  return computeFoursomesCore(ctx, readAllowancePct(ctx), combinedSideHandicap);
}
```

```ts
// chapmanMatchplay.ts (ny)
import { computeFoursomesCore, chapmanSideHandicap } from './foursomesMatchplay';
export function compute(ctx: ScoringContext): FoursomesMatchplayResult {
  const pct = ctx.game.mode_config.kind === 'chapman_matchplay'
    ? ctx.game.mode_config.allowance_pct : 100;
  return computeFoursomesCore(ctx, pct, chapmanSideHandicap);
  // returnerer kind: 'foursomes_matchplay' → all visning gjenbrukes
}
```

Router (`lib/scoring/index.ts:56`): ny `case 'chapman_matchplay': return chapmanMatchplay.compute(ctx);` + import.

**Per-hull SI-allokering** (heltalls-strokes) beholdes som overalt ellers — side-handicapet rundes før diff (WHS: rund hver sides playing handicap, så ta differansen). Ingen fraksjonell total-subtraksjon.

### 3. `isFoursomesFamily`-helper

Ny i `types.ts` (etter `isScrambleFamily`, linje 74), eksportert via `index.ts:81`:

```ts
export function isFoursomesFamily(mode: GameMode): boolean {
  return mode === 'foursomes_matchplay' || mode === 'chapman_matchplay';
}
```

Bruk på `game_mode`-baserte routing-/struktur-sjekker (leaderboard-render, scorecard-layout, mail-path, cup-display, game-home lag-grid). **Behold mode-spesifikke greiner** der oppførsel avviker: (a) tee-starter-banner (kun foursomes), (b) Chapman-phase-stripe (kun chapman), (c) allowance-copy/default.

### 4. Validator (`lib/games/gamePayload.ts`)

- `parseGameMode` (~linje 240): legg til `raw === 'chapman_matchplay'`.
- Ny `validateChapmanMatchplay` — kopi av `validateFoursomesMatchplay` (linje 975) med: `kind: 'chapman_matchplay'`, leser `chapman_allowance_pct` via ny `parseChapmanAllowancePct` (heltall 0..100, default 100), samme 2+2 team-balance-regler, `flight_number = team_number`.
- `modeValidators`-Record (linje 1559): `chapman_matchplay: validateChapmanMatchplay`.

### 5. Migrasjon (`supabase/migrations/0058_chapman_matchplay.sql`)

Mal: 0048_foursomes_matchplay.sql. **Applisert POST-deploy** via Supabase MCP. Verifiser at 0057_ambrose er siste appliserte baseline før nummerering.

```sql
-- Format-row: cup-eligible, ingen intent-mapping (cup-only, som foursomes)
insert into public.formats (slug, display_name, icon_key, short_description, scoring_module, is_active, is_cup_eligible) values
  ('chapman_matchplay', 'Chapman', 'chapman_matchplay',
   '<norsk: 2v2. Begge slår ut, bytt ball, velg beste, spill annenhver. Også kjent som Pinehurst. — humanizer>',
   '@/lib/scoring/modes/chapmanMatchplay', true, true);

-- Cup-level allowance default (WHS Chapman: full diff etter 60/40 = 100)
alter table public.tournaments
  add column chapman_allowance_pct smallint not null default 100
    check (chapman_allowance_pct between 0 and 100);
comment on column public.tournaments.chapman_allowance_pct is
  'Handicap-allowance for Chapman-matches i cupen. Side-HCP = 60% lav + 40% høy; '
  '100 = full differanse (WHS-standard), 0 = brutto. Pre-fyller wizard.';
```

Ingen `chapman_side*_tee_starter`-kolonner (Chapman har ingen tee-starter — begge slår ut hvert hull).

### 6. Cup-flyt (Chapman er cup-only, speiler foursomes)

- `app/admin/cup/[id]/page.tsx`: ny «+ Chapman match»-knapp etter foursomes-knappen (linker `?intent=cup&...&game_mode=chapman_matchplay`). Oppdater match-result-team-navn-sjekkene (linje ~249/255) med `|| m.gameMode === 'chapman_matchplay'`.
- `app/cup/[id]/page.tsx`: oppdater team-navn-sjekkene (linje ~152/158) med chapman.
- `app/admin/games/new/page.tsx`: `CupGameMode`-union + parse-guard + `loadCupContext` (select `chapman_allowance_pct`) + `CupContext.chapmanAllowancePct` + `buildCupInitialValues` chapman-grein.
- `GameForm.tsx` + `useGameFormState.ts`: `chapman_allowance_pct` InitialValue + state + hidden input (mirror foursomes-blokken) + allowance-felt-UI (gjenbruk `AllowanceField`/foursomes-grein, default 100).
- `lib/cup/getCupSnapshot.ts`: ny chapman-grein (mirror foursomes ~linje 324-361) — bygg ScoringContext m. `kind:'chapman_matchplay'`, kall `chapmanMatchplay.compute`. Legg `'chapman_matchplay'` i mode-union (~378).
- `lib/cup/computeCupLeaderboard.ts`: utvid `gameMode`-union (linje 31) med `'chapman_matchplay'`.
- `CupSetup.tsx` multi-select er DB-drevet (`getCupEligibleFormats`) → Chapman dukker opp automatisk.

### 7. Scorekort / hull-page-veiledning

- **Tee-starter-banner SKRUS AV for chapman:** `app/games/[id]/holes/[holeNumber]/page.tsx:103` — `isFoursomes` forblir `=== 'foursomes_matchplay'` (IKKE family). Tee-starter-slot (linje ~511-547) og `foursomesActions.ts`-guarden (linje 76) forblir foursomes-only. Begrunnelse: i Chapman slår begge ut hvert hull.
- **Chapman-phase-stripe (ny, lett):** kompakt statisk påminnelse øverst på hver hull-side for `chapman_matchplay`: «Begge slår ut → bytt ball → velg beste → spill annenhver». Ny liten komponent (f.eks. `components/ChapmanPhaseReminder.tsx`) eller inline. Mobile-first, respekterer `prefers-reduced-motion` (statisk, så trivielt). Norsk copy → humanizer.
- **Scorekort-struktur:** `lib/games/scorecardLayout.ts` + `scorecardTitle.ts` — rut chapman gjennom foursomes-grenen via `isFoursomesFamily` (samme «Match-scorekort», én ball per lag, lag-grid).
- **Leaderboard:** `app/games/[id]/leaderboard/page.tsx` — rut `isFoursomesFamily(game_mode)` til foursomes-render. `formatLabel: MODE_LABELS[game.game_mode]` (linje 385) sender allerede riktig label → leaderboard viser «Chapman» uendret.

### 8. Mail — gjenbruk foursomes-path

`gameFinishedNotification.ts` + `gameFinishedRecipients.ts` gates på `game_mode`. Rut `chapman_matchplay` gjennom samme matchplay-grein som foursomes via `isFoursomesFamily`. Ingen ny mail-variant, ingen ny snapshot (gjenbruk per test-disiplin Type B).

### 9. Oppdagbarhet / copy

- `lib/formats/modeGuide.ts`: ny `chapman_matchplay`-entry (`Record<GameMode>` → tsc tvinger den). Summary + de 4 fasene som `points`. Nevn «også kjent som Pinehurst».
- `lib/formats/icons.tsx`: map `'chapman_matchplay'` → ikon (gjenbruk foursomes-ikon eller distinkt — Claude's discretion).
- `lib/games/allowanceCopy.ts`: chapman-grein (forklarer 60/40 + default 100, 0=brutto).
- `lib/games/formatLabel.ts`: chapman-grein om nødvendig (ellers MODE_LABELS dekker).
- `app/spillformer/page.tsx`: Chapman i format-oversikten (drives av MODE_GUIDE/MODE_LABELS).

### 10. Norsk copy — humanizer-pass (før commit)

short_description, phase-stripe-tekst, modeGuide-entry, allowanceCopy, evt. cup-knapp-tekst. Kjør `humanizer:humanizer`-skill.

## Edge cases & guardrails

- **`allowance_pct = 0`:** gyldig — brutto Chapman matchplay (laveste lag-gross vinner hullet).
- **Ulike combined men like 60/40-side-HCP:** teamDiff = 0 → begge sider 0 strokes (gross-matchplay på det hullet-settet). Deterministisk highSideNumber-default (som foursomes).
- **Feil antall spillere (ikke 2+2):** scoring-laget returnerer defensiv empty shell (mirror foursomes `placeholderSides`); validatoren håndhever 2+2 ved publish.
- **Avrunding:** side-HCP rundes (`Math.round(0.6×low + 0.4×high)`) FØR diff — konsistent med WHS (rund playing handicap, så diff). Per-hull SI-allokering på heltall.
- **Defensiv fallback:** `chapman.compute` med feil `mode_config.kind` → pct 100 (mirror foursomes-fallback).
- **Tee-starter-kolonner:** Chapman bruker dem ikke; foursomes-only-gating sikrer at banneret ikke lekker inn.
- **Legacy/ukjent mode i MODE_GUIDE/MODE_LABELS:** typen er total (`Record<GameMode>`) → tsc fanger manglende entry.

## Key decisions

- **ÉN modus «Chapman», ikke to** — Chapman ≡ Pinehurst (research + bruker bekreftet). Avvik fra issue dokumentert over.
- **Kanonisk 60/40 side-handicap** (WHS Chapman), default matchplay-diff 100 %, justerbar 0..100, 0 = brutto. (Domene-fakta avgjort ved research, som Ambrose ÷2N.)
- **`compute()` returnerer `kind: 'foursomes_matchplay'`** (Ambrose-mønsteret) → all leaderboard/podium/mail/scorekort gjenbrukes; ingen nye view-komponenter.
- **`isFoursomesFamily`-helper** for struktur-gating; mode-spesifikke greiner for tee-starter (foursomes) og phase-stripe (chapman).
- **Cup-only** (is_cup_eligible=true, ingen intent-mapping) — speiler foursomes/fourball.
- **Phase-stripe på hull-siden** (bruker valgte «kort stripe») + MODE_GUIDE-kort på spill-siden. Tee-starter-banner skrus av (begge slår ut).
- **Egen `tournaments.chapman_allowance_pct`-kolonne** (default 100) — speiler per-format-allowance-mønsteret (foursomes 50, fourball 85).

**Claude's Discretion:**
- Ikon-valg for `'chapman_matchplay'` (gjenbruk foursomes vs distinkt).
- Om phase-stripe er egen komponent vs inline.
- Eksakt norsk ordlyd (humanizer avgjør).
- `sort_order`/plassering av «+ Chapman»-knapp blant cup-match-knappene.
- Om `combinedCourseHandicap`-feltet for chapman holder 60/40-verdien (anbefalt) vs sum, og hvordan foursomes-viewet labler det.

## Success criteria

- [ ] `chapmanMatchplay.compute(ctx)` returnerer `kind: 'foursomes_matchplay'` og `computeLeaderboard` ruter `game_mode==='chapman_matchplay'` dit. **Verifiser:** `lib/scoring/index.ts` har `case 'chapman_matchplay'`; chapman-test «returnerer kind foursomes_matchplay» grønn.
- [ ] Type A: `chapmanSideHandicap(10,20)===14`; høylaget får riktig strokes ved 100 % default; `allowance_pct=0` → brutto (0 strokes). **Verifiser:** `npx vitest run lib/scoring/modes/chapmanMatchplay` grønn.
- [ ] `foursomesMatchplay.compute` gir uendret resultat etter `computeFoursomesCore`-ekstraksjonen (ingen regresjon). **Verifiser:** `npx vitest run lib/scoring/modes/foursomesMatchplay` grønn.
- [ ] `validateChapmanMatchplay` produserer `mode_config {kind:'chapman_matchplay', allowance_pct, team_size:2, teams_count:2}`; avviser ikke-2+2 og pct utenfor 0..100. **Verifiser:** `npx vitest run lib/games/gamePayload` (ny chapman-blokk) grønn.
- [ ] Migrasjon 0058 skrevet (format-row is_cup_eligible=true + `chapman_allowance_pct`-kolonne) — **applisert POST-deploy** via Supabase MCP, ikke før merge. **Verifiser:** fil finnes + matcher 0048-mal; (post-deploy) `execute_sql` viser raden, is_active=true.
- [ ] Admin kan opprette et Chapman-spill i en cup; det vises med label «Chapman» og foursomes-leaderboard (én ball/lag, match-resultat). **Verifiser:** «+ Chapman»-knapp + `validateChapmanMatchplay` + `isFoursomesFamily`-routing; `npm run build` grønn. Visuell smoke via evaluator/preview.
- [ ] Hull-siden viser Chapman-phase-stripe (de 4 fasene) for chapman_matchplay, og IKKE tee-starter-banneret. **Verifiser:** komponent rendres gated på `chapman_matchplay`; tee-slot gated på `=== 'foursomes_matchplay'`. Type C render-test (data-testid).
- [ ] `npm run build` (tsc) grønn — alle exhaustive switches/Records dekker `'chapman_matchplay'`. **Verifiser:** `npm run build`.
- [ ] Versjons-bump 1.53.0 → 1.54.0 (minor) + CHANGELOG-oppføring i den bruker-synlige `feat`-commiten.

## Gates (etter hver chunk)

- [ ] `npm run build` (tsc — fanger manglende exhaustive-switch-cases; per memory IKKE bare scoped `tsc`)
- [ ] `npx vitest run lib/scoring/modes/chapmanMatchplay lib/scoring/modes/foursomesMatchplay` (engine + regresjon)
- [ ] `npx vitest run lib/games/gamePayload` (validator)
- [ ] Type C render-test for phase-stripe (komponent)
- [ ] `npm test` (full suite) før PR-merge
- [ ] `humanizer:humanizer` på alle nye norske strenger
- [ ] `.githooks/commit-msg` aksepterer commits (bump+CHANGELOG på feat); worktree `core.hooksPath` verifisert
- [ ] Playwright/Preview-smoke (frontend touched, mandatory for evaluator): opprett Chapman-match i cup + tast et hull, se phase-stripe + leaderboard-label «Chapman»

## Files likely touched

**Nye:** `lib/scoring/modes/chapmanMatchplay.ts`, `lib/scoring/modes/chapmanMatchplay.test.ts`, `components/ChapmanPhaseReminder.tsx` (+ test), `supabase/migrations/0058_chapman_matchplay.sql`.

**Scoring/typer:** `lib/scoring/modes/types.ts` (GameMode, MODE_LABELS, GameModeConfig, isFoursomesFamily), `lib/scoring/modes/foursomesMatchplay.ts` (ekstrahér computeFoursomesCore), `lib/scoring/index.ts` (router-case + eksport).

**Validator:** `lib/games/gamePayload.ts` (parseGameMode, validateChapmanMatchplay, parseChapmanAllowancePct, modeValidators).

**Cup-flyt:** `app/admin/cup/[id]/page.tsx`, `app/cup/[id]/page.tsx`, `app/admin/games/new/page.tsx`, `GameForm.tsx`, `useGameFormState.ts`, `lib/cup/getCupSnapshot.ts`, `lib/cup/computeCupLeaderboard.ts`.

**Spill-flater:** `app/games/[id]/leaderboard/page.tsx`, `app/games/[id]/holes/[holeNumber]/page.tsx` (+ `HoleClient.tsx` ved behov), `lib/games/scorecardLayout.ts`, `scorecardTitle.ts`.

**Mail:** `gameFinishedNotification.ts`, `gameFinishedRecipients.ts`.

**Oppdagbarhet/copy:** `lib/formats/modeGuide.ts`, `lib/formats/icons.tsx`, `lib/games/allowanceCopy.ts`, `lib/games/formatLabel.ts`, `app/spillformer/page.tsx`.

**Versjon:** `package.json` (1.54.0), `CHANGELOG.md`.

## Out of scope

- **Pinehurst som egen modus** — droppet (≡ Chapman; bruker bekreftet).
- **Egen Chapman result-`kind` / egne view/podium-komponenter** — gjenbruker Foursomes.
- **Greensome (#289) / Gruesome (#291)** — egne issues/moduser i samme familie.
- **Standalone (ikke-cup) Chapman-create** — kun cup per issue (speiler foursomes); trivielt å legge til intent-mapping senere.
- **Drive-/swap-/select-håndhevelse** — honor-system (appen sporer ikke slag).
- **«Purist» fraksjonell total-subtraksjon** av lag-HCP — Tørny bruker per-hull SI-allokering konsekvent.
