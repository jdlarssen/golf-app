# Evaluation: #973 dedup side-tournament input building — ACCEPT

Behaviour-preserving refactor. Extracts `buildCourseArrays` + `mapSideWinners`
pure helpers in `lib/scoring/sideTournamentInput.ts`, adopts them in both the
netto-leaderboard builder (`buildSideTournamentInput`) and the raw-scores builder
(`computeSideTournament`), and adds `lib/scoring/sideTournamentInput.test.ts`.
All gates green, all Success Criteria met, zero out-of-scope leakage.
Verified independently by reading the code, diffing the old inline blocks
byte-for-byte, running all three gates, and mutation-testing the new tests.

## Success Criteria

| Criterion | Status | Evidence |
|---|---|---|
| `buildCourseArrays` helper w/ JSDoc explaining fallback discipline | ✅ | `lib/scoring/sideTournamentInput.ts:12-42`; returns `{coursePars, courseStrokeIndices, siByHole}`; JSDoc documents `?? 4` par / `?? h` SI-array / raw unbaked `siByHole` map. |
| `mapSideWinners` helper (filter pos∈{1,2}, map to camelCase) | ✅ | `lib/scoring/sideTournamentInput.ts:49-60`; filter `w.position === 1 \|\| w.position === 2`, map `winner_user_id → winnerUserId`. |
| `buildSideTournamentInput` consumes both helpers, no inline blocks | ✅ | `sideTournamentInput.ts:99-101` (`buildCourseArrays(holes)`) + `:138` (`mapSideWinners(sideWinnerRows)`). Old inline par-loop + winner filter/map removed. |
| `computeSideTournament` consumes both helpers; maps rawHolesRows; reuses `siByHole` for netto `?? 18`; no inline blocks | ✅ | `sideTournament.tsx:56-62` maps `hole_number/par_mens/stroke_index → holeNumber/par/strokeIndex`; `:99` netto loop `siByHole.get(h) ?? 18`; `:161` `mapSideWinners`. `parByHole` gone. |
| New test file covering both helpers (dense/sparse/out-of-order/empty; pos 0/3/null excluded, 1/2 included, field mapping) | ✅ | `lib/scoring/sideTournamentInput.test.ts` — 12 tests, all cases present, all green. (Contract said "8 tester"; actual count is 12 — more coverage, not less.) |
| Behaviour preserved: `sideTournament.test.ts` green, tsc clean, lint clean | ✅ | vitest 162 pass; `tsc --noEmit` exit 0; eslint clean on both files (see Gate results). |
| Deviation documented in closing comment | ⏳ | Deferred to issue-close per contract ("gjøres ved lukking, etter ACCEPT + merge"). Not evaluable now — not a blocker. |

## Behaviour preservation

**Fallback-trap — PRESERVED (the crux).** The two distinct fallbacks are intact:

- The per-player netto loop in `computeSideTournament` still reads
  `const si = siByHole.get(h) ?? 18;` (`sideTournament.tsx:99`) — **byte-identical**
  to the old line (verified via `git show 5f9e6d42:...`, old line was
  `const si = siByHole.get(h) ?? 18;`). It reads from the raw `siByHole` map
  returned by the helper, NOT from the `courseStrokeIndices` array.
- The `courseStrokeIndices` array uses `?? h` (inside `buildCourseArrays`,
  `sideTournamentInput.ts:41`).
- `buildCourseArrays` returns the raw `siByHole` map **unbaked** (no fallback
  applied to the map itself), so the netto loop's `?? 18` still applies to
  missing holes. The refactor did NOT collapse the two fallbacks.

**Mutation check (proves the tests guard this).** I temporarily flipped the
SI-array fallback in `buildCourseArrays` from `?? h` to `?? 18` and re-ran the
new test file: **2 tests failed** (the sparse-course and empty-course cases).
Reverted immediately; working tree confirmed clean. The tests are not
tautological — they would catch a fallback regression.

**Verbatim extraction — CONFIRMED.**

- `buildCourseArrays` produces byte-identical `coursePars`/`courseStrokeIndices`
  to the old inline loops in BOTH call sites. Compared old blocks
  (`git show 5f9e6d42:...`) against the helper: same `parByHole`/`siByHole` map
  build, same `for h=1..18` loop, same `parByHole.get(h) ?? 4` and
  `siByHole.get(h) ?? h`. Par source in the tsx call site is `par_mens`
  (mapped at `sideTournament.tsx:59`), matching the old inline `h.par_mens`.
  Par fallback `?? 4`, SI-array fallback `?? h` — all identical.
- `mapSideWinners` filters exactly `position ∈ {1,2}` and maps
  `winner_user_id → winnerUserId` (with `category`, `position` passthrough) —
  identical to both old inline filter/map blocks.

**No dropped usage — CONFIRMED.**

- `parByHole` no longer referenced anywhere in `sideTournament.tsx`
  (`grep` → not found); correctly encapsulated inside `buildCourseArrays`.
- `siByHole` still destructured from the helper (`:56`) and used by the netto
  loop (`:99`).
- The `SideWinner` type import was removed from `sideTournament.tsx` and is
  genuinely unused now (only `mapSideWinners`'s return value is used); tsc/eslint
  clean confirms no unused-import or missing-type error.
- `SideWinnerRow` import is still present and still used (`:49`,
  `fetchSideWinners` return type).

## Gate results

`node --version` → v22.23.0 (Node 22 confirmed).

**`npx vitest run lib/scoring/sideTournamentInput.test.ts lib/scoring/sideTournament.test.ts`**
```
 Test Files  2 passed (2)
      Tests  162 passed (162)
   Duration  802ms
```

**`npx tsc --noEmit`** → exit code **0**, no output (clean).

**`npx eslint lib/scoring/sideTournamentInput.ts "app/[locale]/games/[id]/leaderboard/sideTournament.tsx"`**
→ exit code **0**, no output (clean).

## Scope

`git diff 5f9e6d42..HEAD --stat` — exactly the 3 expected source files + the
contract md:
```
 .forge/contracts/973-matchplay-side-tournament-dedup.md | 59 +++++++
 app/[locale]/games/[id]/leaderboard/sideTournament.tsx  | 42 +++----
 lib/scoring/sideTournamentInput.test.ts                 | 88 ++++++++++
 lib/scoring/sideTournamentInput.ts                      | 92 +++++++++----
```

Out-of-scope checklist — all clean:
- No full builder consolidation (two builders remain separate; only shared
  sub-blocks extracted).
- Per-player netto source / team grouping / best-ball logic in
  `computeSideTournament` untouched (`:64-159` unchanged apart from the two
  helper-call substitutions).
- `calculateSideTournament` (the consumer) untouched
  (`git diff … lib/scoring/sideTournament.ts` empty).
- No UI/copy change.
- No version bump / CHANGELOG change (`git diff … package.json CHANGELOG.md
  package-lock.json` empty) — correct for a `refactor(scoring):` commit.

There is an uncommitted working-tree edit to the contract md (Success-Criteria
checkboxes flipped `[ ]→[x]` by the build step) — forge bookkeeping, not a code
change; irrelevant to the refactor's correctness.

## Minor notes (non-blocking, no action required)

- The contract's inline line-number citations are slightly stale
  (`buildCourseArrays` is `:12-42` not `:12-52`; `mapSideWinners` is `:49-60`
  not `:54-71`) and it says "8 tester" where the file has 12. Cosmetic
  documentation drift in the checklist; the criteria themselves are fully met.
