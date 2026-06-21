# Evaluation: #842 — split (home)/page.tsx into co-located server components

**Verdict: ACCEPT**

Pure behavior-preserving split of the 1583-line `(home)/page.tsx` (now 1013
lines) — the 6 server sub-components are extracted into co-located siblings and
the `getGameContext` cache singleton moves to its own module. The
`GameHomePage` orchestrator stays in page.tsx (in scope; size is dominated by
the orchestrator body, not the extracted sections).

## Criteria (independently verified, fresh-context evaluator)

| # | Criterion | Result |
|---|-----------|--------|
| 1 | 7 new files exist (`gameContext.ts` + 6 component files) | PASS |
| 2 | Component + owned-type placement matches plan | PASS |
| 3 | **Cache singleton** — exactly ONE `cache()` for `getGameContext`, in `gameContext.ts`, imported by page + 5 data sections (not CreatorControls) | PASS |
| 4 | Moved blocks logically identical to main (normalized diffs, EXIT 0) | PASS |
| 5 | `GameHomePage` orchestrator body byte-identical — exact diff of 863 lines = ZERO changes | PASS |
| 6 | `GameMode` routed via type-only import (avoids page↔component cycle); equivalent 22-member union, no behavior change | PASS |
| 7 | `GameRow` stays page-local (gratuitous export reverted in 1df59073) | PASS |
| 8 | No orphaned imports; only 8 files changed; no bump/CHANGELOG; `refactor(` prefix | PASS |

## The cache singleton

`getGameContext` (Supabase client + proxy-verified userId) now lives once in
`gameContext.ts`. page.tsx + FlightRoster + DraftTeamsOverview +
PendingApprovalsBanner + CupStandingsLink + PrimaryCtaSection import the same
instance; CreatorControls (sync) correctly does not. Each Suspense section still
pays a single context lookup per request.

## Gates (run by evaluator, Node 22)

- `npx tsc --noEmit` → exit 0
- `npx eslint` (8 files) → 0 errors, 0 warnings
- (implementer) full vitest suite → 3873 tests passed (295 files)

Net: 8 files changed. The orchestrator's 863-line body, the kept module
constants (`Params`/`SearchParams`/`STATUS_TONES`/`STATUS_BANNER_KEYS`/`GameRow`/
`GAME_SELECT`), and `formatLengthMeters` all diff EXIT 0 against `origin/main`.
