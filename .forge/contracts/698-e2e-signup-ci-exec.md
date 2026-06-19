# Forge contract — #698: e2e signup/invite specs into CI gate

## Context

GitHub #698. The pre-existing signup/invite e2e specs (`e2e/auth/invitation-flow.spec.ts` + 4 in `e2e/signup/`) were deliberately kept out of the `npm run e2e:gate` path when the gate was activated in #674. Three blockers were documented. This contract specifies the resolution for each.

## Blockers and resolutions

### Blocker 1 — Copy-drift in `invite-only.spec.ts`

**Problem:** `invite-only.spec.ts` asserts `page.getByText(/Dette spillet krever invitasjon/i)` and expects zero "Meld meg på" / "Send forespørsel" buttons. After i18n Fase 2 the component was rewritten: uninvited users on `invite_only` games now see `inviteNotInvitedIntro` ("Du er ikke invitert ennå, men du kan be arrangøren om plass.") + a `RegistrationForm` in `manual_approval` mode — which renders a "Send forespørsel" button. The old "krever invitasjon" string is gone from the codebase.

**Resolution:** The test intent (verify that an invite_only game does NOT show a plain "Meld meg på"-button for uninvited users, while a RegistrationForm for requesting a spot IS shown) must be updated to match current UX:
- Drop the `getByText(/Dette spillet krever invitasjon/i)` assertion.
- Add `data-testid="invite-only-banner"` to the banner or container rendered in the `invite_only` path (the `<p>` that shows `inviteNotInvitedIntro` or the wrapping `<div>`).
- Assert `page.getByTestId('invite-only-banner')` is visible.
- Assert the "Meld meg på" button is absent (count 0) — this is still correct.
- Remove the assertion that "Send forespørsel" has count 0 (it's now present and intentional).
- Rule: test-disiplin D — never assert on Norwegian copy, use data-testid.

**Files to change:**
- `app/[locale]/signup/[shortId]/page.tsx` — add `data-testid="invite-only-banner"` to the wrapping `<div>` of the uninvited-invite_only path.
- `e2e/signup/invite-only.spec.ts` — swap copy assertion for testid; remove "Send forespørsel" count assertion.

**Audit of the other 4 specs for copy assertions:**
- `invitation-flow.spec.ts` — uses `getByLabel`, `getByRole`, `getByTestId('success-banner')`, `getByTestId('invite-toggle')` — no raw Norwegian copy. CLEAN.
- `manual-approval.spec.ts` — asserts `getByText(hilsen)` where `hilsen = 'Gleder meg!'` (player data, not UI copy), and `getByRole('button', { name: 'Godkjenn' })`, `getByText(/Forespørsel sendt/i)`. The `/Forespørsel sendt/i` pattern matches a translated success-banner that reads `requestSentBanner`. This is copy-drift risk.
- `open-register.spec.ts` — uses role-based selectors only. CLEAN.
- `self-withdraw.spec.ts` — uses role-based selectors only. CLEAN.

**manual-approval.spec.ts `Forespørsel sendt` assertion:** check the translation key `requestSentBanner` in `messages/no.json` for exact Norwegian string, confirm match, and add `data-testid="request-sent-banner"` to RegistrationForm's success banner instead.

### Blocker 2 — RESEND_API_KEY not set in CI → `invitation-flow.spec.ts` redirects to `?error=mail_failed`

**Problem:** `sendInvitation` in `app/[locale]/admin/spillere/actions.ts` calls `sendInviteNotification` which calls `getClient()` which throws `'RESEND_API_KEY is not set'`. The catch block redirects to `?error=mail_failed`. In CI, no Resend secret is configured.

**Resolution — mail stub via env flag:** Add a `RESEND_STUB_SEND=true` env check in `lib/mail/inviteNotification.ts`. When set, `sendInviteNotification` returns immediately without calling Resend (no-op success). Prod behavior is identical: if `RESEND_STUB_SEND` is absent/false, full send path runs unchanged.

This removes the need for a real Resend API key in CI. The CI workflow adds `RESEND_STUB_SEND: 'true'` to the e2e job env block.

The stub must be inside `sendInviteNotification` (before `getClient()`), not in `getClient()`, so the function signature and best-effort contract remain unchanged for callers.

**Prod-path unchanged proof:** `RESEND_STUB_SEND` is only set in CI e2e env; Vercel prod env has no such variable.

### Blocker 3 — OTP rate-limiting (already resolved)

**Status:** Confirmed resolved. The shared `signInViaOtp` helper in `e2e/_helpers/games.ts` drives verify-only (navigates directly to `?step=verify`, no `sendCode` call). The `invitation-flow.spec.ts` has its own local copy of `signInViaOtp` (same verify-only strategy). All 5 specs route through one of these two implementations. No further work needed.

## Gate wiring

**Approach:** Add `@gate` tag to all 5 specs so `npm run e2e:gate` (`playwright test --grep @gate`) picks them up. The existing CI e2e job already runs this command against the staging Supabase env with the required secrets.

**Tag locations:**
- Each `test.describe(...)` block gets `@gate` in its title string.
- The `invitation-flow.spec.ts` has a single `test.describe` → add `@gate`.
- The signup specs each have 1–2 `test.describe` blocks → add `@gate` to all relevant ones (only the full-flow blocks that need env, not the logged-out-smoke).

**CI additions needed:**
- `RESEND_STUB_SEND: 'true'` in the `e2e` job env block of `.github/workflows/ci.yml`.
- No new secrets needed.

## Acceptance criteria

- [x] `invite-only.spec.ts` uses `data-testid="invite-only-banner"` instead of Norwegian copy assertion.
- [x] `manual-approval.spec.ts` uses `data-testid="request-sent-banner"` for the success banner.
- [x] `RESEND_STUB_SEND=true` in CI removes Resend-key requirement for invitation-flow.
- [x] All 5 specs are tagged `@gate` and appear in `playwright test --grep @gate --list`.
- [x] `npx tsc --noEmit` passes clean on all changed `.tsx`/`.ts` files.
- [x] OTP helper confirmed — verify-only path in both helpers.
- [x] No version bump (test/chore-only changes).
