# T5 — Testing

**TRIGGER:** about to add or change any test — including refreshing snapshots with the
test runner's update flag.

**SKIP IF:** never. (Snapshot refreshes follow step 5; everything else follows step 1.)

## Steps

1. **Pick the test type per the project's decision tree** (bindings §T5) — it is
   authoritative. Generic floor, ONLY where the project doctrine is silent: pure logic →
   unit test first or together with the code · rendered output → approval snapshot ·
   data-rendering UI → at most ONE render test per component · user flow → one e2e golden
   path. Protected areas that require the test FIRST are listed in bindings
   §Domain triggers. When you catch the thought "just one more test", stop and re-check
   the tree — surplus tests are scope creep with maintenance cost.

2. **Red before green.** Where a test precedes the fix/feature: take the edge-case table
   from intake (T1 step 4) → write the test → watch it FAIL → implement → green.
   A test that never failed proves nothing. Exit condition: you saw the red run.

3. **Time rules:** no absolute timestamps near now()-dependent logic. Use offsets
   relative to the current clock, or fake/frozen timers (this stack's idiom:
   bindings §T5). An absolute "future" date is a time bomb: when it expires the assertion
   flips and blocks every push through the test gate (#1000).

4. **Mock only at system boundaries**, and reuse the shared mock helpers — copy-pasted
   mock setup between files is forbidden (it signals a missing shared helper).

5. **Snapshot updates:** after a refresh, read the diff hunk by hunk and justify each
   change against your edit. An unexplained snapshot diff is a bug you are about to
   commit. Exit condition: every changed hunk has an explanation.

6. **Bug-fix tests:** when T4 captured an external artifact (prod log, payload), fixture
   first, then the failing test, then the fix. When T4 reproduced the bug directly, the
   failing test written BEFORE the fix is itself the fixture — proceed. Never write the
   "regression test" after the fix from imagination: it asserts the fix, not the bug.

7. **Copy-only changes:** update the source string → refresh snapshots → review the diff
   (step 5). Adding NEW tests for a copy change is forbidden by the project doctrine.

## Output

- Red-then-green evidence for step-2 tests (output in this session).
- Snapshot-diff justification, one line per template, in the commit message or PR.
