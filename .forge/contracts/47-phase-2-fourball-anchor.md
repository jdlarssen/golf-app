# Arkitektur-anker: Ryder Cup fase 2 — four-ball matchplay (2v2 best-ball-matchplay)

**Type:** Anchor-doc, ikke build-kontrakt. Skrevet før fase 1 har landet for å låse retning og constraints. Full build-kontrakt skrives når fase 2 starter, mot da-eksisterende fase 1-kode.

**Parent:** [#47](https://github.com/jdlarssen/golf-app/issues/47) (lukket ved fase 1-merge)
**Bygger på:** Fase 1 — cup-grunnmur

## Retning

Ny `game_mode = 'fourball_matchplay'`. Hver match er en 2v2-kamp der hver spiller har egen ball (ikke alt-shot — det er fase 3). Per hull = lagets score er den beste av to spilleres netto-score. Sammenlikn lag1.best vs lag2.best som matchplay (3&2, 2up, AS).

**Re-bruker fra fase 1:**
- Cup-wrapper (`tournaments`-tabell + `games.tournament_id` FK)
- Hver match = egen `games`-rad, scoring-flyten er per-game som i dag
- Master-cup-leaderboard fra fase 1 aggregerer point fra fourball-matches på samme måte som singles

**Re-bruker fra eksisterende kode:**
- `singles_matchplay`-mønster ([lib/scoring/modes/singlesMatchplay.ts](lib/scoring/modes/singlesMatchplay.ts)) — `computeMatchResult(holesUp, holesPlayed, holesRemaining)` virker uendret
- Per-hull-klassifisering (`classifyMatchplayHole`) utvides til å akseptere lag-best-netto i stedet for individuell-netto
- Best-ball-aggregering fra [lib/scoring/bestBall.ts](lib/scoring/bestBall.ts) gir oss «best av to per hull»-logikken — gjenbrukes for per-side per-hole-beregning

## Constraints fase 1 må respektere

- **`tournament_id`-FK må akseptere ANY game_mode** — ikke hardkode for `singles_matchplay` i fase 1
- **Cup-leaderboard-aggregator (`computeCupLeaderboard`) må håndtere ulike result-shapes** — singles returnerer `SinglesMatchplayResult`, fase 2 returnerer `FourballMatchplayResult`. Funksjonen skal hente result, ikke anta shape
- **«Opprett ny match»-flyt fra cup-side må tillate game-mode-valg** — i fase 1 er det bare `singles_matchplay`, men UI-en må være forberedt på flere modes
- **`game_players.team_number`-kolonne** brukes til side-tilhørighet (1 eller 2). Skal beholdes uendret for fase 2

## Key unknowns (avgjøres ved build)

- **Course handicap-allokering:** Real Ryder Cup spilles scratch (ingen handicap). Tørny default er netto. Skal four-ball støtte begge moder? Anbefalt utgangspunkt: netto (matcher Tørny-konvensjonen), med opt-in scratch via `mode_config.scratch=true`.
- **Scorekort-UX:** 4 spillere visible, hver taster egen score. Vises bestes-score-highlight per hull? Per-side-totalsum oppe? Defer til build, men kople UX mot eksisterende best-ball-scorekort så vi ikke duplikerer.
- **Pairing-validering:** krever vi at de 4 spillerne er fordelt 2v2 i game-form? Ja — speil par-stableford-mønsteret.
- **Match-result-tekstformat:** «3&2 til Lag Skog (Per/Knut)» eller «3&2 til Lag Skog» (lag-fokusert)? Anbefalt: lag-fokusert i cup-leaderboard, par-fokusert i match-detalj.

## Avhengigheter

- **Fase 1 må være shipped** — bygger direkte på cup-wrapper
- **Ingen avhengighet til fase 3 (foursomes)** — uavhengige scoring-modes
- **Fase 4 (templating)** vil bygge på dette for «4 singles + 2 four-balls»-presets

## Estimat

Mellomstor — ~3-5 dager: ny scoring-modul (best av to per hull + matchplay-overlay), wizard-støtte, scorekort-UX, leaderboard-rendering, validator, tester.

## Out of scope for fase 2

- Foursomes (alt-shot) — fase 3
- Templating — fase 4
- Scratch-only-modus uten netto-fallback — kan defer hvis netto-default dekker behovet

## Build-kontrakt skrives ved fase 2-start

Mot da-eksisterende fase 1-kode. Anchor-doc her er retnings-låsing, ikke implementasjons-spec.
