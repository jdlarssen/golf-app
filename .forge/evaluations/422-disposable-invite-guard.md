# VERDICT: ACCEPT

Evaluation of `#422 — Guard disposable-domener på de bruker-drevne invite-flatene`
Branch: `issue-422-disposable-invite-guard` · Evaluated 2026-06-04 (independent re-verification).

---

## Gate results (exact, re-run by evaluator)

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit; echo "EXIT=$?"` | `EXIT=0` |
| Co-located tests | `npx vitest run "app/invite/actions.test.ts" "app/signup/[shortId]/teamActions.test.ts"` | `Test Files 4 passed (4)` · `Tests 40 passed (40)` |
| Lint | `npx eslint <6 touched files>; echo "EXIT=$?"` | `EXIT=0` |

(vitest matched 4 files because the two target patterns each pull in a sibling validation/form test in the same dir; 40 tests green total.)

---

## Per-criterion verification (K1–K7)

| # | Criterion | Verdict | Evidence (independently verified) |
|---|---|---|---|
| K1 | Friend-invite blocks disposable | **PASS** | `app/invite/actions.ts:32-34` — `if (isDisposableEmailDomain(email)) redirect('/profile?invite_error=disposable_email')`, placed AFTER `looksLikeEmail` (l.23) and BEFORE `getServerClient()` (l.36), the `invitations` insert (l.107) and `sendInviteNotification` (l.123). Test `app/invite/actions.test.ts` (`rejects a known disposable domain …`) asserts redirect target + `supabaseMock.rpc` not-called + `insertCalls.toHaveLength(0)` + `sendInviteNotificationMock` not-called. `__fromCalls` is a real FIFO recorder (`tests/serverActionMocks.ts:118-119`); `mailinator.com` is in the curated list (`lib/auth/disposableDomains.ts:19`), so the test genuinely exercises the guard. |
| K2 | Friend error message shown | **PASS** | `app/profile/page.tsx:45` — `disposable_email: 'Engangs-e-post går ikke. Be vennen om en vanlig e-postadresse.'` in `INVITE_ERROR_MESSAGES`. Rendered behind the server-side redirect query param (static string — verified by reading per task note). |
| K3 | Team co-player blocks disposable | **PASS** | `app/signup/[shortId]/teamActions.ts:256-258` — guard in the pre-validation loop, placed AFTER the `!slot.value || !slot.value.includes('@')` check (l.249) and BEFORE `getAdminClient()` (l.268) / all inserts (captain row l.273, invitations l.447). Test asserts `toEqual({ok:false, error:'disposable_email'})` + 0 admin inserts via `adminMock.__fromCalls`. Test is structurally identical to the passing `self_in_slots` test and reaches the same loop (disposable slot is mid-list, after a valid slot). |
| K4 | Team error message shown | **PASS** | `app/signup/[shortId]/TeamRegistrationForm.tsx:33-34` — `disposable_email: 'Engangs-e-post går ikke. Bruk en vanlig e-postadresse for medspilleren.'` in `Record<TeamRegistrationError, string>`. `'disposable_email'` added to the `TeamRegistrationError` union (`teamActions.ts:89`). Wiring is real, NOT a cast: `grep` for `as TeamRegistrationError` / `as Record` / `@ts-` in the form returns nothing — `tsc` (EXIT=0) genuinely enforces the union ↔ map exhaustiveness. |
| K5 | Admin flows unchanged | **PASS** | `git diff origin/main...HEAD --stat -- app/admin/spillere/actions.ts app/admin/games/[id]/inviteToGameActions.ts` returns empty (both untouched). Single implementation commit `4ebf8c9` does not list either file. |
| K6 | Always-on (not flag-gated) | **PASS** | Both guards are unconditional `if (isDisposableEmailDomain(...))`. `grep -n NEXT_PUBLIC_ALLOW_SELF_REGISTRATION` in both files → no match (exit 1). |
| K7 | Gates green | **PASS** | Re-run by evaluator: tsc `EXIT=0`; vitest 40 passed; eslint `EXIT=0`; `package.json` + `package-lock.json` 1.73.0→1.73.1; CHANGELOG `[1.73.1]` entry added inside the 1.73.y series. |

---

## Adversarial findings

**Probed: any OTHER unguarded user-driven invite vector?**
Enumerated every `.from('invitations').insert` site:
- `app/invite/actions.ts:107` — guarded (K1). ✅
- `app/signup/[shortId]/teamActions.ts:447` — guarded in pre-validation (K3). ✅
- `app/admin/spillere/actions.ts:81` — admin-only (`requireAdmin`), deliberately unguarded per Decision A. ✅ (documented)
- `app/admin/games/[id]/inviteToGameActions.ts:189` — admin / trusted-creator, deliberately unguarded per Decision A. ✅ (documented)

Also checked the self-registration server actions the task flagged (`app/signup/[shortId]/actions.ts` — `registerForOpenGame`, `requestApproval`): both operate on the **already-authenticated user's own `userId`** (`requireAuthedUser`) and insert into `game_players` / `game_registration_requests` keyed on `user_id` — they never invite an arbitrary OTHER email and never write to `invitations`. The acting user's own email already cleared the #365 `/login` block to be logged in. **Not a gap** (self-registration of one's own email is out of scope, exactly as the task notes). No other signup/invite action invites an arbitrary email.

**Conclusion: no unguarded user-driven invite vector exists.** All four invitation-insert sites are accounted for; the two user-driven ones are guarded, the two admin ones are intentionally and documentedly excluded.

**Guard placement / effectiveness:** Friend guard short-circuits via `redirect()` before any Supabase client, RPC, insert, or mail — no dead row, no wasted mail. Team guard returns before `getAdminClient()` and any insert. Both verified by reading line order, not just the builder's claim.

**Always-on:** Confirmed neither guard references the self-reg flag (grep clean in both files).

**Admin exclusion deliberate, not accidental:** Contract Decision A (§2) + Edge-case + §5 all document it explicitly; `git diff` stat confirms both admin files are byte-for-byte untouched.

**Type wiring:** `disposable_email` is present in BOTH the `TeamRegistrationError` union and the `ERROR_MESSAGES` map, with no cast/suppression — tsc's EXIT=0 is a real signal, not bypassed.

**Test honesty:** Both new tests assert no-insert (via the real `__fromCalls` FIFO recorder) and no-mail (friend), not merely the return value. Test inputs use `mailinator.com`, which is genuinely in the curated list, so the guard is actually exercised.

**False positives:** Helper matches exactly via `DISPOSABLE_EMAIL_DOMAINS.has(domain)` on the lowercased post-`@` domain (`lib/auth/disposableEmail.ts:22`) — no substring/suffix matching. No new list entries added (reuses #365's set). Low false-positive risk, as claimed.

---

## Notes (non-blocking)

- The team guard reuses the existing `team_name_invalid` error code for the empty/no-`@` slot case (pre-existing behavior, unchanged by this PR) — slightly odd naming but out of scope here.
- UI strings verified by reading (static map entries behind server-side guards); no dev server / Playwright needed, per task instruction.

No blocking issues. All seven criteria PASS, all three gates green on independent re-run.
