# Evaluation: #166 self-registration — ACCEPT

**Commit:** ec0ca1c
**Date:** 2026-05-26

## Verdict

Implementation matches the contract end-to-end. Env flag defaults off, rate-limit helper is fail-open and uses `getAdminClient()` as specified, fire-order in `sendCode` is honeypot → rate-limit → `signInWithOtp`, and both bucket trips map to the same `?error=rate_limited` redirect. 19 unit tests pass across three new suites (loginRateLimit, actions flag/rate-limit, SendCodeForm sub-text). tsc clean, eslint clean on all touched files. Norwegian copy reads naturally — no anglicisms, no em-dash chains, no code-switching. Empty-state correctly branches on `canCreateGame` so admins and trusted creators keep the original copy. Only nit: a stderr `[login/sendCode] opened_at stamp failed` warning fires during the actions tests because the admin-client mock doesn't implement the `update().ilike()` chain — the action's own try/catch swallows it and the test isn't load-bearing, but it's noise worth tidying. Manual preview test + Playwright on-state still on the user.

## Success criteria

- [x] **Flag off → `user_not_found` (unchanged behaviour)** — `actions.test.ts:148–164` asserts `shouldCreateUser: false` for non-invited email when env is `'false'`. Production-equivalent code path at `actions.ts:58–68`.
- [x] **Flag on → OTP sent to non-invited email** — `actions.test.ts:166–181` asserts `shouldCreateUser: true` when env is `'true'`.
- [x] **Per-email rate-limit (3/15min)** — `loginRateLimit.ts:46` default, `loginRateLimit.test.ts:33–48` deny-test asserts `reason: 'email'`.
- [x] **Per-IP rate-limit (10/15min)** — `loginRateLimit.ts:47` default, `loginRateLimit.test.ts:50–65` deny-test asserts `reason: 'ip'`.
- [x] **Honeypot short-circuits before rate-limit RPC** — `actions.test.ts:132–145` explicitly asserts `consumeLoginRateLimitMock` not called when honeypot fires. Code at `actions.ts:27–33`.
- [x] **`/login` sub-text gated on env** — `SendCodeForm.test.tsx:14–31` covers both states; Playwright `e2e/auth/login.spec.ts:61–70` asserts default-off. Server resolves env in `page.tsx:62–64` and passes as prop.
- [x] **Empty-state copy on `/`** — `app/page.tsx:199` shows new copy «Du er klar. Be en arrangør om å invitere deg til neste runde.» when `canCreateGame === false`. Differentiation preserved: `canCreateGame` branch at line 197 still gives admin/trusted the original creator copy. No regression-test for the new string (snapshot or selector test would be ideal), but the branching logic is obvious by inspection.
- [ ] **End-to-end self-registered fullføring** — by design user-side preview test (per contract gates section).

## Gates

- [x] **tsc** — `npx tsc --noEmit` exit 0, no diagnostics.
- [x] **vitest** — 19/19 passing across `lib/auth/loginRateLimit.test.ts` (7), `app/(auth)/login/actions.test.ts` (9), `app/(auth)/login/_components/SendCodeForm.test.tsx` (3). Stderr noise from `opened_at stamp failed` is benign — see Issues below.
- [x] **eslint** — exit 0, no warnings on any touched file.
- [x] **pre-commit humanizer** — commit landed cleanly, no advarsler. Manual re-read confirms: «Skriv inn e-posten din. Er du ny her, lager vi en konto til deg.» (sub-text), «Du er klar. Be en arrangør om å invitere deg til neste runde.» (empty-state), CHANGELOG tagline all idiomatic norsk. No «registrere deg»-anglism, no em-dash chains, no embedded English.
- [ ] **Playwright on-state** — skipped (off-state covered in `e2e/auth/login.spec.ts:61–70`; on-state covered at component level in `SendCodeForm.test.tsx` because `NEXT_PUBLIC_*` envs inline at build, can't be flipped per Playwright test without a rebuild). Documented in the spec comment lines 56–60.
- [ ] **Vercel preview** — user-side.
- [ ] **Manual prod test (flag-off `user_not_found`, flag-on full flow, rate-limit at 4th attempt)** — user-side.

## Issues

**Minor (noise, not a defect):**

- `app/(auth)/login/actions.test.ts` — the admin-client mock at lines 43–50 returns `update: adminUpdateMock` (a bare vi.fn) instead of a chainable builder. The action's new `opened_at` stamp at `actions.ts:99–104` chains `.update().ilike().is().is()`, which crashes inside the try/catch and logs `[login/sendCode] opened_at stamp failed TypeError` to stderr on 5 of the 9 actions tests. Tests still pass because the catch swallows it, and `opened_at`-stamping is not what these tests are exercising. Worth either (a) replacing `adminUpdateMock` with a chainable mock, or (b) ignoring console.error in this suite to keep CI output quieter. Not a blocker.

**Test-coverage observation:**

- No automated regression on the new `/` empty-state copy. A simple `screen.getByText('Be en arrangør om å invitere deg til neste runde.')` snippet in an existing home-page test (if any) or a Playwright assertion would lock the wording. Low priority — string is short and obvious, and humanizer already cleared it.

**No defects found in:**

- Fire order (honeypot → rate-limit → signInWithOtp) ✓
- Both-bucket-trips-same-error mapping (no leak) ✓
- `getAdminClient()` for the RPC, not server client ✓
- Env flag default off in `.env.example` ✓
- Empty-state copy correctly branches on `canCreateGame` so admins/trusted creators unaffected ✓
- Norwegian copy quality (no anglicisms, no em-dash chains, no code-switching, idiomatic) ✓
- Version bump (1.28.0 → 1.29.0 MINOR per CLAUDE.md rules — new user-visible feature) ✓
- CHANGELOG tagline reads as stakeholder norsk, not dev prose ✓

## Recommendations

1. **Before PR merge:** clean up the `adminUpdateMock` in `actions.test.ts` so the stderr `opened_at stamp failed` warnings stop appearing on every CI run. Five-line change — make the mock return `{ ilike: () => ({ is: () => ({ is: () => Promise.resolve({ error: null }) }) }) }` or similar.
2. **User-side after PR preview:** verify the four manual gates from the contract — flag-off `user_not_found`, flag-on full flow lands on `/complete-profile`, rate-limit fires at 4th attempt, `/login` sub-text appears in preview with the env set.
3. **Out-of-scope but worth tracking:** the `opened_at`-stamping side-effect was added in this commit (not in the contract) — if intentional, deserves its own line in the CHANGELOG technical section. If accidental, consider whether the side-effect actually belongs in this PR or should be split.
