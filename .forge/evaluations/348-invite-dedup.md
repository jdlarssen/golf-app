# Evaluation — #348: Invitasjon — unngå dobbel-mail (delt dedup på tvers av begge dører)

**Date:** 2026-05-31
**Branch:** issue-348-invite-dedup
**Evaluated commit:** 2416b08434afd5cc32f861e77e3a89cd865f0d1a
**Contract:** `.forge/contracts/348-invite-dedup.md`

---

## Verdict: ACCEPT

All AC1–AC8 pass. Gates pass. No regressions.

---

## AC1–AC8 Results

### AC1 — PASS
`sendFriendInvite` (`app/invite/actions.ts:76`) adds `email_is_invited` to its `Promise.all` RPC batch alongside `email_is_registered` and `email_is_in_auth_users`. When `invitedResult.data` is true (line 87–89), it redirects to `/profile?invite_error=already_invited` with no insert and no mail call. The `invitations.insert` at line 97 and `sendInviteNotification` at line 113 are both downstream of the gate. Confirmed by test: `sendFriendInvite — shared dedup (#348) / refuses a second mail when email_is_invited is true` asserts redirect, RPC call, zero inserts, zero mail calls.

### AC2 — PASS
`sendInvitation` (`app/admin/spillere/actions.ts:72–78`) now calls `supabase.rpc('email_is_invited', { check_email: email })` and redirects to `/admin/spillere?error=already_invited&email=…` when true with no insert and no mail. The old inline `.from('invitations').select('id').eq('email', email).is('accepted_at', null).maybeSingle()` is completely gone (verified via `git diff 5653ef7..2416b08 -- app/admin/spillere/actions.ts`). Confirmed by test: `sendInvitation — shared dedup (#348) / redirects already_invited via the email_is_invited RPC`.

### AC3 — PASS
- **Friend door:** `INVITE_ERROR_MESSAGES.already_invited` in `app/profile/page.tsx:41` reads: `'Denne adressen er allerede invitert. Du trenger ikke gjøre noe mer.'` — friendly, no disclosure of who invited the address. No AI-tells, natural bokmål.
- **Admin door:** `ERROR_MESSAGES.already_invited` in `app/admin/spillere/page.tsx:26` reads: `'Det finnes allerede en ventende invitasjon til denne adressen. Bruk "Send på nytt" istedenfor.'` — pre-existing, still present and unchanged.

### AC4 — PASS
Both vectors are closed:
- **Admin→then friend:** friend door calls `email_is_invited` which (as SECURITY DEFINER) sees the admin's invitation row regardless of RLS. If admin created the row, `email_is_invited` returns true → friend door redirects `already_invited`, no second insert, no second mail.
- **Friend→then admin:** admin door now calls `email_is_invited` via RPC too. Admin is authenticated so RPC executes; the RPC is SECURITY DEFINER so it bypasses RLS and sees the friend-created invitation row. Returns true → admin redirects `already_invited`, no insert, no mail.
Both directions blocked.

### AC5 — PASS
`email_is_invited` is the single dedup primitive. Confirmed by grep: both `app/invite/actions.ts` and `app/admin/spillere/actions.ts` call `supabase.rpc('email_is_invited', { check_email: email })`. The login flow already used it. Three callers, one RPC.

### AC6 — PASS
Three new tests, all meaningful:
1. `app/invite/actions.test.ts` — "refuses a second mail when email_is_invited is true": asserts redirect to `already_invited`, RPC called with normalized email, zero `insert` calls, zero mail calls. Would fail without the fix because old code had no `email_is_invited` call.
2. `app/invite/actions.test.ts` — "proceeds normally when the address has no open invitation": asserts happy-path insert + mail. Validates the guard is not overly broad.
3. `app/admin/spillere/actions.test.ts` — "redirects already_invited via the email_is_invited RPC": asserts redirect to `already_invited`, RPC call with normalized email, zero inserts, zero mail. Would fail against the old inline table query code because `buildSupabaseMock` would have needed a queue entry for the old `.maybeSingle()`, and the comment explicitly states the RPC must be used (not a table query).

`buildSupabaseMock` backward compatibility: the new `rpcResults` parameter defaults to `{}`, so all 20+ existing callers that pass only `queue` continue to work unchanged. `rpc()` resolves to `{ data: null, error: null }` for unknown RPC names, which is safe. Full 2329-test suite passes with no failures.

### AC7 — PASS
New Norwegian copy: `'Denne adressen er allerede invitert. Du trenger ikke gjøre noe mer.'` — no `vennligst`, no em-dash chains, no AI-tells, no anglicisms. Natural bokmål. The pre-commit hook warns (does not block) on AI-tells; no hook warning was triggered on this string.

### AC8 — PASS
`package.json` version is `"1.60.4"` (was `1.60.3`). CHANGELOG entry present at `## [1.60.4] - 2026-05-31` with correct tagline + Teknisk section. Commit prefix is `fix(invite):` which requires the version bump — hook passed (commit exists without `--no-verify`).

---

## RLS Analysis — Is the double-mail vector actually closed both directions?

**Migration 0013** (`supabase/migrations/0013_email_is_invited.sql`):
- Defines `public.email_is_invited(check_email text)` as `SECURITY DEFINER`.
- Logic: `EXISTS (SELECT 1 FROM public.invitations WHERE lower(email) = lower(check_email) AND accepted_at IS NULL AND (expires_at IS NULL OR expires_at > now()))`.
- `GRANT EXECUTE ON FUNCTION public.email_is_invited(text) TO anon, authenticated` — both doors' clients are `authenticated` and can call it.
- Because it is `SECURITY DEFINER`, it runs as the function owner (postgres/service-role), bypassing all RLS policies on `public.invitations`.

**Migration 0020** (`supabase/migrations/0020_tighten_invitations_select_policy.sql`):
- Drops the old `USING (true)` policy that allowed any authenticated user to read any invitation row.
- Adds `"invitations select own incoming"`: `USING (lower(email) = lower(auth.jwt() ->> 'email'))`.
- Combined with the pre-existing `"invitations select own outgoing"` (0008) policy, a normal user can only see rows where they are invitee or inviter.

**Conclusion:** A plain `.from('invitations').select()` query from a friend's user-client would only see their own outgoing invitations, not another user's (admin's) invitation row. The RPC bypasses this. The double-mail vector is **correctly closed in both directions**:
- admin-then-friend: closed (new code in `sendFriendInvite`)
- friend-then-admin: closed (new code in `sendInvitation`)

**Side-effect accepted:** An expired invitation no longer blocks a fresh admin invite. The `email_is_invited` RPC checks `expires_at > now()` so expired rows are excluded. The old inline query checked `accepted_at IS NULL` without an expiry gate, meaning it would block re-inviting after expiry. This behavioral change is documented in the contract's gray-area section and the CHANGELOG as an explicit, acknowledged side effect.

---

## Gate Results

### `npm run build`
```
✓ Compiled successfully in 2.5s
✓ Generating static pages using 9 workers (29/29) in 239ms
```
**PASS** — No errors.

### `npm run lint`
```
✖ 18 problems (0 errors, 18 warnings)
```
All 18 warnings are pre-existing `_gameId` warnings in leaderboard view files. Zero warnings in changed files (confirmed: no output from `grep -E "(app/invite|app/admin/spillere|app/profile/page|serverActionMocks)"`).
**PASS**

### `npx vitest run app/invite app/admin/spillere tests/`
```
Test Files  3 passed (3)
      Tests  5 passed (5)
   Duration  663ms
```
**PASS**

### `npx vitest run` (full suite)
```
Test Files  197 passed (197)
      Tests  2329 passed (2329)
   Duration  21.42s
```
**PASS** — No regressions. `buildSupabaseMock` change is fully backward-compatible across all 20 caller files.

### `npx tsc --noEmit`
Pre-existing errors only in:
- `app/admin/games/[id]/signups/actions.test.ts`
- `app/games/[id]/withdrawActions.test.ts`
- `app/signup/[shortId]/actions.test.ts`
- `app/signup/[shortId]/teamActions.test.ts`
- `.next/dev/types/validator.ts` (phantom route types)

Zero errors in changed files: `app/invite/actions.ts`, `app/admin/spillere/actions.ts`, `app/profile/page.tsx`, `tests/serverActionMocks.ts` — confirmed by grep (no output).
**PASS**

---

## Regressions / Concerns

None. Specific checks:

- **Unused imports:** All imports in `app/admin/spillere/actions.ts` are used (`getAdminClient` by `withdrawInvitation`, `randomUUID` by insert, others by their respective actions).
- **`buildSupabaseMock` backward compatibility:** `rpcResults` defaults to `{}` → existing single-argument callers work; unknown RPC names resolve `{ data: null, error: null }`. Full 2329-test suite confirms no breakage.
- **Old inline query removal:** Confirmed gone via `git diff 5653ef7..2416b08`. No trace of `.from('invitations').select('id').eq('email', email).is('accepted_at', null)` remains in `sendInvitation`.
- **Scope discipline:** No out-of-scope changes. Admin's `resendInvitation` and `withdrawInvitation` are untouched (correct — they operate on specific invitation IDs, not dedup by email). No quota changes, no RLS policy changes, no relabeling.
- **Live Playwright:** Skipped — prod-only testing, no running server, behavior is server-action + string-in-Record. Static verification + unit tests are the appropriate evidence tier here. This is expected and acceptable per the evaluation spec.
