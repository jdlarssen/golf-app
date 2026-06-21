# Evaluation: #815 — extract COURSE_HOLES_SELECT / SCORES_SELECT constants

**Date:** 2026-06-21
**Commit evaluated:** HEAD = `1f7dcfba` (one atomic commit)
**Evaluator:** skeptical subagent (independent — did not build the change)

---

## VERDICT: ACCEPT

All 8 success criteria pass. Both gates pass. No unexpected file changes.

---

## Per-criterion table

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | `queryFragments.ts` created with correct string constants and row types | **PASS** | File verified line-by-line: `COURSE_HOLES_SELECT` = `'hole_number, par_mens, par_ladies, par_juniors, stroke_index' as const` (line 20); `SCORES_SELECT` = `'user_id, hole_number, strokes' as const` (line 22); `ScoreRow.strokes: number \| null` (line 35 — nullable, correct) |
| 2 | Prefixed template-literals produce original byte-for-byte string (comma+space joiner present) | **PASS** | grep confirms all 6 sites use `` `course_id, ${COURSE_HOLES_SELECT}` `` and `` `game_id, ${SCORES_SELECT}` `` — note the `", "` separator matches the original `'course_id, hole_number, ...'` exactly. Concatenated result = `'course_id, hole_number, par_mens, par_ladies, par_juniors, stroke_index'` and `'game_id, user_id, hole_number, strokes'` respectively. |
| 3 | No bare copies of either exact select string remain in lib/app/components (excluding test files and the constant definition itself) | **PASS** | `grep -rn 'hole_number, par_mens, par_ladies, par_juniors, stroke_index'` → zero results outside `queryFragments.ts`. `grep -rn 'user_id, hole_number, strokes'` → zero results outside `queryFragments.ts`. Only the `RealtimeMount.tsx` line 20 matched the second grep because its string includes additional columns (`entered_by, client_updated_at, updated_at`) — a *different* string, correctly left untouched. |
| 4 | Out-of-scope variants unchanged: `RealtimeMount.tsx:20`, `submit/page.tsx:208`, `holes/[holeNumber]/page.tsx:203`; ~15 leaderboard `rawHolesRows` prop-type object literals untouched | **PASS** | `RealtimeMount.tsx:20` still has `'game_id, user_id, hole_number, strokes, entered_by, client_updated_at, updated_at'` (bare string, untouched). `submit/page.tsx:208` still has `'hole_number, strokes, entered_by'` (bare string). `holes/[holeNumber]/page.tsx:203` still has `'hole_number, strokes'` (bare string). The ~15 `rawHolesRows: { hole_number: number; par_mens: number; ... }[]` prop type literals in `formats/*.tsx` remain inline object types (not imported from queryFragments). |
| 5 | `gameFinishedRecipients.ts`: exactly 4× `.returns<ScoreRow[]>()` and 4× `.returns<CourseHoleRow[]>()`; `game_players` `.returns<>` at ~line 72 untouched | **PASS** | `grep -c` confirms exactly 4 occurrences of each. `game_players` block at lines 72–86 retains its original multi-line anonymous type — confirmed by reading lines 72–86 directly. |
| 6 | `buildModeResultForGame.ts`: private `CourseHoleRow`/`ScoreRow` interfaces deleted; new imported types used; mapper math (~line 285) byte-identical to parent commit | **PASS** | Lines 1–8 show clean import of `COURSE_HOLES_SELECT, SCORES_SELECT, CourseHoleRow, ScoreRow` from `@/lib/supabase/queryFragments`. No inline interface definitions remain. Mapper math at lines 278–293 (current) matches `git show HEAD~1` lines 280–295 character-for-character (`par: h.par_mens`, `parByGender`, `strokeIndex: h.stroke_index`, `gross: s.strokes`). |
| 7 | `npx tsc --noEmit` exits 0 | **PASS** | Ran under Node 22.23.0. Output: `EXIT:0`, no errors. |
| 8 | No unexpected files in diff; no `package.json`/`CHANGELOG.md` changes | **PASS** | `git diff --stat HEAD~1 HEAD` shows exactly 15 files: 13 source files + `queryFragments.ts` (new) + `.forge/contracts/815-...md`. No `package.json`, no `CHANGELOG.md`, no test files. Correct for a `refactor(...)` commit. |

---

## Gates

| Gate | Result | Details |
|------|--------|---------|
| `npx tsc --noEmit` | **GREEN** | Exit 0, zero errors |
| `npx vitest run` | **GREEN** | 295 test files / 3873 tests passed, 0 test failures, 0 test file changes |

---

## Concerns / observations

None blocking. One minor observation for the record:

- The `rawHolesRows` prop-type object literals in `formats/*.tsx` (e.g. `{ hole_number: number; par_mens: number; par_ladies: number; par_juniors: number; stroke_index: number }[]`) are structurally identical to `CourseHoleRow` but were correctly left as inline types per the out-of-scope clause. A future cleanup could import `CourseHoleRow` here too, but that is out of scope for this issue and poses no runtime risk.
- `ScoreRow.strokes: number | null` is correct — the DB column is nullable and the cast must reflect that. Confirmed.

---

## Summary

The refactor is clean, complete, and safe. Every call-site was updated, no bare string copies remain, the prefixed template-literals produce the original concatenated strings byte-for-byte, the out-of-scope variants are untouched, and both compiler and test gates are fully green.
