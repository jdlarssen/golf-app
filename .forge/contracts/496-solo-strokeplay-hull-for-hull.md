# Forge-kontrakt: Solo strokeplay format-bevisst «Hull for hull» + head-to-head (epic #496, PR 8)

**Issue:** [#496](https://github.com/jdlarssen/golf-app/issues/496)
**Branch:** `claude/dreamy-faraday-e4d745`
**Status:** self-eval complete — all 8 criteria checked with evidence; gates green (build + 55 tests + tsc)
**Bump:** MINOR `1.101.0 → 1.102.0` (ny bruker-synlig flate)

## Kontekst

Epic #496 PR 8 — **solo strokeplay** (`game_mode === 'solo_strokeplay'`). «Hull for hull» kjører i dag generisk best-ball `computeLeaderboard` for alle format. For solo-strokeplay tegner det et **lag-scorekort med «Lag N»-rader** (hver spiller = ett 1-manns-lag) — feil språk og feil ramme: spillerne spilte hver sitt scorekort, ikke som lag. Epicen vil ha et **klassisk per-spiller-scorekort** i stedet.

Eier-beslutninger (gjelder denne + resten av epicen, bekreftet denne sesjonen):
- **Scope:** ett format per kjøring; nå solo-strokeplay.
- **Strøm B (H2H):** JA ved nøyaktig 2 spillere (`fitsPlayerCount`: `solo_strokeplay` ≥ 1, så 2 er gyldig). Eier bekreftet H2H for de gjenstående formatene.
- **Strøm A-framing:** mitt valg (eier deferret, som for Nassau).

## Mønsteret (speil de syv foregående)

- `SoloStrokeplayHolesView.tsx` (server-comp) under `app/games/[id]/leaderboard/holes/` — rikere enn `SoloStrokeplayView` (som kun viser totaler): per-hull netto + brutto per spiller.
- `buildSoloStrokeplayContext.ts` i `lib/scoring/context/` — trekk den inline `ScoringContext`-map-en ut av `renderSoloStrokeplay` (leaderboard/page.tsx) så begge flatene deler én kilde. **NB:** `renderSoloStrokeplay` filtrerer ut WD-spillere (`withdrawn_at != null`) før ctx bygges — helperen MÅ ta imot allerede-filtrerte spillere (eller filtrere selv) så «Hull for hull» og leaderboard ser samme felt.
- Branch i `holes/page.tsx` på `game.game_mode === 'solo_strokeplay'` → `<Suspense><SoloStrokeplayHolesBody/></Suspense>`. Solo, ingen ekstra fetch utover scores (speiler `NassauHolesBody`). **WD-filtrering:** holes-body må filtrere WD-spillere likt som renderSoloStrokeplay (hent `withdrawn_at` i player-select, ekskluder fra ctx).
- Strøm B: i `renderSoloStrokeplay`, ved `finished && result.players.length === 2` → `HeadToHeadResult` i stedet for `SoloStrokeplayPodium` (+ `wdSection`). 3+ eller 1 → Podium som før.

## Scoring-utvidelse (Type A, TDD FØRST)

`SoloStrokeplayResult` eksponerer kun totaler. Intern `perHoleNetForRanking` finnes men er padded med 999. Utvid additivt:

```ts
export interface SoloStrokeplayHolePlayerCell {
  userId: string;
  gross: number | null;     // null = ikke spilt / pick-up
  net: number | null;       // gross − tildelte slag; null = ikke spilt (IKKE 999-padding)
}

export interface SoloStrokeplayHoleRow {
  holeNumber: number;
  par: number;
  strokeIndex: number;
  perPlayer: SoloStrokeplayHolePlayerCell[];
  bestUserIds: string[];    // lavest net blant spilte; [] hvis ingen; length > 1 = delt
}

// SoloStrokeplayResult får:  holes: SoloStrokeplayHoleRow[];  // alle hull, sortert
```

- Bygg i `compute()` (gjenbruk `strokesForHole`). Ren additiv endring; `players`/ranking/cascade urørt (eksisterende cases grønne). `net` null på uspilt (ikke 999).
- `bestUserIds` = lavest `net` blant spilte (driver per-hull-highlight + H2H-strip).
- **Mitt designvalg:** top-level `holes`-array, par fra `hole.par` (mens-par; samme som scoring-laget bruker for visning).

## Strøm A — SoloStrokeplayHolesView (framing: klassisk scorekort)

1. **Topp:** kompakt rangert totals-stripe (hvem leder): per spiller netto-total + brutto, leder i champagne. Reflekterer `result.players` (allerede rank-sortert).
2. **Ut · hull 1–9** og **Inn · hull 10–18:** per-hull-kort. Hvert hull: hull/par/SI + per spiller `brutto-shape → netto` (sortert lavest netto først), hull-vinner (entydig lavest netto) uthevet i champagne med ★; delt lavest = nøytralt (som Nassau). Ut/Inn-subtotal per spiller.
3. **Reveal-modus:** `scoreVisibility === 'reveal' && gameStatus !== 'finished'` → reveal-hidden-melding (speil NassauHolesView). Ferdig → full visning.

Designkrav: `tabular-nums`, champagne kun til vinner, gjenbruk `Card`/`Kicker`/`AppShell`/`LeaderboardBackdrop`/`formatRevealName`/`ScoreShape`+`scoreShape`/`scoreTone`, mobil-først, ≥44px, dark-mode, ingen lag-språk.

## Strøm B — HeadToHeadResult ved 2 spillere (lavest-vinner)

`HeadToHeadResult`-skallet antar **høyest score vinner** (tug-of-war fyller proporsjonalt med score; dom viser «høy–lav»). Solo-strokeplay er **lavest netto vinner**. Utvid skallet minimalt med en opt-in-flagg:

- Ny prop `lowerWins?: boolean` (default `false` — Skins/BBB/Nassau uendret).
- Når `lowerWins`: (a) tug-of-war fyller invertert (vinner-siden = den med lavest score får størst andel), (b) dommen viser vinnerens faktiske score først: «{vinner} vant duellen {vinnerScore}–{taperScore}» (for lavest-vinner blir det lav–høy, f.eks. «78–85»). Crown/`winnerUserId` styrer allerede vinner-siden.
- I `renderSoloStrokeplay`: `score = totalNetStrokes`, `lowerWins`, `unitLabel = 'slag'`, `formatLabel = 'Slagspill · Netto'`, `winnerUserId` = rank-1 (tie iff begge deler rank), `strip` fra per-hull `bestUserIds`, `subLabel = \`${totalGrossStrokes} brutto\``.
- Lås `lowerWins`-inverteringen med ett ekstra `it` i `HeadToHeadResult.test.tsx` (samme komponent — ikke en ny komponent-test).

## Integrasjon

- `buildSoloStrokeplayContext.ts` (ny) — `renderSoloStrokeplay` + `SoloStrokeplayHolesBody` deler den (WD-filtrert input).
- `holes/page.tsx` — ny branch + `SoloStrokeplayHolesBody` (henter `withdrawn_at` for WD-filtrering).
- `e2e/games/solo-strokeplay.spec.ts` (ny) — tre auth-gate-tester (hull-side, leaderboard, leaderboard/holes), speil nassau.spec.ts.
- `SoloStrokeplayView.test.tsx` + `SoloStrokeplayPodium.test.tsx` — legg `holes: []` i fixtures (nytt påkrevd felt; verken view/podium rendrer per-hull).

## Gates

1. **`npm run build`** — grønt (nye typer treffer eksaustive switch/Record over `ModeResult`).
2. **`npx vitest run lib/scoring/modes/soloStrokeplay.test.ts "app/games/[id]/leaderboard/holes/SoloStrokeplayHolesView.test.tsx" "app/games/[id]/leaderboard/HeadToHeadResult.test.tsx" "app/games/[id]/leaderboard/SoloStrokeplayView.test.tsx" "app/games/[id]/leaderboard/SoloStrokeplayPodium.test.tsx"`** — grønt.
3. **`humanizer:humanizer`** på ny norsk copy før commit.
4. **Version-bump MINOR** (1.101.0 → 1.102.0) + CHANGELOG i SAMME commit som feature.

## Success-kriterier

- [x] **A1 — Scoring:** `SoloStrokeplayResult.holes` eksponerer per-hull per-spiller `net` (null på uspilt, ikke 999) + `gross` + `bestUserIds`. TDD rød → grønn. *Evidens: `SoloStrokeplayHoleRow`/`SoloStrokeplayHolePlayerCell` i types.ts; `computeHoleRows` i soloStrokeplay.ts; 4 nye Type A cases — `npx vitest run soloStrokeplay.test.ts` = 20 passed (16 eksisterende uendret). Commit f6912c3.*
- [x] **A2 — Branch:** `/leaderboard/holes` på et solo-strokeplay-spill rendrer `SoloStrokeplayHolesView` (rangert stillings-header + Ut/Inn per-hull-kort) — IKKE «Lag N»-best-ball-scorekortet (render-test asserterer `not.toContain('Lag')`). `holes/page.tsx` forgrener på `game_mode === 'solo_strokeplay'`, WD-filtrert via helper. *Evidens: branch + SoloStrokeplayHolesBody + view. Commit 2c646cb.*
- [x] **B1 — H2H + lavest-vinner:** Ferdig 2-spiller solo-strokeplay viser `HeadToHeadResult` med `lowerWins` (invertert bar + vinnerens lave score først i dommen) i stedet for podium. 1/3+ beholder `SoloStrokeplayPodium`. *Evidens: renderSoloStrokeplay `result.players.length === 2`-gren; HeadToHeadResult `lowerWins`-prop; `lowerWins`-test «vant duellen 78–85». Commits 2c646cb + cba5620.*
- [x] **C1 — Delt kontekst:** `buildSoloStrokeplayContext` (eier WD-filtreringen) deles av `renderSoloStrokeplay` + `SoloStrokeplayHolesBody`. *Evidens: lib/scoring/context/buildSoloStrokeplayContext.ts; begge call-sites. Commits 9d6812c + 2c646cb.*
- [x] **C2 — Designkrav:** `isRevealHidden` i view; `tabular-nums` på tall; header-lenke `h-11 w-11` (44px); kun theme-tokens (dark mode); H2H-strip `reveal-up` (globals.css undertrykker ved prefers-reduced-motion); hull-kort uten egen animasjon. *Evidens: SoloStrokeplayHolesView.tsx.*
- [x] **C3 — Tester:** én Type C render-test for `SoloStrokeplayHolesView` (asserterer scorekort-strukturen + champagne-vinner + halved-nøytral, ikke Type A-tall); `lowerWins`-`it` i HeadToHeadResult-testen; ny `e2e/games/solo-strokeplay.spec.ts` (3 auth-gate-tester). *Evidens: 55 passed i gate-settet. Commits cba5620 + e2e.*
- [x] **C4 — Ingen regresjon:** `DrilldownBody` urørt; Skins/BBB/Nassau-H2H uendret (lowerWins default false — eksisterende HeadToHeadResult-test fortsatt grønn); `npm run build` grønt med additivt `holes`-felt. *Evidens: build + diff.*
- [x] **D1 — Versjon:** bump MINOR 1.101.0 → 1.102.0; CHANGELOG `## 1.102.y — Slagspill · hull for hull` åpen, 1.101-serien wrappet i `<details>`. Epic-sjekkliste oppdateres på issue. *Evidens: package.json + CHANGELOG. Commit 2c646cb.*

## Utenfor scope

- solo/modified-stableford (PR 9).
- Podium for 1/3+ spillere uendret.
- WD-flytens egen logikk (kun videreført filtrering).
