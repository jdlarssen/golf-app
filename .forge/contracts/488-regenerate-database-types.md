# Contract: #488 — Regenerate `lib/database.types.ts` against prod

## Problem

`lib/database.types.ts` has drifted from the prod schema after migration `0083_leagues_group_scoping`:
- Missing the `league_group_id(p_league_id)` RPC (added in 0083, never regenerated into the types).
- Table ordering for `leagues` / `league_players` / `league_rounds` differs from what the generator now produces.

Pure tech-debt. The file is **not imported anywhere** (Supabase clients in `lib/supabase/` do not pass the `Database` generic), so there is no compile or runtime effect either way — it is a reference artifact that must match the generator output to stop drifting.

## Scope

- ONE `chore(types):` commit that replaces `lib/database.types.ts` with fresh `generate_typescript_types` output from prod (`glofubopddkjhymcbaph`).
- No other file changes. No version bump (chore, not user-visible).

## Success criteria

- [x] `league_group_id` RPC is present in the regenerated file (the drift the issue names). — `grep -c league_group_id` = 1 (was 0 before regen).
- [x] `befriend_inviter` RPC (added manually in #481) is still present after regen — i.e. regen is from current prod, not an older snapshot. — `grep -c befriend_inviter` = 1; prod migration list confirms `auto_friendship_via_invitation` (0084) applied.
- [x] The file content equals the verbatim generator output for current prod (no manual hand-edits on top). — written via `jq '.types' > lib/database.types.ts` straight from `generate_typescript_types`, no edits.
- [x] `npx tsc --noEmit` passes (no new type errors introduced). — `TSC_EXIT=0`.
- [x] Committed with a `chore(types):` message; no `package.json` / `CHANGELOG.md` change. — commit `df1ab82`; `git diff --stat` = `lib/database.types.ts | 412 +-` (207 ins / 205 del), single file.

## Gates

- `npx tsc --noEmit` — clean.
- `git diff --stat` shows only `lib/database.types.ts` changed.

## Non-goals

- Wiring the `Database` generic into the Supabase clients (separate concern, not this issue).
- Any user-visible behavior change.
