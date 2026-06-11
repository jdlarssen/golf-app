# Evaluation: #552 — i18n Fase 1 Pilot (login/auth-strenger + språkvelger)

**Contract:** `.forge/contracts/552-i18n-fase-1-pilot.md`
**Range:** `ea7c275..HEAD` (6 commits)
**Evaluator:** fresh-context skeptic, 2026-06-11
**Verdict:** **ACCEPT**

---

## Gate results (run by evaluator, not trusted from prior runs)

| Gate | Result | Evidence |
|------|--------|----------|
| `npm run build` | **PASS** | exit 0 (`BUILD_EXIT=0`); full prod build of all `[locale]` routes |
| `npx tsc --noEmit` (raw) | NOISY (see NIT-1) | exit 2 — **all 94 errors in gitignored `.next/dev/types/*` Next.js dev artifacts; ZERO in source** |
| `tsc --noEmit` (source only, `.next` excluded) | **PASS** | exit 0, 0 errors — authoritative |
| `npm run test` (vitest) | **PASS** | 259 files / **3193 tests passed**, 31s |
| `npx playwright test e2e/auth/` | **PASS** | 7 passed, 1 skipped (invitation-flow — needs service-role env, expected) |

The contract's intent for `tsc` is "catches `[locale]`-route + exhaustive-switch issues" — both `next build` and source-only tsc are clean. The raw-command noise is an environmental Next 16 dev-server artifact, not a code defect (NIT-1).

---

## Per-criterion verdict

| # | Success Criterion | Verdict | Evidence |
|---|-------------------|---------|----------|
| 1 | Every user-facing string in login/** + complete-profile/** from `messages/*.json`; no hardcoded NO literals | **PASS** | grep for æøå literals + bare label/aria/JSX-text props → only hit is `<label>Website</label>` honeypot inside `aria-hidden`/`display:none` (intentionally EN, anti-bot). All 8 login + 5 onboarding error codes + all labels routed via `t()`. |
| 2 | Norwegian output byte-identical; existing tests pass WITHOUT modification | **PASS (w/ justified deviation)** | NO catalog strings diffed byte-for-byte against `ea7c275` originals — identical (incl. instructionPrefix+suffix recompose `Skriv inn koden vi sendte til {email}.`). `SendCodeForm.test.tsx` passes unmodified via the vitest `useTranslations` stub resolving keys → `no.json`. **Deviation:** `login.spec.ts` + `playwright.config.ts` WERE modified (commit 7f7bf88) — justified, see SHOULD-NOTE-1/2. |
| 3 | `en.json` covers full slice, idiomatic; no raw key visible in either locale on any login/profile route incl. error states | **PASS** | Runtime probe: `/login?error=bogus` → "Noe gikk galt", `/en/login?error=bogus` → "Something went wrong", no `auth.errors`/`errors.unknown` in body. EN catalog idiomatic (`Sett i gang`→"Let's go", not "Set in motion"; "you're good to go"). `getMessageFallback` renders last segment even on a both-catalog miss — defense in depth. |
| 4 | Login switcher; EN pre-auth → `/login`→`/en/login` (params preserved), NEXT_LOCALE 1y, copy + `<html lang>` flip; reload keeps EN | **PASS** | `language-switch.spec.ts` golden path green (URL, `<html lang="en">`, "Send me a code", reload-persist, switch-back→`/login` not `/no/login`). Params: separate runtime probe — `/login?step=verify&email=…&next=%2Fhjem` → `/en/login?step=verify&email=…&next=%2Fhjem`, all 3 survive. Cookie attrs (`path:/`, `maxAge:60*60*24*365`, `sameSite:lax`, name `NEXT_LOCALE`) **byte-match proxy.ts lines 141-143**. |
| 5 | Profil «Språk»-row; logged-in switch updates BOTH users.locale + cookie, redirects locale-correct | **PASS (code-review)** | `profile/page.tsx` adds inline `<LocaleSwitcher>` row keyed `profile.languageRowLabel`. `setLocale` sets cookie unconditionally + best-effort `update users set locale` when `auth.getUser()` returns a user, then `redirect({href, locale})`. Matches design §4. |
| 6 | `verifyCode` persists cookie-locale to users.locale when NULL (non-blocking) | **PASS (code-review)** | `actions.ts:199-223`: own try/catch (logs `[login/verifyCode] locale-persist threw`, never blocks); validates cookie against `routing.locales`; `.is('locale', null)` guard = NULL-only, never overwrites; positioned after session established, before final `redirect(next)`. |
| 7 | `language-switch.spec.ts` passes (golden path + negotiation) | **PASS** | 3 tests green: golden path, en-GB Accept-Language→EN, nb-NO→NO. |
| 8 | MINOR bump + CHANGELOG per conventions | **PASS** | `1.112.7`→`1.113.0` (MINOR). CHANGELOG: 3-layer (theme + tagline blockquote + Teknisk details), prev `1.112.y` re-wrapped in `<details>`. Bump+CHANGELOG in the SAME commit as the feat (`d391be3`), `Refs #552`. Extraction commits correctly typed `refactor(...)`. |

---

## Edge cases & guardrails probed

- **Search-param survival** — runtime-verified (probe): `?step=verify&email=…&next=%2Fhjem` preserved through EN switch, encoding intact.
- **Unknown `?error=`** — runtime-verified: → `unknown` copy, no raw key (both locales).
- **No session in setLocale** — code: cookie set unconditionally; DB update gated on `auth.getUser()` user; no throw.
- **users.locale never overwritten at login** — code: `.is('locale', null)` guard; explicit Profil toggle is the only overwrite path (`setLocale` does unconditional update — intended).
- **Default-locale URLs unprefixed** — golden path asserts switch-back lands `/login`, never `/no/login`.
- **setLocale input validation** (public action) — `locale` validated vs `routing.locales`→default fallback; `pathname`/`search` String-coerced. **Open-redirect probe:** injected `pathname=https://evil.example.com/phish` → redirect landed `/en/login`, host stripped by next-intl `isLocalizableHref` (protocol-bearing href rejected). No phishing vector.
- **vitest.setup.ts** — ADDED `useTranslations` stub (resolves keys → `no.json`), kept `useLocale:()=>'no'`, still spreads `...actual`, `next/navigation` mock untouched. **No existing stub weakened.**

---

## Issues found

### SHOULD-NOTE-1 — `login.spec.ts` heading assert modified, but justified
Contract says existing tests pass unmodified; commit 7f7bf88 changed `e2e/auth/login.spec.ts:22` from `heading 'Logg inn'` → `heading 'Tørny'`. **Verified the original was ALREADY BROKEN at base:** ran `ea7c275`'s `login.spec.ts` verbatim → the `'Logg inn'` assert FAILS ("element(s) not found"). The `Logg inn` h1 was dropped in `db8b73e` (2026-05-12, "swap BrandMark for BrandHero"); BrandHero renders `<h1>Tørny</h1>`. The assertion has been dead on main for ~1 month. Fixing it to assert the actually-rendered heading is correct, not papering over a regression. Documented inline + in commit body. **Not blocking.**

### SHOULD-NOTE-2 — `playwright.config.ts` adds `locale: 'nb-NO'`, but justified
This phase is the first time `/en/login` shows real EN copy (Phase 0 had an empty `en` catalog). A CI runner with en-US OS locale would now negotiate English and break the Norwegian-asserting smoke tests. Pinning the baseline context to `nb-NO` (negotiation specs override with their own contexts) is a direct, correct consequence of shipping this feature. Documented inline. **Not blocking.**

### NIT-1 — raw `npx tsc --noEmit` exits non-zero on dev artifacts
`tsconfig.json` includes `.next/dev/types/**/*.ts`; the Next 16 dev server generates `routes.d.ts`/`validator.ts` in a format bare `tsc` misparses (94 TS1005/TS1128 errors, all in `.next/dev/`, gitignored, regenerated). Source-only tsc is clean; `next build` is clean. Pre-existing tooling quirk, unrelated to this work — but the literal gate command is red. Consider excluding `.next/dev` from the typecheck include or documenting the noise. **Not blocking** (authoritative type-check via `next build` passes).

### NIT-2 — search-param preservation has no committed regression test
The contract's headline edge case (`?step=verify&email=…&next=…` survival) is verified by code review + my throwaway runtime probe, but `language-switch.spec.ts` does NOT assert it. The mechanism is sound and proven at runtime today; a one-line URL assert in the golden path would lock it against future next-intl regressions. **Not blocking** — contract explicitly accepts code-review evidence for the non-golden paths.

---

## Final verdict: **ACCEPT**

All 8 success criteria PASS. All gates pass (raw tsc noise is an env artifact; source + build are clean). Two test-infra modifications deviate from the "unmodified" clause but are independently verified as fixes to a month-old dead assertion and a necessary consequence of the feature — not regressions. Norwegian output is byte-identical, English is idiomatic, no raw-key leaks, search params + cookie attrs + NULL-only persistence + open-redirect safety all verified. Worktree clean.
