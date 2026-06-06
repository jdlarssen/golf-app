# Evaluation: #469 — shamble krever ≥2 lag i Kompis-wizard

**VERDICT: ACCEPT**

Evaluated: 2026-06-06
Evaluator: fresh-context adversarial review

---

## Per-criterion table

| # | Criterion | Evidence | Result |
|---|-----------|----------|--------|
| 1 | `shamble` case is exactly `n >= 6 && n <= 8 && (n % 3 === 0 \|\| n % 4 === 0)` | `fitsPlayerCount.ts` line 80: exact match. `n <= 0` guard at line 22 precedes the switch. No other format's case was changed — diff shows only shamble case touched. texas_scramble/ambrose/florida_scramble retain their #467 rules (`even 4–8`, `even 4–8`, `{6,8}` respectively). `best_ball` untouched (`even 2–8`). | PASS |
| 2 | Test asserts false for {1,2,3,4,5,7,9,12}, true for {6,8} | `fitsPlayerCount.test.ts` lines 283–297: all 10 entries confirmed. Contract requires false for {1,2,3,4,5,7,9,12} — all present. True for {6,8} — present. Note: contract also specified `false` for `n=12`; test line 294 asserts `[12, false]`. No other format's test expectations changed — diff shows only the shamble describe block was touched. | PASS |
| 3a | `npx vitest run lib/wizard/fitsPlayerCount.test.ts` | `1 passed (1)`, `Tests 110 passed (110)`, duration 352ms | PASS |
| 3b | `npx vitest run app/admin/games/new lib/wizard` | `Test Files 18 passed (18)`, `Tests 237 passed (237)`, no failures | PASS |
| 3c | `npx tsc --noEmit` | No output (exit 0) — type-check clean | PASS |
| 4 | Golf logic sanity: is `{6,8}` the correct set? | Team size 3: 2 teams=6 ✓, 3 teams=9 (>8 cap, excluded ✓). Team size 4: 2 teams=8 ✓, 1 team=4 (excluded ✓). The 8-slot payload cap is the same cap used by florida_scramble (#467) and best_ball (#374) — internally consistent. Valid sizes under both constraints: {6, 8}. Logic is correct. | PASS |
| 5 | `git diff origin/main...HEAD --stat` — only expected files | 6 files changed: `.forge/contracts/469-shamble-min-teams.md`, `CHANGELOG.md`, `lib/wizard/fitsPlayerCount.test.ts`, `lib/wizard/fitsPlayerCount.ts`, `package-lock.json`, `package.json`. No surprise files. | PASS |
| 6 | Version bumped + CHANGELOG entry under `1.83.y — Liga` | `package.json`: `"version": "1.83.12"` (patch bump from 1.83.11). `CHANGELOG.md` line 24: `### [1.83.12] - 2026-06-06 · bug` under `## 1.83.y — Liga` heading. Entry includes tagline blockquote + collapsible Teknisk section. | PASS |

---

## Issues found

None. All criteria pass.

---

## Supplementary notes

- The shamble test suite covers {1,2,3,4,5,6,7,8,9,12} — 10 values, giving full coverage of the floor (5→6 boundary), the odd-number gaps (5,7), the cap boundary (8→9), and an above-cap multiple (12). This exceeds the minimum required by the contract.
- The CHANGELOG tagline ("Shamble dukket opp i veiviseren allerede ved tre eller fire spillere...") is accurate and user-friendly Norwegian.
- The change is a strict tightening of an existing predicate — no new code paths, no new imports, no side effects outside the shamble case.
