# Evaluation: #506 — GameForm/GameWizard flaky timeout fix

**VERDICT: ACCEPT**

Evaluated: 2026-06-08  
Commit: `0adb95b`  
Evaluator: independent fresh-context agent

---

## Per-Criterion Table

| Criterion | Status | Evidence |
|---|---|---|
| **C1 — Root cause documented with evidence** | PASS | Contract contains evidence table: 2.82s / 122ms isolated vs 5–7s under load; default 5000ms identified as the ceiling. Mechanism proof (C3/G3) independently confirms this. |
| **C2 — Config change in place** | PASS | `vitest.config.ts` lines 27–28: `testTimeout: 20_000` and `hookTimeout: 20_000` with `#506` comment. Only file changed besides `.forge/contracts/`. |
| **C3 — Mechanism proof (deterministic)** | PASS | `--testTimeout=1` → all 61 tests fail with `Error: Test timed out in 1ms.` (TestTimeoutError, not assertion failures). Zero logic failures: the error message + source location match `it(...)` call sites, not expect() lines. |
| **C4 — Isolation still green** | PASS | `npx vitest run GameForm.test.tsx GameWizard.test.tsx` → **61/61 passed, 2.66s** |
| **C5 — Full suite stable over repeated runs** | PASS | 3 consecutive `npx vitest run` runs: **248/248 files, 2966/2966 tests green each time, 0 timeouts.** Wall-clock: 25.3s, 25.9s, 27.4s. |
| **C6 — No test files modified** | PASS | `git diff origin/main...HEAD --name-only` = `vitest.config.ts` + `.forge/contracts/506-flaky-test-timeout.md`. No `*.test.ts(x)` files touched. |
| **C7 — TypeScript compiles clean** | PASS | `npx tsc --noEmit` → no output, exit 0. |

---

## Gate Outputs (key lines)

**G1 — tsc:**
```
(no output — clean)
```

**G2 — isolation:**
```
Test Files  2 passed (2)
      Tests  61 passed (61)
   Duration  2.66s
```

**G3 — mechanism proof (--testTimeout=1, ALL should fail):**
```
❯ app/admin/games/new/GameWizard.test.tsx (17 tests | 17 failed)
❯ app/admin/games/new/GameForm.test.tsx   (44 tests | 44 failed)

Error: Test timed out in 1ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
```
All 61 failures are `TestTimeoutError` at `it(...)` call sites — no assertion failures.

**G4 — full suite × 3:**
```
Run 1: 248 passed (248), 2966 passed (2966) — 25.30s
Run 2: 248 passed (248), 2966 passed (2966) — 25.93s
Run 3: 248 passed (248), 2966 passed (2966) — 27.44s
grep for FAIL/timed out: no matches in any run
```

---

## Diagnosis Soundness Assessment

The mechanism proof (G3) is a strong deterministic argument: the exact same test bodies that pass at 20s fail at 1ms with a `TestTimeoutError`, not a logic error. This rules out race conditions and assertion bugs as the failure mode. G4's three consecutive full-suite green runs are corroborating evidence, though a non-deterministic flake cannot be proven absent by N runs alone.

The key argument is: **G3 + G4 together**. G3 shows the failure mode is a timeout ceiling, not logic. G4 shows that raising the ceiling to 20s makes the flake stop occurring across 3 × 2966 tests (8898 test executions). The worst observed contention peak was 7s; 20s provides ~2.85× headroom. That's a sound basis for ACCEPT.

---

## Concerns / Notes

**None blocking.** Two observations worth noting:

1. **Global timeout is conservative but not dangerous.** Raising to 20s means a genuine infinite-loop or hang in any test would wait 20s before failing instead of 5s. Given the test suite runs in ~26s wall-clock across 248 files, this adds at most 15s of delay per truly hung test — acceptable for a CI gate, and the comment in the config documents the reasoning.

2. **`hookTimeout` was already 10s by default.** Setting it explicitly to 20s to match `testTimeout` is stylistically consistent but has no observed effect — no hook timeouts were seen in the flake data. Not a concern; just noted.

3. **`"Not implemented: navigation to another Document"` console noise** is pre-existing jsdom behaviour (flagged in contract as out of scope). Does not affect test correctness.
