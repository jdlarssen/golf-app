# Evaluation: #676 — email-invited co-player on a 'both' game must not become a solo dead-end

**VERDICT: ACCEPT (with one regression to flag as a follow-up issue — auto-friendship #481 no longer fires for team/both email-invites)**

Commit evaluated: `09d91754`
Method: code-tracing (file:line) + co-located tests + `tsc` + `vitest`. Live UI verification was NOT possible in this environment (needs OTP login backend + seeded 'both' game + pending invitation) — stated per the prompt; verdict rests on tracing + the co-located suite + typecheck.

## Per-criterion verification

| # | Criterion | Verdict | Evidence |
|---|-----------|---------|----------|
| 1 | `'both'` treated like `'team'` for the no-solo-insert decision | PASS | `actions.ts:273-275` — `isTeamScoped = registration_type === 'team' \|\| === 'both'`. The solo-insert guard at `:313` is `if (!isTeamScoped)`, so both team and both skip the `game_players` insert. Test `:644-683` asserts `adminGamePlayersInsertMock` NOT called for a `'both'` game. |
| 2 | `accepted_at` flip deferred/skipped for team-scoped (team OR both), id-scoped, not consumed elsewhere | PASS | The single flip is at `:296-301` and is now scoped via `.in('id', inviteIdsToConsume)`. `inviteIdsToConsume` (`:292-294`) = all pending invites whose id is NOT in `teamScopedInvIds` (`:289-291`). Grep of the whole file confirms exactly ONE `invitations.accepted_at` write in `verifyCode` (`:299`); `:323` is `game_players.accepted_at` (skipped for team-scoped anyway); `:150` is `sendCode`'s `opened_at`. No other consumer. |
| 3 | Email-invited co-player on team/both routed to `/signup/[shortId]/team`, not `/games/[id]` | PASS | `:389-395` — when exactly one team-scoped invite and zero solo, `gameDest = /signup/${shortId}/team`. Tests `:640` (team) and `:682` ('both') assert the redirect. Incomplete-profile variant wraps it in `/complete-profile?next=…` (`:424-426`, test `:705-707`). |
| 4 | `team/page.tsx` still finds the pending invitation + offers "Bli med på lag" for team AND both | PASS | `team/page.tsx:94-100` queries `invitations` by `game_id` + `.is('accepted_at', null)` only — NO `registration_type` filter, so it is agnostic to team vs both. Because the flip is now skipped (crit 2), `accepted_at IS NULL` holds → `pendingInvitation` is found (`:101`) → `invited_unknown` attach UI renders (`:121-140`). |
| 5 | Solo invitations keep existing behaviour (solo insert + flip + redirect to game) | PASS | Solo invite is not team-scoped → its id IS in `inviteIdsToConsume` → flipped at `:299`. `!isTeamScoped` → solo `game_players` insert at `:314-324`. Redirect `:386-388` → `/games/[id]`. Tests `:455-498` (insert+notify+complete-profile route) and `:500-523` (`/games/[id]` on completed profile) still green. |
| 6 | Co-located test: 'both' → no solo row + invitation still findable + redirect to team page | PASS (with a caveat) | New `describe` block `:644-737`: three cases — no solo insert + notify + redirect to `/signup/xyz98765/team`; incomplete-profile → `/complete-profile?next=…/team`; explicit-next precedence. Caveat: the "invitation still findable" claim is asserted only indirectly (empty mock queue + redirect), NOT by inspecting that the flip's `.update().in()` was skipped — see Issues. The skip itself is proven by code-tracing, not by the test. |
| 7 | `tsc --noEmit` clean; relevant vitest green | PASS | See Gate outputs. |

## Loop-closure trace (end-to-end)

1. OTP verify on a 'both' game email-invite → `verifyCode` keeps the invitation pending (`:289-301` excludes it from the flip) and skips the solo insert (`:313`).
2. Redirect → `/signup/[shortId]/team` (`:393`).
3. `team/page.tsx`: no `game_registration_requests` row (`:77-82`) → looks up invitation by email + `game_id` + `accepted_at IS NULL` (`:94-100`) → found → renders `mode="invited_unknown"` attach card (`:121-140`).
4. Co-player clicks "Bli med på lag" → `attachToCaptainTeam` (`teamActions.ts:891`): creates the team-linked `game_registration_requests` row (`:964-978`), inserts the proper team `game_players` row for open mode (`:999-1010`), and ONLY THEN flips `invitations.accepted_at` (`:1017-1020`).

Every hop verified. The loop closes.

## Regression analysis

- **#356 single-game solo redirect**: intact. The condition was tightened from `soloInvites.length === 1` to `soloInvites.length === 1 && teamScopedInvites.length === 0` (`:386`). For a pure solo invite this is unchanged. Tests `:500-523` confirm `/games/[id]`. PASS.
- **#199 team-only path**: intact and slightly improved — team-only games now also get an explicit redirect to the attach page (`:640`), where previously they fell through to home. No solo insert (was already correct via the old `isTeamOnly`). PASS.
- **Club/friend invitations (game_id null)**: unaffected. Game-less rows are never in `teamScopedInvIds` (only `gameScoped` rows are resolved), so they remain in `inviteIdsToConsume` and are still consumed (`:292-294`). `accept_club_invitations()` RPC (`:411`) reads a separate `club_invitations` table (#644) — untouched. PASS.
- **Mixed solo + team invitations for one email**: solo is consumed + solo-inserted; team stays pending. Redirect falls through to home (`/`) because neither single-type branch matches (`:386`/`:389`). Documented "ambiguous → home" fallback. Acceptable; no data corruption. PASS.
- **#481 auto-friendship — REGRESSION (real, must be filed)**: `befriend_inviter` (migration `0084`, gate at SQL `:37-44`) only creates a friendship when an invitation from the inviter to this email has `accepted_at IS NOT NULL`. The RPC is called in `verifyCode` at `:363-372` (the ONLY caller — grep-confirmed; `attachToCaptainTeam` does NOT call it). Because the fix now keeps team/both invitations `accepted_at = NULL` at verify time, the gate returns `'no_invitation'` and **no friendship is created** for team/both email-invited co-players.
  - **Before the fix**, a `'team'` game email-invite DID get auto-friended (the old code flipped `accepted_at` for ALL pending invites before calling `befriend_inviter`). So this is a genuine behavioural regression for the `'team'` path.
  - For `'both'` the path was entirely broken before, so there is no net loss there — but it also will not gain auto-friendship.
  - Solo invites are unaffected (still flipped before `befriend_inviter`, gate passes) — verified.
  - **Severity: low-to-moderate.** Auto-friendship is a best-effort "vennegraf grows organically" nicety, not part of the core join loop. The co-player still joins the team correctly. But the friendship that previously formed for team email-invites silently stops forming. This was not a listed contract criterion, but the evaluation prompt explicitly flagged #481 as a regression check, and it does regress. Recommend filing a follow-up issue: either call `befriend_inviter` from `attachToCaptainTeam` after the `accepted_at` flip, or have the attach flow trigger it.

## Gate outputs

- `npx tsc --noEmit` → `TSC_EXIT=0` (clean).
- `npx vitest run "app/[locale]/(auth)/login/actions.test.ts"` → `Test Files 1 passed (1) / Tests 24 passed (24)`, 471ms.

## Issues found

1. **(Regression) #481 auto-friendship no longer fires for team/both email-invites.** See regression analysis. Not a contract criterion but a real behavioural change vs the pre-fix `'team'` path. Should be a follow-up issue, not a blocker for #676 itself (the dead-end the issue describes is genuinely fixed).
2. **(Test weakness, minor)** The new 'both'/team tests assert the flip-skip only indirectly. The mock's empty queue resolves to `{data:null}` rather than throwing, so a stray `accepted_at` flip on the server client would NOT fail the test — it would silently pass. The skip is proven by code-tracing, but the test would be stronger asserting on `supabaseMock.__fromCalls` that no `invitations`/`update`/`in` chain ran for the team/both case. Not blocking.

## Why ACCEPT despite the regression

All seven contract success-criteria pass. The P2 dead-end described in the issue (solo row inserted + invitation consumed → co-player stranded with no path back) is genuinely and completely fixed, verified hop-by-hop. The #481 auto-friendship regression is a separate, lower-severity side-effect on a best-effort nicety that was never in this contract's scope and does not re-open the dead-end. It should be tracked as a follow-up issue rather than blocking the fix.
