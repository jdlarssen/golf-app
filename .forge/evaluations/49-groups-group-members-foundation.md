# Evaluation: `groups` + `group_members` Foundation (#49)

Evaluator: forge:evaluate (independent skeptical review)
Date: 2026-06-05
Branch: claude/heuristic-davinci-bcdc4b

---

## Verdict

**ACCEPT**

---

## C1–C6 Criterion Table

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| C1 | Tables + enum exist with correct columns; RLS enabled | **PASS** | `groups` has 4 columns (id uuid PK, name text NOT NULL, created_by uuid nullable, created_at timestamptz NOT NULL); `group_members` has 4 columns (group_id uuid NOT NULL, user_id uuid NOT NULL, role USER-DEFINED/group_role NOT NULL default 'member', joined_at timestamptz NOT NULL). RLS enabled = true on both (`pg_class.relrowsecurity`). `group_role` enum = {owner, admin, member} in that order. |
| C2 | `is_group_member`/`is_group_admin` are SECURITY DEFINER; `anon` cannot EXECUTE; `authenticated` can; 4 policies per table | **PASS** | `pg_proc.prosecdef = true` for both. `has_function_privilege('anon', ..., 'EXECUTE') = false` and `has_function_privilege('authenticated', ..., 'EXECUTE') = true` confirmed via direct privilege query. ACL entries = `{postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres}` — no `anon` entry. Policy count: `groups` = 4, `group_members` = 4 (select/insert/update/delete each). |
| C3 | No unique/PK constraint on `group_members.user_id` alone | **PASS** | Only constraint on `group_members` is `group_members_pkey` (type `p`, columns = `{group_id, user_id}`). No single-column unique on `user_id`. Many-to-many confirmed. |
| C4 | Backfill: exactly 1 group; member_count == user_count; exactly 1 owner who is admin | **PASS** | `group_count=1`, `group_name="Tørny"`, `member_count=13`, `user_count=13`, `owner_count=1`, `owner_is_admin_count=1`, `all_users_enrolled=true`. |
| C5 | `lib/database.types.ts` contains groups/group_members/group_role; types compile | **PASS** | File has `group_members:` block (lines 626–661), `groups:` block (lines 662–690), `group_role: "owner" \| "admin" \| "member"` in Enums type (line 1225), and `group_role: ["owner","admin","member"]` in EnumConstants (line 1364). `npx tsc --noEmit` exits 0 with no output. |
| C6 | No existing `.sql` migration modified; only 0074 + types + .forge added | **PASS** | `git diff --name-only 3307aa7..HEAD` = exactly 3 files: `.forge/contracts/49-groups-group-members-foundation.md`, `lib/database.types.ts`, `supabase/migrations/0074_groups_and_group_members.sql`. No existing `.sql` touched. `git diff --stat` shows 408 lines added, 0 deleted from any pre-existing file. |

---

## Skeptical Findings

### 1. RLS Recursion Risk

**Cleared.** The `group_members SELECT` policy uses `public.is_group_member(group_id)`, which is a `SECURITY DEFINER` function. When Postgres evaluates the policy for a SELECT on `group_members`, it calls `is_group_member`, which internally does `SELECT … FROM public.group_members`. Because the function runs as the function-owner (security definer) rather than as the calling user, Postgres does NOT apply RLS to that inner query. There is no recursive policy evaluation loop. This is the same pattern used by `is_in_game()` in migration 0003.

The `is_group_admin` function is called only from the `groups` table policies and the `group_members` INSERT/UPDATE/DELETE policies — never from the `group_members SELECT` policy. The chain is therefore non-recursive in every path.

### 2. Anon (Unauthenticated) Access

**Cleared.** Confirmed via `has_function_privilege('anon', oid, 'EXECUTE')` = false for both helpers. All 8 RLS policies are `to authenticated` — `pg_policies.roles = {authenticated}` for every policy on both tables. Supabase's default `anon` role cannot call the helpers via `/rest/v1/rpc`, and the RLS policies do not apply to `anon` queries because the policies are role-scoped to `authenticated`. A direct table query by `anon` would also be blocked by RLS (no policy grants `anon` access). No anon leakage path exists.

### 3. Scope Creep

**Cleared.** Only 3 files changed from baseline commit `3307aa7`: the new migration, the types file, and the forge contract. No `group_id` column was added to any existing table (confirmed by querying `information_schema.columns` for `column_name = 'group_id'` across all public tables — zero results outside `group_members` itself). No UI files, no app logic, no changes to `games`, `courses`, `scores`, or their RLS policies.

### 4. Existing Table RLS Integrity

**Cleared.** Policy counts on all 8 pre-existing core tables are unchanged from baseline expectations: `users`=5, `games`=6, `game_players`=8, `scores`=3, `courses`=3, `course_holes`=3, `tee_boxes`=3, `invitations`=8. The migration file contains zero `ALTER TABLE`, `DROP POLICY`, or `CREATE POLICY` statements targeting any pre-existing table — only `CREATE TABLE`, `CREATE TYPE`, `CREATE FUNCTION`, `CREATE INDEX`, `ALTER TABLE … ENABLE ROW LEVEL SECURITY` (on the two new tables only), and `CREATE POLICY` (on the two new tables only).

### 5. Migration File / Live DB Consistency

**Cleared.** The `source_body` returned from `pg_proc` for both helpers matches verbatim the function bodies in `0074_groups_and_group_members.sql`. The column definitions, enum values, and constraint structure in the live DB match the DDL in the migration file exactly.

### 6. One Minor Observation (non-blocking)

The `set search_path = ''` pragma on both SECURITY DEFINER helpers correctly uses an empty search path and fully qualifies all references (`public.group_members`, `auth.uid()`). This is consistent with the 0071 style requirement and closes the search-path injection vector.

---

## Issues to Fix

None. All criteria pass; no blocking findings.
