# Forge-kontrakt: Shamble / Champagne Scramble — best N av M etter delt drive (#285)

**Issue:** [#285](https://github.com/jdlarssen/golf-app/issues/285) · del av format-epic [#270](https://github.com/jdlarssen/golf-app/issues/270) · avhenger av F1 [#271](https://github.com/jdlarssen/golf-app/issues/271) (ferdig)
**Branch:** `claude/romantic-blackwell-51100d`
**Kompleksitet:** MEDIUM
**Dato:** 2026-05-30

## Sammendrag

Nytt lag-format: **Shamble** (inkl. **Champagne Scramble**-variant). Alle slår tee shot, laget velger beste drive, deretter spiller hver spiller sin egen ball til hull. Lagets hull-score = **summen av de N laveste individuelle scorene** på hullet. N er konfigurerbar:

- **Shamble** — N låst til 2 (klassisk «best 2»).
- **Champagne Scramble** — arrangør velger N ∈ {1, 2, 3}.

Lavest sammenlagt lag-total vinner. Lag à 3 eller 4 spillere.

### Den arkitektoniske kjernen

«Beste drive» er en **fysisk/sosial handling på banen** — den endrer ikke hva appen fanger. Vi registrerer kun hver spillers **endelige hull-score** (egen ball). Lagets hull-score utledes da som best-N av disse. Derfor:

- **Ingen ny input-tabell, intet per-hull-widget, ingen captain-eier-rad.** Hver spiller taster sin egen score på det vanlige fler-spiller-scorekortet (som best ball / par-stableford / nines). Strokeplay-utledet.
- Shamble er en **generalisering av best ball** («best 1 av M») til «best N av M».

Hybrid-malen:

| Aspekt | Mal | Hvorfor |
|--------|-----|---------|
| Lag-struktur + config + validator | **Texas scramble** (`team_size`, `teams_count`, per-spiller `team_number`) | Eneste variable-lag-format (Texas: 2\|4 lag, vilkårlig antall). |
| Per-spiller-score + ScoringContext + render-datasti | **Nines** (`renderNines`, standard `ctx.scores`/`players`/`holes`) | Hver spiller eier egen score-rad, ingen ekstra tabell. |
| Best-N-aggregering + netto/brutto | **Ny** i `shamble.ts` | Mønster fra skins `effectiveFor` + best ball lavest-per-hull. |

**Captain-modellen til Texas brukes IKKE** (Texas har én lag-score-rad fordi laget spiller én ball — Shamble spiller egne baller, hver med egen netto via egen course handicap, som best ball).

## Låste beslutninger (fra gray-area-diskusjon)

| # | Beslutning | Valg | Begrunnelse |
|---|-----------|------|-------------|
| 1 | Variant-modell | **Én `shamble`-GameMode**, umbrella-flis «Shamble / Champagne Scramble», variant velges i wizarden | Jørgen valgte «én flis + variant-velger». Speiler Nines / Split Sixes. Én game_mode = lavest build-trap-risiko. |
| 2 | Netto/brutto | **Bryter, default netto** (`shamble_scoring: 'gross' \| 'net'`) | Jørgen valgte dette. Speiler Wolf/Nassau/Skins/Nines. Netto = rettferdig på tvers av HCP (klubb). |
| 3 | Antall som teller | `shamble_count: 1 \| 2 \| 3`. Shamble-preset låser til **2**; Champagne lar arrangør velge 1/2/3. Klampes til ≤ `team_size`. | Issue: «vanligst best 2 av 4»; «Champagne = 1, 2 eller 3 av 4». N per spill (ikke per hull). |
| 4 | Lag-størrelse | **3 eller 4** (`team_size: 3 \| 4`), uniform per spill | Issue: «Lag à 3 eller 4». Blandet lag-størrelse utsettes. |
| 5 | Placement | **Klubb-turnering, sekundær** (`format_intent_mapping`: 'klubb', visible, ikke primary) | Issue-default. |
| 6 | Egen handicap-allowance-% | **Nei** — hver spiller bruker full course handicap netto (som best ball). Ingen `team_handicap_pct` (det er en Texas-ting for delt lag-ball). | Egne baller ⇒ ingen lag-HCP-%. |

## ⚠️ Avvik fra issuets bokstavelige kriterier

Issuet (skrevet under epic-planlegging) sier «seed **både** Shamble og Champagne Scramble format-rows (samme modul, ulik config)». Jørgens beslutning #1 (én flis + variant-velger) betyr at vi seeder **én** format-rad (`shamble`), og variant-skillet lever i wizarden — nøyaktig som Nines / Split Sixes (#278) som også seeder én rad for to varianter. Dette er det samme bevisste avviket som #282/#278, godkjent via brukerbeslutning. Gjentas i closing-kommentaren under «Teknisk».

## Prior Decisions (fra tidligere kontrakter)

- **Slug ER game_mode** (`#273`/`#282`): én format-rad ⇒ én slug ⇒ én GameMode-member. Én flis ⇒ én `shamble`-slug.
- **Variant-bevisst flate-navn** (`#282`, `lib/games/formatLabel.ts`): `formatDisplayLabel(mode, modeConfig)` finnes. Utvides så `shamble`-spill viser **«Shamble»** (variant 'shamble') eller **«Champagne Scramble»** (variant 'champagne'); umbrella-`MODE_LABELS['shamble']` brukes som fallback.
- **Strokeplay-utledet familie** (`#278` nines, `#275` skins): ingen ny tabell, ingen get/set/subscribe-helpers, ingen registreringswidget.
- **Mode-guide for spillere** (`#299`, `lib/formats/modeGuide.ts`): `Record<GameMode, ModeGuide>` — ny `shamble`-oppføring kreves (uttømmende Record).

## Design

### `mode_config`-shape (ny variant i `GameModeConfig`, etter `nines` rundt linje 190)

```typescript
| {
    /**
     * Shamble / Champagne Scramble (#285): lag-format. Delt drive, så egen
     * ball til hull. Lagets hull-score = sum av de `shamble_count` laveste
     * effective-scorene på hullet. Strokeplay-utledet (egne score-rader, som
     * best ball / nines — ingen captain-rad).
     */
    kind: 'shamble';
    team_size: 3 | 4;
    teams_count: number;
    /** 'shamble' = klassisk best-2-preset; 'champagne' = arrangør valgte antall. */
    shamble_variant: 'shamble' | 'champagne';
    /** Hvor mange laveste score som teller per hull (1/2/3). Klampes til ≤ team_size i validator. Shamble-preset = 2. */
    shamble_count: 1 | 2 | 3;
    /** 'net' = gross − strokesForHole(CH, SI). 'gross' = rå gross. Default 'net'. Speiler skins_scoring. */
    shamble_scoring: 'gross' | 'net';
  }
```

### Scoring-algoritme (`lib/scoring/modes/shamble.ts`)

Per hull, per lag:
1. For hvert lag-medlem med gross: `effective = shamble_scoring === 'gross' ? gross : gross − strokesForHole(courseHandicap, strokeIndex)`. Gjenbruk skins/best-ball-helperne (`strokesForHole` fra `strokeAllocation`, per-kjønn-par via eksisterende `parResolver` hvis relevant).
2. **Pending-hull:** hvis < `count` medlemmer har gross → lagets hull-score = `null`, `pending: true`, teller ikke i total. Når ≥ `count` har tastet → `teamScore = sum(de `count` laveste effective)`, provisorisk under live (kan synke når flere taster), endelig ved game-finish.
3. **Counted-markering:** de `count` laveste effective-scorene merkes `counted: true` (for leaderboard-highlight). Ved likhet på grensa: deterministisk valg (laveste gross, så `userId.localeCompare`) — påvirker kun visning, ikke total.
4. Lag-total = `sum` av ikke-pending hull-scorer. `holesCounted` = antall ikke-pending hull.

**Ranking:** lavest `totalScore` = rank 1 (strokeplay). Gjenbruk lag-tie-break-cascaden (`rankTeams`, som best ball / Texas) på per-lag per-hull team-score-arrays (total → back-9 → back-6 → back-3 → hull-18). `tiedWith` = lag med eksakt samme rank etter cascade.

**Robusthet:** defensive defaults i `compute()` (manglende config → `shamble_variant: 'shamble'`, `shamble_count: 2`, `shamble_scoring: 'net'`). `count` klampes til `min(count, team_size)` så draft-state med < count spillere ikke krasjer.

### Resultat-typer (i `types.ts`, speiler Texas/Nines team-shape, legges til i `ModeResult`-union)

```typescript
export interface ShambleHoleTeamCell {
  teamNumber: number;
  teamScore: number | null;   // sum av `count` laveste effective; null når pending
  pending: boolean;
  perPlayer: Array<{
    userId: string;
    gross: number | null;
    effectiveScore: number | null;  // netto eller brutto
    counted: boolean;               // blant de `count` laveste på hullet
  }>;
}
export interface ShambleHoleRow { holeNumber: number; par: number; strokeIndex: number; teams: ShambleHoleTeamCell[]; }
export interface ShambleTeamLine { teamNumber: number; members: string[]; totalScore: number; holesCounted: number; rank: number; tiedWith: number[]; }
export interface ShambleResult {
  kind: 'shamble';
  variant: 'shamble' | 'champagne';
  count: 1 | 2 | 3;
  scoring: 'gross' | 'net';
  teamSize: 3 | 4;
  holes: ShambleHoleRow[];
  teams: ShambleTeamLine[];
}
```

Eksakte feltnavn er **Claude's discretion** så lenge de speiler etablert Texas/Nines-shape og narrower rent på `kind`.

### Filendringer (eksakt wiring — alle uttømmende switch/Record MÅ oppdateres, ellers feiler `npm run build`)

**Scoring-laget:**
- `lib/scoring/modes/types.ts` — `shamble` i `GameMode`-union (etter `nines`); `MODE_LABELS.shamble = 'Shamble / Champagne Scramble'`; ny `GameModeConfig`-variant (over); Result-interfaces; `ShambleResult` i `ModeResult`-union.
- `lib/scoring/modes/shamble.ts` — ny: `compute(ctx): ShambleResult`.
- `lib/scoring/index.ts` — `import * as shamble`; `case 'shamble': return shamble.compute(ctx);`; re-eksporter Result-typene.

**Game-payload:**
- `lib/games/gamePayload.ts` — `|| raw === 'shamble'` i `parseGameMode`; `parseShambleVariant/Count/Scoring` + `parseShambleTeamSize` (3\|4); `validateShamble` (speiler `validateTexasScramble`s team-tildeling — `teams_count`, per-spiller `team_number`, balanse-sjekk, men UTEN captain-logikk; `count`-klamp ≤ `team_size`; Shamble-variant låser `count = 2`; bygger `mode_config`); `shamble: validateShamble` i `modeValidators`-Record.
- `lib/games/allowanceCopy.ts` — `case 'shamble':` i `bruttoHelperFor`.
- `lib/games/formatLabel.ts` — utvid `formatDisplayLabel` så `kind === 'shamble'` returnerer «Champagne Scramble» (variant 'champagne') / «Shamble» (variant 'shamble').
- `lib/formats/modeGuide.ts` — `shamble`-oppføring i `MODE_GUIDE` (forklar delt drive → egen ball → best N teller, begge varianter).

**Migrasjon:**
- `supabase/migrations/0055_shamble.sql` — `insert into public.formats` (slug `'shamble'`, display `'Shamble / Champagne Scramble'`, icon_key `'shamble'`, scoring_module `'@/lib/scoring/modes/shamble'`, `is_active true`, `is_cup_eligible false`) + `insert into public.format_intent_mapping` (`'shamble'`, `'klubb'`, visible, **ikke** primary, neste ledige `sort_order` i klubb). Plain-insert-idiom (ingen `on conflict`), som 0051–0054. Ingen ny tabell.

**Wizard:**
- `app/admin/games/new/sections/ShambleSetup.tsx` — ny (speiler `NinesSetup`): variant-radio (Shamble «best 2» / Champagne Scramble «velg antall»); når Champagne → `count`-velger (1/2/3); netto/brutto-radio (default netto); `team_size`-radio (3/4). Hint om lag-størrelse + best-N-regel.
- `app/admin/games/new/GameWizard.tsx` — state (`isShamble`, `shambleVariant`, `shambleCount`, `shambleScoring`, `shambleTeamSize`) + settere; betinget render av `<ShambleSetup>`; skjulte inputs (`shamble_variant`, `shamble_count`, `shamble_scoring`, `shamble_team_size`).
- **Lag-tildeling:** gjenbruk eksisterende `teams_count`-tildelingssteg (som Texas). ⚠️ **Hovedrisiko/discretion:** verifiser at lag-tildelings-UI-et + `parseShambleTeamSize` aksepterer `team_size = 3` (Texas tilbyr 2/4). Utvid minimalt om nødvendig.
- Ikon-map for ModeSelector/FormatGrid — registrer `'shamble'`-ikon (champagne-glass-motiv passer umbrella-navnet; speil hvordan `nines` ble lagt til).

**Leaderboard:**
- `app/games/[id]/leaderboard/ShambleView.tsx` — lag-rangering etter total; per-hull lag-score-rutenett med `counted`-highlight + pending-merking; `tabular-nums`; reveal-aware (skjul totaler når `scoreVisibility === 'reveal' && gameStatus !== 'finished'`).
- `app/games/[id]/leaderboard/ShamblePodium.tsx` — topp-3-lag-podium + flat liste for resten; `totalScore` som metrikk (lavest vinner).
- `app/games/[id]/leaderboard/page.tsx` — `if (game.game_mode === 'shamble') return renderShamble({...})`; `renderShamble` speiler `renderNines`s datasti (standard per-spiller `ScoringContext`, ingen ekstra tabell-fetch), `result.kind !== 'shamble'` → `notFound()`; imports.

## Edge Cases & Guardrails

- **`count` > `team_size`:** validator klamper `count` til `team_size`. For team_size 3 + Champagne count 3 → «alle teller» (degenerert men gyldig: ren lag-total). Shamble-preset (2) trygt for både 3 og 4.
- **Pending-hull:** < `count` medlemmer har gross → lagets hull pending, ikke i total. Uavhengig per hull.
- **Draft/tom state:** `compute()` robust mot lag med < `team_size` medlemmer (klamp + defensive defaults). Validatoren er den harde gaten ved publish.
- **Blandet lag-størrelse:** uniform `team_size` håndheves (alle lag samme 3 eller 4). Blandet = ute av scope.
- **`'use client'`-eksport-felle:** `formatLabel.ts` forblir ren (allerede). Eventuelle delte konstanter holdes server-trygge.
- **Mode-lock etter publish:** `team_size`/variant/count låst etter publish (eksisterende mode-lock-mønster). Ingen ny edit-risiko.
- **Per-kjønn-par (#240):** arves gratis via eksisterende `parResolver`/effective-helperne.

## Success Criteria

- [ ] **K1 — Typer + uttømmende maps:** `shamble` i `GameMode`/`MODE_LABELS`/`GameModeConfig`/`ModeResult`, `computeLeaderboard`-switch, `modeValidators`-Record, `MODE_GUIDE`-Record, `bruttoHelperFor`-switch, og evt. wizard-maps (`TeamSizeSelector`/`ReadyStep`/`GameRow`-mirror). **Verifiseres:** `npm run build` exit 0 (autoritativ for completeness-trap).
- [ ] **K2 — Scoring-modul:** `lib/scoring/modes/shamble.ts` `compute()` — best-N-sum per hull (N=1/2/3), netto/brutto via effective-helper, pending uten carryover, lag-ranking via cascade. **Verifiseres:** modul finnes + K3 grønn.
- [ ] **K3 — Type A unit-tester:** `shamble.test.ts` dekker best-1/2/3 av 4, best-2 av 3, likhet på grensa, pending (senere hull avgjøres), netto-vs-brutto-flip, count-klamp, fler-hull-totaler + lag-`tiedWith`, defensive defaults. **Verifiseres:** `npx vitest run lib/scoring/modes/shamble.test.ts` grønn.
- [ ] **K4 — Validator + regresjon:** `validateShamble` (team_size 3/4, teams_count-balanse, count-klamp, Shamble låser count=2) + `parseGameMode` + `modeValidators`. **Verifiseres:** regresjonscases i `gamePayload.test.ts` grønn.
- [ ] **K5 — Migrasjon:** `0055_shamble.sql` seeder ÉN format-rad «Shamble / Champagne Scramble» + klubb-mapping (sekundær, ikke primary). **Verifiseres:** fil finnes, matcher 0054-idiom; `mcp__supabase__apply_migration` kjørt mot DB.
- [ ] **K6 — Wizard:** Én flis; `ShambleSetup` med variant-radio (Shamble/Champagne), count-velger (1/2/3) ved Champagne, netto/brutto-radio (default netto), team_size 3/4. Lag-tildeling fungerer for 3 OG 4. **Verifiseres:** `ShambleSetup.test.tsx` grønn + Playwright/preview av oppsett-flyt.
- [ ] **K7 — Leaderboard + Type C render-test:** `ShambleView` (lag-rangering + per-hull-rutenett + counted-highlight + pending + reveal-aware) + `ShamblePodium` wiret via `renderShamble`. **Verifiseres:** `ShambleView.test.tsx` 1 render-test grønn; Playwright/preview av leaderboard.
- [ ] **K8 — CHANGELOG + versjon:** 1.50.0 → 1.51.0 (MINOR) + CHANGELOG 1.51.y-serie (1.50.y wrappet i `<details>`). **Verifiseres:** `package.json` + CHANGELOG staget i release-commit; commit-msg-hook passerer.

## Gates (scoped til det som endret seg)

```bash
# Type A + regresjon (raskest, kjør tidlig og ofte)
npx vitest run lib/scoring/modes/shamble.test.ts lib/games/gamePayload.test.ts

# Type C render-test
npx vitest run "app/games/[id]/leaderboard/ShambleView.test.tsx"

# Uttømmende completeness + typer (AUTORITATIV — fanger manglende switch/Record-member)
npm run build
```

- **humanizer-skill** på all ny norsk copy (ShambleSetup, ShambleView, modeGuide, allowanceCopy, CHANGELOG-tagline) FØR commit, per CLAUDE.md.
- **Worktree-hook-fix** (per memory): `git config --worktree core.hooksPath .githooks` FØR første commit, ellers bypasses version-bump-hooken stille.
- **Playwright/preview** mandatory for K6 + K7 (frontend touched).

## Ikke i scope

- **To separate fliser / to game_modes** — Jørgen valgte én flis (beslutning #1).
- **Per-hull-variasjon av `count`** — N er per spill, ikke per hull. Deferred.
- **Blandet lag-størrelse** innen ett spill (3 og 4 om hverandre) — uniform håndheves.
- **Cup-eligibility / Ryder-cup-integrasjon** — `is_cup_eligible false`, v1 (som Nines).
- **Egen handicap-allowance-%** (Texas-style) — egne baller ⇒ full course handicap netto per spiller.
- **Ny side-bet-kategori / captain-rad / per-hull-registreringswidget** — strokeplay-utledet.

## Test-disiplin-notater (per `docs/test-discipline.md`)

- **Type A** (`shamble.ts`): assertion-rik TDD, `it.each` for parametriserte N×lag-størrelse×tie-kombinasjoner. Ren funksjon — mock kun ved system-grenser (ingen her).
- **Type C** (`ShambleView`): maks ÉN render-test. Ikke re-assert score-tall fra Type A — verifiser struktur (rader, counted-highlight, pending, reveal-skjul). `ShamblePodium`/`ShambleSetup` er presentasjon; lett render-test hver er valgfritt, ikke duplisert Type-A.
- Ingen «mens jeg var her»-tester. Ingen kopier-lim av mock-oppsett (delte fixtures i `shamble.test.ts`).
