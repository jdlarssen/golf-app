# Contract: Dedupliser matchplay-status mellom scorekort og scoring-modul

**Issue:** [#205](https://github.com/jdlarssen/golf-app/issues/205) — scorecard: matchplay-status duplisert i `computeLayoutBTotals` (drift-risk).
**Severity:** LOW (drift-risk, ikke bug). Ren refactor med tester som låser eksisterende oppførsel.

## Bakgrunn

`lib/games/scorecardLayout.ts:computeLayoutBTotals` reimplementerer hull-for-hull matchplay-utfall + running-tally (`meWins`, `oppWins`, `mpPlayed`) inline (linjer 268–315). Den samme logikken finnes i `lib/scoring/modes/singlesMatchplay.ts:compute()` (linjer 150–206). Hvis matchplay-regler endres ett sted (f.eks. concessions, four-ball, foursomes), kan scorekort-flaten driver mens leaderboardet evolverer.

## Approach

**Shared-helper-strategi** (issue's Option 2): eksportér en minimal `computeMatchplayRunningStatus()`-helper fra `singlesMatchplay.ts` som begge call-sites bruker. Format-strenger forblir lokale (scorekort: «Du er X up etter N hull» — leaderboard: «1up» / «AS» / «3&2»).

Forkastet: bygge full `ScoringContext` i scorekort-laget og kalle `compute()` — overkill, scorekort trenger ikke per-hull-rader eller `MatchplayMatchResult`.

## Success Criteria

- [ ] **Ny eksportert helper** `computeMatchplayRunningStatus()` i `lib/scoring/modes/singlesMatchplay.ts` med signatur som tar `(holes, side1Input, side2Input, scoresByUserHole)` og returnerer `{ holesUp, holesPlayed, holesRemaining }`.
- [ ] **`compute()` i singlesMatchplay refaktorert** til å bruke helperen internt (eller speile dens algoritme via felles per-hull-pipeline). Per-hull `MatchplayHoleRow[]` fortsatt produsert som før.
- [ ] **`computeLayoutBTotals` matchplay-grenen** kaller helperen i stedet for inline `meWins`/`oppWins`-tracking. Lokal status-string-formatering beholdes.
- [ ] **5 eksisterende matchplay-tester** i `scorecardLayout.test.ts` (AS, 1 up, 2 down, unplayed-hull, ingen hull spilt) passerer uendret.
- [ ] **Eksisterende singlesMatchplay-tester** i `lib/scoring/modes/singlesMatchplay.test.ts` passerer uendret (ingen oppførselsendring i compute()).
- [ ] **Ny roundtrip-test** verifiserer at scorekort-grenen og `singlesMatchplay.compute()` returnerer SAMME `holesUp` + `holesPlayed` for et delt fixture-set (minimum 3 hull med blandede utfall: me-win, opp-win, tied).
- [ ] **Ingen oppførselsendring i UI** — `matchStatus`-streng som returneres fra `computeLayoutBTotals` er identisk med før for alle 5 test-scenarier.

## Gates

Kjør etter hver chunk; alle må være grønne før evaluering:

```bash
npm run test -- lib/games/scorecardLayout.test.ts lib/scoring/modes/singlesMatchplay.test.ts
npx tsc --noEmit
npm run lint -- lib/games/scorecardLayout.ts lib/scoring/modes/singlesMatchplay.ts
```

Full test-suite ved siste gate:

```bash
npm run test
```

## Out of Scope

- Endring av matchplay-format-strenger i hverken scorekort eller leaderboard.
- Refaktor av `computeMatchResult()` (mat-em-logikken) — den er allerede shared via samme modul.
- Andre call-sites enn de to identifiserte.
- Version-bump / CHANGELOG: dette er ren refactor (ingen bruker-synlig endring) — `refactor(...)`-prefix, hooken slipper igjennom uten bump.
