# Contract: Dedupliser sideturnering-input-bygging til delte pure helpers

**Issue:** [#973](https://github.com/jdlarssen/golf-app/issues/973) — dedupliser matchplay-sideturnering til delt `buildSideTournamentInput` (#942-oppfølging).
**Severity:** LOW (drift-risk, ikke bug). Ren refactor med tester som låser oppførsel.
**Branch:** `claude/wizardly-brattain-f5f82a`

## Bakgrunn

`SideTournamentInput` bygges i dag to steder, fra **to ulike kilder**:

1. **`lib/scoring/sideTournamentInput.ts:buildSideTournamentInput`** — bygger fra en ferdig-beregnet netto-leaderboard (`nettoLines: TeamLine[]`). Kall-steder: leaderboard-siden ([`leaderboardContent.tsx:519`](app/[locale]/games/[id]/leaderboard/leaderboardContent.tsx)) og delekort-routen ([`computeSharerSideAwards.ts:174`](lib/games/computeSharerSideAwards.ts)).
2. **`app/[locale]/games/[id]/leaderboard/sideTournament.tsx:computeSideTournament`** (linje ~51–195) — bygger inline fra **rå-scores + `game_players`**, regner netto selv via `strokesForHole`, grupperer lag fra `team_number` (eller solo). Kall-steder: `renderSideTournamentTabs` (~15 score-/podium-formater) og `renderMatchplaySideSection` (matchplay-familien).

## Approach — targeted sub-helper-ekstraksjon (IKKE full builder-konsolidering)

Issuet foreslår «konsolider matchplay-stien til å bruke `buildSideTournamentInput` (evt. med en `teamGroups → nettoLines`-adapter)». **Det forkastes** — begrunnelse under. I stedet ekstraheres kun de to blokkene som er **verbatim-duplisert** mellom de to filene til delte, unit-testbare pure helpers.

**Duplisert verbatim (ekstraheres):**
- `coursePars` + `courseStrokeIndices` (18-element `parByHole`/`siByHole`-oppslag + fallback-loop). `sideTournamentInput.ts:44–65` ≡ `sideTournament.tsx:51–67`.
- `sideWinners`-mapping (`SideWinnerRow[]` → `SideWinner[]`, filter `position ∈ {1,2}`). `sideTournamentInput.ts:102–112` ≡ `sideTournament.tsx:166–175`.

**Genuint ulikt (røres IKKE — kan ikke unifiseres):**
- Per-spiller `perHoleGross`/`perHoleNetto`: `buildSideTournamentInput` leser fra `nettoLines`; `computeSideTournament` regner selv via `strokesForHole`.
- Lag-gruppering: `line.teamNumber` vs `team_number`-gruppering / solo-per-spiller.
- `nettoBestBallPerHole`: `line.holes[].teamNet` vs `Math.min(...)` av lagmedlemmenes netto.

**Hvorfor full konsolidering forkastes:** De ~15 formatene som går via `computeSideTournament` (matchplay, wolf, skins, nassau, nines, acey-deucey, solo m.fl.) har **ingen `TeamLine[]` netto-leaderboard** i det hele tatt — de kan ikke mate `buildSideTournamentInput`. En syntetisk-`TeamLine`-adapter ville lagt til LOC, vært skjør, og **ingen av de to builderne har direkte unit-tester** (kun `calculateSideTournament`-konsumenten er testet) — så en regresjon i adapteren ville passere `tsc` og gå ufanget. Sub-helper-ekstraksjonen gir den reelle dedup-gevinsten (fjerner den faktisk-dupliserte koden) med minimal risiko og legger til ny test-dekning.

## Behavior-trap som MÅ bevares

I `computeSideTournament` bruker per-spiller-netto-loopen `siByHole.get(h) ?? 18` (linje 104) — mens `courseStrokeIndices`-arrayet bruker `?? h` (linje 66). **Ulike fallbacks.** Helperen returnerer derfor det rå `siByHole`-Map-et (uten innbakt fallback) så `computeSideTournament` beholder sin `?? 18` i netto-loopen, og `courseStrokeIndices`-arrayet beholder sin `?? h`. Ikke kollaps de to.

## Success Criteria

- [x] **Ny pure helper** `buildCourseArrays(holes: { holeNumber; par; strokeIndex }[])` i `lib/scoring/sideTournamentInput.ts`, returnerer `{ coursePars: number[]; courseStrokeIndices: number[]; siByHole: Map<number, number> }`. JSDoc som forklarer fallback-disiplinen (`?? 4` for par, `?? h` for SI-array). — `sideTournamentInput.ts:12–52` (commit `2ce38ef4`).
- [x] **Ny pure helper** `mapSideWinners(rows: SideWinnerRow[]): SideWinner[]` i samme fil (filter `position ∈ {1,2}`, map til `{ category, position, winnerUserId }`). — `sideTournamentInput.ts:54–71`.
- [x] **`buildSideTournamentInput` konsumerer begge helpers** — ingen inline `coursePars`/`courseStrokeIndices`-loop eller `sideWinners`-filter/map igjen i funksjonen. — `sideTournamentInput.ts`: block erstattet av `buildCourseArrays(holes)` + `mapSideWinners(sideWinnerRows)`.
- [x] **`computeSideTournament` konsumerer begge helpers** — mapper `rawHolesRows` → `{ holeNumber, par: par_mens, strokeIndex }` ved kallet; bruker returnert `siByHole` for netto-loopens `?? 18`; ingen inline `coursePars`/`sideWinners`-blokk igjen. — `sideTournament.tsx` (commit `166fba86`).
- [x] **Ny testfil** `lib/scoring/sideTournamentInput.test.ts` dekker helperne: (a) `buildCourseArrays` — dense 18-hull, sparse (manglende hull → `?? 4`/`?? h`), out-of-order hull-rader, tomt input; (b) `mapSideWinners` — position 0/3/null ekskludert, 1/2 inkludert, felt-mapping korrekt. — 8 tester grønne.
- [x] **Oppførsel bevart:** `lib/scoring/sideTournament.test.ts` fortsatt grønn (konsumenten urørt); `npx tsc --noEmit` ren; lint ren på de to endrede filene. — `vitest run lib/scoring` = 1029 pass; leaderboard-view-tester = 186 pass; `tsc --noEmit` exit 0; `eslint` ren på begge filer.
- [ ] **Avvik dokumentert:** closing-kommentaren nevner at issue-ets «én builder»-forslag ble erstattet med sub-helper-ekstraksjon, med begrunnelsen over. — *(gjøres ved lukking, etter ACCEPT + merge.)*

## Gates

Kjør etter hver chunk; alle grønne før evaluering:

```bash
npx vitest run lib/scoring/sideTournamentInput.test.ts lib/scoring/sideTournament.test.ts
npx tsc --noEmit
npx eslint lib/scoring/sideTournamentInput.ts "app/[locale]/games/[id]/leaderboard/sideTournament.tsx"
```

## Out of Scope

- Full konsolidering av de to builderne til én (forkastet — se Approach).
- Endring av per-spiller-netto-kilden, lag-grupperingen eller best-ball-logikken i noen av stiene.
- `calculateSideTournament` (konsumenten) — urørt.
- UI-/copy-endringer, nye Type C render-tester.
- Version-bump / CHANGELOG: ren refactor, ingen bruker-synlig endring → `refactor(scoring): …`-prefix, `[no-changelog]` ikke nødvendig (kun `fix/feat/perf` krever det). Hooken slipper `refactor` fritt.
