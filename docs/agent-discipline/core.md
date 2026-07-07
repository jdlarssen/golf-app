# Agent discipline — core

<!-- Always-loaded via @-include in CLAUDE.md. Procedure files are referenced by plain path
     on purpose — @-imports recurse and would load everything every session.
     Package docs: docs/agent-discipline/README.md -->

This file converts judgment into procedure: when a trigger fires, STOP and read the matching
procedure before continuing — each rule traces to a real failure in this repo's history
(prod, staging QA, or a blocked main).

## How to use

1. Match your situation against the trigger table. Triggers are observable events, not
   vibes. Several can fire at once; run every one that matches, in table order.
2. Make the dispatch visible: your first status message on a new task names the
   classification (TRIVIAL/FULL, T1 step 1) and the triggers you expect to fire. A
   dispatch that never appears in output did not happen — "this is a simple cleanup" in
   place of a classification is the anti-rationalization table's first row.
3. Read the procedure file with the Read tool — once per session. A procedure already read
   is re-RUN from memory, not re-read; re-read only after context compaction (T9).
4. Follow numbered steps literally. Where a step names an exit condition, do not move on
   until it is met. SKIP-conditions are explicit; if none applies, you may not skip.
5. `docs/agent-discipline/bindings.md` maps generic steps to this repo's exact commands,
   paths and domain traps. Procedures point to its sections (§T1–§T7 and §T9,
   §Enforcement — which also covers T8's repo specifics — and §Domain triggers).

## Trigger table

| # | When (observable event) | Read first |
|---|---|---|
| T1 | New task: user request, issue picked up, or subtask you defined | docs/agent-discipline/procedures/task-intake.md |
| T2 | About to change the signature OR behavior of an exported symbol, a type/union member, constant, limit/bound, or user-visible string — or you just fixed a bug pattern (T4 routes here) | docs/agent-discipline/procedures/change-propagation.md |
| T3 | About to touch DB schema, a migration, DB-enforced authz (RLS here), or write any INSERT/UPDATE/DELETE/upsert | docs/agent-discipline/procedures/db-and-authz.md |
| T4 | Bug report, failing test, or output ≠ your `EXPECT:` line (I8) | docs/agent-discipline/procedures/debugging.md |
| T5 | About to add or change a test (including snapshot refreshes) | docs/agent-discipline/procedures/testing.md |
| T6 | About to commit, or to open or merge a pull request (repo commands: bindings §T6) | docs/agent-discipline/procedures/commit-and-pr.md |
| T7 | About to send any message reporting task status to the user — end-of-turn summary, PR description, issue-closing comment — in any language (done/ferdig, fixed/fikset, works/funker, passing/grønt) | docs/agent-discipline/procedures/done-verification.md |
| T8 | 2 failed attempts at the same goal (attempt: defined in I5) · a hook/permission denial whose remedy the active procedure or the denial text does NOT already give · missing access/info · conflicting instructions · about to re-run a command with identical arguments and no change in between | docs/agent-discipline/procedures/stuck-and-stop-loss.md |
| T9 | Session start in a fresh worktree, or context was summarized/compacted | docs/agent-discipline/bindings.md §T9 |

## Global invariants (always active)

| # | Invariant | Enforced by |
|---|---|---|
| I1 | Ground truth over memory. Never write an API call, column name, enum value, config key or path from recall. If you did not read it in THIS session (file, live schema, bundled docs), verify before writing it. | discipline only |
| I2 | Evidence before claims. "Done / fixed / passing" requires command output produced in this session that shows it (T7). | discipline only |
| I3 | Absence of error ≠ success. Operations that can silently no-op (0-row write, empty query result, skipped gate) must be positively confirmed. Where in-session confirmation is impossible (e.g. fire-and-forget mail — best-effort by design here), write `VERIFICATION GAP:` instead of claiming success. | partial — affected-rows helper (bindings §T3) |
| I4 | Scope = the task. Every changed line must trace to the task. Unrelated finding → separate issue, never a drive-by edit. | discipline only |
| I5 | Stop-loss. An attempt = an edit to product code intended to remove a symptom, followed by a rerun that still shows it. Probes and diagnostics are not attempts. Two failed attempts at the same symptom → stop editing, go to T8. Never attempt #3 on hope. | discipline only |
| I6 | Unclear intent, requirements or architecture: interactive session → ask before writing code. Autonomous/unattended → pick the most reasonable interpretation, proceed, and record `ASSUMPTION:` in reply and notes. | discipline only |
| I7 | Hooks are teammates. A block or denial is information about a rule, never an obstacle. Fix the cause; bypassing (skip-verify flags, force-push, bypass env vars, rewording a command to dodge a rule) is forbidden. Documented false-positive workarounds (bindings §Enforcement) are not dodges. | guard hooks deny bypass flags |
| I8 | Predictions make failures visible. Before running a verification command you will act on (test, build, query), write one line: `EXPECT: <output>`. Output ≠ EXPECT → T4 fires. | discipline only |

## Token economy (always active)

- Batch independent tool calls in one message; never serialize reads that don't depend on
  each other's output.
- Search before reading: Grep/Glob to locate, then Read the relevant range. Whole-file
  reads only for files under ~200 lines, or files where you will edit 3+ separate regions.
- Never re-read a file you just edited "to verify" — the edit tool errors on failure.
- Exploration is direct by default. A clearly-delimited fan-out question you expect to
  touch more than ~5 files ("where is X handled?") → delegate one codebase-search agent if
  the harness has one (Claude Code: an Explore subagent), not ten manual greps.
- Don't paste file contents, long diffs or full logs into replies; cite `path:line` and
  summarize.
- The conversation is a cache: don't re-derive established facts or re-open decided
  questions.
- Stop searching once you can act. One confirming source is enough; don't confirmation-shop.

## Anti-rationalization table

Catching yourself thinking the left column means the right column applies.

| Thought | Reality |
|---|---|
| "It's a one-line change" | One-line changes with unread context broke prod here (#666, #669). T1's short path takes under a minute. |
| "It compiles / types are green" | The #641–#648 cluster compiled green, passed unit tests, and was broken end-to-end in prod. Green build ≠ executed flow (T7). |
| "I remember this API/schema" | Hand-recalled schema is this repo's #1 bug source. Read it (I1). |
| "The fix is obviously X" | Two obvious fixes failing in a row = your model of the bug is wrong. Diagnose first (T4). |
| "I'll fix this other thing while I'm here" | Separate issue (I4). |
| "The test/hook is wrong, I'll bypass it" | The gate encodes a shipped failure. Fix the cause or go to T8 (I7). |
| "Third attempt will probably work" | Stop-loss (I5). |
| "Recording the assumption slows me down" | An unrecorded wrong assumption costs a debugging session later (I6). |
| "I fixed the reported site, so the bug is fixed" | The same pattern usually lives in sibling modules (#666, #907). T2 step 3. |
