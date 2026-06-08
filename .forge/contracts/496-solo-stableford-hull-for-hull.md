# Forge-kontrakt: Solo / Modified Stableford format-bevisst «Hull for hull» + head-to-head (epic #496, PR 9 — siste)

**Issue:** [#496](https://github.com/jdlarssen/golf-app/issues/496)
**Branch:** `claude/dreamy-faraday-e4d745`
**Status:** self-eval complete — all 8 criteria checked with evidence; gates green (build + 81 tests + tsc). NB: discovered modified-stableford negative-total edge → made HeadToHeadResult tug-of-war bar negative-robust (0-baseline shift, no-op for non-negative formats).
**Bump:** MINOR `1.102.0 → 1.103.0` (ny bruker-synlig flate)

## Kontekst

Epic #496 PR 9 (siste) — **solo stableford + modified stableford**. «Hull for hull» kjører i dag generisk best-ball for begge og tegner et «Lag N»-scorekort — feil for solo. Epicen vil ha et klassisk per-spiller stableford-scorekort med poeng per hull.

**To game_modes, ett resultat:** `stableford` og `modified_stableford` deler `computeWithPointsTable` (modified har bare en annen poeng-tabell + contributor-regel) og returnerer begge `kind: 'stableford'` med `variant: 'solo' | 'team'`. `isStablefordFamily(game_mode)` ruter begge til `renderStableford`. **Kun SOLO-varianten mangler per-hull** — team-varianten (`StablefordTeamResult.teams[].holes`) har allerede `StablefordTeamHoleRow`. Denne PR-en rører kun solo.

**Modified-poeng kan være negative:** par = 0, bogey = −1, dobbeltbogey+ = −3, birdie = +2, eagle = +5, albatross+ = +8. «Best på hullet» = HØYEST poeng (ikke lavest). Uspilt hull gir 0 poeng OG par gir 0 poeng — så «spilt» MÅ avgjøres på `gross !== null`, ikke `points !== 0`.

Eier-beslutninger (bekreftet sesjonen): ett format per kjøring (nå stableford-familien); H2H JA ved 2 spillere (`fitsPlayerCount`: begge ≥ 1); framing mitt valg.

## Scoring-utvidelse (Type A, TDD FØRST)

`StablefordSoloResult` eksponerer kun totaler. Intern `perHole` (points) finnes men er ueksponert, og skiller ikke spilt-0 fra uspilt-0. Utvid SOLO-resultatet additivt:

```ts
export interface StablefordSoloHolePlayerCell {
  userId: string;
  gross: number | null;   // null = ikke spilt
  points: number;         // 0 ved uspilt; ellers fra poeng-tabellen (kan være negativ i modified)
}

export interface StablefordSoloHoleRow {
  holeNumber: number;
  par: number;
  strokeIndex: number;
  perPlayer: StablefordSoloHolePlayerCell[];
  bestUserIds: string[];  // HØYEST points blant SPILTE (gross !== null); [] hvis ingen; > 1 = delt
}

// StablefordSoloResult får:  holes: StablefordSoloHoleRow[];
// StablefordTeamResult er UENDRET (har allerede per-hull).
```

- Bygg i `computeSolo` (har `holesSorted`, `grossByKey`, `ctx.players`, `pointsFn`). Gjenbruk `strokesForHole` + `parFor(hole, teeGender)` + `pointsFn` (samme tabell som rankingen, så de ikke kan divergere; modified får negative poeng fritt).
- `bestUserIds` = spillere med `gross !== null` og MAX points. Tom hvis ingen spilte; > 1 ved delt.
- Test BÅDE standard (positiv tabell) og modified (negativ tabell) i de nye Type A-casene.

## Strøm A — SoloStablefordHolesView (framing: stableford-scorekort)

Som solo-strokeplay-flaten, men poeng i stedet for slag, og HØYEST vinner hullet:
1. **Stillings-header:** rangert (høyest poeng først), per spiller poeng-total + «X hull spilt», leder i champagne.
2. **Ut / Inn-bolker:** per-hull-kort — hull/par/SI + per spiller brutto-shape → poeng (sortert HØYEST poeng først), entydig hull-vinner (høyest poeng) i champagne med ★; delt = nøytralt. Poeng-subtotal per ni. Negative poeng vises med U+2212-minus.
3. **Reveal-modus:** `scoreVisibility === 'reveal' && gameStatus !== 'finished'` → reveal-hidden (speil de andre).

Designkrav: `tabular-nums`, champagne kun til vinner, gjenbruk `Card`/`Kicker`/`AppShell`/`LeaderboardBackdrop`/`formatRevealName`/`ScoreShape`, mobil-først, ≥44px, dark-mode, ingen lag-språk.

## Strøm B — HeadToHeadResult ved 2 spillere (høyest-vinner)

Stableford er **høyest poeng vinner** → `HeadToHeadResult` brukes med `lowerWins` UTELATT (default false — samme som Skins/BBB/Nassau). I `renderStableford`, i SOLO-grenen (etter `result.variant === 'team'`-return), når `game.status === 'finished'` && `result.players.length === 2` && **`!showSideTournament`** → `HeadToHeadResult` i stedet for `SoloStablefordPodium`.

- `score = totalPoints`; `unitLabel = 'poeng'`; `formatLabel = game.game_mode === 'modified_stableford' ? 'Modified Stableford' : 'Stableford'`.
- `winnerUserId` = rank-1 (tie iff begge deler rank); `strip` fra per-hull `bestUserIds` (a/b/halved/unplayed); ingen `hangingNote`.
- **Side-tournament-edge:** når `showSideTournament` er true beholdes podiet (i tabs) — duell-kortet integreres ikke med sideturneringen (sjelden kombinasjon, holder podium-flyten intakt).

## Integrasjon

- `buildStablefordContext.ts` (ny) — eier WD-filtrering (#386) + `isTeamVariant`-teamNumber-logikk + sender det reelle `game_mode` gjennom (stableford vs modified, så router velger riktig tabell). Delt av `renderStableford` (solo OG team) + `SoloStablefordHolesBody`.
- `holes/page.tsx` — branch: `(mode_config.kind === 'stableford' || 'modified_stableford') && team_size === 1` → `SoloStablefordHolesBody`. Team-stableford (team_size 2) faller gjennom til generisk `DrilldownBody` som i dag (team-format, utenfor epic-scope).
- `e2e/games/solo-stableford.spec.ts` (ny) — tre auth-gate-tester, speil solo-strokeplay.spec.ts.
- `SoloStablefordView.test.tsx` + `SoloStablefordPodium.test.tsx` — `holes: []` i solo-fixtures (nytt påkrevd felt på solo-resultatet).

## Gates

1. **`npm run build`** — grønt.
2. **`npx vitest run lib/scoring/modes/stableford.test.ts lib/scoring/modes/modifiedStableford.test.ts "app/games/[id]/leaderboard/holes/SoloStablefordHolesView.test.tsx" "app/games/[id]/leaderboard/HeadToHeadResult.test.tsx" "app/games/[id]/leaderboard/SoloStablefordView.test.tsx" "app/games/[id]/leaderboard/SoloStablefordPodium.test.tsx"`** — grønt.
3. **`humanizer:humanizer`** på ny norsk copy.
4. **Version-bump MINOR** (1.102.0 → 1.103.0) + CHANGELOG i SAMME commit.

## Success-kriterier

- [x] **A1 — Scoring:** `StablefordSoloResult.holes` eksponerer per-hull `gross` (null på uspilt) + `points` + `bestUserIds` (høyest poeng blant spilte, `gross !== null`). TDD rød → grønn, testet på BÅDE standard (stableford.test.ts) + modified (modifiedStableford.test.ts, negative poeng −1/−3) tabeller. Team-varianten + eksisterende solo-felt urørt. *Evidens: `StablefordSoloHoleRow`/`computeSoloHoleRows` i types.ts/stableford.ts; 76 passed (standard+modified+view+podium). Commit b5496a4.*
- [x] **A2 — Branch:** `/leaderboard/holes` på et solo stableford/modified-spill rendrer `SoloStablefordHolesView` — IKKE «Lag N»-scorekortet (render-test `not.toContain('Lag')`). Branch på `mode_config.kind ∈ {stableford, modified_stableford} && team_size === 1`; team faller til generisk. *Evidens: holes/page.tsx branch + SoloStablefordHolesBody. Commit b6dfe6e.*
- [x] **B1 — H2H (høyest-vinner):** Ferdig 2-spiller solo stableford uten sideturnering viser `HeadToHeadResult` (score=totalPoints, default høyest-vinner) i stedet for podium. 1/3+/team/sideturnering beholder podium (`result.players.length === 2 && !showSideTournament`-gate). *Evidens: renderStableford solo-gren. Commit b6dfe6e.*
- [x] **C1 — Delt kontekst:** `buildStablefordContext` (WD #386 + team-variant teamNumber + game_mode-passthrough for poeng-tabell) deles av `renderStableford` (solo+team) + `SoloStablefordHolesBody`. *Evidens: lib/scoring/context/buildStablefordContext.ts; begge call-sites. Commits d6d4afc + b6dfe6e.*
- [x] **C2 — Designkrav:** `isRevealHidden`; `tabular-nums`; header `h-11 w-11`; theme-tokens (dark mode); H2H-strip `reveal-up`; negative poeng via `formatPoints` (U+2212). *Evidens: SoloStablefordHolesView.tsx.*
- [x] **C3 — Tester:** én Type C render-test for `SoloStablefordHolesView` (struktur + champagne + negativt poeng, ikke Type A-tall); ny `e2e/games/solo-stableford.spec.ts` (3 auth-gate). **Avvik fra kontrakt:** HeadToHeadResult fikk likevel en endring — tug-of-war-baren ble gjort negativ-robust (0-basislinje-skift) fordi modifisert stableford bruker netto-poeng (par=0) og totaler kan bli negative; skiftet er en no-op for ikke-negative format (lo=0), så Skins/BBB/Nassau/slagspill er uendret (eksisterende cases grønne). Låst med et negativ-score-`it`. *Evidens: 81 passed. Commits 515d2b6 + e2e.*
- [x] **C4 — Ingen regresjon:** `DrilldownBody` urørt; team-stableford + sideturnering-flyt uendret (H2H bare i solo + `!showSideTournament`); positive H2H-format uendret (lo=0); `npm run build` grønt. *Evidens: build + diff.*
- [x] **D1 — Versjon:** bump MINOR 1.102.0 → 1.103.0; CHANGELOG `## 1.103.y — Stableford · hull for hull` åpen, 1.102 wrappet. Epic-sjekkliste PR 9 oppdateres på issue → **epic #496 fullført**. *Evidens: package.json + CHANGELOG. Commit b6dfe6e.*

## Utenfor scope

- Team-/par-stableford «Hull for hull» (lag-format, ikke solo) — beholder generisk visning.
- Sideturnering-redesign.
- Podium for 1/3+ spillere.
