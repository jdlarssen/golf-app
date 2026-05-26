# Evaluation: #231 offline-sync any-typing cleanup

**Date:** 2026-05-26
**Verdict:** ACCEPT

## Criteria verified

- [✓] `npx eslint e2e/sync/offline-sync.spec.ts` returns 0 errors: ran the command, empty stdout, exit code 0. Was 5 errors before per contract baseline.
- [✓] `npm run lint` reports no new errors: ran, output ends in `✖ 8 problems (0 errors, 8 warnings)`. All 8 warnings are pre-existing `_gameId is defined but never used` warnings in the four leaderboard view components — unrelated to this change.
- [✓] `npx tsc --noEmit` passes: ran, empty stdout, exit code 0.
- [✓] No runtime behavior change: diff (`git show aa9fb67 -- e2e/sync/offline-sync.spec.ts`) shows only the new type-only imports + interface + 5 callsite type-cast replacements. Zero executable lines changed.
- [✓] `TornyDexie` interface defined inline at `offline-sync.spec.ts:6-9`, using `LocalScore` and `SyncQueueItem` imports from `@/lib/sync/db` (line 4). Imports verified as type-only (`import type`). Production types `LocalScore` (db.ts:3) and `SyncQueueItem` (db.ts:14) are exported and match the production `GolfDb`'s table signatures on db.ts:23-24.
- [✓] All 5 callsites updated — verified via `grep -n "__torny_dexie"`: lines 88, 99, 109, 134, 166 now all read `__torny_dexie: TornyDexie`. Line 75 is the assignment side inside the DEXIE_BOOT template literal (untyped string, unaffected). No `any` remains.

## Gate results

- `npx eslint e2e/sync/offline-sync.spec.ts`: 0 errors, exit 0
- `npm run lint`: 0 errors, 8 pre-existing warnings (unchanged)
- `npx tsc --noEmit`: passes, exit 0

## Issues found

**Minor (non-blocking): `if (!db) return;` guard on line 89 is now dead code.**

The contract's design (line 42) specified `__torny_dexie?: TornyDexie` (optional). The builder chose to drop the `?` and made it non-optional (`__torny_dexie: TornyDexie`), documented in the commit message as a deliberate decision since `bootDexie` always runs first. That's a reasonable refinement, but it leaves the runtime guard `if (!db) return;` in `clearDexie` (line 89) without a typed signal of why it exists. TypeScript will not flag it (the assertion casts a possibly-undefined property to non-optional, so the truthiness check still narrows at runtime), but a reader sees the contradiction.

This is purely a stylistic inconsistency — does not affect lint, types, or test behavior. Could be addressed in a follow-up commit or left for the next person who touches the helper, but is not worth blocking the PR for.

**Scope creep:** None. The diff is exactly the 5 type-cast replacements + 4 new lines of imports + 4 lines of interface, totaling 13 insertions / 5 deletions in a single file — matches "Files Likely Touched" precisely.

**Edge cases:** None broken. The Dexie type import is type-only (no runtime coupling), Playwright's tsconfig resolves the `@/` alias (verified by the tsc pass), and the runtime path (template-literal DEXIE_BOOT) is untouched.

## Recommendation

Accept. The contract's three gates pass cleanly, the design matches what was built (one defensible deviation — dropping the `?` — well-documented in the commit), and no scope creep. The leftover `if (!db) return;` guard in `clearDexie` is a minor stylistic loose-end worth noting but not worth blocking on; if anything, leaving it preserves defensive behavior should `bootDexie` ever be skipped. The change cleanly eliminates the 5 lint errors and adds a small but real safety net (schema drift between `lib/sync/db.ts` and the test mirror will now fail at lint time).
