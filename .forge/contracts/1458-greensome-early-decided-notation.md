# Contract: #1458 + #1506 — Early-decided matchplay team formats show «Xup» instead of «X&Y»

Worktree: `.claude/worktrees/contract-golf-app-5f531d` · Branch: `claude/reverent-dirac-5cdc17`
Spec/anchor: issue #1458 (generalprøven of split cup day #1441, criterion 5b) + issue
#1506 (independent prod confirmation, cup «testes» 2026-08-07 — same root cause,
diagnosed to `computeFoursomesCore` missing the #800 snapshot).
All commits include `Refs #1458` and `Refs #1506` in the body. The PR closes both.

## Addendum 2026-08-07 — #1506 merged into this contract

- #1506 (filed after this contract was written) reached the identical root-cause
  diagnosis from prod data: game `90f3e5a1` (greensome, front9) decided 5 up with 4 to
  play, all 9 holes entered → persisted `game_players.result_summary.margin = "8up"`
  where «5&4» is correct. No contract changes needed — the design below already covers
  it. Points, winner side and cup totals were verified correct; only the notation string
  is wrong.
- Ground truth added this session: `lib/scoring/resultSummary.ts:184` sets
  `margin = result.formatted`, persisted at endGame via
  `lib/games/persistResultSummaries.ts`. The engine fix therefore flows into all future
  persists automatically. Cup pages compute on read, so existing cup matches heal on
  deploy without data changes.
- **Out of scope, follow-up issue:** already-persisted `result_summary.margin` strings
  on finished games (at least prod game `90f3e5a1`) stay wrong until repaired — a prod
  data repair is firewalled and needs owner approval, so it becomes its own issue.

## Problem

A greensome cup match mathematically decided before the last hole (e.g. 5 up with 4 to
play) shows «5up til Nord» on the cup card, where golf-correct decided notation is
«5&4». Singles with an identical run of holes shows «5&4» correctly, and a greensome
decided on the last hole correctly shows «1up» (the F1 «X&0» guard works). The wrong
notation appears wherever the engine's `result.formatted` is consumed (cup card, admin
cup view, leaderboards, mail) whenever the players kept entering scores after the match
was clinched.

## Root cause (diagnosed in contract session — verified by reading, not hypothesis)

The issue body guessed the cup layer formats foursomes differently from singles. That is
**wrong** — the cup pipeline passes the engine's `formatted` through untouched
(`lib/cup/computeCupMatchResult.ts:143` → `lib/cup/getCupSnapshot.ts:344` →
`app/[locale]/cup/[id]/page.tsx:215` / `CupManagement.tsx:341`). The real gap is in the
scoring engines:

- Bug #800 ("18up when all 18 holes are entered after the match was decided") was fixed
  for **singles only**: `singlesMatchplay.compute()` detects the first hole where
  `|holesUp| > holesRemaining` during the hole walk and freezes that snapshot
  (`lib/scoring/modes/singlesMatchplay.ts:330-344`, used at `:374-379`).
- `computeFoursomesCore` (`lib/scoring/modes/foursomesMatchplay.ts:273`) and
  `fourballMatchplay.compute` (`lib/scoring/modes/fourballMatchplay.ts:228`) never got
  that fix — they call `computeMatchResult` **only on final aggregates**. When every
  hole in scope has both-side scores, `holesPlayed === totalHoles` and the «Nup» branch
  (`singlesMatchplay.ts:110-127`) wins, even though the match clinched earlier.
- Existing decided-early tests in these modes all stop score entry at the clinch hole
  (`holesPlayed < totalHoles`), so `computeMatchResult`'s mat-em branch covers them and
  the gap stayed invisible.

**Affected modes:** foursomes, greensome, chapman, gruesome (all delegate to
`computeFoursomesCore`) + fourball (own walk). **Not affected:** patsome, round robin,
nassau, best_ball (no «X&Y» notation by design), matchplayRunningStatus (live
thru-status, different semantics).

## Research Findings

No third-party library involved — pure in-repo TypeScript. The reference implementation
is the in-repo #800 fix and its regression suite
(`lib/scoring/modes/singlesMatchplay.test.ts:419-476`), which locks the exact target
behavior: clinch mid-round + remaining holes entered afterwards → frozen «X&Y».

## Prior Decisions

- **#800:** decided notation must reflect the clinch point, not final aggregates, even
  when all holes in scope are entered afterwards. This contract extends that decision to
  the rest of the matchplay family.
- **F1/#1441 «X&0» guard:** a clinch registered on the last hole in scope must format
  «Nup», never «N&0» (`holesPlayed < totalHoles` guard, `singlesMatchplay.ts:326-330`).
  Must not regress.
- **#1441 segments:** `totalHoles` = holes in scope (18 full / 9 front9-back9); all
  mat-em math is scope-relative. Max clinch over 9 holes is «5&4».
- **AGENTS.md trap 4 (a rule has one home):** the mat-em snapshot currently lives inline
  in the singles walk only. After this fix the rule must have ONE shared home used by all
  three walks — a third inline copy is not acceptable.
- **lib/scoring domain rule:** new test FIRST, no exceptions (`lib/scoring/AGENTS.md`).

## Design

Port the #800 mat-em snapshot from the singles walk to `computeFoursomesCore` and
`fourballMatchplay.compute`, by extraction rather than copy-paste:

1. Extract the per-hole mat-em detection into one shared exported helper (recommended
   home: `singlesMatchplay.ts` next to `computeMatchResult`, which the other modes
   already import; exact shape is builder's discretion — e.g.
   `detectMatEm(side1Wins, side2Wins, holesPlayed, totalHoles): MatchplayMatchResult | null`
   called per hole, first non-null hit frozen by the caller, or a small tracker
   closure). Refactor the singles walk to use it — the existing #800 suite locks the
   behavior during the refactor.
2. In `computeFoursomesCore`'s hole walk and `fourballMatchplay`'s hole walk: after each
   played hole, run the same detection; keep only the **first** hit; final result =
   `matEm ?? computeMatchResult(holesUp, holesPlayed, holesRemaining, totalHoles)` —
   exactly the singles pattern (`singlesMatchplay.ts:378-379`).
3. Aggregates (`holesUp`, `holesPlayed`, `holesRemaining`) keep their full-walk values;
   only `result` freezes. This matches singles semantics, and the cup layer consumes
   only `result`.

No cup-layer or UI changes: once the engines return the frozen snapshot, the cup card,
admin view, leaderboards and mail are all correct for free.

## Edge Cases & Guardrails

- Clinch registered on the last hole in scope → «Nup»/«AS», never «N&0» (keep the
  `holesPlayed < totalHoles` guard). Existing F1 tests must stay green.
- Aggregate flips after the clinch (trailing side wins the remaining holes) → result
  stays frozen at the clinch snapshot; `holesUp` keeps the final walk value. This is the
  strongest repro shape — it distinguishes freezing from final-aggregate formatting.
- Hole where only one side has gross → not counted as played, still remaining (existing
  `classifyMatchplayHole` semantics; mat-em math uses the same `holesPlayed`).
- No scores / live mid-round not clinched → `result` stays `null` (unchanged).
- 9-hole segment scope → scope-relative math (already parameterized via `totalHoles`).
- Pure functions, no DB, no migration, no RLS.

## Key Decisions

- Fix at engine level, not cup level — the cup layer already passes `formatted` through;
  fixing the engines also repairs regular (non-cup) foursomes-family and fourball games.
- One shared home for the mat-em rule (trap 4) — extraction over three inline copies.
- Chapman/gruesome get no dedicated new tests: they delegate to `computeFoursomesCore`
  and the core is tested directly; adding per-mode duplicates would violate test
  discipline (no redundant re-assertions). Greensome DOES get a repro test — it is the
  reported mode and proves the delegation path end-to-end.

**Claude's Discretion:**
- Exact shape/name/location of the shared helper (function-per-hole vs tracker closure).
- Whether the greensome repro uses zero handicaps (recommended — keeps the fixture pure)
  or mirrors the #1441 override setup.

## Success Criteria

- [x] C1 (test-first repro, core): `foursomesMatchplay.test.ts` — side 1 clinches at
  hole 14 (5 up, 4 remaining), holes 15–18 entered and won by side 2 →
  `result.formatted === '5&4'`, `decidedAtHole === 14`, `remainingAtDecision === 4`,
  `winner === 'side1'`, while `holesUp === 1` (proves freezing, not final aggregates).
  Written FIRST, shown failing, then green.
  **Evidence:** failing-first `AssertionError: expected '1up' to be '5&4'`
  (foursomesMatchplay.test.ts:643) before the walk fix in 65200e9b; green in the C4 run.
- [x] C2 (reported mode): `greensomeMatchplay.test.ts` — same scenario through
  `greensomeMatchplay.compute` → `'5&4'`. Failing first, then green.
  **Evidence:** failing-first at greensomeMatchplay.test.ts:427 (same assertion), green
  in the C4 run; asserts formatted/winner/decidedAtHole/remainingAtDecision/marginUp.
- [x] C3 (sibling walk): `fourballMatchplay.test.ts` — same scenario shape through
  fourball's own walk → `'5&4'`. Failing first, then green.
  **Evidence:** failing-first at fourballMatchplay.test.ts:683, green in the C4 run.
- [x] C4 (no regressions): full `npx vitest run lib/scoring` green — including existing
  F1 last-hole «1up»/«X&0» guards and the singles #800 suite (locks the extraction
  refactor).
  **Evidence:** main-chat re-run 2026-08-07 21:53: `Test Files 45 passed (45) · Tests
  1127 passed (1127)` (was 1124 on main; +3 repro tests).
- [x] C5 (one home): the mat-em snapshot logic exists in exactly one exported helper,
  used by the singles walk, `computeFoursomesCore` and fourball. Evidence: grep shows
  one definition + three call sites, zero inline copies.
  **Evidence:** main-chat grep: definition `singlesMatchplay.ts:152`, call sites
  `singlesMatchplay.ts:366`, `foursomesMatchplay.ts:261`, `fourballMatchplay.ts:213`.
- [x] C6 (staging, user-visible): seeded early-decided greensome cup match on
  torny-staging shows «5&4 til <lag>» on the cup page (and admin cup view). Evidence
  posted on the PR per staging-verify + `staging-verified` label before merge.
  **Evidence (2026-08-07):** no seeding needed — the #1441 generalprøve cup «RyderTest2»
  already held the exact repro (Greensome 1, persisted margin '5up', 9/9 holes). Cup
  result page on the PR branch shows «5&4 til Nord»; last-hole-decided Greensome 3
  correctly keeps «1up til Sør»; tied Greensome 2 keeps «Delt (AS)». DB still holds
  '5up' (compute-on-read proven, zero writes). Post-#1472 admin cup view renders no
  notation itself — it links to the verified result page. Full oracle table in the PR
  comment on #1510.

## Gates

- [ ] `npx vitest run lib/scoring` green (domain rule: test FIRST)
- [ ] `npx tsc --noEmit` clean (from the worktree root — main-repo tsc can be false-red)
- [ ] `npm run lint` clean
- [ ] `fix` → patch bump (`npm version patch --no-git-tag-version`) + one Feilrettinger
  line in `CHANGELOG.md` (commit-msg hook enforces)

## Files Likely Touched

- `lib/scoring/modes/foursomesMatchplay.ts` — mat-em snapshot in the core walk
- `lib/scoring/modes/fourballMatchplay.ts` — same in fourball's walk
- `lib/scoring/modes/singlesMatchplay.ts` — extract shared helper; walk refactored onto it
- `lib/scoring/modes/foursomesMatchplay.test.ts`, `greensomeMatchplay.test.ts`,
  `fourballMatchplay.test.ts` — new repro tests
- `package.json`, `package-lock.json`, `CHANGELOG.md` — patch bump + Feilrettinger line

## Out of Scope

- `matchplayRunningStatus.ts` (live thru-status on the scorecard — different semantics,
  no final notation).
- Round Robin / Nassau / best_ball cup host / patsome — no «X&Y» notation by design.
- Cup UI files — they already render `result.formatted` correctly.
- Any DB/schema/RLS work — results are computed on read, nothing is persisted.
- Concessions ("gimme"/conceded matches) — not a feature in the app; nothing to do.
