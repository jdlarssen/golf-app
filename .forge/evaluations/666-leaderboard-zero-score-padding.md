# Evaluation: #666 — Leaderboard zero-score padding

**Verdict: ACCEPT**
**Evaluated:** 2026-06-17 · fix commit `5340a73b` · branch `claude/infallible-hypatia-5167f6`
**Evaluator:** independent skeptical review (read code + ran all gates myself)

The legacy `computeLeaderboard` in `lib/leaderboard.ts` padded missing holes with `0` in the
ranking array, so a team that entered no scores summed to 0 and `rankTeams` (ascending) crowned it
#1. The fix back-ports the `bestBall.ts` `#635` pattern: a team with no scores at all is padded with
`UNPLAYED_PADDING` (999) on every hole; teams that played ≥1 hole are unchanged. All five criteria
pass, and the key non-regression property holds.

## Per-criterion table

| # | Criterion | Verdict | Evidence |
|---|-----------|---------|----------|
| K1 | TDD proof — regression test genuinely targets the bug; fails pre-fix, passes post-fix | ✅ PASS | I copied `git show HEAD~2:lib/leaderboard.ts` (the literal pre-fix file, with `arr.push(h?.teamNet ?? 0)`) into a temp module and ran the regression test against it: **FAIL — `AssertionError: expected 2 to be 1`** (no-score team B got rank 1, team A rank 2). On the current tree `npx vitest run lib/leaderboard.test.ts` → **3/3 pass**. Temp files removed; `git status` clean. The test asserts `t1.rank===1`, `t2.rank===2`, and `t2.missingHoles).toHaveLength(18)` (proving team B truly entered nothing). |
| K2 | Fixed ranking block: (a) `h?.teamNet ?? (teamPlayedAny ? 0 : UNPLAYED_PADDING)`, (b) `UNPLAYED_PADDING` imported, (c) matches `bestBall.ts`, (d) ≥1-hole team UNCHANGED | ✅ PASS | `lib/leaderboard.ts:205` is exactly `arr.push(h?.teamNet ?? (teamPlayedAny ? 0 : UNPLAYED_PADDING));` with `teamPlayedAny` computed at :201. Import extended at :5 (`UNPLAYED_PADDING` added). Byte-identical logic to `bestBall.ts:173-177`. **(d):** when `teamPlayedAny===true` the ternary picks `0`, which equals the old `?? 0` — no change for any team with a score. |
| K3 | Stale comment ("Missing holes get the team's average") corrected | ✅ PASS | Old comment (it used 0, not an average — the comment lied) is gone. New comment at :195-199 accurately describes both branches and cites #666/#635 + "Mirrors lib/scoring/modes/bestBall.ts". |
| K4 | `npm run typecheck` 0 errors; `npm test` all green (~3564); `lib/leaderboard.ts`/`.test.ts` not among pre-existing lint errors | ✅ PASS | `npm run typecheck` → clean (tsc --noEmit, no output). `npm test` → **282 files / 3564 tests passed** (matches contract exactly). `npm run lint 2>&1 \| grep -i leaderboard` lists only the pre-existing `app/[locale]/.../leaderboard/*View.tsx` files; **neither `lib/leaderboard.ts` nor `lib/leaderboard.test.ts` appears**. |
| K5 | `package.json` = 1.132.6 and `CHANGELOG.md` has a 1.132.6 entry, both in commit 5340a73b | ✅ PASS | `git show 5340a73b:package.json` → `"version": "1.132.6"`; current tree matches. `git show 5340a73b:CHANGELOG.md` has `### [1.132.6] - 2026-06-17 · #666` with tagline + Teknisk block, both staged in the same commit as the fix. |

## Non-regression analysis (the skeptical core)

**Claim:** the fix changes ranking *only* for an all-empty team; every team with ≥1 score is bit-for-bit unchanged.

**Verified by mechanism, not just by test:**
- `holes[i].teamNet` is `bb.teamNet` from `bestBallForHole`, which is `null` when no team member scored that hole. `missingHoles` is defined as exactly the holes where `teamNet === null` (`lib/leaderboard.ts:176-178`).
- `teamPlayedAny = l.holes.some((h) => h?.teamNet != null)`. For a team with at least one score this is `true`, so the ternary `(teamPlayedAny ? 0 : UNPLAYED_PADDING)` evaluates to `0` — **identical to the old `h?.teamNet ?? 0`**. The ranking array is therefore unchanged for every partial or full team.
- Only when *all 18* holes are `null` does `teamPlayedAny` become `false`, switching the pad to `UNPLAYED_PADDING` (999 → sum 17982 → ranked last). This is the single new branch.
- The "basic netto" test (team A total 72 → rank 1, team B total 90 → rank 2) confirms the normal two-team case still ranks lowest-total-first, untouched.

**Is the test trivially passing?** No. I ran the regression assertion against the actual pre-fix file and it failed with `expected 2 to be 1` — it genuinely catches the bug. It would also catch a future regression that reverted the pad to `?? 0`.

**Scope discipline:** the "partial team → missing holes = 0" behaviour is deliberately preserved (separate, by-design, flagged via `missingHoles` for a UI warning). The fix does not touch it. Matches contract Merknad.

## Bottom line

ACCEPT. The fix is a faithful, minimal back-port of the established `bestBall.ts` pattern; it is
provably correct against the pre-fix regression, leaves the normal ranking path byte-identical, and
ships with version bump + CHANGELOG in the same atomic commit.
