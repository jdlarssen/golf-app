# Evaluation: #906 — «Inviter spillere» friend-scoping (server-enforced)

# ACCEPT

Branch `claude/dazzling-robinson-946c3d`, commit `81db3961`. All ten success criteria verified by code inspection, the three gates pass, and the false-positive guard (AGENTS.md trap #4) is mathematically sound. Independently verified — claims not trusted.

## Gate results

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` (Node v22.23.0) | **PASS** — `TSC_EXIT=0` |
| `npx eslint` (5 touched files) | **PASS** — 0 errors, 1 warning (`inviteEmailToGame` complexity 36; known/accepted pre-existing, `npm run lint` has no `--max-warnings`) |
| `npx vitest run inviteToGameActions.test.ts` | **PASS** — `Test Files 1 passed (1)`, `Tests 22 passed (22)` |

No NEW eslint errors. The lone warning is the documented complexity nudge (33→36) the guard introduced; not blocking.

## Per-criterion verdict

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Resolver: union of friend-connections ∪ co-players ∪ club members (groupId only); fail-SAFE; `server-only` | ✅ | `lib/games/inviteEligibility.ts:1` `import 'server-only'`; L32-37 `Promise.all([getFriendConnectionIds, getCoPlayerIds, groupId ? getGroupMemberIds : []])` → `new Set([...])`; L52-58 `getGroupMemberIds` returns `[]` on error → set SHRINKS (rejects), never opens |
| 2 | Picker guard rejects ineligible non-admin → `?error=invite_not_allowed`; admin+self bypass; runs after loadGameForInvite; gate `!ctx.isAdmin && recipientUserId !== inviterUserId` | ✅ | `inviteToGameActions.ts:60-65` exact gate condition; runs at L60 (after `loadGameForInvite` L52, after status check L54); redirect L63 |
| 3 | Email branch: same guard ONLY in existing-user branch; unknown-email branch UNGUARDED | ✅ | `inviteToGameActions.ts:177-182` guard inside `if (existingUser)` block; unknown-email path (L215-296) has no eligibility guard — verified |
| 4 | `loadGameForInvite` select + `GameSnapshot` include `group_id` | ✅ | `GameSnapshot` L14-20 has `group_id: string \| null`; select string L307 `'id, name, status, game_mode, group_id'` |
| 5 | `invite_not_allowed` in no.json + en.json under `game.players.errorMessages` + ERROR_KEYS; natural Norwegian | ✅ | no.json:1657 + en.json:1657 (both under `errorMessages` block, confirmed by sed context); `spillere/page.tsx:45` in ERROR_KEYS. NB copy: «Du kan bare legge til venner og folk du har spilt med. Inviter andre med e-post.» — action-oriented, du-form, no AI-tells |
| 6 | Cosmetic: `<form>` `shrink-0` + SubmitButton `whitespace-nowrap` | ✅ | `InviteToGameClient.tsx:80` `<form action={addAction} className="shrink-0">`; L84 `className="whitespace-nowrap px-4 py-2 text-sm"` |
| 7 | Tests cover all 5 cases; no test weakened | ✅ | non-admin ineligible→rejected (L289-310, asserts resolver called w/ `(CREATOR_ID, null)` + redirect); non-admin eligible→added w/ group_id (L312-337, asserts `(CREATOR_ID, 'club-1')`); self→allowed, resolver NOT called (L339-359 `not.toHaveBeenCalled`); admin ineligible→allowed, resolver NOT called (L361-380); email existing-user non-admin ineligible→rejected (L624-648). Default mock sets RECIPIENT_ID eligible so pre-existing happy-paths still pass — additive, not weakened |
| 8 | No false positives: UI-offered set ⊆ resolver eligible set | ✅ | `getTeamCandidates` (UI) = `getFriendIds` ∪ `getCoPlayerIds`. Resolver = `getFriendConnectionIds` ∪ `getCoPlayerIds` ∪ club. `getFriendIds` filters `status==='accepted'` (`friendGraph.ts:24-28`); `getFriendConnectionIds` has NO status filter (`connectedIdsFromRows` L38-40) → accepted ⊆ accepted+pending. `getCoPlayerIds` identical (same fn). All paths use `getAdminClient()` (no RLS-visibility divergence). ∴ UI-offered ⊆ eligible — no offered candidate ever rejected |
| 9 | Follow-up issue #921 exists | ✅ | `gh issue view 921`: OPEN, title "RLS-håndhev invite-eligibility på game_players (defense-in-depth for #906)", milestone #9 "Backlog — uplanlagt / scale-triggered" |
| 10 | Bump 1.140.6 + CHANGELOG nested under open `## 1.140.y` | ✅ | `package.json:3` `"version": "1.140.6"`; CHANGELOG `### [1.140.6] - 2026-06-23 · #906` under `## 1.140.y — Tall på flisene`. Bump + CHANGELOG + behavior all in atomic commit `81db3961` |

## Notes / gaps

- **No gaps found.** Logic is fully exercised by unit tests.
- **Atomicity:** the entire change — resolver, action guard, copy, ERROR_KEYS, cosmetic, bump, package-lock, CHANGELOG — lands in one commit (`81db3961`), as required.
- **Fail-safe direction confirmed:** every component read (`getFriendConnectionIds`, `getCoPlayerIds`, `getGroupMemberIds`) returns `[]` on error → eligible set shrinks → guard rejects (creator retries). Never fail-open.
- **Scope discipline:** RLS-layer correctly deferred to #921 per owner decision 2 in the contract — not silently dropped.
- **UI live render skipped (justified):** the cosmetic classes are present and verified at `InviteToGameClient.tsx:80,84`; a headless staging boot is slow/flaky and the security logic is reachable only via a crafted call (the UI never offers an ineligible candidate per criterion 8), which the 22 unit tests cover. The contract explicitly permits skipping the heavy UI boot.
