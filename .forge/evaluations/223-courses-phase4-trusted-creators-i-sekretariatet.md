# Evaluation: Courses Fase 4 — trusted creators i Sekretariatet

**Contract:** [.forge/contracts/223-courses-phase4-trusted-creators-i-sekretariatet.md](../contracts/223-courses-phase4-trusted-creators-i-sekretariatet.md)
**Branch:** claude/determined-chatterjee-15e710
**Commits:** 5274b27 (refactor chunk 1) + bcab9a9 (feat chunk 2)
**Verdict:** ACCEPT
**Date:** 2026-05-25

## Summary

Implementation matches the contract's design: the layout-gate is loosened to admin-or-trusted, every admin-only sub-route self-gates via the new `requireAdmin()` helper before any DB read, and the four courses-actions (`createCourse`, `updateCourse`, `deleteCourse`, `restoreTee`) consistently route writes through a single `writeClient` that picks `getAdminClient()` for trusted-non-admin callers. The `deleteCourse` ownership-check is correctly ordered after the in-use guard and defends against missing rows; the activity-ledger label fix is in place; CHANGELOG is correctly wrapped with 1.27.y collapsed and 1.28.0 open. All gates pass cleanly.

## Gate Results

- `npm run lint`: PASS — 5 errors all in `e2e/sync/offline-sync.spec.ts` (pre-existing baseline per contract note); 8 warnings all `_`-prefixed-unused-arg or pre-existing. One new benign warning: `_formData` unused in `restoreTee` (project convention, same as Fase 3).
- `npm test`: PASS — 1164/1164 across 100 test files.
- `npm run build`: PASS — full route map rendered, no type errors.

## K-criterion verification

### K1: `lib/admin/auth.ts` exports new `requireAdmin(supabase)` helper

**Status:** PASS
**Evidence:** [`lib/admin/auth.ts:55-61`](../../lib/admin/auth.ts) defines `requireAdmin` redirecting trusted to `/admin` and ikke-trusted ikke-admin to `/`. `requireAdminOrTrustedCreator` (lines 63-69) is unchanged in behavior — both delegate to a shared `loadRole`. New `name` field added to `AdminRoleContext` so admin-only actions can skip a `users` round-trip for audit-name. [`lib/admin/auth.test.ts`](../../lib/admin/auth.test.ts) has 9 tests covering both helpers across all redirect paths (admin/trusted/random/unauth + email-fallback).

### K2: `app/admin/layout.tsx` uses `requireAdminOrTrustedCreator()`

**Status:** PASS
**Evidence:** [`app/admin/layout.tsx:16`](../../app/admin/layout.tsx) calls `await requireAdminOrTrustedCreator(supabase)`. Inline `is_admin` check + proxy-header shortcut are gone, replaced by the helper. Comment correctly notes why the shortcut is no longer viable (trust-resolution needs email).

### K3: `/admin` filters tiles per role + activity-ledger label fix

**Status:** PASS
**Evidence:** [`app/admin/page.tsx:241-269`](../../app/admin/page.tsx) builds `tiles: Tile[]` as `role.isAdmin ? [4-tiles] : [banerTile]`. Activity-ledger embed at line 397-405 selects `created_by_user:users!courses_created_by_fkey(name, nickname)`; loop at 451-458 uses `displayName(c.created_by_user) ?? 'Sekretariatet'` (correct null-fallback for legacy rows). `getRole()` is `cache()`-wrapped so the role lookup is shared with TilesGrid without duplicate DB hits.

### K4: All admin-only routes self-gate via `requireAdmin()`

**Status:** PASS
**Evidence:** `grep -rn requireAdmin app/admin/` confirms `requireAdmin` is present in every page + action under `/admin/spillere`, `/admin/games` (excl. `/new`), `/admin/lanseringer`. Spot-check on `app/admin/games/[id]/page.tsx:179` and `app/admin/spillere/[id]/slett/actions.ts:15` confirms the helper runs **before** the first DB read/write. `/admin/games/new/{page,actions}.ts` correctly stays on `requireAdminOrTrustedCreator` (trusted-OK per #198). One small bonus: helper now carries `name`, so actions like `deleteGame`/`finalizeGame` skip an extra `users.select name` round-trip.

### K5: Courses-subtree uses correct helper + admin-client writes

**Status:** PASS
**Evidence:** Every courses page+action uses `requireAdminOrTrustedCreator`. Four actions show the `writeClient` pattern applied consistently:
- `createCourse` ([new/actions.ts:161-187](../../app/admin/courses/new/actions.ts)) — INSERT courses + course_holes + tee_boxes all via `writeClient`.
- `updateCourse` ([[id]/edit/actions.ts:190-256](../../app/admin/courses/[id]/edit/actions.ts)) — UPDATE courses, DELETE/INSERT course_holes, per-tee UPDATE/INSERT/DELETE/UPDATE (archive) all via `writeClient`. Verified no stray `supabase.from('...').update/insert/delete` mixed in.
- `deleteCourse` ([[id]/edit/actions.ts:352-358](../../app/admin/courses/[id]/edit/actions.ts)) — DELETE via `writeClient` after both guards.
- `restoreTee` ([[id]/edit/actions.ts:283-300](../../app/admin/courses/[id]/edit/actions.ts)) — UPDATE tee_boxes + courses both via `writeClient`.

Inline `requireAdmin` helper at the top of the old edit/actions.ts is gone (compared diff: `requireAdmin` import is for the shared helper only via `requireAdminOrTrustedCreator`).

### K6: `deleteCourse` ownership-check

**Status:** PASS
**Evidence:** [[id]/edit/actions.ts:315-364](../../app/admin/courses/[id]/edit/actions.ts) — in-use guard runs first (lines 322-333), then ownership-check (335-348), gated on `!role.isAdmin`. Missing-row treated as `not_owned` (defense-in-depth: `if (!course || course.created_by !== role.userId)`). Admin path bypasses ownership entirely. New `not_owned` error message at [`app/admin/courses/page.tsx:28`](../../app/admin/courses/page.tsx) reads «Du kan kun slette baner du selv har laget.» 7 new tests in [`actions.test.ts`](../../app/admin/courses/[id]/edit/actions.test.ts) cover: admin-delete-any, trusted-delete-own (via admin-client), trusted-delete-other (not_owned), trusted-delete-in-use (in_use fires first), trusted-delete-missing (not_owned defense), plus trusted-`updateCourse` (admin-client writes + `updated_by = trustedUserId`).

### K7: Test-suite green

**Status:** PASS
**Evidence:** `npm test` → 1164/1164 across 100 test files. No skipped, no flaky.

### K8: Lint + build green

**Status:** PASS
**Evidence:** Lint shows only the 5 pre-existing errors in `e2e/sync/offline-sync.spec.ts` (baseline, unaffected by this work). Build completes through type-check + route generation.

### K9: Version bump 1.27.2 → 1.28.0 + CHANGELOG

**Status:** PASS
**Evidence:** [`package.json`](../../package.json) shows `"version": "1.28.0"`. [`CHANGELOG.md`](../../CHANGELOG.md) opens a new `## 1.28.y — Bane-tilgang for kompis-gjengen` heading with the 1.28.0 entry under it. Previous `## 1.27.y — Arkiv-UI og delbare filter-lenker` series is now wrapped in `<details><summary><strong>1.27.y — … (3 oppføringer) — klikk for å vise</strong></summary>` exactly as the policy requires. Stakeholder tagline is a single blockquote: «Trusted creators kan nå legge til og oppdatere baner selv … men kun baner de selv har laget kan slettes.» — one em-dash (no chain), action-verb form, no «X-spillet» redundans.

### K10: PR-disiplin (`Part of #223`, closing-kommentar)

**Status:** DEFERRED — happens at PR-create-time, not in build.

## Skeptical Checks

**Consistent `writeClient` across all 4 actions:** Verified by reading each action end-to-end. In `updateCourse` (which has 6 distinct write-sites: courses-update, course_holes-delete, course_holes-insert, per-tee-update/insert, tees-hard-delete, tees-archive), every single write goes through `writeClient`. No mixed mode. Same for `restoreTee` (2 writes) and `createCourse` (3 writes).

**`deleteCourse` ownership-check before destructive write:** Confirmed. Line ordering is in-use → ownership → admin-client switch → DELETE. The `!role.isAdmin` branch wraps a `maybeSingle()` query for `created_by` and treats both null-row AND mismatched-owner as `not_owned` — forged POST against a non-existent course id can't bypass the gate.

**Activity-ledger renders trusted creators by name:** The embed-query (`created_by_user:users!courses_created_by_fkey(name, nickname)`) pulls the creator row regardless of whether they're admin. `displayName()` handles both array- and object-form. Fallback to 'Sekretariatet' only fires when `created_by` is null (legacy rows pre-Fase-2 backfill). For courses created by `fornes.even@yahoo.no`, the ledger will show his name (or nickname if set).

**`restoreTee` includes `writeClient` pattern:** Yes — `restoreTee` is in the courses-edit flow, uses `requireAdminOrTrustedCreator`, and routes both the tee_boxes UPDATE and the courses audit-bump UPDATE through `writeClient`. If a trusted creator restores a tee on a course they don't own, the action still proceeds (per contract Q1: trusted can edit *all* courses, including restore). Only delete is gated by ownership.

**Admin-only routes gate BEFORE DB reads:** Spot-checked `app/admin/games/[id]/page.tsx:179` (gate at line 179, first `.from(...)` at line 184–190), `app/admin/spillere/[id]/slett/actions.ts:15` (gate before `.from('users').select` at 24-28), and `app/admin/games/[id]/slett/actions.ts:16` (gate before `.from('games').select` at line 23). No leakage.

**Test mocking the role correctly:** The new tests in `lib/admin/auth.test.ts` (5 for `requireAdmin`, 4 for `requireAdminOrTrustedCreator`) mock `is_admin`/`email`/`name` distinctly per case and assert both ctx-shape AND redirect target. The trusted-path tests in `actions.test.ts` set up `adminClientMock` separately from `supabaseMock` and assert that DELETE-on-courses goes through `adminClientMock.__fromCalls`, not the request-scoped mock — exactly the right test for "did we actually swap clients?"

**CHANGELOG AI-tells:** Tagline reads naturally, no «X-spillet»-redundans, no «entry/feature/release/by default» anglicism, single em-dash (not a chain). The phrase "Trusted creators" is English code-switching, but the role-name is a project-internal identifier (matches `TRUSTED_CREATOR_EMAILS` constant and previous #198 framing) — acceptable as a proper-noun-style label. Series-header «Bane-tilgang for kompis-gjengen» is idiomatic Norwegian.

**Latent #198 RLS-bug (sidenote from contract):** Not investigated here. Contract correctly scoped this out of Fase 4. If `fornes.even@yahoo.no` is currently `is_admin = true` in prod (which would mask the RLS-bug), Fase 4 still works correctly because the `writeClient` branch only activates when `!role.isAdmin`.

## Verdict Reasoning

Every K1–K9 criterion verified independently with concrete code + test evidence. The skeptical checks I'd have expected to catch issues (mixed `supabase`/`writeClient` writes, ownership-check ordering, leaked admin-only reads, mock-role-mismatch) all came up clean. The `writeClient` pattern is applied uniformly so a future write-site added without checking role is the only obvious failure mode — and the contract noted this as a documented convention (single binding per action). CHANGELOG conforms to the documented three-layer structure and the previous series is correctly collapsed. Build + lint + tests all green.

K10 (PR-disiplin) is the only deferred criterion and is structurally outside the build chain's scope.

**ACCEPT.**

## Recommendations (non-blocking, separate followups)

1. **Trust the `e2e/sync/offline-sync.spec.ts` lint-baseline.** 5 `Unexpected any` errors are pre-existing and have been baseline'd through multiple phases now. Worth a separate housekeeping issue to either fix the types or `// eslint-disable-next-line` with a rationale comment — but not for Fase 4.

2. **`getRole()` and `getAdminContext()` both call `supabase.auth.getUser()` indirectly** (once via cached `getAdminContext`, once via cached `getRole` → `requireAdminOrTrustedCreator` → `loadRole`). Both are `cache()`-wrapped so the second call is a cache hit, but the user-profile `users.select(...)` runs twice (proxy-verified user-id lookup uses a different field-set than `loadRole`). Minor; below the threshold of refactor-now.

3. **Greeting-card label «Saksbehandler» for trusted users.** Contract noted this as Claude's Discretion. Currently a trusted creator sees themselves greeted with the same «Saksbehandler»-kicker as Jørgen. Probably fine — but Jørgen may want to see this in prod and decide whether to swap to «Bidragsyter» or drop the kicker for non-admin. Filed mentally as a polish followup, not required.

4. **`fornes.even`'s `is_admin` flag in prod.** Worth a separate Supabase MCP query before/after Jørgen does the smoke-test, to determine whether the latent #198 RLS-bug is real or masked. If trusted-non-admin INSERTs on `games` actually do fail with RLS in prod today, that's a #198 followup, not Fase 4.
