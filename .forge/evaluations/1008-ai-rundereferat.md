# Evaluation: #1008 — AI-rundereferat ved avsluttet spill (Pressetribunen v1)

**Evaluator:** fresh-context skeptical reviewer
**Date:** 2026-07-02
**Commits reviewed:** `7534f618..6219c6d6` on `claude/xenodochial-poincare-63b7de`
**Contract:** `.forge/contracts/1008-ai-rundereferat.md`

## Verdict

**ACCEPT**

Every success criterion was independently verified. All four gates are green with the exact
counts the contract claims (tsc clean, 4462 tests / 351 files, lint 0 errors, build exit 0). The
anonymous spectator path renders the stored report server-side (verified via `curl` — no auth). The
best-effort/never-block semantics, the "LLM sees only deterministic facts" property, the HTML
escaping of untrusted LLM output, and the reopen-clearing are all present and tested. No blocking
findings.

## Criterion-by-criterion

| # | Criterion | Verified how | Result |
|---|-----------|--------------|--------|
| 1 | Finished game gets report on result page + mail + spectator link | `curl -s /spectate/393c6166-…` (HTTP 200, anonymous) contains `data-testid="round-report"`, the kicker «Fra pressetribunen», and the seeded body text, all inside the report div with the champagne-gold `border-l-[3px] border-accent`. Mail block present-case in `gameFinishedNotification.test.ts:707`. Result-page + spectate share `renderLeaderboardContent` → one wiring covers both. | PASS |
| 2 | Report failure never affects finish flow | `generateAndPersistRoundReport` is a whole-body try/catch that **never throws** (returns `{status,report}`). Wired *after* `notifyAchievementUnlocks`, *before* the mail blast, at both end-actions; return value is informational only. Tests: missing key → `'skipped'` w/o SDK **and w/o getGameWithPlayers** call; null result → skipped; <6 holes → skipped; SDK reject → `'failed'` no throw; sanitizer reject → failed; 0-row write → failed. | PASS |
| 3 | Report never contradicts leaderboard | Facts built exclusively via `buildShareCardData` (same shaper as leaderboard/share card); `buildRoundReportFacts` never re-derives a total/rank/margin. Prompt embeds fact JSON verbatim (`roundReportPrompt.test.ts:42` `JSON.parse` == FACTS). Type A tests assert facts numbers == ModeResult numbers by construction — e.g. matchplay `margin:'3&2'`/`decidedAtHole:16` pass straight through from `result.result`. LLM never sees raw scores. | PASS |
| 4 | Type B snapshot test on mail integration | ONE new extractor `roundReportBlockHtml()` (distinct `margin:24px 0` fingerprint) + ONE present-case. Absence locked by existing `baseParams` cases (no `roundReport`). Chrome + subject snapshots untouched. | PASS |
| 5 | No API call on read | `@anthropic-ai/sdk` imported only in `lib/games/generateRoundReport.ts`; called only from the two end-actions. Read path (`getGameWithPlayers` → `RoundReportCard`) has zero SDK contact. Build renders spectate w/o any generation. | PASS |
| 6 | All 22 modes produce facts | Exhaustive `switch` on `ModeResult.kind` in `computeScoredHoles` with `never` default; band-collapse (placement/matchplay/skins) via `buildShareCardData`. Type A band-coverage `it.each` over the remaining placement kinds. `null` result + <6 scored holes → skipped (tested). | PASS |
| 7 | `reopenGame` clears the report | `.update({ status:'active', ended_at:null, round_report:null })` at `actions.ts:784` (commit b606d3bc). | PASS |
| 8 | Gates green | Ran all four myself (see below). tsc clean; vitest 4462/351; lint 0 errors; build exit 0. | PASS |
| 9 | Version bump minor + `[no-changelog]` | `package.json` 1.163.2 → 1.164.0. Feat commit `afd8e46a` body carries `Refs #1008` + `[no-changelog]` with dark-launch rationale. No CHANGELOG line (deferred to key-flip, passkey precedent). | PASS |

## Gate outputs (exact)

| Gate | Command | Result |
|------|---------|--------|
| Types | `npx tsc --noEmit` | exit 0, no output (clean) |
| Tests | `npx vitest run` | **Test Files 351 passed (351)**, **Tests 4462 passed (4462)**, 0 failures, duration ~50s |
| Lint | `npm run lint` | exit 0 — **0 errors, 50 warnings**. All 50 are pre-existing `complexity`/`max-depth` warnings in files OUTSIDE the diff (sideTournament, league, wolf, wizard, etc.). None in the new #1008 files. |
| Build | `npm run build` | **exit 0**, "✓ Compiled successfully", 268 static pages generated, no errors |

Live surface (dev server already running on :3000, staging-backed):
- `GET /spectate/393c6166-1659-40b4-bf07-d9412187ad1a` → HTTP **200** (anonymous, no cookie)
- `grep 'data-testid="round-report"'` → 1 match
- `grep 'Testreferat fra pressetribunen'` → 1 match (inside the report div)
- `grep 'Fra pressetribunen'` → 4 matches (kicker heading rendered)

## Findings

No blocking findings.

**N1 (note, non-blocking).** Two threshold constants govern "thin data": `MIN_SCORED_HOLES = 6`
(skip-generation, `generateRoundReport.ts`) and `THIN_DATA_HOLE_THRESHOLD = 9` (short-prompt in
`roundReportPrompt.ts`). These are intentionally distinct — <6 = no story (skip), 6–8 = short report
(3-sentence cap). Consistent with contract decisions 3 + 5, but the two different numbers could read
as a discrepancy on a quick skim. Fine as-is.

**N2 (note, non-blocking).** Plain-text mail branch does not `escapeHtml()` the report (`reportText`
at `gameFinishedNotification.ts:315`). Correct — plain text has no injection surface; the HTML
branch (line 313) does escape, and the mail test asserts `& → &amp;` in the HTML block. Untrusted
LLM output is properly escaped where it matters.

**N3 (note, non-blocking).** `RoundReportCard` gating is asymmetric across formats: matchplay/
fourball/foursomes use `game.status === 'finished' && game.round_report`, while placement formats
gate on `game.round_report` alone. Verified safe both ways: matchplay `*View` renders on live+finished
(single return), so it needs the explicit status guard; placement formats define `reportSection`
*inside* their `if (status === 'finished')` block, so it's structurally unreachable on live/reveal
paths. And `round_report` is only ever non-null on finished games regardless. No live-render leak.

**N4 (note, non-blocking).** `lib/cup/actions.ts:385` sets `status: 'finished'` but on the
`tournaments` table (cup/liga), not `games` — not a missed game-finish path. `endGameMarkingWithdrawals`
delegates to `endGame(gameId, true)`, so it inherits the report hook. The "exactly two finish paths"
claim holds.

## Notes

- The 50 lint warnings are all pre-existing complexity warnings outside the diff scope — not
  introduced by this work, not a blocker.
- Test discipline respected: exactly ONE new Type C render test (`RoundReportCard.test.tsx`, one
  `it`); the `scorecardLayout.test.ts` +1 line is just a fixture field (`round_report: null`), not a
  new test; Type B is one extractor + one present-case (additive).
- `getGameWithPlayers` keyParts bumped `'gwp2' → 'gwp3'` — stale-cache trap correctly handled; the
  bump forces a one-time fresh fetch so just-finished reports appear immediately.
- `database.types.ts` includes `round_report` in Row/Insert/Update; migration `0125` is additive
  nullable with the RLS-audit note. (Migration application to staging/prod is an owner/MCP step, not
  verifiable from the worktree — the contract documents the staging-first discipline.)
- The feat commit ships dark (no `ANTHROPIC_API_KEY` in prod), which is the designed rollout.
