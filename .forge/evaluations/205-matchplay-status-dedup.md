# Evaluation: #205 — matchplay-status dedup

**VERDICT: ACCEPT**

Skeptical fresh-eyes review of commits `590b0db` (helper extraction) and `9e01d2a` (scorecard delegation) against `.forge/contracts/205-matchplay-status-dedup.md`. All 7 success criteria met, all gates green, drift-risk genuinely reduced via `classifyMatchplayHole` as shared classifier.

## Success criteria

### 1. Helper exists with contract-required signature ✅

`lib/scoring/modes/singlesMatchplay.ts:179-218` exports `computeMatchplayRunningStatus(holes, side1, side2, scoresByUserHole)` returning `{ holesUp, holesPlayed, holesRemaining }`. Signature matches contract verbatim. Input types (`MatchplayRunningHole`, `MatchplayRunningSide`) are minimal and well-documented (`number`, `strokeIndex`, `userId`, `courseHandicap`). Return shape (`MatchplayRunningStatus`) mirrors fields on `SinglesMatchplayResult` for semantic alignment.

### 2. `compute()` refactored to share classification ✅

`lib/scoring/modes/singlesMatchplay.ts:230-321`. `compute()` still iterates to build `MatchplayHoleRow[]` (per-hull rows needed by leaderboard), but win/loss/tied determination now goes through the exported `classifyMatchplayHole()` helper (line 279). The contract's phrasing "use the helper internally OR mirror its algorithm via shared per-hole pipeline" is satisfied via the shared `classifyMatchplayHole` — that's the single semantic surface both call-sites route through. Per-hull `MatchplayHoleRow[]` still produced as before (line 290-301).

### 3. `computeLayoutBTotals` matchplay branch delegates ✅

`lib/games/scorecardLayout.ts:281-298`. Inline `meWins`/`oppWins`/`mpPlayed` tracking is gone. The matchplay branch builds the input by mapping `LayoutBHoleInput` to `MatchplayRunningHole` and calls `computeMatchplayRunningStatus()`. Local status-string formatting (`Du er X up etter N hull` / `AS (N hull spilt)` / `Ingen hull spilt ennå`) is preserved at lines 289-297. No parallel inline implementation remains — the helper is the only path to `holesUp`/`holesPlayed` in this function. Confirmed via `git show 9e01d2a`: net `+22 / -39` in `scorecardLayout.ts` (inline logic removed, delegation added).

### 4. 5 existing matchplay tests pass unchanged ✅

`lib/games/scorecardLayout.test.ts:420-501` retains the 5 pre-existing test cases with identical expected strings:
- `Du er 1 up etter 3 hull` (line 437)
- `AS (2 hull spilt)` (line 454)
- `Du er 2 down etter 2 hull` (line 471)
- `Du er 1 up etter 1 hull` (line 488)
- `Ingen hull spilt ennå` (line 500)

All pass: targeted vitest run reports `Test Files 2 passed (2), Tests 43 passed (43)`.

### 5. Existing singlesMatchplay tests pass unchanged ✅

`lib/scoring/modes/singlesMatchplay.test.ts` included in the targeted vitest run; included in the 43 passing tests. Full suite (`npm run test`) reports `82 files, 958 tests passed`, confirming no behavioral regression in `compute()`.

### 6. Roundtrip test verifies the contract ✅

`lib/games/scorecardLayout.test.ts:513-635` adds a `describe('roundtrip: scorekort vs singlesMatchplay.compute (issue #205)')` block with two cases:

**Case 1 — blandede utfall (line 514-581):** 5-hole fixture covering me-win (hull 1, SI 1 with stroke), tied (hull 2, SI 18), opp-win (hull 3, SI 5), unplayed (hull 4, `opp#4` missing), opp-win (hull 5, SI 2). Builds both a `LayoutBHoleInput[]` for `computeLayoutBTotals` AND an equivalent `ScoringContext` for `singlesMatchplay.compute()` from the same scores map. Asserts:
- `computeResult.holesPlayed === 4` (unplayed hole excluded — line 577)
- `computeResult.holesUp === -1` (line 578)
- `scorecardResult.matchStatus === 'Du er 1 down etter 4 hull'` (line 580 — same numbers expressed from me's perspective)

**Case 2 — AS midt i runden (line 583-635):** 3 holes (me-win, opp-win, tied). Asserts `holesPlayed === 3`, `holesUp === 0`, `matchStatus === 'AS (3 hull spilt)'`.

Both cases call BOTH `computeLayoutBTotals` and `singlesMatchplay.compute()` on shared input. Case 1 includes an unplayed hole. Covers me-win, opp-win, tied, and unplayed — all four `MatchplayHoleResult` variants are exercised.

### 7. No UI behavioral drift ✅

`grep -nE "matchStatus = '(Du er|AS|Ingen)" lib/games/scorecardLayout.ts` returns only `Ingen hull spilt ennå` literal at line 290. The other three branches use template literals (`AS (${...} hull spilt)`, `Du er ${...} up etter ${...} hull`, `Du er ${-...} down etter ${...} hull`) — confirmed exact format identical to prior version via the 5 unchanged test assertions. No format-string drift.

## Gates

| Gate | Command | Result |
|---|---|---|
| Targeted vitest | `npx vitest run lib/games/scorecardLayout.test.ts lib/scoring/modes/singlesMatchplay.test.ts` | 43/43 pass |
| TypeScript | `npx tsc --noEmit` | clean (no output) |
| ESLint | `npx eslint lib/games/scorecardLayout.ts lib/scoring/modes/singlesMatchplay.ts` | clean (no output) |
| Full suite | `npm run test` | 958/958 pass across 82 files |

## Out-of-scope check

Contract specifies "ren refactor — refactor(...)-prefix, hooken slipper igjennom uten bump" and "no behavior change."

- Commit subjects `refactor(scoring): extract computeMatchplayRunningStatus helper` and `refactor(scorecard): use shared matchplay running-status helper` — correct prefix.
- `git diff 086c3ea..HEAD -- package.json CHANGELOG.md` returns empty for the two refactor commits — no version bump, no CHANGELOG entry, as required.
- The branch-level `package.json` / `CHANGELOG.md` diff vs `main` is from the earlier multi-player scorekort work (1.18.0), not from this contract — out of scope for this evaluation.

## Drift-risk reduction (the actual point)

The whole motivation per the contract: "matchplay-regler endres ett sted (concessions, four-ball, foursomes) — scorekort-flaten kan drifte mens leaderboardet evolverer." After this refactor:

- Win/loss/tied/unplayed classification lives in exactly one place: `classifyMatchplayHole(side1Net, side2Net)`.
- Both `compute()` (line 279) and `computeMatchplayRunningStatus()` (line 201) route through it.
- The scorecard's matchplay branch calls `computeMatchplayRunningStatus()` rather than maintaining its own inline tally.
- Future matchplay rule changes (e.g., adding concession-tracking to `classifyMatchplayHole`'s input or output) update both surfaces simultaneously; the roundtrip test guards against accidental re-divergence.

This is a real reduction in drift surface, not a cosmetic refactor.

## Issues found

None blocking. Minor observations (intentionally not flagged as blockers):

- `compute()` still maintains its own loop counters (`side1Wins`, `side2Wins`, `holesPlayed`) rather than calling `computeMatchplayRunningStatus()` directly. The contract explicitly allows this ("eller speile dens algoritme via felles per-hull-pipeline") because `compute()` also needs to emit per-hull rows. Sharing `classifyMatchplayHole` is sufficient guarantee against semantic drift.
- The helper accepts a `readonly` holes array and a `ReadonlyMap` for scores — defensive immutability that matches the existing `ScoringContext` conventions. Good.

## Result

ACCEPT. The work delivers exactly what the contract specifies: a shared helper, scorecard delegation, classification unified via `classifyMatchplayHole`, all 5 existing UI strings preserved, roundtrip test covering blended outcomes including unplayed, no out-of-scope changes. Gates all green.
