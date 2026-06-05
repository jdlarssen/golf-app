# Evaluation: #369 Venner + åpen-for-venner

**VERDICT: ACCEPT**

Independent, adversarial verification of issue #369 against its contract
(`.forge/contracts/369-venner-og-aapen-for-venner.md`). All gates green, all
nine success criteria PASS, DB state independently confirmed via Supabase MCP,
authz/privacy traced and found sound. Two low-severity, non-blocking notes below.

Evaluated at commit `97e50cc` (branch `claude/friendly-meninsky-ef92cd`,
base `cd3bf76`). 8 commits, 48 files, +2410/-110.

---

## Gate results (real output)

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | **exit 0** (clean) |
| `npx vitest run` | **221 files / 2687 tests passed**, 0 failed |
| `npm run build` | **success** — 35 routes compiled, incl. `/profile/venner` and `/venner/legg-til/[code]` |
| Supabase MCP `execute_sql` schema/RLS/RPC verification | **all confirmed** (details per criterion) |
| Migration recorded applied | `supabase_migrations.schema_migrations` → `20260605205855 friendships_and_friend_visibility` ✓ |
| Security advisors (post-DDL) | no NEW critical findings; see Notes |

---

## Per-criterion table

| # | Verdict | Evidence |
|---|---------|----------|
| **C1 — Schema applied** | **PASS** | DB confirmed via `execute_sql`: `friendships` table exists, RLS enabled (`relrowsecurity=true`), exactly **1 policy, 0 write policies** (SELECT-only). `users.friend_code`: column exists, `is_nullable=NO`, **0 nulls**, unique constraint `users_friend_code_unique` present, format check `users_friend_code_format` present, all values distinct. `games.let_friends_skip_gate` column exists. **5 RPCs** (`send_friend_request`, `send_friend_request_by_email`, `respond_friend_request`, `remove_friend`, `connect_via_friend_code`) all `prosecdef=true`, `anon_can_execute=false`, `authenticated_can_execute=true`, all with `proconfig=["search_path=\"\""]`. `notifications_kind_check` constraint includes both `friend_request` and `friend_accepted`. `lib/database.types.ts` regenerated (friendships, friend_code, let_friends_skip_gate, all 5 RPCs present). tsc=0, build green. |
| **C2 — Three ways to add a friend** | **PASS** | (a) co-player suggestion → `sendFriendRequest` (`app/profile/venner/actions.ts:75`) → RPC inserts pending. (b) email → `addFriendByEmail` (`:96`) calls `send_friend_request_by_email`; `not_found` → `redirect(?invite_email=...)` (`:114-116`) → page offers `sendFriendInvite` reusing the same email. (c) shared link → `app/venner/legg-til/[code]/actions.ts:connectFriend` → `connect_via_friend_code` inserts accepted directly. All wired and compile (build green). |
| **C3 — Mutual request→accept + notifications** | **PASS** | `send_friend_request` RPC (migration `:101`): reverse-pending → auto-accept; accepted → `already_friends`; pending → `already_pending`; else insert pending → `requested`. `respond_friend_request` (`:167`): authz raises `not_authorized` unless `addressee_id = auth.uid()`, only on `pending`; accept → `status='accepted'`; decline → **DELETE** row. Server action `respondFriendRequest` reads `requester_id` BEFORE the call (row deleted on decline) and notifies `friend_accepted` on accept (`actions.ts:152`). `friend_request`/`friend_accepted` zod schemas, EMOJI (👋/🫂), `buildCardContent` cases, and inbox deeplink (`/profile/venner`) all present and exhaustive (build's exhaustive-switch check passes). |
| **C4 — Friend list + remove** | **PASS** | `app/profile/venner/page.tsx` renders incoming (Godta/Avslå), friends (`ConfirmSubmit` two-tap remove), outgoing (Venter), suggestions (Legg til), email field, share link. `getFriendData` partitions via the unit-tested pure `friendGraph` functions. `removeFriend` → `remove_friend` RPC deletes pending+accepted in **both directions** between `auth.uid()` and `p_other` (migration `:194`). Inline two-tap confirm is the deliberate, contract-sanctioned deviation from the dedicated-`/slett`-page rule (owner-flagged). |
| **C5 — Autocomplete union (#408)** | **PASS** | `lib/users/getTeamCandidates.ts` = `getFriendIds(userId) ∪ getCoPlayerIds(userId)`, deduped, self-filtered, email-only, sorted. `TeamRegistrationForm` unchanged (reads resolver only). 4 new unit tests in `getTeamCandidates.test.ts`: union+dedup, **friend-with-no-shared-game** (the #408 core promise), empty-without-query, email-filter+sort — all green within the 2687. |
| **C6 — "Slipp venner direkte inn"** | **PASS** | `RegistrationSection.tsx:126-150`: checkbox rendered **only** when `opt.value === 'manual_approval' && registrationMode === 'manual_approval'`. `gamePayload.ts:2267-2269`: `letFriendsSkipGate = registrationMode === 'manual_approval' && formData.get('let_friends_skip_gate') === '1'` — **force-false for open/invite_only server-side** (a stale checkbox cannot open a non-manual game; verified by reading the parse). Persisted in both create (`actions.ts:189`) and edit (`edit/actions.ts:169`). `registerForOpenGame` (`signup/[shortId]/actions.ts:159-167`): `canDirectJoin` extended with `manual_approval && let_friends_skip_gate && getFriendIds(userId).includes(game.created_by)` — **server-verified, client cannot lie about friendship**. Non-friend on manual_approval → falls through to `wrong_mode` → request flow unchanged. |
| **C7 — "Fra vennene dine" discovery** | **PASS** | `getDiscoverableGames.ts:176-219`: `friendGames` queries `created_by IN getFriendIds(userId)`, `registration_mode IN ('open','manual_approval')` (**invite_only excluded at query level**), `status IN ('draft','scheduled')`, `neq created_by self`. Deduped vs `clubGames` (`openExcludedIds`) and excluded from `openGames` (`openExcludedIdsWithFriends`). `joinMode = direct` iff `open` OR (`manual_approval && let_friends_skip_gate===true`), else `request`. 5 new test cases: skip_gate=false→request, skip_gate=true→direct, invite_only→absent, dedup vs open. `HomeDiscoverySection.tsx:48` renders section; CTA from `joinMode` (Meld meg på / Be om å bli med). |
| **C8 — Wizard kompis friend quick-add** | **PASS** | `GameWizard.tsx:757`: `FriendQuickAdd` rendered only when `state.intent === 'kompis' && friendPlayerIds.length > 0`; club branch untouched. `lib/friends/getFriendPlayerOptions.ts` unions friends into `PlayerOption[]` via admin-client (so friends with no shared game still reach quick-add), no email exposed (privacy per #435). |
| **C9 — No regression + gates + docs/flow** | **PASS** | Full `npx vitest run` = 221/2687 green. tsc=0, build green (35 routes). Migration 0077 is purely additive — no existing RLS/policy/function altered except the `notifications_kind_check` drop/re-add (additive values only; all 15 prior kinds retained, verified in migration `:275-294`). Flow SVG + PNG updated, `docs/user-flows.md` + `README.md` touched (per diff stat). CHANGELOG + package.json bumped (commit-msg hook would have blocked otherwise). |

---

## Adversarial findings (authz / privacy / logic)

### Verified SOUND — why I'm convinced

- **Friendship rows are not readable/mutable by third parties.** RLS SELECT policy
  is exactly `(requester_id = auth.uid() OR addressee_id = auth.uid())` for role
  `authenticated` (confirmed via `pg_policies`). **Zero** INSERT/UPDATE/DELETE
  policies exist — every mutation flows through a SECURITY DEFINER RPC that gates
  on `auth.uid()`. `respond_friend_request` raises `not_authorized` unless the
  caller is the addressee; `remove_friend`/`send_friend_request`/`connect_*` only
  touch rows where the caller is a party. The server actions invoke RPCs via the
  **cookie-based** client (not admin), so `auth.uid()` is the real user — a
  client cannot impersonate by passing someone else's id.

- **Server-side skip-gate (no client trust).** `registerForOpenGame` resolves
  friendship with `getFriendIds(userId)` (admin-client, server-side) and checks
  `friendIds.includes(game.created_by)`. The discovery `joinMode` is presentation
  only; the signup action re-verifies — defense in depth. A non-friend POSTing
  the open-join action against a manual_approval+skip-gate game gets `wrong_mode`.

- **gamePayload force-false confirmed.** Re-read the parse: `let_friends_skip_gate`
  is `true` ONLY for `manual_approval`. A DevTools-injected checkbox on an `open`
  or `invite_only` game cannot persist `true`.

- **Discovery never leaks invite_only.** The friendGames query filters
  `registration_mode IN ('open','manual_approval')` at the DB level, so an
  invite_only game by a friend is structurally absent (not merely hidden in UI).

- **`connect_via_friend_code` consent model holds.** Befriending requires
  possessing the target's `friend_code` AND being authenticated; the opener
  becomes addressee ("accepted by opening"), owner becomes requester ("consented
  by sharing"). There is no path to befriend a third party who never shared a
  code. Idempotent (already_friends short-circuit). The delete-pending-then-insert
  avoids unique-constraint collision in both directions. Matches contract intent;
  not abusable beyond it.

- **Email-existence disclosure is deliberate and bounded.** `send_friend_request_by_email`
  returns `not_found` for unknown emails — required to power the "invite them"
  branch, and consistent with the existing `email_is_invited`/`email_is_registered`
  RPCs already in the codebase. The contract documents this as the intended UX.
  No new disclosure surface beyond what already exists.

### Notes (non-blocking)

1. **`generate_friend_code` has a mutable `search_path`** (Supabase advisor 0011,
   WARN). The function omits `set search_path = ''` (migration `:21-22`). This
   faithfully mirrors the existing `generate_group_short_id` (also flagged), so it
   is a pattern-consistency issue, not a regression unique to this work. Risk is
   minimal: anon EXECUTE is revoked (`:58`), input is non-injectable (no params),
   it only produces a random 8-char string. Worth a follow-up issue to harden both
   `generate_*` helpers together, but does not block ACCEPT.

2. **`respondFriendRequest` calls `requireUser()` twice** (`actions.ts:133` and
   `:153`) — a redundant `auth.getUser()` roundtrip on the accept path. Purely a
   micro-inefficiency; no correctness or security impact.

3. The five friend RPCs appear under advisor 0029 ("Signed-In Users Can Execute
   SECURITY DEFINER Function"). This is **expected** — it is exactly how the
   existing club governance RPCs (`add_club_member_by_email`, `decide_join_request`,
   `set_club_member_role`) work. They are NOT in the 0028 anon-executable list
   (anon EXECUTE correctly revoked, independently confirmed). No action needed.

---

## Conclusion

The implementation matches the contract precisely across all nine criteria.
Schema, RLS, and RPCs are independently confirmed at the database level. The
authz model (select-own RLS + SECURITY-DEFINER-only writes gating on `auth.uid()`)
is correct, the skip-gate is server-verified and force-falsed for non-manual
modes, discovery never surfaces invite_only, and the mutual/reverse-pending/
remove-both-directions semantics in the RPC SQL are sound. Gates are all green
(tsc 0, 2687 tests, build OK). The two notes are low-severity and worth at most a
follow-up issue; neither blocks acceptance.

**VERDICT: ACCEPT**
