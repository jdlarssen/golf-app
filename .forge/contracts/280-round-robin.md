# Spec: Round Robin — 4-spiller med roterende partnere

**Issue:** [#280](https://github.com/jdlarssen/golf-app/issues/280)
**Parent epic:** [#270](https://github.com/jdlarssen/golf-app/issues/270)
**Batch:** Kompis-runde format (sekundær under `kompis`-intent)
**Avhengighet:** F1 (#271) — `formats` + `format_intent_mapping` (allerede landet, migrasjon 0047)

## Problem

Tørny støtter i dag 12 game_modes. **Round Robin** (også kalt «Sixes», «6-6-6» eller «Hollywood») er en sosial kompis-arketype for nøyaktig 4 spillere: runden deles i tre 6-hulls-segmenter, og partner-konstellasjonen roterer hvert segment slik at hver spiller spiller med + mot hver av de andre tre. Det spilles som 4BBB matchplay (beste netto av to teller for laget), og vinneren er spilleren med flest hull-seire totalt på tvers av de tre konstellasjonene.

Round Robin er mekanisk identisk med fourball matchplay (#217) på hull-nivå — beste netto-ball per side, sammenlign side mot side. Forskjellen er at «sidene» bytter hver 6. hull, og rangeringen er **per spiller** (ikke per fast lag), fordi lagene ikke er konstante. Dette gjør at modulen kan gjenbruke fourball-motorens per-hull-beregning fullt ut, men aggregere annerledes.

## Research Findings

Kanonisk Round Robin-regelsett (verifisert mot eksterne kilder 2026-05-29 — Jørgen ba eksplisitt om at scoring skal «følge reglene for round robin»):

- **Rotasjon (universell):** Med spillere A/B/C/D: hull 1–6 = A+B vs C+D, hull 7–12 = A+C vs B+D, hull 13–18 = A+D vs B+C. Hver spiller partner med hver annen nøyaktig én gang og møter hver annen to ganger. (Matcher issue-ordlyden eksakt.)
- **Per-hull-scoring:** Better-ball matchplay — på hvert hull tas beste netto per side, laveste netto vinner hullet for den siden.
- **Poeng-utdeling (mest eksplisitte kilde, golfcompendium.com):** *«in match play, award one point to each golfer on the team that wins a hole, then pay out the difference in points at the end of the match.»* → **Hull-seire-modell: +1 til hver spiller på den vinnende siden. Delte hull gir ingen poeng til noen.**
- **Vinner:** Flest hull-seire totalt (issue: «mest hull-seire totalt»). Den alternative betting-varianten «vinn 2 av 3 segment-matcher» er bevisst IKKE valgt — issuet spesifiserer kumulativ hull-telling.
- **Nøkkel-innsikt om delte hull:** På et delt hull får alle fire spillere samme inkrement (0 i hull-seire-modellen). Valget «delt = 0» vs «delt = ½» er derfor **rangerings-invariant** — vinneren blir identisk uansett. Vi velger «delt = 0» fordi det matcher både issue-ordlyden og den mest eksplisitte kanoniske kilden, og gir reneste tall.

Kilder: golfcompendium.com/2023/08/round-robin.html, golf.com/news/money-games-explained-how-to-play-sixes/, golfhandicapcalculator.co/round-robin-golf-6-6-6-rotate-partners/

## Prior Decisions

Fra epic #270 + F1-kontrakt ([271](271-f1-data-model.md)):
- Nytt format introduseres via egen migrasjon som seeder `formats`-row + `format_intent_mapping`. Ingen FK mellom `games.game_mode` og `formats.slug`.
- `is_active = false` skjuler fra wizard; slug fortsetter å funke i historiske games.
- Server-action-validering (ikke DB CHECK) håndhever game_mode.

Fra Wolf-kontrakt ([274](274-wolf.md)) — **arkitektonisk mal for 4-spiller rotasjon**:
- 4 spillere får `team_number` 1-4 = rotation-slot (A/B/C/D), `flight_number = team_number` (DB-CHECK `game_players_team_flight_consistency`).
- Validatoren håndhever EKSAKT 4 spillere med unike slots 1-4 ved publish.
- Hver modus eksporterer `compute(ctx): ModeResult` (discriminated union på `kind`). Pure logic, full Type A test-disiplin per [`lib/scoring/AGENTS.md`](../../lib/scoring/AGENTS.md).

Fra fourball-matchplay ([217](217-fourball-matchplay.md), [lib/scoring/modes/fourballMatchplay.ts](../../lib/scoring/modes/fourballMatchplay.ts)) — **scoring-motor som gjenbrukes**:
- `applyAllowance(courseHandicap, allowance_pct)` → effektiv HCP per spiller. WHS-default 85 %, 0 = brutto.
- `bestBallForHole(players)` → beste netto + contributors per side.
- `classifyMatchplayHole(side1Net, side2Net)` → `'side1_wins' | 'side2_wins' | 'tied' | 'unplayed'`.
- Wizard har eget per-format allowance-felt (`fourball_allowance_pct`, default 85). Round Robin får sitt eget `round_robin_allowance_pct` etter samme mønster.

Fra denne diskusjonsrunden (2026-05-29):
- **Q1 (poeng-telling):** «følg reglene for round robin» → hull-seire-modell (delt = 0), per research over.
- **Q2 (handicap / «kan round robin være et valg inne i 4bbb?»):** Round Robin gjenbruker fourballs per-hull-motor OG handicap-modell (`allowance_pct`, 85 % default) — men forblir sitt EGET format (egen `game_mode`-slug, eget kort under Kompis). Se «Key Architectural Decision».
- **Q3 (leaderboard):** Per-spiller-totaler (primær rangering) + segment-sammendrag (de 3 konstellasjonene med hull-seire per segment).

## Key Architectural Decision 1: INGEN ny tabell

Til forskjell fra Wolf (`wolf_hole_choices`) og BBB (`bingo_bango_bongo_holes`) trenger Round Robin **ingen ny tabell og ingen per-hull-input**. Partner-rotasjonen er en **ren deterministisk funksjon av (spiller-slot, hull-nummer)** — den er ikke et valg og ikke en observert prestasjon. Slagene tastes via det eksisterende scorekortet (uendret maskineri, akkurat som Wolf — 4 individuelle spillere taster egen gross). Scoring-modulen utleder alt fra `scores` + de fire spillernes `team_number`-slots. Dette gir minimal blast-radius: migrasjonen seeder kun format-row + intent-mapping.

## Key Architectural Decision 2: Eget format, delt motor (svar på Q2)

Jørgens intuisjon stemmer — Round Robin ER 4BBB matchplay på hull-nivå. Derfor gjenbruker `compute()` fourballs eksakte per-hull-motor (`applyAllowance` → `strokesForHole` → `bestBallForHole` → `classifyMatchplayHole`) og fourballs handicap-modell (`allowance_pct`). Men Round Robin forblir et **eget format**, ikke en toggle inni fourball, fordi alt RUNDT hull-beregningen er ulikt:

| | Fourball matchplay | Round Robin |
|---|---|---|
| Lag | 2 faste lag à 2 | 4 spillere, par roterer hvert segment |
| Resultat | Én match: `holesUp`, «3&2»/«AS» | Per-spiller-rangering på hull-seire |
| Mat-em (early decision) | Ja (match avgjøres før 18) | Nei — alle hull spilles og teller |
| Leaderboard | Ett 2-side-scoreboard | 4 spillere ranket + segment-sammendrag |
| Wizard | Tildel 4 spillere til 2 lag | Tildel 4 spillere til slots A/B/C/D |

Å presse to inkompatible resultat-/UI-shapes inn i samme `kind` ville brutt «ett game_mode = én scoring-modul = én result-kind»-mønsteret hele katalogen følger (fourball gjenbruker selv singles' helpers uten å være «en variant av singles»). Round Robin skal også være sitt eget kort under Kompis (issue-placement + epic #270-katalog-modell). **Konklusjon: eget `game_mode: 'round_robin'`, men compute() er en tynn rotasjons-+-aggregerings-wrapper rundt fourball-motoren.**

## Design

### 1. Scoring-modul — `lib/scoring/modes/roundRobin.ts`

**Discriminator:** `game_mode: 'round_robin'`, `mode_config.kind: 'round_robin'`.

**Slot → segment-pairing (ren funksjon):** A=slot1, B=slot2, C=slot3, D=slot4.
- Segment 1 (hull 1–6): side1 = [slot1, slot2], side2 = [slot3, slot4]
- Segment 2 (hull 7–12): side1 = [slot1, slot3], side2 = [slot2, slot4]
- Segment 3 (hull 13–18): side1 = [slot1, slot4], side2 = [slot2, slot3]

`segmentForHole(holeNumber) = Math.floor((holeNumber - 1) / 6) + 1` (1–3 for hull 1–18).

**Algoritme (`compute(ctx): RoundRobinResult`):**
```
allowancePct = readAllowancePct(ctx)            // mode_config.allowance_pct, default 85
slot[n] = players.find(p => p.teamNumber === n)  // n = 1..4
if (ikke nøyaktig 4 spillere med unike slots 1-4) return emptyShell()   // defensiv, som fourball

for hver hull 1..18 (sortert):
  seg = segmentForHole(hole)
  [side1Ids, side2Ids] = segmentPairings(seg)
  // Per-spiller-celle (gjenbruk fourball-mønster): gross → extra (applyAllowance + strokesForHole) → net
  side1Cells = buildCells(side1Ids); side2Cells = buildCells(side2Ids)
  bb1 = bestBallForHole(side1Cells); bb2 = bestBallForHole(side2Cells)
  result = classifyMatchplayHole(bb1.teamNet, bb2.teamNet)   // 'side1_wins'|'side2_wins'|'tied'|'unplayed'
  holeWinByPlayer = {}
  if result === 'side1_wins': for id in side1Ids: holeWinByPlayer[id] = 1
  if result === 'side2_wins': for id in side2Ids: holeWinByPlayer[id] = 1
  // 'tied'/'unplayed': ingen hull-seire (delt = 0)
  akkumulér per spiller: totalHoleWins, totalHolesLost, totalHolesHalved
  akkumulér per (spiller, segment): holesWon/holesLost/holesHalved + partner/opponents
  push RoundRobinHoleRow

players = rankPlayers(...)
```

**Rangering:** `totalHoleWins` DESC → `totalHolesLost` ASC → `teamNumber` ASC (deterministisk). `tiedWith` settes for spillere med eksakt lik (totalHoleWins, totalHolesLost). Dokumentér i kode at full 5-tier-cascade ikke gjelder (ikke slag-basert ranking).

**Output (nye typer i `types.ts`):** gjenbruk `MatchplayHoleResult` (`'side1_wins'|'side2_wins'|'tied'|'unplayed'`) for per-hull-utfall.
```ts
export interface RoundRobinPlayerCell {
  userId: string;
  gross: number | null;
  extraStrokes: number;
  net: number | null;
  isContributor: boolean;      // hadde side-best netto på hullet (kan være begge ved tie)
  par: number;                 // parFor(hole, teeGender) — #240
}

export interface RoundRobinHoleRow {
  holeNumber: number;
  segment: 1 | 2 | 3;
  par: number;                 // = side1Par (backward-compat)
  side1Par: number;
  side2Par: number;
  strokeIndex: number;
  side1PlayerIds: [string, string];   // hvem som utgjør side 1 på DETTE hullet (avhenger av segment)
  side2PlayerIds: [string, string];
  side1Players: RoundRobinPlayerCell[];
  side2Players: RoundRobinPlayerCell[];
  side1BestNet: number | null;
  side2BestNet: number | null;
  side1ContributorIds: string[];
  side2ContributorIds: string[];
  result: MatchplayHoleResult;
  holeWinByPlayer: Record<string, number>;   // 0 eller 1 per spiller
}

export interface RoundRobinSegmentLine {
  segment: 1 | 2 | 3;
  holeNumbers: number[];               // [1..6] | [7..12] | [13..18]
  partnerUserId: string;               // hvem spilleren spilte MED i dette segmentet
  opponentUserIds: [string, string];
  holesWon: number;                    // hull spillerens side vant i segmentet
  holesLost: number;
  holesHalved: number;
}

export interface RoundRobinPlayerLine {
  userId: string;
  teamNumber: number;                  // slot 1-4 (A/B/C/D)
  totalHoleWins: number;               // primær rangering (sum over 18 hull)
  totalHolesLost: number;
  totalHolesHalved: number;
  segments: RoundRobinSegmentLine[];   // alltid 3 (én per segment)
  rank: number;
  tiedWith: string[];
}

export interface RoundRobinResult {
  kind: 'round_robin';
  allowancePct: number;
  holes: RoundRobinHoleRow[];
  players: RoundRobinPlayerLine[];
}
```

### 2. Mode-registrering + config

- `lib/scoring/index.ts`: `import * as roundRobin from './modes/roundRobin'`, legg til `case 'round_robin': return roundRobin.compute(ctx);`, re-eksporter Round Robin-typene.
- `lib/scoring/modes/types.ts`:
  - `GameMode`-union: `| 'round_robin'`
  - `MODE_LABELS`: `round_robin: 'Round Robin'`
  - `GameModeConfig`-union: `| { kind: 'round_robin'; team_size: 1; teams_count: 4; allowance_pct: number }` (speiler Wolf-shapen, men `allowance_pct` i stedet for `wolf_scoring`).
  - Utvid `ModeResult`-union med `RoundRobinResult`.
  - **Søk opp ALLE `Record<GameMode, …>` og `switch`-er på game_mode** (jf. minne om tsc/Vercel-build-gate) — se «Files Likely Touched».

### 3. Validator — `lib/games/gamePayload.ts`

Ny `validateRoundRobin(formData, mode)` — strukturell hybrid av `validateWolf` (4-slot) + `validateFourballMatchplay` (allowance):
- EKSAKT 4 spillere ved publish; 0–3 → `min_players_for_mode`, 5+ → `too_many_players_for_mode`.
- `team_number` 1-4, alle distinct → ellers `bad_team` / `team_balance` (gjenbruk Wolf-kodene).
- `flight_number = team_number` (DB-CHECK-konsistens).
- Allowance via nytt felt `round_robin_allowance_pct` (parse-helper speiler `parseFourballAllowancePct`: draft default 85, publish krever gyldig 0–100, ellers `bad_allowance`).
- `mode_config`-output: `{ kind: 'round_robin', team_size: 1, teams_count: 4, allowance_pct }`.
- Wire i `parseGameMode` (`raw === 'round_robin'`) + `modeValidators`-mappen (begge exhaustive på GameMode).

### 4. Wizard — slot-tildeling + allowance

Round Robin er et 4-spiller-slot-format (som Wolf). Mønster å speile: `WolfSetup`-integrasjonen i `useGameFormState.ts` + `GameWizard.tsx`.
- `useGameFormState.ts`: ny `isRoundRobin`-flag; config-builder-gren som returnerer round_robin-config; canPublish krever nøyaktig 4 spillere; slot-tildeling 1-4. **Slot-tildeling er kosmetisk** (alle permutasjoner gir samme totaler — hver spiller partner alle og møter alle uansett), så deterministisk tildeling i valgrekkefølge holder. Shuffle er valgfri flair (Claude's discretion).
- Nytt allowance-state `round_robin_allowance_pct` (default 85), submittes som form-felt. Gjenbruk samme allowance-input-UI som fourball.
- `app/admin/games/new/TeamSizeSelector.tsx`: `ENABLED_COMBOS.round_robin = new Set<TeamSize>([1])` (exhaustive Record — build-gate).
- `app/admin/games/new/sections/ReadyStep.tsx`: `MODE_SUMMARY_LABELS.round_robin = 'Round Robin'`.
- `GameWizard.tsx`: render round_robin-oppsett (dedikert `RoundRobinSetup.tsx` som speiler `WolfSetup` men med allowance-slider i stedet for gross/net-toggle, ELLER gjenbruk generisk flyt + allowance-felt — Claude's discretion, velg minst kode).

### 5. Scorekort — partner-konstellasjon-badge

Issue-krav: «Scorecard: viser nåværende partner-konstellasjon på hvert hull». Ren visning (ingen input), speiler Wolf-badge-mønsteret.
- `app/games/[id]/holes/[holeNumber]/HoleClient.tsx` (+ `page.tsx`): når `gameMode === 'round_robin'`, render en badge over score-padden: «Segment {seg}/3 · Du spiller med {partner} mot {opp1} + {opp2}». Konstellasjonen utledes klient-side fra de fire spillernes `team_number`-slots + current `holeNumber` (ingen ny fetch — slots finnes allerede på game_players). Spillere taster egen gross som vanlig (4-spiller-scorekort, uendret, som Wolf).
- Tap-targets ≥44px, norsk copy.

### 6. Leaderboard — `RoundRobinView` + `RoundRobinPodium`

Routing-mønster: `app/games/[id]/leaderboard/page.tsx` har en `if (game.game_mode === 'X') return renderX(...)`-kjede med `renderX`-funksjoner. (Ingen `LeaderboardTabs.tsx` lenger — den refererte i Wolf-kontrakten er erstattet av render-funksjon-kjeden.)
- `renderRoundRobin(opts)`: fetch holes + scores (eksisterende slim-fetch, som renderFourballMatchplay), bygg `ScoringContext`, `computeLeaderboard` → narrow på `kind === 'round_robin'`. Finished → `<RoundRobinPodium>`, aktiv/scheduled → `<RoundRobinView>`.
- `RoundRobinView.tsx` (NY): **per-spiller-rangering** (kolonner: spiller, hull-seire, evt. tapt/delt, `tabular-nums`) + **segment-sammendrag** (3 blokker: «Segment 1 (hull 1–6) — med {partner}: vant X, tapte Y, delte Z»). Respekter reveal-modus (skjul totaler til `finished` hvis `score_visibility === 'reveal'`). Bruk `WolfView`/`BingoBangoBongoView`-struktur som mal.
- `RoundRobinPodium.tsx` (NY): 1./2./3.-plass på totalHoleWins, champagne-gull kun på vinner. Speil `WolfPodium`/`BingoBangoBongoPodium`.

### 7. Migrasjon — `supabase/migrations/0054_round_robin.sql`

KUN seed (ingen tabell):
```sql
insert into public.formats (slug, display_name, icon_key, short_description, scoring_module, is_active, is_cup_eligible)
  values ('round_robin', 'Round Robin', 'round_robin',
          '4 spillere, roterende partnere hvert 6. hull. Flest hull-seire vinner.',
          '@/lib/scoring/modes/roundRobin', true, false);

insert into public.format_intent_mapping (format_slug, intent, is_visible, is_primary, sort_order)
  values ('round_robin', 'kompis', true, false, 80);  -- bekreft neste ledige sort_order mot eksisterende kompis-rader
```

### 8. Ikon + mode-guide

- `lib/formats/icons.tsx`: `ICON_MAP.round_robin = RoundRobinIcon` (28×28, stroke=currentColor; rotasjons-tema, f.eks. fire prikker med sirkulær pil). Fall tilbake til generisk hvis tid er knapp.
- `lib/formats/modeGuide.ts`: `MODE_GUIDE.round_robin = { summary, points: [...] }` på norsk — forklar rotasjon (med + mot alle), 4BBB-matchplay per hull, vinner = flest hull-seire.

## Edge Cases & Guardrails

- **Ikke nøyaktig 4 spillere / ikke unike slots 1-4:** scoring-modulen returnerer `emptyShell()` (defensiv, som fourball); validatoren håndhever ved publish.
- **Hull uten gross for én/begge sider:** `classifyMatchplayHole` → `'unplayed'`; hullet teller verken som seier eller tap for noen. Beste-ball-tradisjon: én partner med gross holder for at siden har en best (hullet er kun unplayed når en side mangler BEGGE).
- **Delt hull (lik beste netto):** `'tied'` → ingen hull-seire, men telles i `totalHolesHalved` og segment-`holesHalved`. Rangerings-invariant (se Research).
- **Allowance 0 % (brutto):** `applyAllowance(ch, 0)` → 0 strokes; ren brutto-matchplay. Gyldig.
- **Ingen mat-em:** alle 18 hull spilles og teller mot hull-seire — Round Robin har ikke fourballs «3&2»-avgjørelse. `computeMatchResult` brukes IKKE.
- **Mindre enn 18 hull spilt:** kun spilte hull bidrar; pending hull gir 0 til alle. Final rangering på det som faktisk er spilt.
- **9-hulls-runder:** ikke støttet (Tørny antar 18-hulls runder, som Wolf). Defer.
- **Spiller forsvinner mid-runde:** ikke støttet (som øvrige modes).
- **Reveal-modus:** skjul totaler til `finished` hvis `score_visibility === 'reveal'` (som øvrige views).
- **Side-turnering (CTP/LD):** fungerer uendret — slag finnes per spiller.
- **`teamNumber`/`teeGender` per-kjønn-par (#240):** bruk `parFor(hole, player.teeGender)` per spiller, som fourball.

## Key Decisions

- **Hull-seire-modell, delt = 0** (Q1, «følg reglene»): +1 til hver spiller på vinnende side; delte/unplayed hull gir 0. Grunnlag: mest eksplisitte kanoniske kilde + issue-ordlyd + rangerings-invariant mot ½-alternativet.
- **Eget format som gjenbruker fourball-motoren** (Q2): egen `game_mode: 'round_robin'`, men `compute()` er rotasjon + aggregering rundt `bestBallForHole`/`classifyMatchplayHole`/`applyAllowance`. Begrunnelse i «Key Architectural Decision 2».
- **`allowance_pct`-handicap (85 % WHS-default)** som fourball — golf-korrekt for matchplay og holder scoring-koden per-hull identisk med fourball. Eget `round_robin_allowance_pct`-wizard-felt (speiler fourball-mønsteret).
- **Ingen ny tabell** (Key Architectural Decision 1): rotasjon er deterministisk funksjon, slag fra eksisterende scorekort.
- **Per-spiller-rangering + segment-sammendrag** (Q3): primær rang på `totalHoleWins`, segment-blokker viser de 3 konstellasjonene.
- **Slot-tildeling kosmetisk → valgrekkefølge** (ingen tvungen shuffle): alle permutasjoner gir samme totaler.
- **View + Podium** (ikke ett kombinert som fourball): speiler kompis-søsknene Wolf/Skins/Nassau/BBB som alle har vinner-feiring på podium.
- **Filnavn `roundRobin.ts` (camelCase)** — repo-konvensjon (`fourballMatchplay.ts`, `bingoBangoBongo.ts`). Slug i DB forblir `round_robin`.

**Claude's Discretion:**
- Dedikert `RoundRobinSetup.tsx` (speil WolfSetup) vs. gjenbruk av generisk wizard-flyt + allowance-felt — velg minst kode.
- Om slot-shuffle-knapp tas med (kosmetisk) eller droppes.
- Eksakt `sort_order` under kompis (bekreft mot eksisterende rader; 80 antatt).
- Ikon-design for `round_robin`.
- Test-organisering: én `roundRobin.test.ts` med alt, eller splittet.
- Om per-hull-detalj-tabell (18 rader) tas med i `RoundRobinView` i tillegg til segment-sammendraget — start med segment-sammendrag (Q3-valget), legg til hull-tabell kun hvis det er rent.
- Norsk ord for «hull-seire» / segment-tekster — kjør `humanizer`.

## Success Criteria

- [x] `lib/scoring/modes/roundRobin.ts` eksporterer `compute(ctx): RoundRobinResult`; gjenbruker `bestBallForHole` + `classifyMatchplayHole` + `applyAllowance` + `strokesForHole` + `parFor`. — `roundRobin.ts:228` (commit aa3f862)
- [x] `lib/scoring/modes/roundRobin.test.ts` — Type A unit-tester (`it.each`): full 18-hulls runde med blandede resultater på tvers av de 3 segmentene; verifiser at hver spiller partner med + mot hver annen; hull-seire-telling (delt = 0); ranking + tiebreak; segment-breakdown korrekt; allowance 0 (brutto) vs 85; unplayed/pending hull; defensiv emptyShell ved ≠4 spillere. — **38 tester grønne**
- [x] `lib/scoring/index.ts` har `round_robin`-case + type-re-eksport; `npx tsc --noEmit` grønn. — verifisert
- [x] `lib/scoring/modes/types.ts` har Round Robin-typene + utvidet `GameMode`/`GameModeConfig`/`ModeResult`/`MODE_LABELS`. — `types.ts`
- [x] `lib/games/gamePayload.ts` har `validateRoundRobin` (eksakt 4, slots 1-4, allowance) wired i `parseGameMode` + `modeValidators`; validator-tester (4 ok, 3 → min, 5 → too_many, ikke-unike slots → team_balance, bad allowance). — **16 validator-tester grønne**
- [x] Wizard viser Round Robin som valgbart format under Kompis, krever 4 spillere, og har allowance-felt (default 85). `ENABLED_COMBOS` + `MODE_SUMMARY_LABELS` + `MODE_GUIDE` + `ICON_MAP` har round_robin-entry. — `RoundRobinSetup.tsx` + `useGameFormState.ts` (`isRoundRobin`, `roundRobinAllowancePct`=85, `roundRobinPlayersValid`=4) + `GameWizard.tsx` (commit 1596874)
- [x] Scorekort viser partner-konstellasjon-badge på hvert hull når `gameMode === 'round_robin'` (Type C render-test). — `RoundRobinBadge.tsx` via `roundRobinConstellationForHole()` (commit 36391e4)
- [x] `RoundRobinView.tsx` viser per-spiller-totaler + segment-sammendrag fra fixture (Type C render-test); `RoundRobinPodium.tsx` viser 1/2/3 på hull-seire. — commit f991ad2 (4 render-tester)
- [x] `renderRoundRobin` i leaderboard/page.tsx router round_robin-games korrekt (finished → Podium, aktiv → View). — `page.tsx:449` + `renderRoundRobin` (commit f991ad2)
- [~] Migrasjon `0054_round_robin.sql` seeder format-row + intent-mapping (sort_order=100). **Fil skrevet (commit 1596874); APPLISERES via Supabase MCP rett etter merge+deploy** (unngår prod-kode/DB-mismatch). Verifiseres da: `select count(*) from formats where slug='round_robin'` = 1.
- [x] Norsk copy gjennomgått med `humanizer:humanizer`-skill. — 4/5 strenger rene; CHANGELOG-tagline em-dash-kjede fikset (commit afe8eb8)
- [x] CHANGELOG-oppføring + minor-bump 1.49.0 → 1.50.0. — commit 1596874

## Gates

Etter hver chunk:
- [ ] `npx tsc --noEmit` — 0 nye errors
- [ ] `npx vitest run lib/scoring/modes/roundRobin` — Type A grønn
- [ ] `npx vitest run` — full suite grønn (regresjonsbeskyttelse)
- [ ] `npm run lint` — 0 errors
- [ ] `npm run build` — grønn (fanger exhaustive-switch/Record-gaps som tsc alene kan glippe; jf. minne om Vercel-build-trap)
- [ ] Playwright/manuell iPhone-Safari-sjekk for scorekort-badge + leaderboard hvis frontend rørt

## Files Likely Touched

**Nye:**
- `lib/scoring/modes/roundRobin.ts` + `.test.ts`
- `app/games/[id]/leaderboard/RoundRobinView.tsx` (+ test)
- `app/games/[id]/leaderboard/RoundRobinPodium.tsx`
- `app/admin/games/new/sections/RoundRobinSetup.tsx` (hvis dedikert setup velges) (+ test)
- `supabase/migrations/0054_round_robin.sql`
- `e2e/round-robin-golden-path.spec.ts` (golden path, anbefalt)

**Endrede (exhaustive `Record<GameMode>` / switch — MÅ oppdateres ellers feiler build):**
- `lib/scoring/modes/types.ts` — `GameMode`, `GameModeConfig`, `ModeResult`, `MODE_LABELS` + Round Robin-typer
- `lib/scoring/index.ts` — `round_robin`-case i `computeLeaderboard` + re-eksport
- `lib/games/gamePayload.ts` — `validateRoundRobin` + `parseGameMode` + `modeValidators`
- `app/admin/games/new/TeamSizeSelector.tsx` — `ENABLED_COMBOS`
- `app/admin/games/new/sections/ReadyStep.tsx` — `MODE_SUMMARY_LABELS`
- `app/admin/games/new/useGameFormState.ts` — `isRoundRobin`-flag, config-builder, canPublish, slot-tildeling, `round_robin_allowance_pct`-state
- `app/admin/games/new/GameWizard.tsx` — render round_robin-oppsett
- `app/games/[id]/leaderboard/page.tsx` — `renderRoundRobin` + routing-gren
- `app/games/[id]/holes/[holeNumber]/HoleClient.tsx` + `page.tsx` — konstellasjon-badge
- `lib/formats/icons.tsx` — `round_robin`-ikon
- `lib/formats/modeGuide.ts` — `round_robin`-guide
- `CHANGELOG.md` + `package.json` — minor-bump

(Bekreft fullstendig liste av exhaustive maps ved å søke `Record<GameMode`, `MODE_LABELS`, `switch.*game_mode` før build-gate.)

## Out of Scope

- **Ny tabell / per-hull-input** — bevisst unngått (Key Architectural Decision 1).
- **«Vinn 2 av 3 segment-matcher»-variant** — issuet valgte kumulativ hull-telling; segment-match-vinner kan vises informativt i view, men er ikke primær rangering.
- **Mat-em / «3&2»-avgjørelse** — Round Robin spiller alltid alle 18.
- **9-hulls Round Robin, 3-spiller-variant, mid-round player-swap** — som øvrige modes, defer.
- **Konfigurerbar segment-lengde** (ikke alltid 6-6-6) — hardkodet 6-6-6 i v1.
- **Gross/netto-toggle** — Round Robin bruker allowance_pct (matchplay-modell), ikke Wolf-stil toggle.
- **Achievements/bragging-stats** utover segment-sammendraget.

## Deferred Ideas

- Per-hull-detalj-tabell (18 rader med konstellasjon + utfall) i RoundRobinView hvis segment-sammendraget viser seg å være for tynt.
- «Round Robin Nines» (poeng-variant der hver 6-hulls-match deler ut 6 poeng fordelt på de to sidene) — eget format hvis bruker etterspør.
