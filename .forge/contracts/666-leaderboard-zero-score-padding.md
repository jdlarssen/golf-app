# Forge-kontrakt: #666 — Best-ball leaderboard kårer ikke et lag uten score som vinner

**Issue:** [#666](https://github.com/jdlarssen/golf-app/issues/666) (P1) · folder inn #26 (mangler test på `lib/leaderboard.ts`)
**Branch:** issue-666-leaderboard-padding
**Type:** Bug-fix (bruker-synlig → krever version-bump + CHANGELOG)
**Opprettet:** 2026-06-17

## Problem (verifisert i kode)

`lib/leaderboard.ts:202` bygger rank-arrayet med `arr.push(h?.teamNet ?? 0)`. `rankTeams` sorterer
STIGENDE (lavest sum vinner, `tiebreaker.ts`). Et lag uten en eneste registrert score får dermed
total 0 → rangeres #1, foran et lag som spilte hele runden (f.eks. total 72). Det er nøyaktig #635-
mønsteret. Fiksen ble lagt i `bestBall.ts`/`soloStrokeplay.ts`/`texasScramble.ts`/`nassau.ts`, men
ALDRI back-portet til legacy `lib/leaderboard.ts` — som driver live leaderboard-siden (default best_ball-
gren, `page.tsx:744`), champion-reveal (State4View), profil-statistikk (`statistikk/page.tsx:176`) og
CSV-eksport. Kommentaren på linje 195-197 påstår «Missing holes get the team's average» — koden bruker 0.
**Ingen test finnes for fila** (#26).

## Fiks (speil `bestBall.ts:173-177` eksakt)

I `lib/leaderboard.ts`:
1. Utvid importen på linje 5: `import { rankTeams, UNPLAYED_PADDING, type RankedTeam } from '@/lib/scoring/tiebreaker';`
2. I `teamsForRanking`-blokken (198-205): beregn `const teamPlayedAny = l.holes.some((h) => h?.teamNet != null);` og bytt `arr.push(h?.teamNet ?? 0)` → `arr.push(h?.teamNet ?? (teamPlayedAny ? 0 : UNPLAYED_PADDING));`
3. Rett den utdaterte kommentaren (195-197) så den beskriver faktisk oppførsel (lag som spilte ≥1 hull: manglende hull = 0; lag uten noen score: paddes med UNPLAYED_PADDING så de ikke kåres som vinner).

## Test (TDD, Type A — ny fil `lib/leaderboard.test.ts`)

Skriv testen FØR fiksen, bekreft at den feiler, så fiks → grønn. Fokusert, ikke gold-plating:
1. **Regresjon (#666):** to lag; lag A spiller alle 18 (kjent total), lag B har null scores → lag A `rank === 1`, lag B `rank === 2`. (Feiler før fiks: B blir rank 1.)
2. **Basis netto:** lavest total får rank 1, høyest rank 2.
3. **Brutto:** `mode: 'brutto'` tvinger `extraStrokes = 0` (netto == gross uavhengig av courseHandicap).

## Suksesskriterier

- [x] K1: `lib/leaderboard.test.ts` lagt til. Regresjonstesten FEILET pre-fiks (`AssertionError: expected 2 to be 1` — zero-score-laget ble rank 1) og PASSERER etter fiks (3/3 grønne). De to kjøringene vist i build-loggen.
- [x] K2: `lib/leaderboard.ts:206-211` padder nå `h?.teamNet ?? (teamPlayedAny ? 0 : UNPLAYED_PADDING)` (import utvidet linje 5). Identisk mønster som `bestBall.ts:173-177`. Lag med ≥1 hull uendret.
- [x] K3: Kommentaren (linje 195-200) omskrevet til å beskrive faktisk oppførsel + sitere #666/#635.
- [x] K4: `npm run typecheck` 0 feil; `npm test` = 282 filer / 3564 grønne (+1 fil, +3 tester, ingen regresjon). Endrede filer (`lib/leaderboard.ts`, `.test.ts`) er ikke blant repoets forhåndseksisterende lint-feil.
- [x] K5: bump 1.132.5 → 1.132.6 + CHANGELOG-oppføring under åpen `1.132.y`-tema, i samme commit (`5340a73b`) som fiksen.

## Gates

- Ny test feiler før, passerer etter (vis begge).
- `npm run typecheck` + `npm test`.
- commit-msg-hook (krever bump+CHANGELOG på `fix(...)`).

## Merknad

- Scope: KUN zero-score-team-paddingen + kommentaren + test. Ikke rør den (separate, by-design) «manglende hull = 0 for delvis spilte lag»-oppførselen.
- #26 (full Type-A-dekning av brutto/parByGender/contributor) delvis adressert (3 kjernecase); resten kan være follow-up — ikke gold-plate her.
