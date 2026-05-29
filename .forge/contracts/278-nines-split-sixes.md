# Forge-kontrakt: Nines / Split Sixes — 3-spiller point-fordeling

**Issue:** [#278](https://github.com/jdlarssen/golf-app/issues/278) · del av format-epic [#270](https://github.com/jdlarssen/golf-app/issues/270) · avhenger av F1 [#271](https://github.com/jdlarssen/golf-app/issues/271) (ferdig)
**Branch:** `claude/eager-antonelli-dd18da`
**Kompleksitet:** MEDIUM
**Dato:** 2026-05-29

## Sammendrag

Nytt kompis-format: **Nines / Split Sixes** — 3 spillere, poeng fordeles per hull etter hvem som scoret best. To varianter (samme mekanikk, ulik poeng-pott):

- **Nines** — 9 poeng per hull: lavest 5, nest 3, høyest 1.
- **Split Sixes** — 6 poeng per hull: lavest 4, nest 2, høyest 0.

Vinner = mest sammenlagt-poeng. Likt på et hull → poengene for de delte plassene legges sammen og deles likt.

Arkitektonisk er dette **«Skins med en poeng-tabell i stedet for ett skin»**: poengene utledes fra det vanlige strokeplay-scorekortet (`ctx.scores`), så vi trenger **ingen ny input-tabell, intet per-hull-registreringswidget, og ingen get/set/subscribe-helpers** — i motsetning til Wolf/BBB. Malen er `lib/scoring/modes/skins.ts`.

## Låste beslutninger (fra gray-area-diskusjon)

| # | Beslutning | Valg | Begrunnelse |
|---|-----------|------|-------------|
| 1 | Variant-modell | **Én `nines`-GameMode** med `nines_variant: 'nines' \| 'split_sixes'` i `mode_config` | Issuet sier «variant-flag», «seed format-row» (entall). Én umbrella-flis, variant velges i wizarden. |
| 2 | Flis-navn | **«Nines / Split Sixes»** (umbrella) | Bruker bekreftet. Beholder ekte golf-navn som Wolf/Nassau/Skins. Verifisert mot #270: ingen annen planlagt modus skal inn under denne flisen — Acey Deucey (#279) og Round Robin (#280) krever begge eksakt 4 spillere og har egne fliser. |
| 3 | Netto/brutto | **Bryter, default netto** (`nines_scoring: 'gross' \| 'net'`) | Bruker valgte dette. Speiler Wolf/Nassau/Skins-mønstret. |
| 4 | Leaderboard | **Full visning + podium** (`NinesView` + `NinesPodium`) | Bruker valgte dette. Konsistent med resten av familien. |
| 5 | Spillerantall | **Eksakt 3** | Issue-krav. Validatoren håndhever (min 3 + maks 3). |

## Arkitektur

### `mode_config`-shape (ny variant i `GameModeConfig`)

```typescript
| {
    kind: 'nines';
    team_size: 1;
    /** 'nines' = 9 poeng (5–3–1), 'split_sixes' = 6 poeng (4–2–0). */
    nines_variant: 'nines' | 'split_sixes';
    /** 'net' = gross − strokesForHole(CH, SI). 'gross' = rå gross. Default 'net'. */
    nines_scoring: 'gross' | 'net';
  }
```

Defensiv fallback i `compute()` (som skins.ts): manglende/feil felt → `nines_variant: 'nines'`, `nines_scoring: 'net'`.

### Scoring-algoritme (`lib/scoring/modes/nines.ts`)

Per hull:
1. Beregn effective-score per spiller: `effectiveFor(scoring, gross, courseHandicap, strokeIndex)` — gjenbruk av skins.ts-mønstret (`gross` direkte, eller `gross − strokesForHole(CH, SI)`).
2. **Pending-hull:** hvis minst én spiller mangler gross → hullet deler ikke ut poeng (alle 0), `pending: true`, teller ikke i `holesScored`. Uavhengig per hull — **ingen carryover** (skiller seg fra Skins). Senere hull avgjøres normalt.
3. Sorter spillerne stigende på effective-score (lavest = best). Poeng-pott: `nines` → `[5, 3, 1]`, `split_sixes` → `[4, 2, 0]` (indeks 0 = beste plass).
4. **Likt deles likt:** grupper spillere med EKSAKT samme effective-score. En gruppe som opptar plassene `[i..j]` får `sum(pott[i..j]) / gruppestørrelse` poeng hver.

Verifiserte utfall (alltid heltall ved nøyaktig 3 spillere):

| Situasjon | Nines [5,3,1] | Split Sixes [4,2,0] |
|-----------|---------------|---------------------|
| Tre ulike | 5, 3, 1 | 4, 2, 0 |
| To delt lavest | 4, 4, 1 | 3, 3, 0 |
| To delt høyest | 5, 2, 2 | 4, 1, 1 |
| Alle tre delt | 3, 3, 3 | 2, 2, 2 |

Robusthet for n≠3 (draft-state): pott-array indekseres med `?? 0` utenfor grensene, så `compute()` krasjer ikke om wizarden er midt i oppsett med <3 eller >3 spillere. Kun n=3 er et støttet spill (validatoren håndhever ved publish). Dokumenteres i JSDoc.

**Ranking:** `totalPoints` DESC, deterministisk `userId.localeCompare`-fallback, `tiedWith` = spillere med EKSAKT samme `totalPoints`. Full 5-tier-cascade utelates i v1 (samme avgjørelse som Wolf/Skins).

### Resultat-typer (i `types.ts`, speiler Wolf/Skins-shape)

```typescript
export interface NinesHoleRow {
  holeNumber: number;
  par: number;
  strokeIndex: number;
  /** True når ikke alle 3 spillere har gross — hullet deler ikke ut poeng. */
  pending: boolean;
  perPlayer: Array<{
    userId: string;
    gross: number | null;
    /** gross hvis 'gross', netto hvis 'net'. null hvis hullet ikke spilt. */
    effectiveScore: number | null;
    /** Poeng på dette hullet (0 når pending). */
    points: number;
  }>;
  /** Poeng per spiller på dette hullet (0 for alle når pending). */
  pointsByPlayer: Record<string, number>;
}

export interface NinesPlayerLine {
  userId: string;
  totalPoints: number;
  /** Antall ikke-pending hull spilleren bidro på. */
  holesScored: number;
  rank: number;
  tiedWith: string[];
}

export interface NinesResult {
  kind: 'nines';
  variant: 'nines' | 'split_sixes';
  scoring: 'gross' | 'net';
  holes: NinesHoleRow[];
  players: NinesPlayerLine[];
}
```

Legges til i `ModeResult`-unionen.

## Filendringer (eksakt wiring)

### Scoring-laget
- **`lib/scoring/modes/types.ts`** — `nines` i `GameMode`-union (etter `bingo_bango_bongo`); `nines: 'Nines / Split Sixes'` i `MODE_LABELS`; ny variant i `GameModeConfig`; `NinesHoleRow`/`NinesPlayerLine`/`NinesResult`-interfaces; `NinesResult` i `ModeResult`-union.
- **`lib/scoring/modes/nines.ts`** — ny modul: `compute(ctx): NinesResult`.
- **`lib/scoring/index.ts`** — `import * as nines`; `case 'nines': return nines.compute(ctx);` i `computeLeaderboard`-switchen; re-eksporter `NinesResult`/`NinesHoleRow`/`NinesPlayerLine` i type-blokken.

### Game-payload
- **`lib/games/gamePayload.ts`** — `|| raw === 'nines'` i `parseGameMode`; `parseNinesVariant()` + `parseNinesScoring()` (speiler `parseSkinsScoring`); `validateNines()` (eksakt 3: `length < 3` → `min_players_for_mode`, `length > 3` → `too_many_players_for_mode`, `duplicate_player`-sjekk; bygger `mode_config`); `nines: validateNines` i `modeValidators`-Record.
- **`lib/games/allowanceCopy.ts`** — `case 'nines':` i `bruttoHelperFor` → `'Ingen handicap — lavest gross-score per hull gir flest poeng.'`
- **`lib/formats/modeGuide.ts`** — `nines`-oppføring i `MODE_GUIDE` (`{ summary, points }`), norsk copy som forklarer poeng-fordelingen + de to variantene.

### Migrasjon
- **`supabase/migrations/0054_nines.sql`** — `insert into public.formats` (slug `'nines'`, display `'Nines / Split Sixes'`, icon_key `'nines'`, scoring_module `'@/lib/scoring/modes/nines'`, `is_active true`, `is_cup_eligible false`) + `insert into public.format_intent_mapping` (`'nines'`, `'kompis'`, visible, **ikke** primary, sort_order 71). Ingen ny tabell (strokeplay-utledet).

### Wizard
- **`app/admin/games/new/sections/NinesSetup.tsx`** — ny komponent (speiler `SkinsSetup.tsx`): variant-radio (Nines 5–3–1 / Split Sixes 4–2–0) + netto/brutto-radio (default netto).
- **`app/admin/games/new/GameWizard.tsx`** — `state.isNines`/`state.ninesVariant`/`state.ninesScoring` + settere; betinget render av `<NinesSetup>`; skjulte inputs `nines_variant` + `nines_scoring`.
- **Ikon-map for ModeSelector** — registrer `'nines'`-ikon (finn icon-mappet under build, speil hvordan `bingo_bango_bongo` ble lagt til).
- Spillerantall-hint: speil hvordan Wolf kommuniserer «eksakt 4» → her «eksakt 3». Validatoren er den harde gaten.

### Leaderboard
- **`app/games/[id]/leaderboard/NinesView.tsx`** — poeng-tabell: rangering + sammenlagt-poeng per spiller + per-hull-fordeling (hull × spiller-rutenett, `tabular-nums`), tied-rank-label, reveal-aware (skjul totaler når `scoreVisibility === 'reveal' && gameStatus !== 'finished'`).
- **`app/games/[id]/leaderboard/NinesPodium.tsx`** — topp-3-podium + flat liste for resten (her alltid 3 spillere), `totalPoints` som metrikk. Speiler `BingoBangoBongoPodium`.
- **`app/games/[id]/leaderboard/page.tsx`** — `if (game.game_mode === 'nines') return renderNines({...})` (~linje 400); `renderNines`-funksjon speiler `renderSkins` (bygger `ScoringContext`, kaller `computeLeaderboard`, `result.kind !== 'nines'` → `notFound()`, returnerer View/Podium); imports.

**Bekreftet:** Nines trenger INGEN ekstra `ScoringContext`-felt (ingen `wolfChoices`-ekvivalent) — standard `ctx.scores`/`ctx.players`/`ctx.holes` er nok, som Skins/Nassau.

## Suksesskriterier

- [x] **K1 — Typer + uttømmende maps:** ✅ `npm run build` exit 0. `nines` lagt til i `GameMode`/`MODE_LABELS`/`GameModeConfig`/`ModeResult` (`a68c4c4`), `computeLeaderboard`-switch, `modeValidators`+`bruttoHelperFor`+`MODE_GUIDE` (`0352f9b`), `TeamSizeSelector`/`ReadyStep`-maps (`cd56d15`), og `GameRow`-mirror-union i `app/games/[id]/page.tsx` (`ef28b06` — fanget av full build, ikke av scoped tsc).
- [x] **K2 — Scoring-modul:** ✅ `lib/scoring/modes/nines.ts` `compute()` — begge varianter, netto/brutto via `effectiveFor`, likt-deles-likt group-walk, pending-hull uten carryover. 22/22 grønne (`a68c4c4`).
- [x] **K3 — Type A unit-tester:** ✅ `nines.test.ts` 22 cases: shape, tre-ulike/to-delt-lavest/to-delt-høyest/alle-delt (begge varianter), netto-vs-brutto-flip, pending (senere hull avgjøres), fler-hull-totaler + tiedWith, tom state, defensive defaults, pot-sum-invariant.
- [x] **K4 — Validator + regresjonstest:** ✅ `validateNines` (`length < 3`→`min_players_for_mode`, `> 3`→`too_many_players_for_mode`) + `parseGameMode` + `modeValidators`. 6 regresjonscases grønne i `gamePayload.test.ts` (`0352f9b`).
- [x] **K5 — Migrasjon:** ✅ `0054_nines.sql` seeder format-row «Nines / Split Sixes» + kompis-mapping (sekundær). Matcher 0051-plain-insert-idiom (ingen `on conflict`, som siblings). Ingen ny tabell.
- [x] **K6 — Leaderboard-visning + podium:** ✅ `NinesView` (rangering + per-hull-rutenett + pending + reveal-aware) + `NinesPodium` (topp-3, konfetti) wiret via `renderNines` (`ef28b06`). Type C `NinesView.test.tsx` 1/1 grønn. Live preview-verifisering utsatt til migrasjon er kjørt mot DB (single-prosjekt-DB-constraint) — dekkes av render-test + build i mellomtiden.
- [x] **K7 — Wizard:** ✅ `NinesSetup` (variant + netto/brutto-radio) + hidden inputs `nines_variant`/`nines_scoring` i GameWizard (`cd56d15`). `NinesSetup.test.tsx` 1/1 grønn; serialisering→`validateNines` dekket av K4-regresjon. Eksakt-3-hint via `ninesPlayersValid`.
- [x] **K8 — CHANGELOG + versjon:** ✅ 1.49.0 → 1.50.0 (MINOR) + CHANGELOG 1.50.y-serie (1.49.y wrappet i `<details>`). Release-commit `579cd0a` staget package.json + package-lock.json + CHANGELOG.md; commit-msg-hook passerte.

## Gates (kjøres scoped til det som endret seg)

```bash
# Type A + regresjon (raskest, kjør tidlig og ofte)
npx vitest run lib/scoring/modes/nines.test.ts lib/games/gamePayload.test.ts

# Type C render-test
npx vitest run app/games/\[id\]/leaderboard/NinesView.test.tsx

# Uttømmende completeness + typer (AUTORITATIV — fanger manglende switch/Record-medlem)
npm run build
```

- **humanizer-skill** på all ny norsk copy (NinesSetup, NinesView, modeGuide, CHANGELOG-tagline, allowanceCopy) FØR commit, per CLAUDE.md.
- **Worktree-hook-fix** (per memory): `git config --worktree core.hooksPath .githooks` før første commit, ellers bypasses version-bump-hooken stille.

## Ikke i scope

- **Ingen `nines_holes`-tabell / registreringswidget / get/set/subscribe-helpers** — formatet er strokeplay-utledet (bruker eksisterende scorekort).
- **Ingen rikere tie-break-cascade** utover `totalPoints` (v1, som Wolf/Skins).
- **Ikke cup-eligible** — kun kompis-runde (sekundær).
- **Acey Deucey (#279) og Round Robin (#280)** — egne fliser/issues, ikke del av denne umbrella-flisen.
- **Ingen ny side-bet-kategori** — urelatert.

## Test-disiplin-notater (per `docs/test-discipline.md`)

- **Type A** (nines.ts): assertion-rik TDD, `it.each` for de parametriserte variant×tie-kombinasjonene. Mock kun ved system-grenser (ingen her — ren funksjon).
- **Type C** (NinesView): maks ÉN render-test per komponent. Ikke re-assert poeng-tall fra Type A — verifiser kun at strukturen rendrer (rader, tied-label, reveal-skjul). NinesPodium og NinesSetup er primært presentasjon; én lett render-test hver er valgfritt, ikke duplisert Type-A-assertering.
- Ingen «mens jeg var her»-tester. Ingen kopier-lim av mock-oppsett (bruk delte fixtures/helpers i nines.test.ts).
