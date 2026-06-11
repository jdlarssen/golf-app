# Spec: i18n Fase 1 — Pilot: login/auth-strenger + språkvelger (no/en) — #552

> **Type:** Phase contract under epic #60 (master spec:
> `.forge/contracts/60-engelsk-ui-i18n.md`, also posted on #60). Phase 0
> (#475, PR #542) shipped the plumbing. This phase is the vertical slice that
> proves catalogs, routing, negotiation, persistence and `<html lang>`
> end-to-end — and ships the first user-visible i18n feature (MINOR).

## Problem

The i18n foundation is live but invisible: `messages/{no,en}.json` contain only
`common.appName`, every auth string is still hardcoded Norwegian, and there is
no way for a user to choose a language (confirmed: no locale-switch UI or
`users.locale`-writing action exists anywhere). The proxy negotiates locale on
first visit, but a user can never override it.

## Owner Decisions (2026-06-11)

1. **Login page gets a visible pre-auth language switcher** — a discreet
   Norsk/English control. An English-speaking guest on a Norwegian device must
   be able to switch before logging in.
2. **The English option is labelled plain «English»** — no "(beta)" marker,
   despite the rest of the app staying Norwegian until Phases 2–N.

## Inherited Architecture (locked — do not re-litigate)

- next-intl, `localePrefix: 'as-needed'` (`/login` = no, `/en/login` = en).
- Negotiation: `users.locale` → `NEXT_LOCALE` cookie → `Accept-Language` → `no`.
  Proxy reads DB **only on cookie-less requests**; cross-device staleness is
  accepted. **Phase 1's toggle must update BOTH DB and cookie** (proxy.ts
  comment line ~84 promises this).
- Catalogs: `no.json` is source of truth, deep-merged under the active locale
  in `i18n/request.ts` — missing `en` key renders Norwegian, never a raw key.
- Navigation primitives (`Link`, `redirect`, `usePathname`, `useRouter`) come
  from `i18n/navigation.ts`, NOT `next/link`/`next/navigation`.
- `revalidatePath` call-sites import from `lib/i18n/revalidateLocalePath.ts`.
- Catalog conventions per `messages/README.md`: top-level key = feature area,
  English camelCase key names, named for meaning not position, ICU syntax.

## Design

### 1. String extraction — login slice (`auth` namespace)

Move every user-facing string to `messages/no.json` under `auth`, render via
`getTranslations`/`useTranslations`. Inventory (from scout, verify on read):

- `app/[locale]/(auth)/login/page.tsx` — `ERROR_MESSAGES` map (8 codes:
  `rate_limited`, `user_not_found`, `invite_expired`, `disposable_email`,
  `code_invalid`, `code_expired`, `link_expired`, `unknown`) →
  `auth.errors.<code>`. Keep a typed known-codes lookup so an unexpected
  `?error=` value falls back to `auth.errors.unknown`, never a raw key.
- `SendCodeForm.tsx` — pending heading, `E-post` label, self-reg helper, button
  `Send meg kode`, footer note.
- `VerifyCodeForm.tsx` — pending heading, instruction with interpolated email
  (ICU `{email}`), `Kode` label, button `Logg inn`, resend prompt + link,
  local Spinner `aria-label`.

### 2. String extraction — complete-profile slice (`onboarding` namespace)

- `app/[locale]/complete-profile/page.tsx` — kicker, h1, sub-heading, input
  labels + hints, fieldset legends (`Kjønn`, `Spillerklasse`), radio labels,
  submit + pending labels, `ERROR_MESSAGES` (5 codes) → `onboarding.errors.*`.
- `app/[locale]/complete-profile/OnboardingHcpField.tsx` — label, aria-label,
  helper texts.
- Radio labels (`Herre`/`Dame`, `Junior`/`Voksen`/`Senior`) are UI copy →
  translate. Submitted **values** are unchanged enum codes.

**Norwegian output must stay byte-identical** — extraction is a refactor of
where strings live, not a copy edit. Existing component/E2E tests that assert
Norwegian copy must pass unmodified.

### 3. `LocaleSwitcher` component (shared, client)

One component used on both surfaces, e.g. `components/LocaleSwitcher.tsx`:

- Renders the available locales from `routing.locales` as a small segmented
  control — labels are **endonyms**, identical in both catalogs: «Norsk»,
  «English». Carries `data-testid="locale-switcher"` (+ per-option testids)
  for E2E.
- On select: calls the `setLocale` server action (below). Pass the current
  pathname (from `i18n/navigation.ts` `usePathname`) **and current search
  params** (`useSearchParams`) so the redirect lands on the same page —
  `/login?step=verify&email=…&next=…` must survive a language switch.
- Placement login: between `BrandHero` and the `Card` or under the Card —
  discreet, builder's visual call, tap targets ≥44px.
- Placement Profil: a «Språk»-row in the existing `SettingList` («Konto og
  mer») on `app/[locale]/profile/page.tsx`, following the `InstallButton`
  precedent for non-navigation rows (no sub-page — 2 options don't justify
  one; Phase G may convert to a sub-page when gd/ga arrive). Row label keys
  live under `profile.*`.

### 4. `setLocale` server action (single shared action)

`'use server'` module (suggested: `lib/i18n/localeActions.ts` or co-located
`app/`-side — builder's call, but ONE action shared by both surfaces):

1. Validate input against `routing.locales` (reject anything else — this is a
   public action).
2. Set `NEXT_LOCALE` cookie: 1 year, `sameSite: 'lax'`, `path: '/'` (mirror
   proxy.ts values).
3. If a Supabase session exists: `update users set locale = <locale>` for the
   current user. No session → skip silently (pre-auth switch).
4. `redirect` to the locale-correct version of the passed pathname + search
   params via `i18n/navigation.ts` `redirect({href, locale})` so `as-needed`
   prefixing is applied correctly (`/en/login` ↔ `/login`).

### 5. Persist negotiated locale at login

In `verifyCode` (login `actions.ts`), after successful session establishment:
if the user row's `locale` IS NULL and the request's resolved locale (from
`NEXT_LOCALE` cookie) is a valid supported locale, persist it to
`users.locale`. Covers the "switched to English pre-auth, then registered"
path so the choice follows the user cross-device. Best-effort: a failure here
must not block login (log + continue). Do NOT overwrite a non-NULL locale.

### 6. E2E (Type D, one spec file)

`e2e/auth/language-switch.spec.ts`, smoke-style (no Supabase env needed):

1. **Golden path:** goto `/login` → Norwegian copy visible (`Send meg kode`) →
   click English in switcher → URL becomes `/en/login`, copy flips (`Send me a
   code` or final EN copy), `<html lang="en">` → `page.reload()` → still
   English (cookie persisted).
2. **Negotiation:** fresh context with `locale: 'en'` (Playwright context
   option sets `Accept-Language`) → goto `/login` → English. Fresh context
   `locale: 'nb-NO'` → Norwegian.
3. Switcher interaction via `data-testid`; language assertions on copy are the
   point of the test (the no-copy-assert rule yields here — the copy IS the
   feature). Keep assertions to 1–2 strings per language.

Authenticated DB-persistence E2E is NOT required (no stable auth fixture);
the `users.locale` write is verified by code review + the action's co-located
unit coverage if any (do not build a new test rig for it).

## Edge Cases & Guardrails

- **Search params survive switching** — especially `?step=verify&email=`
  mid-login and `?next=` deep-link returns.
- **Unknown `?error=` code** → `auth.errors.unknown`, never a raw key.
- **No session during `setLocale`** → cookie-only, no error.
- **`users.locale` never overwritten** by the login-time persistence (only
  NULL → value); the explicit Profil toggle is the only overwrite path.
- **Default-locale URLs stay unprefixed** — switching back to Norsk from
  `/en/login` must land on `/login`, not `/no/login`.
- **Existing tests** — `e2e/auth/login.spec.ts`, `e2e/profile/profile.spec.ts`
  and any component tests assert Norwegian copy; they must stay green
  unmodified (byte-identical Norwegian output).
- **humanizer** on any NEW Norwegian strings (the «Språk»-row label etc.);
  idiomatic-English pass on the full `en` catalog (no stiff word-for-word
  translations — e.g. `Sett i gang` ≠ "Set in motion").
- **vitest setup stubs `useLocale() → 'no'`** — components using
  `useTranslations` need the provider or the global stub extended; keep the
  full suite green without weakening existing stubs.

## Key Decisions

- Pre-auth switcher on login: **yes** (owner).
- «English» without beta-marker (owner).
- Profil setting = inline row in SettingList, no sub-page (Claude, UX call).
- `onboarding` as new namespace for complete-profile (Claude; `auth` reserved
  for the login flow itself).
- Login-time NULL-only persistence of negotiated locale (Claude).
- BrandHero tagline stays Norwegian — brand-canonical, owner decision pending
  in a later phase.

**Claude's Discretion:** exact file placement of action/component, visual
styling of the switcher, key naming within the namespaces.

## Success Criteria

- [x] Every user-facing string in `app/[locale]/(auth)/login/**` and
      `app/[locale]/complete-profile/**` renders from `messages/*.json`; grep
      shows no remaining hardcoded Norwegian UI literals in those files.
- [x] Norwegian output is unchanged: all existing tests (unit + e2e smoke)
      pass WITHOUT modification.
- [x] `messages/en.json` covers the full slice with idiomatic English; no raw
      catalog key visible in either locale on `/login`, `/en/login`,
      `/complete-profile`, `/en/complete-profile` (incl. all error states).
- [x] Login page shows the Norsk/English switcher; selecting English pre-auth
      redirects `/login` → `/en/login` (params preserved), sets `NEXT_LOCALE`
      (1y), copy + `<html lang>` flip; reload keeps English.
- [x] Profil has the «Språk»-row; switching while logged in updates BOTH
      `users.locale` and the cookie, and redirects to the locale-correct path.
- [x] `verifyCode` persists the cookie-locale to `users.locale` when NULL
      (code-review evidence; non-blocking on failure).
- [x] `e2e/auth/language-switch.spec.ts` passes locally (golden path +
      negotiation).
- [x] MINOR version bump + CHANGELOG entry per `docs/changelog-conventions.md`.

## Gates (per chunk)

- [x] `npm run build` (catches `[locale]`-route + exhaustive-switch issues).
- [x] `npx tsc --noEmit`.
- [x] `npm run test` (full vitest — suite is stable post-#506; co-located rule
      satisfied a fortiori).
- [x] `npx playwright test e2e/auth/` locally (new spec + existing smoke).
- [x] Version bump + CHANGELOG in the same commit as the user-visible change
      (commit-msg hook enforces; extraction-only commits may be `refactor`).

## Files Likely Touched

- `app/[locale]/(auth)/login/page.tsx`, `_components/SendCodeForm.tsx`,
  `_components/VerifyCodeForm.tsx`, `actions.ts`
- `app/[locale]/complete-profile/page.tsx`, `OnboardingHcpField.tsx`
- `app/[locale]/profile/page.tsx` (Språk-row)
- `components/LocaleSwitcher.tsx` (new)
- `lib/i18n/localeActions.ts` (new, or builder's placement)
- `messages/no.json`, `messages/en.json`
- `e2e/auth/language-switch.spec.ts` (new)
- `package.json`, `package-lock.json`, `CHANGELOG.md`
- (possibly `vitest.setup.ts` if the translation provider needs a global stub)

## Out of Scope

- All other app surfaces (Phases 2–N), DB format content (D), mail (M), gd/ga
  (G). OTP mail stays Norwegian — known interim state, resolved in Phase M.
- BrandHero tagline translation (brand decision, later).
- Localized route slugs, `hreflang` metadata.
- Auth-fixture E2E rig for DB persistence.
