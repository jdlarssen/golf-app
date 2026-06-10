# Spec: Engelsk versjon av all UI-tekst (i18n-fundament) — EPIC #60

> **Type:** Epic master-spec. This document is the truth-anchor for the whole
> internationalization effort. It is NOT one PR. It defines the architecture
> once, then decomposes into a Foundation phase, a pilot vertical slice, and a
> set of per-area rollout phases — each its own issue + PR, executed via
> `superpowers:subagent-driven-development`.

## Problem

Tørny is Norwegian-only. Every user-facing string is hardcoded `nb-NO`: ~366 of
485 source files contain Norwegian copy, dates/numbers are formatted `nb-NO` in
~24 places, `app/layout.tsx` and `app/manifest.ts` hardcode `lang="nb-NO"`, and
a meaningful slice of copy lives in **Postgres** (the `formats` table:
`display_name`, `short_description`, `rules_summary/points/long/example`) plus
12 Resend mail templates and the Supabase Auth OTP mail.

There is **no i18n infrastructure** — no `next-intl`, no message catalogs, no
locale negotiation, no `locale` column on `users`. Adding even one language
today means a re-architecture, not a translation pass.

Three open issues want languages: **#60 (English), #61 (Swedish/Danish/Finnish),
#455 (Scottish Gaelic + Irish)**. They are the same problem. Building #60 as a
true N-locale framework is what makes them cheap — "drop a catalog + translate
the DB rows," not "re-plumb the app." So #60's real deliverable is **the i18n
foundation**, with English as the first locale that proves it.

**Locale scope of this epic (user decision):** `no` (default), `en`, **plus
`gd` (Scottish Gaelic) + `ga` (Irish) — folding #455 in.** Sequenced: framework
+ **English first** (production quality, sanity-checkable), **then** `gd`/`ga`
as a follow-on translation phase. `gd`/`ga` are **machine drafts I produce,
shipped best-effort and marked as draft** — they are low-resource languages I
cannot guarantee idiomatic, and end users can't verify them, so they carry a
visible "beta/utkast" marker and get corrected as feedback arrives. #61 (Nordic)
stays out — it's the future one-line-add that proves the framework generalizes.

## Research Findings

- **next-intl is the de-facto i18n library for Next.js 16 App Router.** Next's
  own built-in i18n routing config is App-Router-incompatible; next-intl is the
  recommended path. Source: [next-intl docs](https://next-intl.dev/docs).
- **Routing strategies (next-intl `localePrefix`):**
  - `always` — every locale prefixed (`/no/...`, `/en/...`); breaks all existing
    Norwegian links.
  - **`as-needed`** — default locale unprefixed (`/finn-turneringer` stays
    exactly as today), non-default prefixed (`/en/finn-turneringer`).
  - `never` — no prefix, locale from cookie only ("without i18n routing");
    documented sharp edges: every page that reads the locale cookie becomes
    dynamic, so **no per-locale static rendering** — a permanent ceiling on
    "fast." Source: [without-i18n-routing](https://next-intl.dev/docs/getting-started/app-router/without-i18n-routing),
    locale-switch caveats in [issue #1334](https://github.com/amannn/next-intl/issues/1334).
- **Next.js 16 middleware is `proxy.ts`** (not `middleware.ts`). next-intl's
  `createMiddleware(routing)` must be composed with the existing Supabase
  session-refresh logic in one `proxy` function. Source: [middleware docs](https://next-intl.dev/docs/routing/middleware).
- **Static rendering per locale** is available via `setRequestLocale()` +
  `generateStaticParams()` returning all locales — only with URL routing, not
  with the cookie-only mode.
- **Arbitrary BCP-47 locales** (`gd` Gaelic, `ga` Irish, `sv`/`da`/`fi`) are
  fully supported by next-intl + the ICU `Intl` APIs — confirms the framework
  scales to #61/#455 without code changes.

## Prior Decisions (carried forward)

- **CLAUDE.md collaboration model:** I write all code/SQL/migrations; the user
  executes anything in a third-party UI (Supabase Dashboard, Vercel, Resend).
  → Supabase Auth mail templates live in the Dashboard, so EN auth-mail copy is
  delivered by me but pasted by the user.
- **CLAUDE.md test-discipline:** Type A (pure logic) for formatting + locale
  negotiation; Type B (one snapshot lock per template, extended per-locale) for
  mail; one Type D golden-path E2E for the language switch; no Type C bloat.
- **CLAUDE.md version/CHANGELOG:** plumbing-only commits = `refactor`/`chore`
  (no bump); every user-visible string rollout = MINOR bump + CHANGELOG entry.
- **CLAUDE.md humanizer/no-nb:** translation direction here is NO→EN, so `no-nb`
  does **not** apply; English target copy gets an idiomatic-English pass. The
  `humanizer` skill still applies to any *new Norwegian* strings touched.
- **`lib/games/status.ts` pattern** (`STATUS_LABELS` as single source of truth):
  the same "centralize the strings, render from a map" instinct is what message
  catalogs formalize app-wide.
- **`getGameWithPlayers` caching** (`unstable_cache` + `game-${id}` tag): locale
  must become part of any cache key for locale-dependent cached content (DB mode
  content via `getModeContentMap`, format mapping via `getFormatsForIntent`).

## Design

### Architecture decisions (locked)

1. **Library:** `next-intl`.
2. **Routing:** **URL-prefixed with `localePrefix: 'as-needed'`.** This is the
   answer to "stor OG rask + best på lang sikt":
   - Default locale **`no` keeps today's exact URLs** (`/finn-turneringer`,
     `/opprett-spill`, …) — **zero broken shared links, no PWA `start_url`
     change, no slug renaming.**
   - English served under `/en/...`, **statically renderable + CDN-cacheable per
     locale** and `hreflang`-ready (matters for the public surface: landing,
     `/spillformer`, `/legal/*`, `/signup`).
   - Cookie-only mode was considered and rejected: it forces every
     locale-dependent page dynamic (no static render) — a permanent speed
     ceiling, the opposite of the goal.
   - Path **segments stay Norwegian** for both locales initially (mechanical
     `[locale]` wrap, no per-route renaming). `next-intl` `pathnames` config is
     reserved to localize a few high-value public slugs later — out of scope here.
3. **Locales config:** `routing.ts` with `locales: ['no', 'en', 'gd', 'ga']`,
   `defaultLocale: 'no'`, `localePrefix: 'as-needed'`. English ships first; `gd`
   and `ga` are added in a later phase as draft catalogs. The array is designed
   so adding `'sv'`/`'da'`/`'fi'` (#61) later is a one-line edit + a new catalog
   + DB translations — **no other code change.** `gd`/`ga` carry a draft/beta
   marker in the language switcher (see Guardrails). This N-locale readiness is
   an explicit success criterion — and `gd`/`ga` are its live proof.
4. **Locale negotiation (precedence):** `users.locale` (once known) → `NEXT_LOCALE`
   cookie → `Accept-Language` header → `defaultLocale 'no'`. Auto-detect on first
   visit; manual override in Profil persists to `users.locale` + cookie so it
   follows the user across devices.
5. **Catalogs:** `messages/no.json` + `messages/en.json`, namespaced by feature
   area (`auth`, `wizard`, `leaderboard`, `holes`, `admin`, `klubb`, `liga`,
   `profile`, `common`, …). ICU message syntax for plurals/interpolation.
6. **DB-driven content (user chose "include everything"):** a locale-keyed
   **`format_translations`** table (or JSONB `translations` column on `formats`),
   `(format_id, locale, display_name, short_description, rules_summary,
   rules_points, rules_long, rules_example)`, read locale-aware by
   `getModeContentMap`/`getFormatsForIntent` with fallback to the
   default-locale row. Per-locale **columns** (`display_name_en`) are explicitly
   rejected — they don't scale to #61/#455's many languages.
7. **Mail (user chose "include everything"):** the 12 Resend templates in
   `lib/mail/` take a `locale` arg (recipient's `users.locale`) and render the
   right catalog. Supabase Auth OTP mail is a **Dashboard-config task**: I
   deliver EN templates, the user pastes them. Flag the constraint — Supabase
   Auth has limited per-recipient-locale template selection; the realistic
   outcome is bilingual auth mail or NO-default auth mail, decided in Phase M.
8. **Formatting:** one locale-aware util (`lib/i18n/format.ts`) wrapping
   `Intl.DateTimeFormat`/`Intl.NumberFormat`, replacing all ~24 hardcoded
   `nb-NO` call-sites. `<html lang>` + manifest `lang` become locale-derived.

### Phase breakdown (each phase = its own issue + PR)

> Foundation and the pilot prove the architecture before the bulk extraction
> starts. Rollout phases are parallelizable once Foundation lands.

- **Phase 0 — Foundation (plumbing; `refactor`/`chore`, no user-visible change).**
  Install next-intl. Wrap `app/*` under `app/[locale]/` (mechanical `git mv`).
  `i18n/routing.ts` + `request.ts` + `navigation.ts`. Compose next-intl
  middleware into `proxy.ts` (resolve locale + redirect *before* Supabase
  session refresh; merge cookies/headers into one response; update the matcher).
  `users.locale` migration + negotiation precedence. Locale-aware `<html lang>`
  + manifest. `lib/i18n/format.ts` + migrate the ~24 `nb-NO` sites. Empty-but-
  wired `messages/{no,en}.json`. **Guard:** lint script / ESLint rule that flags
  new hardcoded user-facing literals in `app/**`/`components/**` (prevents
  regression during the long rollout).
- **Phase 1 — Pilot: Login/Auth + language toggle (vertical slice, MINOR).**
  Extract every string in `app/(auth)/login`, `complete-profile`, and build the
  **Profil language toggle** + first-visit `Accept-Language` detection +
  persistence. Populate `no.json`/`en.json` for this slice. One Type D E2E:
  switch language → UI flips → reload → choice persists. This proves catalogs,
  routing, negotiation, persistence, and `<html lang>` end-to-end.
- **Phases 2–N — Per-area content extraction (each MINOR, parallelizable):**
  (a) Core loop — game-home, holes/scorekort, leaderboard + podiums;
  (b) Create flows — wizard, GameForm, CourseForm, opprett-bane/-spill;
  (c) Admin/Sekretariat; (d) Klubb/Liga/Cup; (e) Profile/Friends/innboks/
  finn-turneringer; (f) Reference/public — spillformer, legal, signup landing.
- **Phase D — DB content.** `format_translations` schema + locale-aware reads in
  `getModeContent`/`getFormatsForIntent` (+ locale in their cache keys) + the
  Sekretariat format-editor gaining per-locale fields. Seed EN translations.
  Migration applies **post-deploy** (per memory: format-seed migrations run
  after code ships).
- **Phase M — Mail.** Locale-param the 12 Resend templates + per-locale snapshot
  tests; deliver EN Supabase Auth templates for the user to paste; resolve the
  auth-mail locale constraint.
- **Phase G — Gaelic + Irish (`gd`/`ga`) drafts (last, MINOR).** Add `gd`/`ga`
  to `routing.ts`; machine-draft catalogs from the now-stable `no`/`en` source
  strings + DB `format_translations` rows + Resend mail. Ship best-effort,
  **marked draft** in the language switcher; missing/uncertain keys fall back to
  the default locale. Runs only after English is fully rolled out so the source
  copy is frozen — drafting against a moving target wastes the pass. This phase
  is also the live proof of the N-locale success criterion.

## Edge Cases & Guardrails

- **Existing Norwegian links must not break** — `localePrefix: 'as-needed'`
  guarantees `/finn-turneringer` etc. stay valid (default locale unprefixed).
  Verify a sample of deep links + the PWA `start_url: '/'` after Phase 0.
- **proxy.ts composition order** — locale resolution/redirect must run before
  (or be merged with) Supabase `getUser()`; the auth-gate redirect to `/login`
  must preserve the resolved locale and the `?next=` back-link. The `x-torny-user-id`
  header + `last_seen_at` fire-and-forget must still work.
- **Missing translation keys** — fall back to default-locale (`no`) string, never
  render the raw key or empty. next-intl `getMessageFallback` configured.
- **DB content with no translation row** — fall back to the default-locale row
  (mirrors the existing `MODE_GUIDE` code-fallback in `mergeModeContent`).
- **User data is never translated** — course names, player names, club names,
  free-text are user content, not UI; leave untouched.
- **Cache poisoning across locales** — any `unstable_cache` returning
  locale-dependent content must include locale in its key/tag, or a `no` user
  could serve `en` content and vice-versa.
- **Number/date parsing, not just formatting** — handicap/score inputs: ensure
  input parsing isn't accidentally locale-broken (e.g. decimal comma vs point).
- **Supabase Auth mail** — may not support per-recipient locale selection; do
  not promise localized OTP mail until Phase M confirms the mechanism.
- **Reduced-motion / SW** — hand-rolled `public/sw.js` caches per-URL, so
  `/en/...` caches naturally; confirm no hardcoded NO route list in the SW.
- **`gd`/`ga` are explicitly draft** — the language switcher labels them with a
  beta/utkast marker (e.g. `Gàidhlig (beta)`, `Gaeilge (beta)`) so users know
  the copy is machine-drafted and may be wrong. Any untranslated `gd`/`ga` key
  silently falls back to the default locale, never a raw key. `gd`/`ga` are NOT
  candidates for `Accept-Language` auto-detect on first visit (avoid dropping an
  unsuspecting Irish browser into draft copy) — they're reachable via the manual
  toggle; auto-detect covers `no`/`en` only.
- **`gd`/`ga` auth mail** — Supabase Auth's per-locale limits are even tighter
  for low-resource locales; OTP mail realistically stays `no`/`en`, with `gd`/`ga`
  recipients getting the default-locale auth mail. Acceptable given draft status.

## Key Decisions

- **Scope = full epic in phases** (user) — Foundation + pilot + per-area rollout
  + DB + mail, not one PR.
- **URL routing, `localePrefix: 'as-needed'`** (my call, per "big AND fast +
  long-term") — static-renderable per locale, hreflang-ready, **and** keeps all
  existing Norwegian URLs untouched. Cookie-only mode rejected (static-render
  ceiling).
- **N-locale framework, not EN/NO toggle** (forced by #61 + #455) — adding a
  language must be catalog + DB rows only. This is a north-star criterion.
- **Auto-detect + Profil toggle, persisted to `users.locale`** (user) — auto-
  detect limited to `no`/`en`; `gd`/`ga` are manual-toggle only.
- **DB content via locale-keyed translations table, not per-locale columns**
  (my call) — scales to many languages.
- **Include all mail** (user) — Resend per-recipient locale in-repo; Supabase
  Auth mail delivered as Dashboard copy (`no`/`en`; `gd`/`ga` fall back).
- **#455 (Gaelic + Irish) IS in scope** (user) — sequenced after English as a
  final draft phase. **English first, then `gd`/`ga`** (user) — source copy must
  be frozen before drafting low-resource languages.
- **`gd`/`ga` = machine drafts, best-effort, marked draft** (user) — accept
  lower quality, correct from feedback; visible beta marker protects users who
  can't verify. (Recommend giving #455 a milestone — it currently has none.)
- **#61 (Nordic) stays out** — the future one-line-add that proves the framework
  generalizes beyond what we built for.

**Claude's Discretion:**
- Catalog namespace granularity and key naming convention.
- JSONB-column vs separate-table for `format_translations` (decide at Phase D
  against the format-editor's update ergonomics).
- Exact lint mechanism for the hardcoded-string guard.
- Whether the public/marketing surface gets `hreflang`/`alternates` metadata in
  the rollout or a follow-up.

## Success Criteria

- [ ] **Foundation:** app builds + runs under `app/[locale]/`; every existing
      Norwegian URL still resolves (no `/no` prefix); `npm run build` green.
- [ ] **N-locale proof:** adding `gd`/`ga` (and, as a stub check, a hypothetical
      `'sv'`) to `routing.ts` requires only the array edit + a catalog file — no
      other code change compiles/runs. `gd`/`ga` going live is the live proof.
- [ ] **Gaelic/Irish drafts (Phase G):** `gd`/`ga` selectable from the toggle,
      labelled draft/beta; UI renders the drafted strings with default-locale
      fallback for any missing key; never auto-detected on first visit.
- [ ] **Pilot:** on `/login`, switching language in Profil flips all auth copy
      to English, reloads preserve it, and `users.locale` is updated (observable
      in DB + a passing Type D E2E).
- [ ] **Negotiation:** a fresh browser with `Accept-Language: en` lands on
      English; `no` (or absent) lands on Norwegian; `users.locale` overrides both.
- [ ] **Formatting:** dates/numbers render per active locale (no remaining
      hardcoded `nb-NO` in changed call-sites); covered by Type A tests.
- [ ] **DB content (Phase D):** a format card shows English `display_name` +
      rules under `en`, Norwegian under `no`, with fallback when a row is missing.
- [ ] **Mail (Phase M):** each Resend template renders correct per recipient
      `users.locale`; per-locale snapshot tests pass; EN Auth templates delivered.
- [ ] No untranslated UI string and no raw catalog key visible in any shipped
      phase's surface (spot-check + the lint guard).

## Gates (per chunk)

- [ ] `npm run build` passes (catches the exhaustive-switch / `[locale]` route
      issues that `tsc` alone misses).
- [ ] `npx tsc --noEmit` passes.
- [ ] Co-located `*.test.ts(x)` for changed files pass (per CLAUDE.md gate rule).
- [ ] `npx vitest run lib/i18n lib/mail` for formatting + mail phases.
- [ ] Playwright golden-path E2E for the pilot language switch.
- [ ] Version bump + CHANGELOG entry on every user-visible phase (commit-msg hook
      enforces); plumbing phases use non-bumping prefixes.

## Files Likely Touched

- `package.json` — add `next-intl`.
- `app/[locale]/**` — all routes wrapped (mechanical move) + per-area string
  extraction.
- `app/layout.tsx` / `app/[locale]/layout.tsx` — locale-aware `<html lang>`.
- `proxy.ts` — compose next-intl middleware with Supabase session refresh.
- `app/manifest.ts` — locale-derived `lang`.
- `i18n/routing.ts`, `i18n/request.ts`, `i18n/navigation.ts` — new.
- `messages/no.json`, `messages/en.json` — new catalogs.
- `lib/i18n/format.ts` — new locale-aware date/number util; migrate ~24 sites.
- `lib/formats/getModeContent.ts`, `getFormatsForIntent` — locale-aware reads.
- `supabase/migrations/00XX_users_locale.sql`,
  `00YY_format_translations.sql` — new.
- `lib/mail/*.ts` + `__tests__` — locale param + per-locale snapshots.
- `components/` Profil toggle + language-switcher UI.
- Lint config — hardcoded-string guard.

## Out of Scope

- **Translating into Nordic languages (#61)** — Foundation enables it; the
  translation is a separate one-line-add issue later. (Gaelic/Irish #455 is now
  IN scope as Phase G — see above.)
- **Native-quality / professionally reviewed `gd`/`ga`** — this epic ships
  machine drafts only; a native-review pass is a later, separate effort.
- **Localizing route slugs** (`/en/find-tournaments`) — `pathnames` config
  reserved for later; segments stay Norwegian for both locales now.
- **Translating user data** (course/player/club names, free text).
- **RTL languages / full bidi** — not needed for Latin-script locales.
- **A translation-management UI / TMS integration** — catalogs are edited in-repo.
- **Marketing/SEO `hreflang` polish** — may land in rollout or a follow-up
  (Claude's Discretion).
