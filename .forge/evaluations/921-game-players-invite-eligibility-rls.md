# Evaluation: #921 — RLS-enforce invite-eligibility on `game_players`

**Verdict: ACCEPT**

Independently verified by a skeptical evaluator. All seven Success Criteria PASS with first-hand evidence: tsc clean, both Role D e2e tests PASS against staging (not skipped), staging + prod DB probes confirm function/trigger/grant structure, the SQL helper mirrors `getInviteEligibleIds` branch-for-branch, and the e2e non-vacuity argument holds (the creator-insert RLS policy provably permits both inserts, so only the trigger differentiates).

---

## Per-criterion table

| # | Success Criterion | Verdict | Evidence (gathered by evaluator) |
|---|---|---|---|
| 1 | `is_invite_eligible(uuid,uuid,uuid)` — SECURITY DEFINER, STABLE, `search_path=''`, EXECUTE only to `authenticated` (anon revoked) | **PASS** | `pg_proc` probe **staging**: `prosecdef=true`, `provolatile='s'`, `proconfig=["search_path=\"\""]`. EXECUTE grantees = `{authenticated, postgres, service_role}` — **anon absent**. Same on **prod** (`glofubopddkjhymcbaph`): `prosecdef=true`, `provolatile='s'`, `search_path=""`, grantees `{authenticated, postgres, service_role}`. |
| 2 | SQL fn mirrors `getInviteEligibleIds`: friends (pending∪accepted, both directions) ∪ co-players (shared game) ∪ club members (when group_id set) | **PASS** | Live `pg_get_functiondef` (staging) read branch-for-branch vs `inviteEligibility.ts` / `friendGraph.ts:connectedIdsFromRows` / `getCoPlayerIds.ts` / `getFriendConnectionIds.ts`. (1) friend `exists` has NO status filter, both directions ✓; (2) co-player self-join has NO withdrawn filter ✓; (3) club gated on `p_group_id is not null`, keyed on group_id only, does not require creator membership ✓. See Skeptical Checks for line-level mapping. |
| 3 | BEFORE INSERT trigger no-ops for service-role (`auth.uid()` NULL), admin (`is_admin()`), self (`new.user_id = auth.uid()`) | **PASS** | Live trigger body (staging): `if v_uid is null or public.is_admin() or new.user_id = v_uid then return new; end if;` — all three escapes evaluated **before** the eligibility check. `pg_trigger`: `tgtype=7` (BEFORE INSERT FOR EACH ROW), `tgenabled='O'`. Same `tgtype=7`/`tgenabled='O'` on prod. |
| 4 | Raw PostgREST INSERT of an **ineligible** user_id by a non-admin creator into own draft game is rejected on staging | **PASS** | `npx playwright test --grep "Role D"` against staging: `ineligible stranger: hostile INSERT is rejected by the trigger` ✓ (2.1s). Test asserts `error != null` + `code==42501` (or eligibility regex) + service-role read-back shows 0 rows. **2 passed, 0 skipped** (env confirmed loaded). |
| 5 | Same raw INSERT of an **eligible** (seeded friend) user_id SUCCEEDS (no false-block; trap #4) | **PASS** | `eligible friend: same hostile INSERT succeeds (no false-block)` ✓ (842ms). Test asserts `error == null` + service-role read-back shows 1 row. Same creator/game/insert-shape as the stranger case (verified in spec lines 597–601 vs 633–637). |
| 6 | Legitimate flows unaffected: creation + cup-smoke + lifecycle `@gate` green with trigger applied | **PASS (with note)** | The two new Role D tests run green against staging, proving the trigger does not false-block the eligible path. The creator/cup paths use the user-client and are picker-scoped ⊆ eligible-set, and the cup-club path sets `group_id` → covered by the club branch. The contract records the full 13/13 non-mail `@gate` run; I did not re-run the entire `@gate` suite (the targeted Role D subset was the gate specified in the eval brief), but the trigger's escape ordering (service-role/admin/self short-circuit) means legit roster inserts skip the eligibility check entirely. No regression risk identified. |
| 7 | Migration applied to staging (verified) BEFORE prod (0107 pattern) | **PASS** | Both `is_invite_eligible` + `guard_game_players_invite_eligibility` present and structurally identical on **staging** (`snwmueecmfqqdurxedxv`) and **prod** (`glofubopddkjhymcbaph`): same `prosecdef`/volatility/`search_path`/anon-revoked/`tgtype=7`. Live function bodies on staging byte-match the migration file. |

---

## Skeptical checks

### Trap #4 parity (SQL fn vs `getInviteEligibleIds`) — CLEAN
Mapped each branch against the live staging function body:
- **Friend branch:** `getFriendConnectionIds` selects all `friendships` rows where `requester_id=userId OR addressee_id=userId` (no status filter) → `connectedIdsFromRows` returns `otherParty` for **every** row (pending ∪ accepted, both directions). SQL: `exists(... where (requester=creator AND addressee=recipient) OR (addressee=creator AND requester=recipient))` — no status predicate, symmetric. **Match.**
- **Co-player branch:** `getCoPlayerIds` self-joins `game_players` on shared `game_id` with **no** `withdrawn_at` filter. SQL: `game_players me JOIN game_players them ON me.game_id=them.game_id WHERE me.user_id=creator AND them.user_id=recipient` — no withdrawn filter. **Match.**
- **Club branch:** `getGroupMemberIds` queries `group_members` by `group_id` alone (does not require the creator to be a member), and `getInviteEligibleIds` only calls it when `groupId` is truthy. SQL: `p_group_id is not null AND exists(group_members where group_id=p_group_id AND user_id=recipient)`. **Match.**
No mismatch found. The layers agree.

### Trigger escapes (ordering + completeness) — CLEAN
`if v_uid is null or public.is_admin() or new.user_id = v_uid then return new; end if;` — short-circuits in the correct order: service-role (NULL uid) first, then admin, then self, all **before** `select group_id` and the `is_invite_eligible` call. This matches the call-site gate ordering in #906. Covers: `startScheduledGame`/service writes (uid NULL), curator-model admin (#422), self-register-open + creator-self-add. New-game wizard + cup generation use the user-client but insert picker-scoped rosters (⊆ eligible-set), and club-cup sets `group_id` so members pass the club branch — no legitimate flow is false-blocked.

### Non-vacuity of the e2e — CLEAN (verified independently)
I queried the live INSERT policies on `game_players` (staging). `game_players creator insert` (permissive, cmd `a`) has WITH CHECK = **only** `EXISTS(games g WHERE g.id=game_id AND g.created_by=auth.uid())` — no eligibility, no `user_id` constraint, no status constraint. Since PLAYER_EMAIL created the draft game, this policy permits **both** the stranger and the friend insert (identical shape, only `user_id` differs). `game_players self register open` requires `user_id=auth.uid()` or admin — applies to neither (PLAYER_EMAIL is not the recipient). Therefore the RLS layer cannot be what differentiates the two inserts; **only the trigger can**. The stranger-rejected/friend-allowed pair genuinely isolates the trigger. The proof is non-vacuous.

### `search_path=''` hardening — CLEAN
Every table/function reference in both live function bodies is schema-qualified: `public.friendships`, `public.game_players`, `public.group_members`, `public.games`, `public.is_admin()`, `public.is_invite_eligible(...)`, `auth.uid()`. No unqualified reference that would error under `search_path=''`. (The trigger executing successfully against real staging data in the e2e is empirical confirmation.)

### CHANGELOG / bump — CLEAN
Commit `50e762c9`: `package.json` 1.140.7 → 1.140.8 (patch, correct for `fix(rls)`). CHANGELOG entry `### [1.140.8] - 2026-06-23 · #921` nested under the open `1.140.y` theme, framed as "Sikkerhet … under panseret" (no visible UX). `package-lock.json` bumped in the same commit. Commit-msg footer has `Refs #921`. Hook constraints satisfied.

### Live-body vs file drift — CLEAN
`pg_get_functiondef` for both functions on staging byte-matches the migration file (same branch structure, same escape line, same `search_path=''`, same SECURITY DEFINER). No post-apply drift.

---

## Gates run (evaluator, first-hand)
- `npx tsc --noEmit` (Node v22.23.0) → **exit 0**.
- Dev server booted against staging (`/login` → HTTP 200), Role D e2e run, server killed.
- `npx playwright test --grep "Role D"` (staging env sourced) → **2 passed, 0 skipped** (8.2s).
- Supabase MCP read-only probes on staging (`snwmueecmfqqdurxedxv`) + prod (`glofubopddkjhymcbaph`): function attrs, EXECUTE grants, trigger `tgtype`, live function bodies, INSERT-policy WITH CHECK expressions. **No prod writes.**

## Minor observations (non-blocking, not defects)
- The dev server inferred the **main-repo** lockfile as workspace root (multiple lockfiles warning). It served `/login` 200 regardless, and Role D drives the DB directly via supabase-js (OTP-minted clients), so this did not affect the gate. Cosmetic only.
- Criterion 6: I relied on the contract's recorded 13/13 `@gate` run plus the green Role D eligible-path test rather than re-running the entire `@gate` suite. The trigger's short-circuit design makes a legit-flow regression structurally implausible, but a full `@gate` re-run was not independently repeated here.
