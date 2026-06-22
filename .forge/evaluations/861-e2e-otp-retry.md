# Evaluation — #861: e2e OTP `code_expired` retry on back-to-back logins

## Verdict: **ACCEPT**

All six success criteria verified independently. Both gates green, the deterministic
proof spec passes against staging (twice, deterministic), and skeptical probes of
non-vacuity, retry classification, locale routing, scope discipline, and loop
termination all held. Change is test-infra only — no `app/`, `lib/`, migration, or
version-bump changes; no existing caller required edits.

---

## Per-criterion verdict

| # | Criterion | Verdict | Evidence (observed) |
|---|-----------|---------|---------------------|
| C1 | Primitive exists & is injectable | **PASS** | `withFreshOtpRetry(mint, attempt, opts)` at `e2e/_helpers/games.ts:100`. Bounded: `maxAttempts = opts?.maxAttempts ?? 3` (L105). Re-mints per attempt: `const otp = await mint()` **inside** the loop (L108). Jittered backoff `250 + Math.floor(Math.random()*400)` ms (L115). Throws labelled diagnostic on exhaustion: `withFreshOtpRetry(${label}) brukte opp ${maxAttempts} forsøk: ${lastReason}` (L117–119) — no silent pass. `mint` is a constructor arg, not hard-wired. |
| C2 | Page-driven path uses it, callers unchanged | **PASS** | `signInViaOtp(page, email)` keeps exact signature at `e2e/_helpers/games.ts:194`, body delegates to `signInViaOtpWith(page, email, () => fetchOtpForEmail(email))` (L195). Grepped all ~14 call sites across 12 specs (cup/liga/signup/games/auth) — **none changed** in the diff; only the helper + #849 spec + new proof spec touched. `tsc --noEmit` exit 0. |
| C3 | Retry classification correct | **PASS** | In `signInViaOtpWith` (`games.ts:137`): success = `!/\/login\b/.test(landed.pathname)` (L172); retryable = `err === 'code_expired' \|\| err === 'code_invalid'` (L180); any other error → `retryable:false` (fatal). `next` captured **once** before the loop (L142) and re-applied each attempt (L148) — necessary because the app's failed-verify redirect drops `next` (verified `app/[locale]/(auth)/login/actions.ts:195`: `new URLSearchParams({step, email, error})` — no `next`). `waitForURL` predicate (L166–169) resolves on either leaving `/login` OR an `error` param appearing; the app always redirects to one of those terminal states (actions.ts L196 always sets `error`), so no false timeout. Each attempt re-navigates with a clean `qs` (no `error`), so no stale-error false-positive. |
| C4 | Programmatic path uses it | **PASS** | `signedInClient` at `e2e/games/adversarial-role-replay.spec.ts:65` now wraps mint+verify in `withFreshOtpRetry` (L73–86): `!error` → `{ok:true}`; `msg.includes('expired') \|\| msg.includes('invalid')` → retryable; else fatal. Grepped all `verifyOtp` call sites in `e2e/` — this is the **only** programmatic one; no path missed. `tsc`/`eslint` exit 0. |
| C5 | Deterministic recovery proof | **PASS** | `e2e/auth/otp-retry-recovery.spec.ts` (tagged `@lifecycle`, `test.skip(!envReady)`). Poisoned mint: attempt 1 mints OTP_A then OTP_B (supersede), returns stale A; asserts `stale !== fresh` (L60 — non-vacuity, fails loud if generateLink didn't regenerate). Drives the **real** `signInViaOtpWith`. Asserts left `/login` (L72) AND `mintCalls >= 2` (L73). **Independently re-ran on staging twice: `1 passed (3.7s)` then `1 passed (2.5s)`, playwright exit 0.** Non-vacuity traced below. |
| C6 | Gates green | **PASS** | `npx tsc --noEmit` → exit 0. `npx eslint <3 files>` → exit 0. No version bump / CHANGELOG correct (test-only; `test(e2e):` prefix bypasses the version hook). |

---

## Gate results (observed)

```
$ node --version
v22.23.0

$ npx tsc --noEmit
tsc exit: 0

$ npx eslint e2e/_helpers/games.ts e2e/games/adversarial-role-replay.spec.ts e2e/auth/otp-retry-recovery.spec.ts
eslint exit: 0

$ RUN_E2E=true npx playwright test e2e/auth/otp-retry-recovery.spec.ts --reporter=list   (staging, Node 22, .env.staging.local)
  ✓  1 [chromium] › otp-retry-recovery.spec.ts:46 › signInViaOtp recovers from a forced code_expired on attempt 1 @lifecycle (3.0s)
  1 passed (3.7s)        # run 1
  1 passed (2.5s)        # run 2 (determinism confirmed)
playwright exit: 0
```

Staging target confirmed = `snwmueecmfqqdurxedxv.supabase.co` (torny-staging); dev server on :3000 returned 200. All four `envReady` inputs (URL/SRK/admin/player) confirmed set.

---

## Non-vacuity analysis (the key skeptical claim)

**Does the proof FORCE a failure on attempt 1, or could it pass even if retry never fired?**

Traced the loop (`games.ts:107–116`): `mint()` is called once per iteration (L108). The loop
advances to a 2nd iteration **only** if `res.ok` is false (L110 returns on success) AND
`res.retryable` is true AND `i < maxAttempts` (L112 breaks otherwise). Therefore `mintCalls >= 2`
**can only be true if attempt 1 returned `{ok:false, retryable:true}`** — i.e. the retry fired on a
genuinely retryable failure. The poison mint returns stale OTP_A on call 1 → app rejects superseded
token → redirects `?error=code_expired` → `signInViaOtpWith` classifies retryable → loop re-mints.
So `mintCalls >= 2` is a true witness of the retry path. **Non-vacuous.**

**`stale !== fresh` asserted?** Yes (L60), with a message — if `generateLink` ever stops
regenerating the token, the assertion fails loudly rather than the test passing on a degenerate
no-supersede state.

**Would the OLD (pre-fix) single-shot helper have failed this test?** Yes. The old
`signInViaOtp` (read from `main`) had no retry and no mint seam; its terminal assertion was
`expect(page).not.toHaveURL(/\/login\b/, {timeout: 15_000})`. Fed the stale token, the app
redirects to `/login?...&error=code_expired`, the page never leaves `/login`, and that assertion
fails after 15s. The new retry loop is precisely what converts that failure into a pass on
attempt 2. The proof is therefore a real regression witness for the fix.

---

## Skeptic's notes — what I tried to break, and whether it held

- **`next` dropped across a failed attempt** → re-applied each attempt from a value captured
  before the loop. Confirmed the app's failed-verify redirect omits `next` (actions.ts:195), so
  this re-application is load-bearing, not decorative. **Held.**
- **`waitForURL` false read on a slow/transient redirect** → predicate resolves only on leaving
  `/login` OR an `error` param; the app guarantees one terminal state, and each attempt re-navigates
  with a clean `qs` (no leftover `error`) so a prior attempt's error can't satisfy the predicate
  prematurely. **Held.**
- **Locale-prefixed login (`/login` vs `/en/login`)** → `localePrefix: 'as-needed'`,
  `defaultLocale: 'no'` (i18n/routing.ts). Default login = `/login`; non-default = `/en/login`.
  Regex `/\/login\b/` matches both; success redirect is `redirect(next)` which leaves `/login`
  entirely. Same regex as the original post-condition — no behavioural drift. **Held.**
- **Loop termination / livelock** → bounded by `maxAttempts` (3); exhaustion throws a labelled
  diagnostic with attempt count + retryable flag (no silent pass); only wait is a bounded jittered
  `setTimeout`; CI runs `workers: 1` so the race is absent there. Two parallel workers are
  decorrelated by jitter and bounded by the cap. **Held.**
- **C4 completeness** → grepped every `verifyOtp` in `e2e/`; `signedInClient` is the sole
  programmatic verify path and it now retries; genuinely fatal errors still throw (non-retryable →
  break → throw). **Held.**
- **Scope creep into production code** → `git diff main...HEAD --name-only` = exactly 4 files:
  the contract, the helper, the #849 spec, the new proof spec. No `app/`/`lib/`/migration/package
  changes. Test-only; no version bump warranted. **Held.**

## Minor observations (non-blocking, not defects)

- The final `expect(page).not.toHaveURL(/\/login\b/)` in `signInViaOtpWith` (L186) drops the
  explicit `{timeout: 15_000}` that the old helper carried. This is benign: by the time the loop
  returns `{ok:true}`, the in-attempt `waitForURL` has already confirmed the page left `/login`, so
  the trailing assertion is a same-tick confirmation against an already-settled URL — default
  timeout is sufficient. Not a regression.
- No vitest unit coverage of the classifier — expected and contract-acknowledged (vitest excludes
  `e2e/**`); the C5 proof spec is the owner-chosen determinism vehicle.
