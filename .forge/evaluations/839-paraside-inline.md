# Evaluation: #839 — extract shared ParAsideInline component

**Verdict: ACCEPT**

Behavior-preserving refactor. The par-deviation marker `ParAsideInline` was a
byte-identical copy in `scorecard/page.tsx`, `submit/page.tsx`, and
`approve/page.tsx`; extracted to a single co-located shared component at
`app/[locale]/games/[id]/_components/ParAsideInline.tsx`.

## Criteria (independently verified, fresh-context evaluator)

| # | Criterion | Result |
|---|-----------|--------|
| 1 | Shared component exists + exports `ParAsideInline` | PASS |
| 2 | Three local defs removed, replaced with import | PASS — 0 `function ParAsideInline` remain; usage sites intact |
| 3 | Byte-equivalent behavior (props/JSX/testid/keys/className) | PASS — extracted body diffs identical vs all 3 originals |
| 4 | «Speiler» mirroring comment removed from submit | PASS |
| 5 | No orphaned imports | PASS — `hasParDifference` (all 3), `useTranslations` (submit+approve), `ScoringGender` (approve) removed; kept where still used |
| 6 | `LayoutATable`/`LayoutBTable`/`ScorecardTable` retained | PASS |
| 7 | `ParAsideMarker` (HoleHero) + drilldown `sup` untouched | PASS — 0-line diff each |
| 8 | No version bump / CHANGELOG (pure refactor) | PASS |

## Gates (run by evaluator, Node 22)

- `npx tsc --noEmit` → exit 0 (clean)
- `npx eslint` (4 changed files) → 0 errors, 0 warnings
- `npx vitest run` submit + approve action tests → 2 files, 18 tests passed

Net: 4 files changed, +43 / −112. `_components` is a Next.js App Router private
folder (underscore-prefixed, not a route); `../_components/ParAsideInline`
resolves from all three consumers (tsc-confirmed).
