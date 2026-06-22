# Contract — #861: e2e OTP `code_expired` retry on back-to-back logins

## Problem

Login-heavy `@lifecycle` e2e specs can fail with `/login?step=verify&...&error=code_expired`
when run back-to-back against the same `E2E_ADMIN_EMAIL`. Each spec mints a fresh OTP via
service-role `admin.generateLink` right before driving the verify step. Supabase **regenerates
and supersedes** the user's single one-time token on every `generateLink` call, so when two
logins on the same email interleave (parallel workers locally; or genuine TTL drift), an earlier
`verifyOtp` lands on a token a later mint already invalidated → Supabase returns
"Token has expired or is invalid" → the app maps the `expired` substring to `code_expired`
([app/[locale]/(auth)/login/actions.ts:194](app/[locale]/(auth)/login/actions.ts:194)) and
redirects back to `/login`. The current helper has no recovery — it just waits 15s for a
navigation that never comes and fails.

Each spec passes cleanly in isolation (#736 4/4, #848 5/5, #849 11/11). This is a suite-wide
env characteristic, not a spec defect. Impact is low today: `@lifecycle` specs are excluded from
the `@gate` CI run; the flake only manifests under manual `e2e:lifecycle` (parallel local workers)
or a future lifecycle-CI job that runs them together.

## Root cause (verified by code reading)

- All page-driven logins route through `signInViaOtp` ([e2e/_helpers/games.ts:92](e2e/_helpers/games.ts:92)) — single chokepoint.
- One sibling path mints+verifies **programmatically** (not via the page):
  `signedInClient` in [e2e/games/adversarial-role-replay.spec.ts:65](e2e/games/adversarial-role-replay.spec.ts:65)
  calls `client.auth.verifyOtp` directly. Same supersede-race, same `code_expired`/invalid class.
- On expiry the page-driven flow surfaces the error in the URL (`?error=code_expired`);
  the programmatic flow surfaces it as `error.message` containing "expired"/"invalid".

## Approach (owner-confirmed: targeted retry in the helper)

Add **one** reusable mint-and-verify-with-retry primitive in `e2e/_helpers/games.ts`, then route
both vulnerable paths through it. Do **not** refactor the suite to Playwright `storageState`
session-reuse — that touches ~10 specs and changes the auth model for a low-impact issue
(explicitly de-scoped by owner).

### The primitive

```ts
export type OtpAttemptResult<T> =
  | { ok: true; value: T }
  | { ok: false; retryable: boolean };

export async function withFreshOtpRetry<T>(
  mint: () => Promise<string>,
  attempt: (otp: string) => Promise<OtpAttemptResult<T>>,
  opts?: { maxAttempts?: number; label?: string },
): Promise<T>
```

- Loops up to `maxAttempts` (default 3). Each iteration: `mint()` a fresh OTP → `attempt(otp)`.
- On `{ ok: true }` returns the value. On `{ ok: false, retryable: true }` it re-mints and retries
  after a **jittered** backoff (~250–650 ms) so two parallel-worker racers decorrelate instead of
  lock-stepping into re-invalidating each other. On `{ ok: false, retryable: false }` or exhaustion
  it throws with a labelled, diagnostic message (no silent pass).
- `mint` is injected (not hard-wired to `fetchOtpForEmail`) so the deterministic proof spec can
  drive the **real** production retry/attempt/navigation logic while supplying a poisoned mint.
  This is dependency injection at a natural seam, not a test-only hack.

### Page-driven path (`signInViaOtp`)

Refactor `signInViaOtp(page, email)` to delegate to an exported testable core
`signInViaOtpWith(page, email, mint)`:
- `signInViaOtp = (page, email) => signInViaOtpWith(page, email, () => fetchOtpForEmail(email))`
  — **signature and behaviour for all existing callers are unchanged.**
- The `attempt` closure: capture `next` once before the loop, navigate to `/login?step=verify`,
  `pressSequentially(otp)` (preserve the auto-submit-at-8-digits + click-button-for-shorter
  nuance), then `waitForURL` until the verify redirect settles (left `/login` = success, or an
  `error` param appears). Classify: success → `{ok:true}`; `error ∈ {code_expired, code_invalid}`
  → `{ok:false, retryable:true}`; any other error → `{ok:false, retryable:false}`.
- Keep the final `expect(page).not.toHaveURL(/\/login\b/)` as the post-condition.

### Programmatic path (`signedInClient` in #849 spec)

Route `signedInClient`'s mint+verify through `withFreshOtpRetry`: `attempt` calls
`client.auth.verifyOtp`; classify `!error` → success, message contains "expired"/"invalid" →
retryable, else fatal. Same bug class, ~6-line change reusing the new primitive — prevents the
same flake resurfacing in #849.

## Success criteria

- [x] **C1 — Primitive exists & is injectable.** `withFreshOtpRetry(mint, attempt, opts)` added at
      [e2e/_helpers/games.ts:100](e2e/_helpers/games.ts:100): bounded (`maxAttempts` default 3),
      re-mints per attempt (`const otp = await mint()` inside the loop), jittered backoff
      (`250 + Math.floor(Math.random()*400)` ms) between retries, throws a labelled diagnostic on
      exhaustion (`withFreshOtpRetry(<label>) brukte opp N forsøk: ...`). Evidence: code at cited line.
- [x] **C2 — Page-driven path uses it, callers unchanged.** `signInViaOtp(page, email)` keeps its
      exact signature ([e2e/_helpers/games.ts:194](e2e/_helpers/games.ts:194)) and delegates to
      `signInViaOtpWith(page, email, () => fetchOtpForEmail(email))`. All existing call sites compile
      untouched. Evidence: `tsc --noEmit` exit 0; no edits to any of the ~10 specs importing
      `signInViaOtp`.
- [x] **C3 — Retry classification correct.** In `signInViaOtpWith`: success = `!/\/login\b/` on the
      landed URL; retryable = `error=code_expired || code_invalid`; any other error → `retryable:false`
      (fatal, not retried). `next` captured once before the loop and re-applied each attempt
      ([e2e/_helpers/games.ts:142](e2e/_helpers/games.ts:142)). Evidence: code + the proof spec
      exercising the retryable branch on staging.
- [x] **C4 — Programmatic path uses it.** `signedInClient` in
      [e2e/games/adversarial-role-replay.spec.ts:65](e2e/games/adversarial-role-replay.spec.ts:65)
      routes through `withFreshOtpRetry`, retrying when the `verifyOtp` error message contains
      "expired"/"invalid". Evidence: code at cited line; `tsc`/`eslint` exit 0.
- [x] **C5 — Deterministic recovery proof.** New spec `e2e/auth/otp-retry-recovery.spec.ts`
      (tagged `@lifecycle`, env-gated skip). Injected mint mints OTP_A then OTP_B (supersede),
      returns stale OTP_A on attempt 1, fresh thereafter; asserts `stale ≠ fresh` (non-vacuity),
      drives the **real** `signInViaOtpWith`, then asserts authenticated (left `/login`) and
      `mintCalls ≥ 2` (retry fired — it only fires on a retryable failure). **Staging run:**
      `✓ 1 [chromium] … signInViaOtp recovers from a forced code_expired on attempt 1 @lifecycle (4.2s)`
      → `1 passed (5.1s)`, playwright exit 0. Attempt 2 is itself a normal successful login through the
      production path, so the happy path is proven non-regressed by the same run.
- [x] **C6 — Gates green.** `npm run typecheck` (tsc --noEmit) exit 0; `npm run lint` (eslint) exit 0
      on all three touched files. No version bump / CHANGELOG (test-only; `test(e2e):` commits bypass
      the version hook — three commits landed clean). Evidence: command output above.

## Gates

- `npm run typecheck` (tsc --noEmit) — must be green.
- `npm run lint` (eslint) — must be green for touched files.
- Deterministic proof: `RUN_E2E=true npm run e2e:lifecycle -- --grep "@lifecycle.*OTP|otp-retry"`
  is not how Playwright greps; run the proof file directly against staging:
  `RUN_E2E=true npx playwright test e2e/auth/otp-retry-recovery.spec.ts` (Node 22 + `.env.staging.local`).
  Builder runs this once and captures output as C5 evidence. The skeptical evaluator may rely on
  reading the spec + tsc/lint if it lacks the staging env.

## Out of scope

- Playwright `storageState` session-reuse refactor (owner de-scoped — bigger, riskier).
- Touching `app/` login behaviour — the production login flow is correct; this is test infra only.
- Reducing Supabase OTP TTL / send-throttle config.
- A vitest unit test of the classifier: vitest **excludes `e2e/**`**, so e2e-only logic can't run
  under the `npm test` gate. Determinism is delivered by the C5 proof spec instead (owner-chosen
  "Deterministisk + gates" path).

## Risks / mitigations

- **Parallel re-mint ping-pong.** Two workers could re-invalidate each other on retry. Mitigated by
  jittered backoff (decorrelates) + `maxAttempts` cap (bounded, fails loud rather than hanging). CI
  runs `workers: 1` so the race is absent there anyway.
- **`waitForURL` predicate vs. locale routing.** App login is `/[locale]/login`; the `/\/login\b/`
  regex matches both `/login` and `/nb/login`, consistent with the existing post-condition.
- **Behavioural drift for existing callers.** Avoided by keeping `signInViaOtp`'s signature and
  final post-condition identical; only the internals gain a retry loop.
