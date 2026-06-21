# Evaluation: #838 — type helper params `SupabaseClient<Database>` (close the typed-client leak)

**Date:** 2026-06-22
**Branch:** issue-838-typed-helper-params
**Commits:** `2363a52a` (initial 5 files) + `9a8f9fff` (completeness fix from adversarial review)
**Method:** 3-lens adversarial verification workflow (`completeness` · `masked-drift` · `behavior/gates`), each a fresh independent sub-agent that re-ran the gates on Node 22.

---

## Verdict: ACCEPT (after one fix cycle)

The first commit typed the 5 helper files the discovery grep found (10 param sites). The
**completeness lens caught a real gap**: the discovery regex *and* the verification grep were both
structurally blind to the `SupabaseClient<any>` form, which erases the `<Database>` generic exactly
like a bare `SupabaseClient`. Two genuine production leak sites (`lib/clubs/getClubDetail.ts:69`,
`lib/clubs/getMyClubs.ts:26`, on the live `/klubber` pages) plus one minor `.rpc()`-only field
(`lib/admin/rateLimit.ts:26`) were missed. The second commit closed all three.

## Lens results

| Lens | Verdict | Evidence |
|------|---------|----------|
| **Completeness** | FAIL → FIXED | Found `SupabaseClient<any>` leaks in `getClubDetail.ts:69` + `getMyClubs.ts:26` (both `.from('group_members').select()` → `any` on club pages) + bare field in `rateLimit.ts:26`. Fixed in `9a8f9fff`. Re-checked: `grep` for any untyped `SupabaseClient` in `lib/app/components` (non-test) → **0 hits**; only remaining is the `getClubDetail.test.ts` mock (`as unknown as SupabaseClient`, out of scope). |
| **Masked-drift** | PASS | All 16 `.returns<>()` casts in the changed files cross-checked field-by-field vs `lib/database.types.ts` + live prod schema (via Supabase MCP) — all agree. The one `GamePlayerRow.team_number: number` non-null cast vs nullable column is **pre-existing (#572, commit ff2e7d0f)**, not introduced here, and defused at runtime by `team_number: p.team_number ?? 0`. No cast masks a behavior-affecting mismatch. |
| **Behavior/gates** | PASS | Genuinely type-only (generic is type-erased). `tsc --noEmit` exit 0; `eslint` on the 3 club/admin files exit 0; full `vitest` 295 files / 3873 tests green, **zero test-file changes**. No `package.json`/`CHANGELOG.md` change (correct — `refactor`, no bump). Callers pass typed factory clients (`getAdminClient()`/`getServerClient()` → `<Database>`); test callers use `as never` mocks. No caller breakage. |

## Scope delivered (8 production files, 13 param/field sites)

- `lib/mail/gameFinishedRecipients.ts` (4) · `lib/scoring/buildModeResultForGame.ts` (3) ·
  `lib/games/getFinishedGamesForUser.ts` (1) · `lib/invitations/quota.ts` (1) ·
  `lib/games/startScheduledGame.ts` (1) — initial commit.
- `lib/clubs/getClubDetail.ts` (1) · `lib/clubs/getMyClubs.ts` (1) · `lib/admin/rateLimit.ts` (1) —
  completeness fix; dropped 2 now-unnecessary `eslint-disable no-explicit-any` directives.

## Deviation from issue scope (transparent)

The issue estimated **5 files / 10 sites**. Adversarial review expanded it to **8 files / 13 sites**
(the `<any>` form was invisible to the original discovery method). The `getClubDetail.test.ts` mock is
deliberately left as bare `SupabaseClient` (`as unknown as` cast — typing it buys nothing for a test
double; it is assignable to `<Database>` because `any` is bidirectionally compatible, which is why
the club tests stay green).

## Follow-up (not blocking)
- Optional: align `GamePlayerRow.team_number` to `number | null` (the `?? 0` already handles null) so
  the cast stops masking the pre-existing nullability drift. Pre-dates this PR (#572) — file separately
  if desired.
- A lint rule banning `SupabaseClient<any>` in production `lib/` would prevent this leak class from
  recurring.
