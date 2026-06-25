# Evaluering: #940 — Per-bane prestasjonsoversikt + historikk-hub-toggle

VERDICT: ACCEPT

Evaluator: skeptical fresh-context review of branch `claude/loving-franklin-952bdf` (4 commits) vs `.forge/contracts/940-per-bane-stats.md`. All four gates run fresh, green. Live UI claim spot-checked against code; not re-driven.

## Per-kriterium (K1–K9)

| K | Status | Evidens |
| --- | --- | --- |
| K1 — Ren aggregator (TDD) | PASS | `lib/stats/courseStats.ts:42` groups by `courseId`, skips `courseId==null \|\| completeBrutto==null` (l.46), `average=Math.round(...)`, `best=Math.min`, sort `b.rounds-a.rounds \|\| courseName.localeCompare` (l.66-69). `courseStats.test.ts` covers all 8 listed cases incl. 82.5→83 rounding, single-round, null-courseId, tie-break asc. 7 tests green. |
| K2 — Toggle-komponent | PASS | `components/stats/HistorikkTabs.tsx` — `'use client'`, two `ReactNode` props, `useState<Tab>('stats')` default, `role="tablist"`+2×`role="tab"`, `min-h-[44px]`, i18n labels. Faithful mirror of `LeaderboardTabs`. Rendered at page.tsx:279. tsc green. |
| K3 — Statistikk-tab (default) | PASS | page.tsx:193-222 `statsContent` = trend chart (unchanged props) + `CoursePerformancePanel`. Default tab is `'stats'`. Live screenshot claim (trend + Baner) consistent with code. |
| K4 — Runder-tab | PASS | page.tsx:225-258 `roundsContent` = same `GameHistoryCard` list, same `?from=/profile/historikk` links, unchanged. |
| K5 — «Baner»-panel | PASS | `CoursePerformancePanel.tsx` — one `<li>` per course, `tabular-nums` cells (l.74), sorted by aggregator (rounds desc). Empty state wired via `coursesEmpty` (l.40-42). «Ukjent bane» fallback at page.tsx:184 (`g.courses?.name ?? unknownCourseName`). Live: "Byneset North · RUNDER 2 · SNITT 83 · BESTE 80" matches seed (80,86 → avg 83, best 80). |
| K6 — i18n | PASS | Both locales gained all 10 keys (tabStats/tabRounds/tabsAriaLabel/coursesHeading/coursesSubtitle/coursesColRounds/coursesColAvg/coursesColBest/coursesEmpty/unknownCourse). `npx vitest run messages` → 2 files, 4 tests green (catalog+apostrophe parity). No code-referenced key missing from either locale. |
| K7 — Query | PASS | `games.course_id` added to select at page.tsx:89; `GameRow.course_id: string \| null` at page.tsx:47. No new table/column/RLS. tsc green. |
| K8 — Tom-tilstand uendret | PASS | page.tsx:272-280 — `finishedCount===0` → same `emptyState` Card, NO `HistorikkTabs`. Toggle only renders in the `else`. Matches live "0-round → no tabs" claim. |
| K9 — Versjon + CHANGELOG | PASS | package.json 1.145.2 → **1.146.0** (minor, correct for feat). Exactly one Funksjon-row: `1.146 · Snitt og beste per bane` with `[#940] —` body + `↳ /profile/historikk · «Se tallene dine»` link+CTA, per docs/changelog-conventions.md. |

## Gates (kjørt fresh, Node 22)

| Gate | Kommando | Resultat |
| --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | PASS (exit 0, no output) |
| Lint | `npm run lint` | PASS (exit 0; 51 warnings, 0 errors — all pre-existing complexity warnings in unrelated files; none in new stats/components files) |
| Enhetstester | `npx vitest run lib/stats messages components/stats` | PASS (9 files, 76 tests) |
| Full build | `npm run build` | PASS (exit 0; `/[locale]/profile/historikk` in route map) |

## Gaps / concerns (ranked)

1. **[Process, non-blocking] Uncommitted `.claude/launch.json` change in working tree.** `git status` shows ` M .claude/launch.json` adding `"autoPort": true`. It is correctly NOT in the 4 commits (`main...HEAD` is clean of it), so it does not pollute this PR as committed — but it sits dirty in the worktree and will be swept into the next `git add -A`. Recommend the main chat either commit it separately (it's a generic staging-dev-server convenience, unrelated to #940) or discard it before merge. Does not affect any K-criterion.

2. **[Minor, defensible] Two Type-C render tests added** where the contract reserved the right to skip them. Judged compliant: the project rule is "maks én render-test **per komponent**", and each new component (`HistorikkTabs`, `CoursePerformancePanel`) has exactly one. Crucially, neither re-asserts Type-A math — `HistorikkTabs.test.tsx` tests only the toggle interaction with sentinel divs; `CoursePerformancePanel.test.tsx` asserts row-count/order/empty-state and explicitly NOT the numbers (passes pre-computed `CourseStat[]`). No low-value re-assert. This is correct discipline, not gold-plating.

3. **[None found — noted as verified-clean]** Adversarial checks that came back clean:
   - Average rounding: `Math.round` (half-up); golf scores always positive so no banker's/negative ambiguity. 82.5→83 tested.
   - Complete-18 discipline identical across all three consumers: page `completeBrutto` (l.185-188), trend filter (l.168), and `playerStats.completeRoundTotal` all gate on `holeCount===18 && bruttoSum!=null` / "exactly 18 non-null". `holeCount` derives from scores filtered `.not('strokes','is',null)`, so a 9-hole course (count 9) or partial 18-hole round (count <18) is excluded — no 9-hole trap, no partial-round leak.
   - Server→client boundary: `ReactNode` props only, same proven `LeaderboardTabs` pattern; no server-only value crosses.
   - Mixed complete/incomplete on one course: page emits per-round `completeBrutto`, incomplete rounds become `null` and are skipped per-round (not per-course) — a course with 1 complete + 1 incomplete round correctly reports rounds=1. Tested (courseStats.test.ts:46-55).
   - `effectiveDate` not orphaned by the restructure — still referenced at page.tsx:413,415.

## Recommendation

ACCEPT and merge. All 9 criteria PASS, all 4 gates green, no contract deviations. Before merge: have the main chat resolve the stray uncommitted `.claude/launch.json` (commit separately or discard) so it doesn't ride along untracked.
