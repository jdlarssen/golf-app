# Evaluation: #840 — split admin dashboard into ActivityLedger + TilesGrid

**Verdict: ACCEPT**

Pure behavior-preserving split of the 730-line `app/[locale]/admin/page.tsx`
(now 134 lines) into co-located sibling files, following the #682 pattern.

## Criteria (independently verified, fresh-context evaluator)

| # | Criterion | Result |
|---|-----------|--------|
| 1 | `_dashboardContext.ts` = sole home of `getAdminContext`/`getRole` + `TIME_OF_DAY_KEY` | PASS |
| 2 | `ActivityLedger.tsx` holds ledger pieces (`ActivityLedger`, `LedgerSkeleton`, `Activity`, `shortName`) | PASS |
| 3 | `TilesGrid.tsx` holds tiles pieces (`TilesGrid`, `TileGridView`, `TilesSkeleton`, `TileIcon`, types, `PlayerKlubbhus`) | PASS |
| 4 | `page.tsx` keeps only shell (`KlubbhusetPage`, `GreetingCard`, `GreetingSkeleton`) | PASS |
| 5 | **Cache pitfall** — exactly ONE `cache()` per singleton, both in `_dashboardContext`, all consumers import the same | PASS |
| 6 | Behavior-preserving — every moved block byte-identical vs `main` (only one comment reworded) | PASS |
| 7 | No orphaned imports; only the 4 admin files changed | PASS |
| 8 | No version bump / CHANGELOG; `refactor(` prefix | PASS |

## The cache singleton (the load-bearing requirement)

`getAdminContext` (Supabase client + proxy-verified userId) and `getRole` are
React `cache()` singletons. They now live once in `_dashboardContext.ts`;
`page.tsx`, `ActivityLedger.tsx`, and `TilesGrid.tsx` all import the same
instances. No section re-wraps the context in a fresh `cache()`, so each
Suspense body still pays a single Supabase-auth round-trip per request — no
silent per-request regression.

## Gates (run by evaluator, Node 22)

- `npx tsc --noEmit` → exit 0 (clean)
- `npx eslint` (4 files) → 0 errors, 0 warnings

Net: 4 files changed, +621 / −602. Every moved block diffed line-for-line
against `git show main:` and confirmed identical (logic, queries, JSX, Suspense
boundaries, `getRole()` → `PlayerKlubbhus role={role}` prop flow all unchanged).
