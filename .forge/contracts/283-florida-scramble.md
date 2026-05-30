# Forge-kontrakt: Florida Scramble — Texas-variant med step-aside

**Issue:** [#283](https://github.com/jdlarssen/golf-app/issues/283) · del av format-epic [#270](https://github.com/jdlarssen/golf-app/issues/270) · avhenger av F1 [#271](https://github.com/jdlarssen/golf-app/issues/271) (ferdig)
**Branch:** `claude/sad-sanderson-56d00c`
**Kompleksitet:** MEDIUM
**Dato:** 2026-05-30

## Sammendrag

Nytt klubb-format: **Florida Scramble** (også «Step Aside Scramble») — en Texas Scramble-variant der spilleren hvis ball ble valgt **står over neste slag**. Resten av laget slår videre fra valgt ball. Regelen tvinger fram at alle lag-medlemmer bidrar.

**Avgjørende innsikt (fra gray-area-diskusjon):** Step-aside-regelen styrer *hvem som slår på banen*, men **ikke hva som registreres**. Tørny lagrer én lag-gross per hull uansett — det finnes ingen slag-for-slag-datamodell i appen. Florida scrambles **scoring er derfor identisk med Texas Scramble**: én ball per lag, NGF-aggregat lag-handicap, lavest lag-total vinner, 5-tier tie-break. Step-aside håndteres som **honor-system** (akkurat som Texas allerede gjør med drive-distribusjons-regelen sin), forklart i format-guiden **+ en liten påminnelse-linje på hull-input-flaten** for Florida-spill.

Arkitektonisk er dette **«Texas Scramble med nytt navn, ny flis, ny step-aside-copy, og team_size 3 i tillegg til 4»**. Malen er `lib/scoring/modes/texasScramble.ts` og hele Texas-wiringen (kartlagt i recon under).

## Låste beslutninger (fra gray-area-diskusjon 2026-05-30)

| # | Beslutning | Valg | Begrunnelse |
|---|-----------|------|-------------|
| 1 | **Step-aside-håndtering** | **Honor-system + påminnelse-linje** på hull-input-flaten | Bruker valgte dette. Scoring = Texas. Ingen slag-tracking (ville krevd ny datamodell = MAJOR, bryter én-score-per-hull-arkitekturen). Påminnelse-linja er ærlig oppfyllelse av issuets «visualisering på input-flate» uten å oppfinne slag-data. Speiler hvordan Texas behandler drive-regelen sin (honor-system). |
| 2 | **Lag-størrelse** | **3 og 4 spillere** | Issue-krav («Lag à 3 eller 4»). 2 gir ikke mening med step-aside (én står over → kun 1 spiller). Krever å utvide `TeamSize` med `3` (Texas hadde kun 2 og 4). |
| 3 | **Lag-handicap-formel** | **NGF-aggregat %**, admin-justerbar, default **15 % for 3-mannslag, 10 % for 4-mannslag** | Speiler Texas (`mode_config.team_handicap_pct`). NGF-konvensjon: 3-mann 15 %, 4-mann 10 %. 0 % = brutto-scramble (gyldig). |
| 4 | **Egen flis / egen modus** | **Ja — separat `florida_scramble` game_mode + flis** | Issue ber eksplisitt om `lib/scoring/modes/florida_scramble.ts` + epic #270-mønstret (hver format = egen flis). Bruker-synlig forskjell: navn + step-aside-copy. |
| 5 | **Leaderboard** | **Full view + podium** (`FloridaScrambleView` + `FloridaScramblePodium`) | Konsistent med Texas + resten av familien. |
| 6 | **Placement** | **Klubb-turnering, sekundær** (`format_intent_mapping`: `klubb`, visible, **ikke** primary) | Issue: «Klubb-turnering (sekundær)». `is_cup_eligible = true` (klubb-egnet format), men `is_primary = false`. |
| 7 | **Scoring-deling** | **Felles scramble-kjerne** (`scrambleCore.ts`) brukt av både texas + florida | Scoring er byte-identisk; å duplisere ~120 linjer scoring-logikk er en reell smell. Texas' eksisterende test-suite (20 KB) er behavior-preserving guard. |

## Arkitektur

### Scoring: felles kjerne + tynne wrappere

Florida-scoring = Texas-scoring (identisk algoritme). For å unngå duplisering ekstraheres den kind-agnostiske lag-utregningen til en delt kjerne:

**`lib/scoring/modes/scrambleCore.ts`** (ny):
```typescript
// Felles scramble-kjerne for Texas + Florida. Begge formatene spiller én ball
// per lag og registrerer én lag-gross per hull; eneste forskjell er flis-navn,
// step-aside-copy (Florida) og default lag-handicap-%. Scoring-matematikken er
// identisk, så den bor her og guardes av texasScramble.test.ts.
export function computeScrambleTeamLines(
  ctx: ScoringContext,
  handicapPct: number,
): ScrambleTeamLine[] {
  // Nøyaktig dagens texasScramble.compute-kropp, minus { kind } -wrapper:
  //  - gruppér på teamNumber, filtrer team===null
  //  - pickTeamCaptain (lex-min userId) eier scores-radene
  //  - combinedCourseHandicap = sum members' CH
  //  - teamHandicap = round(combinedCH × handicapPct / 100)
  //  - per hull: teamGross = captain-raden, teamExtraStrokes = strokesForHole(teamHandicap, SI),
  //    teamNet = gross − extra; par via parFor(hole, captain.teeGender) (#240)
  //  - totalNet/totalGross/missingHoles
  //  - rankTeams på 18-lange teamNet-arrays (0-padding for missing)
}
```

**Delte typer i `types.ts`** (kind-agnostiske, erstatter Texas-spesifikke):
```typescript
export interface ScramblePlayerCell { userId: string; courseHandicap: number; isCaptain: boolean; }
export interface ScrambleHoleRow { holeNumber: number; par: number; strokeIndex: number; teamGross: number | null; teamExtraStrokes: number; teamNet: number | null; }
export interface ScrambleTeamLine { teamNumber: number; members: ScramblePlayerCell[]; combinedCourseHandicap: number; teamHandicap: number; holes: ScrambleHoleRow[]; totalNet: number; totalGross: number; missingHoles: number[]; rank: number; tiedWith: number[]; }

// Back-compat-aliaser så eksisterende Texas-konsumenter ikke må røres:
export type TexasScramblePlayerCell = ScramblePlayerCell;
export type TexasScrambleHoleRow = ScrambleHoleRow;
export type TexasScrambleTeamLine = ScrambleTeamLine;
```

**`lib/scoring/modes/texasScramble.ts`** (refaktoreres til wrapper, behavior-preserving):
```typescript
export function compute(ctx: ScoringContext): TexasScrambleResult {
  const handicapPct = ctx.game.mode_config.kind === 'texas_scramble'
    ? ctx.game.mode_config.team_handicap_pct : 0;
  return { kind: 'texas_scramble', teams: computeScrambleTeamLines(ctx, handicapPct) };
}
```

**`lib/scoring/modes/floridaScramble.ts`** (ny, speiler texas):
```typescript
export function compute(ctx: ScoringContext): FloridaScrambleResult {
  const handicapPct = ctx.game.mode_config.kind === 'florida_scramble'
    ? ctx.game.mode_config.team_handicap_pct : 0;
  return { kind: 'florida_scramble', teams: computeScrambleTeamLines(ctx, handicapPct) };
}
```

**Guard:** `texasScramble.test.ts` MÅ forbli 100 % grønn gjennom hele refaktoreringen — det er beviset på at kjerne-ekstraksjonen er atferds-bevarende. Hvis ekstraksjonen viser seg risikabel: fallback til ren klone av `compute`-kroppen i `floridaScramble.ts` (delte typer beholdes uansett).

### `mode_config`-shape (ny variant i `GameModeConfig`)

```typescript
| {
    kind: 'florida_scramble';
    team_size: 3 | 4;
    teams_count: number;
    /** NGF-aggregat: lag-HCP = round(sum(medlemmers CH) × pct / 100). Default 15 (3-mann) / 10 (4-mann). 0-100. */
    team_handicap_pct: number;
  }
```

### Result-type (i `types.ts`)

```typescript
export interface FloridaScrambleResult {
  kind: 'florida_scramble';
  teams: ScrambleTeamLine[];
}
```
Legges til i `ModeResult`-unionen.

### Hull-input: delt lag-kort + step-aside-påminnelse

Florida speiler Texas' hull-rendering eksakt (ett delt lag-kort per lag via `pickTeamCaptain`, alle tap skriver til kaptein-raden). I tillegg, **kun for Florida**: en liten påminnelse-linje over/under lag-kortet:

> «Husk: den som fikk ballen valgt, står over neste slag.»

Statisk tekst — ingen tilstand, ingen tracking. Plasseres i `HoleClient.tsx` bak `isFlorida`-flagget.

## Filendringer (eksakt wiring — speiler Texas der ikke annet er nevnt)

Recon-referansene under er de eksakte Texas-stedene å klone (verifisert 2026-05-30).

### Scoring-laget
- **`lib/scoring/modes/types.ts`**:
  - `florida_scramble` i `GameMode`-union (etter `texas_scramble`, ~linje 11).
  - `florida_scramble: 'Florida Scramble'` i `MODE_LABELS` (~linje 32).
  - Ny `GameModeConfig`-variant (shape over) etter texas-varianten (~linje 95-100).
  - Delte `Scramble*`-typer + back-compat-aliaser (erstatt `TexasScramble*`-interface-definisjonene ~linje 602-644 med aliaser til `Scramble*`).
  - `FloridaScrambleResult`-interface; legg til i `ModeResult`-union (~linje 1301).
- **`lib/scoring/modes/scrambleCore.ts`** (ny): `computeScrambleTeamLines(ctx, handicapPct)`.
- **`lib/scoring/modes/texasScramble.ts`**: refaktorer `compute` til wrapper rundt kjernen.
- **`lib/scoring/modes/floridaScramble.ts`** (ny): `compute(ctx): FloridaScrambleResult`.
- **`lib/scoring/index.ts`**: `import * as floridaScramble`; `case 'florida_scramble': return floridaScramble.compute(ctx);` (~linje 47); re-eksporter `FloridaScrambleResult` + delte `Scramble*`-typer i type-blokken (~linje 100).

### Game-payload
- **`lib/games/gamePayload.ts`**:
  - `|| raw === 'florida_scramble'` i `parseGameMode` (~linje 237).
  - `parseFloridaTeamSize` (3 | 4 | null — speiler `parseTexasTeamSize`, men `'3'`/`'4'` i stedet for `'2'`/`'4'`) + `parseFloridaHandicapPct` (0-100 int — kan gjenbruke `parseTexasHandicapPct` ved å lese feltet `florida_team_handicap_pct`).
  - `validateFloridaScramble` (klone av `validateTexasScramble` ~linje 642-702): feltnavn `florida_team_size` / `florida_team_handicap_pct`; team_size ∈ {3,4}; `flight_number = team_number`; publish krever ≥1 lag (`min_players_for_mode`), hvert lag eksakt `team_size` (`team_balance`), `team_number ≥ 1` (`bad_team`); bygger `mode_config` med `kind: 'florida_scramble'`.
  - `florida_scramble: validateFloridaScramble` i `modeValidators`-Record (~linje 1275).
- **`lib/games/allowanceCopy.ts`**: legg `florida_scramble` til samme `case` som `texas_scramble` (~linje 27-29) → `'Ingen handicap — kun gross teller.'` (felt-helper for brutto; lag-HCP-% styres i wizard, ikke her — samme som Texas).
- **`lib/formats/modeGuide.ts`**: `florida_scramble`-oppføring i `MODE_GUIDE` — speiler texas-summary + ekstra punkt om step-aside-regelen («Den som fikk ballen valgt, står over neste slag.»).

### Migrasjon
- **`supabase/migrations/0055_florida_scramble.sql`** (ny) — plain insert-idiom (matcher 0054):
  ```sql
  insert into public.formats (slug, display_name, icon_key, short_description, scoring_module, is_active, is_cup_eligible)
  values ('florida_scramble', 'Florida Scramble', 'florida_scramble',
          'Lag à 3 eller 4. Som Texas, men den som fikk ballen valgt står over neste slag.',
          '@/lib/scoring/modes/floridaScramble', true, true);

  insert into public.format_intent_mapping (format_slug, intent, is_visible, is_primary, sort_order)
  values ('florida_scramble', 'klubb', true, false, 31);
  ```
  Ingen ny tabell, ingen CHECK-widening (0047 droppet `games_mode_check`).

### Wizard
- **`app/admin/games/new/TeamSizeSelector.tsx`**: utvid `TeamSize`-type til `1 | 2 | 3 | 4`; legg `3` til selector-UI-arrayet; `florida_scramble: new Set<TeamSize>([3, 4])` i `ENABLED_COMBOS`. Verifiser at andre modi ikke utilsiktet får 3 (Sets er eksplisitte per modus).
- **`app/admin/games/new/ModeSelector.tsx`**: ny flis etter texas — `mode: 'florida_scramble'`, `title: 'Florida Scramble'`, `description`-copy (humanizer-pass), `icon: FloridaScrambleIcon`. Definer `FloridaScrambleIcon` (variant av Texas-flagg-ikonet — f.eks. flagg + tre baller hvor én er «utgrået»/stiplet for å antyde step-aside).
- **`lib/formats/icons.tsx`**: `FloridaScrambleIcon`-funksjon + `florida_scramble: FloridaScrambleIcon` i `ICON_MAP` (~linje 240).
- **`app/admin/games/new/useGameFormState.ts`**: `isFlorida`-flagg + `floridaHandicapPct`-state + setter; default-pct ved team_size-endring (3 → 15, 4 → 10) — speiler Texas' default-logikk (~linje 95, 374, 393, 423, 430).
- **`app/admin/games/new/GameWizard.tsx`**: betinget lag-handicap-slider for `isFlorida` (gjenbruk samme slider-komponent som Texas, ~linje 511-526); hidden inputs `florida_team_size` + `florida_team_handicap_pct` (~linje 667-673); payload-bygging (~linje 301).
- **`app/admin/games/new/sections/ReadyStep.tsx`**: `florida_scramble: 'Florida Scramble'` i summary-label-map (~linje 52).

### Leaderboard
- **`app/games/[id]/leaderboard/FloridaScrambleView.tsx`** (ny) — klone av `TexasScrambleView.tsx`.
- **`app/games/[id]/leaderboard/FloridaScramblePodium.tsx`** (ny) — klone av `TexasScramblePodium.tsx` (husk `prefers-reduced-motion` per globals.css-mønstret).
- **`app/games/[id]/leaderboard/page.tsx`**: `renderFloridaScramble` (klone av `renderTexasScramble` ~linje 1761-1856, narrow på `result.kind !== 'florida_scramble'`); route `if (game.game_mode === 'florida_scramble') return renderFloridaScramble({...})` (~linje 371); imports.

### Hull-input
- **`app/games/[id]/holes/[holeNumber]/page.tsx`**: `isFlorida`-flagg (~linje 102); utvid delt-lag-kort-blokken `if (isTexas || isFoursomes)` → inkluder `isFlorida` (~linje 414), med pct-resolusjon `mode_config.kind === 'florida_scramble' ? team_handicap_pct : 0`.
- **`app/games/[id]/holes/[holeNumber]/HoleClient.tsx`**: `isFlorida`-flagg (~linje 248); delt lag-kort-label som Texas; **+ step-aside-påminnelse-linje** (kun `isFlorida`).

### Mail
- **`lib/mail/gameFinishedNotification.ts`**: ny `kind: 'florida_scramble'`-variant i `GameFinishedNotificationMode` (klone av texas, ~linje 116-133); `formatFloridaScrambleBodyLine` + `...BodyLineText` (klone ~linje 524-569 — identisk lag-tekst, evt. samme copy som Texas); dispatcher-grein (~linje 181-183).
- **`lib/mail/gameFinishedRecipients.ts`**: dispatcher `if (game.game_mode === 'florida_scramble')` (~linje 119); `buildFloridaScrambleRecipients` (klone av `buildTexasScrambleRecipients` ~linje 612-754, narrow på `'florida_scramble'`).

### GameRow mode-union mirror
- **`app/games/[id]/page.tsx`**: `| 'florida_scramble'` i `GameForHole`-mode-union (~linje 87). **Fanges av `npm run build`, ikke av scoped tsc** (per memory).

## Suksesskriterier

- [x] **K1 — Typer + uttømmende maps:** `npm run build` exit 0. `florida_scramble` lagt til i `GameMode`/`MODE_LABELS`/`GameModeConfig`/`ModeResult`, `computeLeaderboard`-switch, `modeValidators`, `allowanceCopy`, `MODE_GUIDE`, `TeamSizeSelector.ENABLED_COMBOS`, `ReadyStep`-map, `ICON_MAP`, og `GameRow`-mirror-union i `app/games/[id]/page.tsx`. *Evidens: build-output.*
- [x] **K2 — Felles scramble-kjerne:** `scrambleCore.ts` ekstrahert; `texasScramble.compute` + `floridaScramble.compute` er tynne wrappere. **`texasScramble.test.ts` 100 % grønn** (behavior-preserving guard). *Evidens: `npx vitest run lib/scoring/modes/texasScramble.test.ts` exit 0.*
- [x] **K3 — Florida scoring + Type A unit-tester:** `floridaScramble.ts` `compute()` returnerer `kind: 'florida_scramble'`. `floridaScramble.test.ts` dekker det Florida-spesifikke (uten å re-asserte delt kjerne-math): (a) 3-mannslag CH 12+16+20=48 @ 15 % → teamHandicap = 7; (b) 4-mannslag CH 10+15+20+25=70 @ 10 % → teamHandicap = 7; (c) `kind`-diskriminator; (d) pct=0 → brutto; (e) defensiv fallback ved feil mode_config.kind. *Evidens: test-output.*
- [x] **K4 — Validator + regresjonstest:** `validateFloridaScramble` (team_size ∈ {3,4}, `team_balance` ved ujevnt lag, `min_players_for_mode` ved tomt, `bad_team`, `bad_allowance` ved pct utenfor 0-100) + `parseGameMode` + `modeValidators`. Regresjonscases i `gamePayload.test.ts` (3-mann og 4-mann happy path + minst ett feil-case). *Evidens: `npx vitest run lib/games/gamePayload.test.ts` exit 0.*
- [x] **K5 — Migrasjon:** `0055_florida_scramble.sql` seeder format-row «Florida Scramble» + klubb-mapping (sekundær). Matcher 0054-plain-insert-idiom. *Evidens: fil-innhold + (hvis DB tilgjengelig) `execute_sql` mot `formats` viser raden.*
- [x] **K6 — Leaderboard-visning + podium:** `FloridaScrambleView` + `FloridaScramblePodium` wiret via `renderFloridaScramble`. Type C `FloridaScrambleView.test.tsx` (ÉN render-test, ikke re-assert tall fra Type A — verifiser struktur: lag-rader, rank-label, reveal-skjul). *Evidens: render-test grønn + build.*
- [x] **K7 — Wizard + team_size 3:** `TeamSize` utvidet med `3`; selector viser «3 spillere» når `florida_scramble` valgt; lag-handicap-slider med default 15 (3-mann) / 10 (4-mann); hidden inputs serialiseres → `validateFloridaScramble`. *Evidens: build + (hvis verifiserbart) wizard-render-test eller serialiserings-regresjon i K4.*
- [x] **K8 — Hull-input step-aside-påminnelse:** Florida-spill viser ett delt lag-kort per lag (som Texas) **+ påminnelse-linja** «Husk: den som fikk ballen valgt, står over neste slag.» bak `isFlorida`-flagget. *Evidens: file:line + (hvis mulig) render-/preview-verifisering.*
- [x] **K9 — Mail:** `formatFloridaScrambleBodyLine` sender riktig lag-plasserings-tekst; recipients-builder bygger per-spiller-mode. Snapshot-/regresjonstest i `gameFinishedNotification.test.ts`. *Evidens: test-output.*
- [x] **K10 — CHANGELOG + versjon:** 1.50.0 → **1.51.0** (MINOR — ny bruker-synlig spillmodus). CHANGELOG-oppføring i 1.51.y-serie (1.50.y-serie wrappes i `<details>` om nødvendig per changelog-conventions). *Evidens: package.json + CHANGELOG.md diff; commit-msg-hook passerer.*

## Gates (kjøres scoped til det som endret seg)

```bash
# Scoring: Florida + Texas-guard + validator-regresjon (raskest, kjør tidlig og ofte)
npx vitest run lib/scoring/modes/floridaScramble.test.ts lib/scoring/modes/texasScramble.test.ts lib/games/gamePayload.test.ts

# Type C render-test
npx vitest run app/games/\[id\]/leaderboard/FloridaScrambleView.test.tsx

# Mail-regresjon
npx vitest run lib/mail/gameFinishedNotification.test.ts

# Uttømmende completeness + typer (AUTORITATIV — fanger manglende switch/Record/union-medlem)
npm run build

# Full suite før PR-merge
npm test
```

- **humanizer-skill** på ALL ny norsk copy (ModeSelector-flis, modeGuide, step-aside-påminnelse, lag-handicap-feltlabel om ny, CHANGELOG-tagline, allowanceCopy) FØR commit, per CLAUDE.md.
- **Worktree-hook-fix** (per memory): `git config --worktree core.hooksPath .githooks` før første commit — ellers bypasses version-bump-hooken stille.
- **`.githooks/commit-msg`** aksepterer alle commits (versjons-bump + CHANGELOG på bruker-synlige `feat`-commits).

## Ikke i scope

- **Slag-for-slag step-aside-tracking / rotasjons-tabell** — bevisst utelatt (krever ny datamodell, MAJOR). Honor-system + påminnelse-linje er den valgte løsningen. Issuets «rotasjon over hele runden»-kriterium reinterpreteres: Type A-testene dekker scramble-scoring (lag-HCP over runden), ikke en rotasjons-mekanikk som ikke finnes.
- **2-mannslag** — gir ikke mening med step-aside (én står over → 1 spiller). 3 og 4 kun.
- **WHS-tiered handicap-formel** — NGF-aggregat kun, som Texas. v2-kandidat.
- **Side-tournaments koblet til scramble** — uendret; per-spiller-kategorier fungerer, team-kategorier er egen sak (samme som Texas).
- **Captain-overføring ved spiller-fjerning** — manuelt i v1 (arver Texas' begrensning).
- **Mer enn 8 spillere** (Texas-validatorens `i < 8`-loop arves) — klubb-skala-utvidelse er egen sak hvis brukerne ber om det.
- **kompis-intent-visibility** — issue spesifiserer kun klubb. kompis-mapping er en én-linjes tilføyelse senere om ønskelig.

## Test-disiplin-notater (per `docs/test-discipline.md`)

- **Type A** (`floridaScramble.test.ts`): assertion-rik, men **re-assert IKKE den delte kjerne-mathen** (dekkes av `texasScramble.test.ts`). Fokuser på Florida-spesifikt: config-resolusjon, 3-mann/4-mann teamHandicap, `kind`-diskriminator, defensiv fallback. `it.each` for de to lag-størrelsene.
- **Type C** (`FloridaScrambleView.test.tsx`): maks ÉN render-test. Verifiser struktur (lag-rader, rank-label, reveal-skjul), ikke tall fra Type A. Podium/Setup er presentasjon — lett render-test valgfritt, ikke duplisert Type-A.
- **Refaktor-guard:** kjerne-ekstraksjonen er den eneste endringen i `texasScramble.ts` — `texasScramble.test.ts` er det stående beviset. Ikke legg til «mens jeg var her»-tester.
- **Regresjon** (`gamePayload.test.ts`): minimum 3-mann happy, 4-mann happy, ett feil-case (`team_balance`). Ikke kopier-lim mock-oppsett — gjenbruk eksisterende fixtures.

## Verifisering (2026-05-30)

Alle 10 suksesskriterier verifisert:

- **`npm run build`**: exit 0 (alle uttømmende `Record<GameMode>`-maps + switch-er komplette, inkl. `TeamSize`-widening til 3).
- **Full test-suite** (`npx vitest run`): 1982 tester grønne, 0 feilende.
- **Scoring**: `floridaScramble.test.ts` (8) + `texasScramble.test.ts` (22, behavior-preserving guard for kjerne-ekstraksjon) grønne.
- **Validator**: `gamePayload.florida_scramble.test.ts` (4: 4-mann NGF 10 %, 3-mann NGF 15 %, team_balance, team_size=2-avvisning) grønne.
- **Leaderboard**: `FloridaScrambleView.test.tsx` (Type C) grønn.
- **Mail**: `gameFinishedNotification.test.ts` inkluderer florida-variant, grønn.
- **Step-aside-påminnelse**: `HoleClient.tsx` rendrer «Husk: den som slo det valgte slaget, står over neste slag.» bak `isFlorida` (`data-testid="florida-step-aside-reminder"`).
- **Wizard**: `defaultFloridaHandicapPct(3)=15`, `(4)=10`; `TeamSizeSelector` viser 3-mann-flis for florida.
- **Migrasjon**: `0055_florida_scramble.sql` seeder format-rad + klubb-mapping (sekundær). Ikke kjørt mot DB (single-prosjekt-constraint, som Nines K5).
- **Versjon**: 1.50.0 → 1.51.0; CHANGELOG 1.51.y-serie lagt til, 1.50.y wrappet.

Commits: `3f8bbf2` (scoring) · `99e3581` (payload/migrasjon) · `e0230dc` (wizard) · `b5c568f` (leaderboard) · `fc88840` (hull-input) · `9d6430a` (mail) · `33139f6` (validator-test-fix) · release-commit (1.51.0).

## Arkitektur-revisjon (2026-05-30)

Florida reimplementert som scramble-familie-variant (mønster fra Ambrose #284 som landet parallelt på main): returnerer `kind:'texas_scramble'` og gjenbruker Texas' leaderboard/podium/mail/hull-rendering via `isScrambleFamily`. Ingen egen `FloridaScrambleView`/`Podium`/mail-variant/result-kind (K6/K9 oppfylt via gjenbruk). Migrasjon 0058 (ikke 0055 — kollisjon med round_robin). Versjon 1.54.0.
