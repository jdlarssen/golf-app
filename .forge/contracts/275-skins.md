# Spec: Skins (med carryover) — hull-basert sosialt point-game

**Issue:** [#275](https://github.com/jdlarssen/golf-app/issues/275)
**Parent epic:** [#270](https://github.com/jdlarssen/golf-app/issues/270)
**Batch:** Kompis-runde format — siste ★-primære etter Wolf (#274) + Nassau (#276)
**Bump:** MINOR → `1.45.0` (ny bruker-synlig spillmodus)

## Problem

Tørny støtter i dag 8 game_modes. **Skins** er den siste ★-primære sosiale point-game-arketypen for kompis-runden (Wolf og Nassau er allerede shipped). Regelen er enkel og kjent: hvert hull er verdt 1 skin. Lavest score på hullet vinner skinnet. Blir hullet delt, **ruller skinnet videre (carryover)** til neste hull — som da er verdt 2, så 3, osv. — til noen vinner alene og scooper hele potten.

Skins spilles tradisjonelt om penger, men Tørny skal **ikke** innføre en kr-/betting-dimensjon. I stedet leverer vi en knallklar oversikt over hvem som vant hvor mange skins, slik at kompiser enkelt kan gjøre opp en pott de selv har avtalt utenfor appen.

## Prior Decisions

Fra epic #270 (godkjent 2026-05-27):
- Skins er primary under `kompis`-intent.
- Format-row + intent-mapping seedes via egen migrasjon (F1-pattern), ikke retroaktiv backfill.
- `formats.is_cup_eligible = false` (kun kompis-runder).
- Eksisterende games upåvirket — Skins legges til som ny game_mode, ingen breaking endringer.

Fra Wolf (#274) + Nassau (#276) — etablert format-mønster som bæres videre:
- **Gross/net-toggle i wizard** (`mode_config.skins_scoring: 'gross' | 'net'`, default `'net'`). Tørnys HCP-system honoreres som default, brutto som opt-in. Allowance-pct på games-tabellen ignoreres (full HCP eller ingen) — dokumenter med comment i validator.
- Hver modus eksporterer `compute(ctx: ScoringContext): ModeResult`; `ModeResult` er discriminated union på `kind`. Pure logic, full Type A test-disiplin per [`lib/scoring/AGENTS.md`](../../lib/scoring/AGENTS.md).
- Net-effective per hull: `gross − strokesForHole(courseHandicap, strokeIndex)`. Gjenbruk `effectiveFor`-mønsteret fra [nassau.ts:51](../../lib/scoring/modes/nassau.ts).
- Solo-format-validator-mønster (Nassau): 2–4 spillere, ingen team_number/flight_number. Registrer i `parseGameMode` + `modeValidators`.
- Leaderboard dispatcher per `result.kind` i `leaderboard/page.tsx`; egen `<XView>` + `<XPodium>` per modus. Reveal-modus skjuler totals til `status === 'finished'` når `score_visibility === 'reveal'`.

Fra F1-kontrakt ([271](271-f1-data-model.md)): `is_active = false` skjuler fra wizard, men slug fortsetter å funke i historiske games. Ingen FK mellom `games.game_mode` og `formats.slug`.

## Design

### Nøkkel-innsikt: Skins trenger INGEN ny infrastruktur utover Wolf/Nassau

Til forskjell fra Wolf finnes det **ingen per-hull-beslutning** spilleren tar — vinneren er rent score-drevet. Derfor:
- **Ingen ny DB-tabell** (ingen valg å persistere). Migrasjon = kun format-seed + intent-mapping, som Nassau (`0050_nassau.sql`).
- **Ingen choice-modal** på scorecard.
- **Ingen ny realtime-sub** — scores syncer allerede via eksisterende kanal, og carryover-state er en ren funksjon av scores.

Carryover-state beregnes deterministisk fra scores i scoring-modulen.

### 1. Scoring-modul — `lib/scoring/modes/skins.ts`

**Discriminator:** `game_mode: 'skins'`, `mode_config.kind: 'skins'`.

**Skin-regnskap (sekvensielt over hull i sortert rekkefølge):**

```
carriedPot = 0                      // skins båret inn fra tidligere delte hull
for hole in sortedHoles:
  if not alle spillere har score på hullet:
    row.outcome = 'pending'         // kan ikke avgjøres ennå
    STOPP videre resolving — alle senere hull er også 'pending'
    (carriedPot fryses og vises som "venter")
  atStake = carriedPot + 1          // dette hullets skin + det som henger
  effScores = per spiller: effectiveFor(scoring, gross, courseHcp, strokeIndex)
  minScore = min(effScores)
  winners = spillere med effScore === minScore
  if winners.length === 1:
    row.outcome = 'won'; row.winnerUserId = winners[0]
    award atStake skins til vinneren; carriedPot = 0
  else:
    row.outcome = 'carryover'; row.winnerUserId = null
    carriedPot = atStake            // ruller hele potten videre
```

**Rundeslutt (standard Skins-regel):** Etter siste hull, hvis `carriedPot > 0` (siste spilte hull ble delt, eller runden endte på et delt hull uten påfølgende avgjørelse), er disse skinsene **uvunne** — ingen får dem. `result.unwonSkins = carriedPot`. Ingen omspill (Tørny har ikke playoff).

**Kun spilte hull bidrar:** Et hull legger bare sin skin i potten når det faktisk er ferdigspilt (alle scores inne). Uspilte hull bidrar ingenting.

**Output (nye typer i `types.ts`):**

```ts
export type SkinsHoleOutcome = 'won' | 'carryover' | 'pending';

export interface SkinsHoleRow {
  holeNumber: number;
  par: number;
  strokeIndex: number;
  carriedIn: number;            // skins båret inn i dette hullet (0 = friskt)
  atStake: number;              // carriedIn + 1 (skins på spill på hullet)
  outcome: SkinsHoleOutcome;
  winnerUserId: string | null;  // null hvis carryover/pending
  skinsAwarded: number;         // = atStake hvis 'won', ellers 0
  perPlayer: Array<{
    userId: string;
    gross: number | null;
    effectiveScore: number | null;  // gross hvis 'gross', netto hvis 'net'
    isWinner: boolean;
  }>;
}

export interface SkinsPlayerLine {
  userId: string;
  totalSkins: number;           // sum skins vunnet
  holesWon: number;             // antall hull vunnet alene
  rank: number;
  tiedWith: string[];
}

export interface SkinsResult {
  kind: 'skins';
  scoring: 'gross' | 'net';
  holes: SkinsHoleRow[];
  players: SkinsPlayerLine[];
  unwonSkins: number;           // henger-skins ved rundeslutt
}
```

Ranking: `totalSkins` desc, tiebreak `holesWon` desc, deretter tied (samme `rank`, fyll `tiedWith`). Dokumenter i kode at full 5-tier cascade kan legges til senere (samme avgjørelse som Wolf v1).

### 2. Mode-registrering — `types.ts` + `index.ts`

- `GameMode`-union: legg til `| 'skins'`.
- `MODE_LABELS`: `skins: 'Skins'`.
- `GameModeConfig`-union: `{ kind: 'skins'; team_size: 1; skins_scoring: 'gross' | 'net' }`.
- `index.ts`: `import * as skins`, `case 'skins': return skins.compute(ctx)`, eksporter Skins-typer.

### 3. Validator — `lib/games/gamePayload.ts`

`validateSkins` (speil `validateNassau`):
- 2–4 spillere ved publish, ingen duplikater, solo (team_number/flight_number null).
- `parseSkinsScoring(formData)` → `'gross' | 'net'`, default `'net'`.
- `mode_config: { kind: 'skins', team_size: 1, skins_scoring }`.
- Wire i `parseGameMode` (`raw === 'skins'`) + `modeValidators`-mappen.
- Gjenbruk eksisterende error codes (`duplicate_player`, `min_players_for_mode`, `too_many_players_for_mode`).

### 4. Wizard — `app/admin/games/new/sections/SkinsSetup.tsx`

Speil `NassauSetup.tsx` (enkel — ingen rotasjon/shuffle): radio-toggle `skins_scoring` ("Med handicap (netto)" / "Brutto", default netto) + kort forklaring av carryover-regelen. Hidden input `skins_scoring` i `GameWizard.tsx`. Render-betinget på `selectedFormat?.slug === 'skins'`. Wire `skinsScoring`-state i `useGameFormState`-hooken (samme mønster som `nassauScoring`).

### 5. Scorecard — informasjons-banner (ingen modal)

I hull-flaten (`HoleClient.tsx` + `holes/[holeNumber]/page.tsx`), når `gameMode === 'skins'`: render et lite informasjons-banner over score-input som viser **hvor mange skins som er på spill på dette hullet**: `atStake` for gjeldende hull fra `skins.compute(ctx)` over nåværende scores.
- Friskt hull (carriedIn = 0): "1 skin på spill".
- Etter carryover: "3 skins på spill" + liten hint om hvilke hull som delte ("hull 1–2 delt").
Banneret er rent informativt — ingen interaksjon. Speil hvordan Wolf passet avledet state ned via page → client.

### 6. Leaderboard — `SkinsView.tsx` + `SkinsPodium.tsx`

`SkinsView` (speil `WolfView.tsx`-struktur):
- **Spiller-totals øverst** — sortert på `totalSkins` desc, prominent skins-tall per spiller. Dette er hoved-utbyttet: gjør det knallklart hvem som vant hvor mange skins, så kompiser kan gjøre opp pott utenfor appen.
- **Per-hull-tabell** — hull, par, SI, på-spill (atStake), utfall (vunnet av [navn] / delt → carry / venter), og hvem som scoopet. Carryover-kjeden skal være synlig så det er åpenbart hvor potten samlet seg.
- **Henger-skins** — hvis `unwonSkins > 0`: vis eksplisitt linje ("X skins ikke vunnet — siste hull delt"). Standard Skins-regel, transparent.

`SkinsPodium`: 1./2./3. plass på `totalSkins`. Dispatch-case i `leaderboard/page.tsx` på `result.kind === 'skins'`. Reveal-modus følger Wolf/Nassau-mønster.

## Edge Cases & Guardrails

- **Hull ikke ferdigspilt** (mangler score for ≥1 spiller): `outcome='pending'`, ingen skin deles ut, potten fryses. Alle senere hull er også `pending` til gapet fylles (carryover er sekvensielt og avhenger av rekkefølge).
- **Delt siste hull / runden ender på carry**: `unwonSkins = carriedPot`, vist transparent. Ingen omspill.
- **Uspilte hull ved rundeslutt** (runde avsluttet tidlig): bidrar ingen skin. Carry fra siste delte spilte hull = uvunnet.
- **Alle spillere lik score på et hull** (3- eller 4-veis delt): carryover, akkurat som 2-veis delt.
- **Netto-modus likhet**: HCP-strokes utjevner ofte → flere delte hull → mer carryover. Det er forventet og håndteres av carry-logikken.
- **2-spiller Skins**: fungerer (lavest vinner, delt = carry). Validator tillater 2.
- **Re-opening finished game**: scoring re-deriverer fra scores; ingen lagret state å invalidere.
- **Side-tournaments**: fungerer ut av boksen (gross-scores per hull finnes). Ingen ekstra arbeid.

## Key Decisions

- **Rene skins-poeng, base 1 skin/hull, additiv carryover** (per gray-area-runden): ingen kr/betting i appen. Leaderboard maksimerer klarhet på hvem som vant hvor mange skins, så spillere gjør opp pott eksternt.
- **Standard Skins-regler for uvunne skins**: henger-skins ved rundeslutt forblir uvunne, vist transparent. Ikke "del ut til lavest total" eller andre hjemmesnekrede regler.
- **Carryover alltid på** (format heter "med carryover" — definerende trekk). Ingen toggle.
- **Kontinuerlig 18-hulls carryover** (ingen reset ved turn). Standard.
- **Ingen ny DB-tabell** — carryover er ren funksjon av scores. Migrasjon kun seed (som Nassau).
- **Gross/net-toggle, default netto** — båret fra Wolf/Nassau.
- **Enkel v1-tiebreak** (totalSkins desc → holesWon desc → tied). Full cascade deferred, som Wolf.

**Claude's Discretion:**
- Eksakt banner-plassering/copy på scorecard (over score-input vs i HoleHero).
- Layout-detaljer i SkinsView (chip vs kolonne for carryover-indikator); speil det som er mest lesbart fra WolfView/NassauView.
- Hvordan `atStake` for gjeldende hull mates til HoleClient (egen prop vs avledet client-side). Velg det som matcher eksisterende mønster.
- Norsk copy: "skin"/"skins" beholdes som kjent golfterm (som "Lone Wolf"). "På spill" / "henger" / "scooper" — velg naturlig norsk; kjør `humanizer`.
- Achievement-strip i podium (f.eks. "Scoopet 5-skins-potten") — implementer hvis trivielt, ellers dropp.

## Success Criteria

- [ ] Migrasjon `0051_skins.sql` seeder format-row (`slug='skins'`, scoring_module `@/lib/scoring/modes/skins`, `is_cup_eligible=false`) + `format_intent_mapping` (`kompis`, primary, sort_order 70). Ingen ny tabell.
- [ ] `lib/scoring/modes/skins.ts` eksporterer `compute(ctx): SkinsResult` med carryover-state.
- [ ] `lib/scoring/modes/skins.test.ts` — Type A unit-tester (≥18 cases via `it.each` der naturlig): enkel vinner, 2-veis delt → carry, 3+-veis delt, multi-tied sekvens (hull 1–3 delt → hull 4 scooper 4 skins), pending hull stopper resolving, uvunne skins ved delt siste hull, gross vs net, 2- og 4-spiller. Inkluder eksplisitt "carryover vunnet på hull 4"-casen fra issue.
- [ ] `lib/scoring/index.ts` router har `skins`-case; `types.ts` har `SkinsResult`/`SkinsHoleRow`/`SkinsPlayerLine`/`SkinsHoleOutcome` + utvidet `GameMode`/`GameModeConfig`/`MODE_LABELS`.
- [ ] `lib/games/gamePayload.ts` har `validateSkins` (2–4 spillere, solo) registrert i `parseGameMode` + `modeValidators`.
- [ ] Wizard viser `SkinsSetup` med scoring-toggle når format = skins (Type C render-test).
- [ ] Scorecard viser "X skins på spill"-banner på hull-flaten når `gameMode === 'skins'`.
- [ ] `SkinsView` viser spiller-totals + per-hull carryover-tabell + henger-skins-linje (Type C render-test fra fixture); `SkinsPodium` viser 1/2/3 på totalSkins; dispatch i `leaderboard/page.tsx`.
- [ ] E2E `e2e/games/skins.spec.ts` — auth-gate golden path (speil `wolf.spec.ts`/`nassau.spec.ts`). Carryover-scoring-scenariet dekkes av Type A (riktig hjem per test-disiplin) — avvik fra issuets E2E-ordlyd noteres i closing-kommentar.
- [ ] Norsk copy gjennomgått med `humanizer:humanizer`.
- [ ] CHANGELOG-oppføring + minor-bump til `1.45.0` (samme commit som feature).

## Gates

Etter hver chunk:
- [ ] `npx tsc --noEmit` — 0 nye errors
- [ ] `npx vitest run lib/scoring/modes/skins` — alle Type A grønne
- [ ] `npx vitest run` — full suite grønn (regresjon)
- [ ] `npm run lint` — 0 errors

## Files Likely Touched

**Nye:**
- `supabase/migrations/0051_skins.sql`
- `lib/scoring/modes/skins.ts` + `skins.test.ts`
- `app/admin/games/new/sections/SkinsSetup.tsx` + `SkinsSetup.test.tsx`
- `app/games/[id]/leaderboard/SkinsView.tsx` + `SkinsView.test.tsx`
- `app/games/[id]/leaderboard/SkinsPodium.tsx`
- `e2e/games/skins.spec.ts`

**Endrede:**
- `lib/scoring/modes/types.ts` — Skins-typer + utvid `GameMode`/`GameModeConfig`/`MODE_LABELS`
- `lib/scoring/index.ts` — skins-case + import + type-eksport
- `lib/games/gamePayload.ts` — `validateSkins` + `parseGameMode` + `modeValidators`
- `app/admin/games/new/GameWizard.tsx` — render `<SkinsSetup>` + hidden input
- `app/admin/games/new/` state-hook (`useGameFormState`) — `skinsScoring`-state
- `app/games/[id]/holes/[holeNumber]/page.tsx` + `HoleClient.tsx` — skins-banner
- `app/games/[id]/leaderboard/page.tsx` — skins dispatch-case
- `CHANGELOG.md` + `package.json` — minor-bump 1.45.0

## Out of Scope

- **Kr-/penge-dimensjon** — bevisst utelatt. Spillere avtaler pott eksternt.
- **Konfigurerbar skin-verdi per hull** (vektede hull) — flat 1/hull i v1.
- **Carryover-reset ved turn** (front/back-separate skins) — kontinuerlig 18 i v1.
- **Omspill for uvunne henger-skins** — Tørny har ikke playoff.
- **Full 5-tier tiebreak-cascade** — enkel v1-tiebreak; deferred.
- **Skins-spesifikke achievements/notifikasjoner** — defer (utover evt. trivielt podium-strip).
- **9-hulls Skins-varianter** — Tørny antar 18-hulls runder.
