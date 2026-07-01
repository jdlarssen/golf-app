# Evaluation: Native Supabase passkeys (#63)

# VERDICT: ACCEPT

Independent skeptical evaluation of the passkey feature against `.forge/contracts/63-native-passkeys.md`.
Every success criterion was verified by reading the actual code and running the gates — not by trusting the builder's checkmarks. All three automated gates are green, all mount sites are correctly gated, OTP is provably untouched, and the dark-launch default renders zero passkey UI.

Commits reviewed: `837cbc1b` (flag helper), `8b71a99e` (feature). Base `66d2d776`.

## Success Criteria

| # | Criterion | Verdict | Evidence |
|---|-----------|---------|----------|
| 1 | Browser client opts into passkeys; server/middleware unchanged | **MET** | `lib/supabase/client.ts:12` adds `{ auth: { experimental: { passkey: true } } }` to `createBrowserClient` only. `git diff` of `lib/supabase/server.ts`, `proxy.ts`, `lib/supabase/middleware.ts` is empty — untouched. |
| 2 | `passkeyFlag.ts` with tested `resolvePasskeyAccess` (off/admin±admin/on) | **MET** | `lib/auth/passkeyFlag.ts:35-47` — 3-state switch. `passkeyFlag.test.ts` covers all 6 semantic rows incl. `['admin', false, {canEnroll:false, showLoginButton:true}]` (non-admin gets button but can't enroll) and garbage/undefined→off. Ran green. |
| 3 | Login shows Face ID button (flag≠off + WebAuthn); calls `signInWithPasskey`; success→`window.location.assign(next)`; missing/cancel→graceful fallback | **MET** | `PasskeyLoginButton.tsx:47` `window.location.assign(safeNext(next))` (hard nav, not router). Success gated on `data?.session` truthiness (`:38`), not merely error-null — prevents false-positive nav. `webauthn_credential_not_found` → `loginNoCredential` copy, no nav (`:40-45`). Unsupported → `return null` (`:30`). 3 tests assert all three. |
| 4 | Home dismissable enroll nudge (user-gesture, canEnroll + WebAuthn + no passkey) → `registerPasskey` | **MET** | `PasskeyEnrollmentNudge.tsx` (server) gates on `getPasskeyEnrollAccess()`; `PasskeyEnrollmentPrompt.tsx` shows only after `passkey.list()` returns empty (`:37`), respects localStorage dismiss (`:28`), enroll fires on `onClick` only (`:90`) — never auto. Suspense-mounted at `page.tsx:91-93`. 3 tests. |
| 5 | Profile Passkeys section: list (name+dates), rename, delete, enroll-when-allowed | **MET** | `PasskeySettings.tsx` wires `auth.passkey.list/update/delete` + `auth.registerPasskey` (`:37,63,81,97`). Rename caps 120 chars (`:99`). Delete behind `window.confirm` (`:77`). Gated at `profile/page.tsx:266` on `canEnrollPasskey` (real `is_admin`). 2 tests (list-render, delete-after-confirm). |
| 6 | OTP unchanged as fallback; `verifyCode` side-effects untouched | **MET** | `git diff 66d2d776..HEAD -- app/[locale]/(auth)/login/actions.ts` is **empty**. `actions.test.ts` (invite-accept / befriend / both-game routing) ran and passed inside the vitest run. |
| 7 | `passkey` copy in both locales, humanizer-ready; login-e2e-smoke unaffected (flag off → no UI) | **MET** | 26 keys in `no.json` and `en.json`, zero missing/extra either direction. All 26 keys referenced in components exist in both. Copy idiomatic ("Face ID" chosen as user-facing term). Dark-launch: all 3 gates false in `off` state → no render. |
| 8 | MINOR bump 1.161→1.162.0; CHANGELOG deferred; feat commit `[no-changelog]` | **MET** | `package.json` base `1.161.0` → HEAD `1.162.0`. Commit `8b71a99e` body: "...announcement deferred to the flag-flip. [no-changelog]" + `Refs #63`. |

**Criteria met: 8 / 8.**

## Gate Results (Node v22.23.0)

| Gate | Command | Result |
|------|---------|--------|
| Types | `npx tsc --noEmit` | **exit 0** (clean, no output) |
| Lint | `npx eslint components/passkey lib/auth` | **exit 0** (0 errors, 0 warnings) |
| Tests | `npx vitest run components/passkey lib/auth "app/[locale]/(auth)/login"` | **exit 0** — 9 files / 95 tests passed |

Contract's manual owner gate (Dashboard RP config on prod + real add-to-home-screen device test on staging) remains open by design — not buildable in this environment, correctly deferred.

## Skeptical deep-dive on flagged hazards — all clear

- **3-state flag semantics:** admin-first logic holds. `admin` phase → `showLoginButton:true` for all (pre-auth page can't know role) but `canEnroll:isAdmin`. The button-visible-to-all reasoning is sound: discoverable sign-in fails gracefully for non-enrolled, and only admins have enrolled in that phase. The **real** gate is `getPasskeyEnrollAccess()` (post-auth, real `is_admin`) — used for both nudge and profile. A non-admin in `admin` phase cannot enroll (verified: flag test row + `canEnrollPasskey &&` gate at `profile/page.tsx:266`).
- **Hard nav + graceful fallback:** confirmed `window.location.assign` (not router.push), and success requires `data?.session` truthy, so a null-session-no-error Beta response does NOT navigate.
- **Enroll nudge is user-gesture only:** `registerPasskey` is called exclusively in the `enroll()` `onClick` handler; the `useEffect` only *lists* existing passkeys to decide visibility. No auto-fire.
- **SSR/hydration hazard in WebAuthn hook:** `useWebAuthnSupported` uses `useSyncExternalStore` with server snapshot `() => false`. This is the correct React-idiomatic way to avoid a hydration mismatch — server and first client render both yield `false`, then the client store re-reads. No set-state-in-effect anti-pattern. Clean.
- **DB round-trip avoidance:** `getPasskeyEnrollAccess` short-circuits `off`→false and `on`→true before any Supabase call; only `admin` phase does the `is_admin` lookup. Memoised with `cache()`. As claimed.
- **Open-redirect on `next`:** `safeNext()` (`PasskeyLoginButton.tsx:9-11`) rejects anything not starting with `/` and rejects `//` (protocol-relative). Sanitized.
- **Type-unsafe casts:** the `as Passkey[]` casts in `PasskeySettings` are cosmetic shape narrowing over the Supabase Beta return, not hiding a real mismatch. `tsc` is green. Acceptable given the Beta API has loose types.

## Issues Found

None blocking. Minor non-blocking notes (informational, not defects):

- **[P3 / cosmetic]** Contract SC#2 text says "19 tester grønne" and SC#6 says "31 login tests / 4393 full suite". The scoped run here shows 95 tests across the 9 targeted files, which reconciles (`it.each` expansion + the full login suite). No discrepancy in behavior — just that the contract's exact counts weren't re-derived. Not a defect.
- **[P3]** `PasskeySettings` rename/enroll error mapping only special-cases `webauthn_credential_exists`; other Beta error codes (`too_many_passkeys`) fall to generic `enrollError`. The contract's Edge Cases mention a friendly message for `too_many_passkeys`, but generic-friendly is acceptable (still Norwegian, still not a raw code). Not blocking; could be a follow-up polish issue if the owner wants per-code copy.

Neither warrants blocking the merge. The feature is correctly dark-launched behind `NEXT_PUBLIC_PASSKEYS` (default off), OTP is untouched, and all automated gates pass.
