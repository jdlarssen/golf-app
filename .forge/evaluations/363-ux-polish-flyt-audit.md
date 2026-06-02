# Evaluation: #363 — UX-polish, tre konsistens-fikser fra flyt-audit

**Verdict: ACCEPT**

Commit `1d0eaf2` ("fix(ui): tre konsistens-fikser fra flyt-audit"). Three independent fixes verified by reading code + tests; UI verification waived per contract (admin/trusted-gated + authed game-home; owner spot-checks in prod).

## Gate results

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | PASS (exit 0, no output) |
| `npx vitest run app/admin/games/new/actions.test.ts "app/admin/courses/[id]/edit/actions.test.ts"` | PASS (2 files, 33 tests passed) |
| `npx eslint` on 5 changed files | PASS (exit 0) |
| `npm run build` | PASS (exit 0; `✓ Compiled successfully`; route `ƒ /admin/courses/[id]/slett` present). Only warning: pre-existing multiple-lockfiles / `turbopack.root` notice — unrelated. |
| PATCH-bump | PASS (1.68.0 → 1.68.1 in package.json + package-lock; CHANGELOG 1.68.1 entry with tagline + Teknisk details) |

## Success criteria

| # | Criterion | Verdict | Evidence |
|---|-----------|---------|----------|
| 1 | Trusted-non-admin → `/games/[id]`; admin still `/admin/games/[id]` | PASS | `actions.ts:226-234`: `if (isAdmin) redirect('/admin/games/${id}?status=...')` then fall-through `redirect('/games/${id}')`. `isAdmin` in scope from `requireAdminOrTrustedCreator` at line 92. Cup branch (`/admin/cup/...`, line 218-224) returns before the role check — unaffected. Tests assert both targets: draft trusted → `/games/new-game-trusted-1` (test line ~205), publish trusted → `/games/new-game-trusted-pub` (~315); admin-target tests elsewhere in suite unchanged and still green. |
| 2 | Course delete via dedicated `/slett`; inline `window.confirm` button removed | PASS | New `app/admin/courses/[id]/slett/page.tsx` mirrors games `/slett` (AdminShell/TopBar/BrassRibbon/Banner, ERROR_MESSAGES map, `first()` helper, danger form-button + Avbryt SmartLink). `DeleteCourseButton.tsx` deleted; edit page now links to `/slett` via SmartLink. `grep -rn DeleteCourseButton app components` → no matches (exit 1). |
| 3 | Child-row counts shown; blocks (no delete button) when in use | PASS | `slett/page.tsx`: parallel `count: exact, head` queries for course_holes, tee_boxes, games. `inUse = gameCount > 0` → renders blocking `Banner tone="warning"` ("Banen er i bruk i N spill … Slett spillene som bruker den først") and the entire delete form is in the `else` branch — no button rendered. Non-in-use shows "Slettes permanent" list with hole + tee counts (singular/plural handled). |
| 4 | Home "Pågår nå" section on top with active games; rest in "Mine spill"; no section when none | PASS | `page.tsx:165-169`: `inProgressGames = activeGames.filter(g => g.status === 'active')`, `upcomingGames = filter(g => g.status !== 'active')`. Render `page.tsx:325-335`: "Pågår nå" above "Mine spill", each gated on `.length > 0`. Shared `renderGameCard(g, accent)` used by both; `accent` only toggles `border-accent` vs `hover:border-primary/30`. Card href (`/games/[id]`) + StatusPill unchanged. |
| 5 | No regression: `deleteCourse` guards intact; games/players `/slett` untouched | PASS | `deleteCourse` (edit/actions.ts:345-394) NOT in the diff — in_use guard (353-363), ownership guard (369-378), FK-cascade comment + delete (384-391) all intact. `deleteCourse(courseId)` signature compatible with `.bind(null, id)` form action (extra FormData arg ignored, same as the deleted button). games/players `/slett` files not in changed-files list. |

## Skeptic notes

- **Redirect ordering correct.** Cup redirect happens before the `isAdmin` branch, so cup matches remain admin-driven and land on `/admin/cup/...` regardless of role — unaffected, as required.
- **Gate divergence (intentional, not a defect).** Courses `/slett` uses `requireAdminOrTrustedCreator`; games `/slett` uses `requireAdmin`. Correct: courses are editable/deletable by trusted creators (matches `updateCourse`/`deleteCourse`), game deletion is admin-only. Defense-in-depth preserved: UI blocks in-use courses AND `deleteCourse` keeps its server-side `in_use` redirect.
- **Split is exhaustive.** Home query's `activeGames` = non-finished set; `'active'` rows go to inProgress, all others (draft/scheduled) to upcoming. No game dropped. `isEmptyState` still keys off full `activeGames.length` — empty-state branch unchanged.
- **Finished-games section untouched** — keeps its own markup (🏆, `/leaderboard` href), correctly NOT routed through `renderGameCard` (which targets `/games/[id]`).
- **Copy clean.** New Norwegian user-facing strings ("Pågår nå", "Slett banen for alltid", "Handlingen kan ikke angres", in-use banner) are idiomatic and action-oriented; no em-dash chains or anglicisms in user-facing text (em-dashes appear only in code comments).
- **No type holes / dead code.** tsc + eslint clean; deleted component has no residual references.

## Issues

None. No blocking or non-blocking issues found.
