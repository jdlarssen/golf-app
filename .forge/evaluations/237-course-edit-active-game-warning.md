# Evaluation: #237 — Forvarsel ved par/SI-endring på bane med aktive spill

**Contract:** `.forge/contracts/237-course-edit-active-game-warning.md`
**Commit:** `6c72709`
**Date:** 2026-05-26

## Success Criteria

- **PASS** — Server-side count: `app/admin/courses/[id]/edit/page.tsx:253-258` runs `from('games').select('id', { count: 'exact', head: true }).eq('course_id', courseId).in('status', ['active', 'scheduled'])` in `Promise.all`; passed as `affectedGamesCount` prop at L311.
- **PASS** — Confirm on par-change + active games: `CourseForm.tsx:233-243` gates `window.confirm` on `affectedGamesCount > 0 && hasHoleChanges(initialData?.holes, holes)`; vitest case L326-348 asserts spy called once with `/2 spill/`.
- **PASS** — No confirm on name-only edit: `hasHoleChanges` compares only `par`/`stroke_index` (L98-108); test L350-365 asserts no confirm with `affectedGamesCount=3` and untouched holes.
- **PASS** — No confirm when count=0: gate short-circuits on `affectedGamesCount > 0`; test L367-384 asserts no spy call with count 0 + par change.
- **PASS** — No confirm on tee-only edit: `hasHoleChanges` ignores tee fields entirely (only iterates `current` holes); design confirmed by inspection.
- **PASS** — `hasHoleChanges` unit-tested with 5 cases (no-change, par, SI, undefined initial, shorter initial) at `CourseForm.test.tsx:20-47`. Covers all edge cases the contract names. Truncated-initial test (L43-46) verifies "defensive default returns true".
- **PASS** — `/new` flow unaffected: `affectedGamesCount` defaults to 0 (L48, L133); test L386-396 asserts no confirm on create flow even with par change.
- **PASS** — PATCH bump + CHANGELOG: `package.json` 1.29.0 → 1.29.1; entry in `CHANGELOG.md:17-35` under "1.29.y — Selv-registrering"-series with blockquote tagline + collapsed `<details>` Teknisk section. Series summary L15 updated to mention the patch.

## Edge-case-specific checks

- **PASS** — `hasHoleChanges(undefined, ...)` → `false` (L102).
- **PASS** — `hasHoleChanges` shorter initial → `true` on first missing index (L105 `if (!init) return true`); test asserts this directly.
- **PASS** — `event.preventDefault()` on cancel: L241 calls it only when `!ok`. No preventDefault when confirm returns true → form submits.
- **PASS** — Count filter is `IN ('active','scheduled')` (page.tsx:257), not just one status.
- **PASS** — Fail-open on count error: page.tsx:264-266 `affectedGamesResult.error ? 0 : (count ?? 0)`.
- **PASS** — Singular "ett spill" vs "N spill": `buildHoleChangeConfirmMessage` L111; test L398-416 asserts `/ett spill/` at count=1; count=2 test asserts `/2 spill/`.
- **PARTIAL** — No explicit test that `preventDefault` is NOT called when confirm returns true. The count=2 test mocks confirm to return `true` but doesn't assert the action was called or `preventDefault` skipped. Minor coverage gap; behavior is correct by code inspection.

## Gates

- **PASS** — `npx tsc --noEmit` clean.
- **PASS** — `npm test -- CourseForm`: 26/26 passed.
- **PASS** — `npm test -- app/admin/courses`: 72/72 passed (4 files).

## Final Verdict

**ACCEPT** — All success criteria met, all gates green. Single minor coverage gap on "confirm=true allows submit" assertion is non-blocking; the logic is trivially correct and exercised implicitly by the count=1/count=2 paths.
