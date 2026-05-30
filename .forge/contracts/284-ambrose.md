# Spec: Ambrose — net scramble med team-handicap

Issue: [#284](https://github.com/jdlarssen/golf-app/issues/284)
Epic: [#270](https://github.com/jdlarssen/golf-app/issues/270) (parallell format-utbygging)
Avhengighet: F1 [#271](https://github.com/jdlarssen/golf-app/issues/271) (formats-katalog) — levert (migrasjon 0047).

## Problem

Tørny har Texas scramble (lag spiller én ball, beste slag velges) med NGF-aggregat-handicap. **Ambrose** er den australske/newzealandske scramble-varianten som klubbspillere kjenner under det navnet — mekanisk identisk med Texas scramble, men med en annen, fast lag-handicap-konvensjon (summen av spille-HCP delt på 2 × lagstørrelse). Vi vil tilby Ambrose som eget gjenkjennbart format i wizarden, primært for klubb-turneringer, uten å duplisere scramble-maskineriet.

## Research findings

Søk gjennomført mai 2026. Kanonisk Ambrose-lag-handicap = **summen av spillernes handicap ÷ (2 × antall spillere)**:

- **2-spiller**: combined ÷ 4 (= 25 %)
- **3-spiller**: combined ÷ 6 (= 16,67 %) — ikke i scope (se Texas-presedens, 3-mannslag utsatt)
- **4-spiller**: combined ÷ 8 (= 12,5 %)
- Eksempel: 4-spiller-lag med HCP 8+14+22+30 = 74 → 74 ÷ 8 = 9,25 ≈ 9 slag.
- Kilder: [golfhandicapcalculator.co](https://golfhandicapcalculator.co/ambrose-golf-rules-team-handicap/), [Golf Compendium](https://www.golfcompendium.com/2024/02/ambrose-scramble-format-handicap.html), [Bardwell Valley GC](https://bardwellvalleygolf.com.au/the-ambrose-golf-game-system-invented-by-richard-ambrose/).

⚠️ **Issue-teksten oppgir formelen feil** («÷4 for 4-spiller, ÷6 for 2-spiller»). ÷6 er egentlig 3-spiller-divisoren, og 2/4-tilordningen er byttet om. Bruker har bekreftet at vi følger **standard Ambrose** (avgjort i kontrakt-diskusjon), ikke issue-tallene.

Som Texas scramble er Ambrose **ikke handicaptellende** mot WHS — ren konkurranse-modus.

## Prior decisions (carry forward)

- **Modified Stableford-mønsteret** (`modifiedStableford.ts`, #281): en ny `game_mode` kan returnere et *eksisterende* result-`kind` fra `compute()` slik at all leaderboard-/podium-/mail-visning gjenbrukes uendret. Ambrose følger dette: `ambrose.compute()` returnerer `kind: 'texas_scramble'`.
- **`isStablefordFamily(mode)`-helper** (`types.ts:50`) brukes på ~18 call-sites for å rute to game_modes gjennom felles UI/scorekort/leaderboard-logikk. Ambrose introduserer den parallelle `isScrambleFamily(mode)` (true for `texas_scramble | ambrose`).
- **Formats-katalog er datadreven** (F1, migrasjon 0047): nytt format = INSERT i `public.formats` + `public.format_intent_mapping`. INGEN `games_mode_check`-CHECK lenger (droppet i 0047) — server-action-validering (`gamePayload.ts`) er gaten. Se 0054_nines.sql for malen.
- **Scramble-storage** (#44): lag-kaptein (lex-min userId via `pickTeamCaptain`) eier scores-radene; alle lag-medlemmer kan taste; tap skriver til kaptein-raden. Gjenbrukes 1:1 — Ambrose endrer ingenting her.
- **`team_handicap_pct` på `mode_config`** (ikke `games.hcp_allowance_pct`): scramble-handicap-prosenten ligger i mode_config. Validator setter `hcp_allowance_pct=100` (no-op) for scramble-modi.

## Design

### 1. Formel & config

Bruker valgte **justerbar prosent** (Ambrose-reglene er ikke strengt regelbundet — det er en klubb-konvensjon, så admin kan justere). Ambrose gjenbruker derfor Texas' `team_handicap_pct`-mekanisme, men med **Ambrose-formelen som default**:

```
ambroseDefaultPct(teamSize) = 100 / (2 × teamSize)
  → teamSize 2: 25
  → teamSize 4: 12.5
```

`GameModeConfig`-variant (samme shape som texas, ny `kind`):

```ts
| {
    kind: 'ambrose';
    team_size: 2 | 4;
    teams_count: number;
    /** Prosent av summert lag-HCP = effektivt lag-handicap. Default via
     *  ambroseDefaultPct: 25 (2-mann) / 12.5 (4-mann). 0–100, justerbar.
     *  0 = brutto-scramble, 100 = full sum. Kan være fraksjonell (12.5). */
    team_handicap_pct: number;
  }
```

Utvid `GameMode`-union med `'ambrose'`, `MODE_LABELS` med `ambrose: 'Ambrose'`.

⚠️ **Fraksjonell prosent**: 4-mann-default (12,5 %) er ikke heltall. Texas' `parseTexasHandicapPct` krever `Number.isInteger`. Ambrose trenger en parse som tillater én desimal (0–100, step 0.5). Builder: lag `parseAmbroseHandicapPct` (kopi av texas-varianten uten heltall-kravet) ELLER generaliser den delte helperen — IKKE bryt Texas' heltall-oppførsel. `AllowanceField`-komponenten må kunne rendre/ta imot en desimal-default; verifiser og juster minimalt om nødvendig.

### 2. Scoring-engine (`lib/scoring/modes/ambrose.ts` + refactor av `texasScramble.ts`)

Ekstrahér den delte scramble-kjernen i `texasScramble.ts` slik at handicap-prosenten kommer inn som parameter:

```ts
// texasScramble.ts
export function computeScramble(ctx: ScoringContext, handicapPct: number): TexasScrambleResult { /* dagens body, pct fra param */ }
export function compute(ctx: ScoringContext): TexasScrambleResult {
  const pct = ctx.game.mode_config.kind === 'texas_scramble' ? ctx.game.mode_config.team_handicap_pct : 0;
  return computeScramble(ctx, pct);
}
```

```ts
// ambrose.ts (ny)
import { computeScramble } from './texasScramble';
export function ambroseDefaultPct(teamSize: 2 | 4): number { return 100 / (2 * teamSize); }
export function compute(ctx: ScoringContext): TexasScrambleResult {
  const pct = ctx.game.mode_config.kind === 'ambrose' ? ctx.game.mode_config.team_handicap_pct : 0;
  return computeScramble(ctx, pct); // returnerer kind: 'texas_scramble' → all visning gjenbrukes
}
```

Router (`lib/scoring/index.ts`): ny `case 'ambrose': return ambrose.compute(ctx);`. Eksportér `ambroseDefaultPct` via index for form/validator-bruk.

`team_handicap_pct` kan nå være fraksjonell — `Math.round((combinedCH × pct) / 100)` håndterer 12,5 % korrekt (74 × 0,125 = 9,25 → 9), matematisk identisk med ÷8.

### 3. `isScrambleFamily`-helper

Ny i `types.ts`, eksportert via `index.ts`:

```ts
export function isScrambleFamily(mode: GameMode): boolean {
  return mode === 'texas_scramble' || mode === 'ambrose';
}
```

Bruk denne på call-sites som ruter scramble-STRUKTUR (én ball per lag, lag-grid, lag-card-rendering, leaderboard-view-valg, mail-path). **Behold mode-spesifikke greiner** der default/copy avviker (default-pct: texas 4-mann 10 % vs ambrose 12,5 %; format-label; helper-tekst).

### 4. Validator (`lib/games/gamePayload.ts`)

- `parseGameMode` (linje ~228): legg til `raw === 'ambrose'` i discriminator-listen.
- Ny `validateAmbrose` — kopi av `validateTexasScramble` med: `kind: 'ambrose'`, leser `ambrose_team_size` + `ambrose_team_handicap_pct` (fraksjonell parse), samme team-balance/bad_team/min_players-regler, `flight_number = team_number`, `hcp_allowance_pct=100` no-op.
- `modeValidators`-Record (linje ~1266): `ambrose: validateAmbrose`.

### 5. Migrasjon (`supabase/migrations/0055_ambrose.sql`)

Mal: 0054_nines.sql. Format-row + intent-mapping. Ingen CHECK-endring.

```sql
insert into public.formats (slug, display_name, icon_key, short_description, scoring_module, is_active, is_cup_eligible)
values ('ambrose', 'Ambrose', 'ambrose', '<norsk beskrivelse — humanizer>', '@/lib/scoring/modes/ambrose', true, false);

insert into public.format_intent_mapping (format_slug, intent, is_visible, is_primary, sort_order)
values ('ambrose', 'klubb', true, false, 35); -- sekundær under Klubb, ved siden av texas_scramble (sort_order Claude's discretion)
```

Appliseres mot prod via Supabase MCP (`apply_migration`) + verifiseres med `execute_sql` (raden finnes, is_active=true).

### 6. Admin-form

Speil Texas-greinen i: `ModeSelector.tsx` (ny tile «Ambrose»), `TeamSizeSelector.tsx` (`ENABLED_COMBOS.ambrose = new Set([2,4])`), `GameForm.tsx` + `GameWizard.tsx` (`isAmbrose`-flagg, lag-handicap-felt med default `ambroseDefaultPct(teamSize)` + fraksjonell støtte, `requiresTeams=true`, payload-grein med `flight=team`), `useGameFormState.ts` (ambrose state-init), `sections/*` (PlayersSection/ReadyStep/TeamsAssignmentSection — speil texas), `[id]/edit/page.tsx` (mode_config → form-felt-mapping for ambrose).

Default-pct og helper-tekst er ambrose-spesifikke (12,5 % for 4-mann, ikke NGF 10 %). Bruk `isScrambleFamily` for struktur-gating, men hold `isAmbrose`/`isTexas` der default/copy avviker.

### 7. Leaderboard / hull-page / game-home / scorecard — gjenbruk via family

Siden `ambrose.compute()` returnerer `kind: 'texas_scramble'`, gjenbrukes `TexasScrambleView.tsx` + `TexasScramblePodium.tsx` uendret (de viser allerede brutto + team-HCP + netto). Ruting gates på `game_mode`, så bytt til `isScrambleFamily` i:
- `app/games/[id]/leaderboard/page.tsx` (mode-switch → `renderTexasScramble`)
- `app/games/[id]/holes/[holeNumber]/page.tsx` + `HoleClient.tsx` (lag-card per lag; team-HCP-kommentar/utregning leser pct generisk for begge kinds)
- `app/games/[id]/page.tsx` (game-home: lag-grid, «Format: Ambrose» via MODE_LABELS)
- `app/games/[id]/scorecard/page.tsx` + `submit/page.tsx` (scramble-scorekort-layout)
- `lib/games/scorecardLayout.ts` (linje 136: `cfg.kind === 'texas_scramble'` → inkluder `'ambrose'`) + `scorecardTitle.ts` + `registration.ts` (team-basert selvpåmelding)

### 8. Mail — gjenbruk Texas-path

`gameFinishedNotification.ts` + `gameFinishedRecipients.ts` gates på `game_mode`. Rut `'ambrose'` gjennom samme scramble-grein som texas (body «Laget endte på X. plass av N lag …» er format-agnostisk). Bruk `isScrambleFamily`. Ingen ny mail-variant, ingen ny snapshot (gjenbruker texas-template → unngår duplikat per test-disiplin Type B).

### 9. Format-helpers / oppdagbarhet

- `lib/formats/icons.tsx`: map `'ambrose'` → ikon (gjenbruk texas scramble-ikonet, eller distinkt lucide-ikon — Claude's discretion).
- `lib/formats/modeGuide.ts`: ny Ambrose-guide-oppføring (norsk forklaring, humanizer).
- `lib/games/formatLabel.ts` + `lib/games/allowanceCopy.ts`: ambrose-grein (allowance-copy forklarer Ambrose-formelen, default 25/12,5 %).
- `app/spillformer/page.tsx`: Ambrose i format-oversikten.

### 10. Norsk copy — humanizer-pass (før commit)

ModeSelector tile-tekst, format short_description, lag-handicap helper-tekst (12,5 %-default-forklaring), modeGuide-oppføring, allowanceCopy. Kjør `humanizer:humanizer`-skill.

## Edge cases & guardrails

- **`team_handicap_pct = 0`**: gyldig — brutto-scramble (laveste lag-gross vinner). 
- **`team_handicap_pct = 12.5`**: fraksjonell default for 4-mann; engine runder team-handicap til heltall via `Math.round` (per-hull SI-allokering krever heltall — konsistent med all annen netto-scoring i Tørny).
- **3-mannslag**: avvises (`ENABLED_COMBOS` kun 2/4; `parseAmbroseTeamSize` returnerer null for 3 → `unsupported_mode_size_combo`). Speiler Texas.
- **Lag med feil antall medlemmer**: `team_balance` ved publish (eksakt team_size per lag). Draft tolererer partial.
- **Mode/config låst etter publish**: eksisterende `mode_locked_after_publish` gjelder uendret.
- **Per-hull integer-allokering vs «purist» fraksjonell total-subtraksjon**: Tørny bruker per-hull SI-allokering overalt (best ball, texas). Ambrose følger samme — IKKE total-subtraksjon med fraksjonell HCP. Dokumentert valg.
- **Defensiv fallback**: `ambrose.compute` med feil `mode_config.kind` → pct 0 (gross), speiler texas' defensive fallback.

## Key decisions

- **Standard Ambrose-formel** (combined ÷ 2×teamSize), IKKE issue-tallene — bekreftet av bruker. Default-pct 25 (2-mann) / 12,5 (4-mann).
- **Justerbar prosent** (ikke fast formel) — bruker valgte dette siden Ambrose ikke er strengt regelbundet. Ambrose = Texas-mekanikk med Ambrose-default; eneste reelle forskjell mot Texas er 4-mann-defaulten (12,5 % vs NGF 10 %) + navn/wizard-plassering.
- **`compute()` returnerer `kind: 'texas_scramble'`** (Modified-Stableford-mønsteret) → all leaderboard/podium/mail/hull-page gjenbrukes; ingen nye view-komponenter.
- **`isScrambleFamily`-helper** for struktur-gating; mode-spesifikke greiner kun der default/copy avviker.
- **Datadreven format-registrering** (formats-row + intent-mapping), ingen CHECK-endring.
- **Wizard-plassering**: Klubb, sekundær (per issue). Kompis er en én-linjes mapping-follow-up om ønskelig — ikke i scope nå.
- **Fraksjonell handicap-pct** støttes for Ambrose (én desimal) for å bevare faithful 12,5 %-default; Texas' heltall-oppførsel bevares uendret.

**Claude's Discretion:**
- `sort_order` for klubb-mapping (foreslått 35, ved siden av texas).
- Ikon-valg for `'ambrose'` (gjenbruk texas-ikon vs distinkt).
- Om fraksjonell-pct løses via generalisering av delt parse/field vs ambrose-spesifikk helper — velg laveste risiko, ikke bryt Texas.
- Eksakt norsk ordlyd (humanizer avgjør).

## Success criteria

- [ ] `ambrose.compute(ctx)` returnerer `kind: 'texas_scramble'` og `computeLeaderboard` ruter `game_mode==='ambrose'` dit. Verifiseres i `lib/scoring/modes/ambrose.test.ts` + lesing av `index.ts`-switchen.
- [ ] `ambroseDefaultPct(2)===25` og `ambroseDefaultPct(4)===12.5`; team-handicap for 4-mannslag med combinedCH 74 @ 12,5 % = 9 (Type A-test). Dekker issue-kriteriet «team-HCP-formel for 2-lag og 4-lag».
- [ ] `texasScramble.compute` gir uendret resultat etter `computeScramble`-ekstraksjonen (eksisterende texas-tester grønne — ingen regresjon).
- [ ] `validateAmbrose` produserer `mode_config {kind:'ambrose', team_size, teams_count, team_handicap_pct}`; avviser 3-mannslag, ubalanserte lag, og pct utenfor 0–100; aksepterer fraksjonell 12,5. Verifiseres i `lib/games/gamePayload.ambrose.test.ts`.
- [ ] Migrasjon 0055 applisert mot prod: `select slug,is_active from formats where slug='ambrose'` returnerer raden, og `format_intent_mapping` har klubb-raden. Verifiseres via Supabase MCP.
- [ ] Admin kan opprette et Ambrose-spill (team_size 2 og 4) via wizarden; det vises med label «Ambrose» i `/admin/games`. Verifiseres via Playwright-smoke + lesing av ModeSelector/validator.
- [ ] Leaderboard for et Ambrose-spill rendrer Texas-scramble-viewet med brutto + team-HCP + netto, og format-label «Ambrose». (Gjenbruker `TexasScrambleView` — INGEN ny Type C-komponent-test, ville duplisert #44s test per test-disiplin; routing-assertion dekker det.)
- [ ] `npm run build` (tsc) grønn — alle exhaustive switches (router, MODE_LABELS Record, format-helpers) dekker `'ambrose'`.
- [ ] Versjons-bump 1.50.0 → 1.51.0 + CHANGELOG-oppføring i den bruker-synlige `feat`-commiten (håndheves av commit-msg-hook).

## Gates (etter hver chunk)

- [ ] `npm run build` (tsc — fanger manglende exhaustive-switch-cases; per memory IKKE bare `tsc --filter`)
- [ ] `npm test -- lib/scoring/modes/ambrose` (når engine bygget)
- [ ] `npm test -- lib/scoring/modes/texasScramble` (regresjon etter refactor)
- [ ] `npm test -- lib/games/gamePayload` (når validator bygget)
- [ ] `npm test` (full suite) før PR-merge
- [ ] `humanizer:humanizer` på alle nye norske strenger
- [ ] `.githooks/commit-msg` aksepterer commits (bump+CHANGELOG på feat)
- [ ] Playwright-smoke: opprett Ambrose-spill + tast et par hull (når UI bygget)

## Files likely touched

**Nye:** `lib/scoring/modes/ambrose.ts`, `lib/scoring/modes/ambrose.test.ts`, `lib/games/gamePayload.ambrose.test.ts`, `supabase/migrations/0055_ambrose.sql`.

**Scoring/typer:** `lib/scoring/modes/types.ts` (GameMode, MODE_LABELS, GameModeConfig, isScrambleFamily), `lib/scoring/modes/texasScramble.ts` (ekstrahér computeScramble), `lib/scoring/index.ts` (router-case + eksport).

**Validator:** `lib/games/gamePayload.ts` (parseGameMode, validateAmbrose, parseAmbroseHandicapPct/TeamSize, modeValidators).

**Admin-form:** `ModeSelector.tsx`, `TeamSizeSelector.tsx`, `GameForm.tsx`, `GameWizard.tsx`, `useGameFormState.ts`, `sections/PlayersSection.tsx`, `sections/ReadyStep.tsx`, `sections/TeamsAssignmentSection.tsx`, `[id]/edit/page.tsx`.

**Spill-flater:** `leaderboard/page.tsx`, `holes/[holeNumber]/page.tsx`, `holes/[holeNumber]/HoleClient.tsx`, `games/[id]/page.tsx`, `scorecard/page.tsx`, `submit/page.tsx`.

**Mail:** `gameFinishedNotification.ts`, `gameFinishedRecipients.ts`.

**Helpers/discoverability:** `lib/games/scorecardLayout.ts`, `scorecardTitle.ts`, `registration.ts`, `formatLabel.ts`, `allowanceCopy.ts`, `lib/formats/icons.tsx`, `lib/formats/modeGuide.ts`, `app/spillformer/page.tsx`.

**Versjon:** `package.json` (1.51.0), `CHANGELOG.md`.

## Out of scope

- **3-mannslag** (÷6) — utsatt, speiler Texas-presedens.
- **Egen Ambrose result-`kind` / egne view/podium-komponenter** — gjenbruker Texas (mindre duplisering).
- **Kompis-intent-mapping** — kun klubb per issue; trivielt å legge til senere.
- **Drive-distribusjon-håndhevelse** — honor-system (som Texas).
- **«Purist» fraksjonell total-subtraksjon** av lag-HCP — Tørny bruker per-hull SI-allokering konsekvent.
- **Cup-eligibility** (is_cup_eligible=false) — Ambrose er ikke et 1v1/matchplay-cup-format.
