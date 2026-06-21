# Evaluation: #841 — extract ScoringRulesPanel from SideTournamentView

**Verdict: ACCEPT**

Pure behavior-preserving extraction of the ~190-line `ScoringRulesPanel`
(side-tournament rules/help panel) + its private `isTeamOnlyCategory` helper out
of the 1213-line `SideTournamentView.tsx` (now 1009 lines) into a new co-located
`SideTournamentRulesPanel.tsx`.

## Criteria (independently verified, fresh-context evaluator)

| # | Criterion | Result |
|---|-----------|--------|
| 1 | New file exports `ScoringRulesPanel`, holds private `isTeamOnlyCategory` + inline `PanelRowDef`/`PanelGroupDef`/`PANEL_GROUPS` | PASS |
| 2 | Both functions removed from `SideTournamentView.tsx` | PASS |
| 3 | **Verbatim move** — moved block byte-identical to `origin/main` 1022–1209 except the added `export` keyword | PASS (diff = exactly one hunk) |
| 4 | Import added; render site (~237) unchanged; `GROUP_ORDER`/`GroupId` re-exports retained | PASS |
| 5 | New file imports exactly `useTranslations` + `type SideCategoryId` + `type GroupId` (type-only circular import, no runtime cycle); none unused | PASS |
| 6 | No orphaned imports in `SideTournamentView.tsx` | PASS |
| 7 | Only 2 files changed; no bump/CHANGELOG; `refactor(` prefix | PASS |

## Notes

The implementer initially added a 2-line JSDoc above `isTeamOnlyCategory`; it was
stripped (commit `968b57ee`) to keep the move strictly verbatim and avoid pulling
new Norwegian copy into a pure-refactor diff. The `GroupId` type-only import from
`./SideTournamentView` (which re-exports it) is intentional and creates no runtime
cycle.

## Gates (run by evaluator, Node 22)

- `npx tsc --noEmit` → exit 0
- `npx eslint` (both files) → 0 errors, 0 warnings
- `npx vitest run SideTournamentView.test.tsx` → 3 passed

Net: 2 files changed, +193 / −205.
