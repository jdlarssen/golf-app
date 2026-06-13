# Spec: i18n Fase 2f — offentlig/referanse-flate — #581

> **Type:** Phase contract under epic #60 (master spec:
> `.forge/contracts/60-engelsk-ui-i18n.md`, also posted on #60). Phase 0
> (#475) shipped plumbing, Phase 1 (#552) the pilot, 2a (#554) the core game
> loop, 2b (#561) the create flows, 2c (#563) the Sekretariat, 2d (#566)
> klubb/liga/cup, 2e (#573) the personal surface. **This is the LAST UI-string
> extraction phase.** After it, only Phase D (DB format content), Phase M
> (mail) and Phase G (gd/ga) remain. It covers the **public/reference
> surface** — the home screen chrome, the spillformater reference, the privacy
> page and the whole self-registration flow.

## Problem

An English user can play, create, manage, and use their personal surface in
English — but the moment they land on the home screen, browse the game-format
reference, read the privacy policy, or follow a self-registration link, the UI
is Norwegian. ~140–160 hardcoded Norwegian UI literals remain across these
four surfaces, plus two pre-existing i18n-correctness bugs on the home screen
(a date pinned to `'no'`, status labels read from a Norwegian code constant
instead of the catalog) and one open bug in the signup page ordering (#559).

## Research Findings (scout 2026-06-13)

- **Home `app/[locale]/page.tsx`** (~14 chrome strings): success banners
  («✓ Profilen din er oppdatert.», «✓ «{name}» er slettet.»), empty-state
  block (Kicker «KLUBBHUSET ER ÅPENT», «Velkommen, {name}.», two discovery-
  conditional paragraphs, LinkButton «Åpne Klubbhuset», PullQuote «En god
  runde begynner med god planlegging.»), greeting «Hei, {name}.» (fallback
  `'spiller'` in two places), section labels («Pågår nå», «Mine spill», «Finn
  turneringer», «Avsluttede spill»), the discover card «Se åpne turneringer du
  kan bli med i», and the `kl. ` tee-off separator. The shared
  `HomeDiscoverySection` already migrated in 2e (home gets it free).
  **Two i18n-correctness fixes belong here:** (1) `formatShortDateLocale(g.ended_at, 'no')`
  (line ~357) is hardcoded to `'no'` — finished-card dates show Norwegian
  format even for `en` users → swap to the resolved `getLocale()`; (2)
  `STATUS_LABELS[g.status]` (line ~286, from `lib/games/status.ts`) renders
  Norwegian status text — the `gameStatus` catalog namespace already exists
  with identical Norwegian (`{draft:Utkast, scheduled:Planlagt,
  active:Pågående, finished:Avsluttet}`) → swap to `getTranslations('gameStatus')`.
  `formatTeeOffDate`/`formatTeeOffTime` (legacy nb helpers) on active cards →
  `formatTeeOffDateLocale`/`TimeLocale`. `formatDisplayLabel(game_mode,
  mode_config)` on finished cards composes the variant-aware label from
  `MODE_LABELS` — see §Mode-label decision.
- **Spillformater** (~8 chrome strings, content is DB-driven):
  `spillformater/page.tsx` — metadata title «Spillformater», BackLink «← Hjem»,
  Kicker «SPILLFORMATER», PageHeader title «Spillformater» + subtitle «Trykk på
  et format …». `spillformater/[slug]/page.tsx` — `generateMetadata` (uses
  `MODE_LABELS[mode]` + fallback «Spillformat»), BackLink «← Alle
  spillformater», Kicker «SPILLFORMAT», section headings «Slik fungerer det»,
  «Konkret eksempel». **Boundary (locked):** `merged.summary/points/long/example`
  come from `getModeContentMap` (DB, code-fallback in `mergeModeContent`) =
  **Phase D**, untouched here. The page `label`/metadata use `MODE_LABELS`
  (Norwegian code constant) → swap to the existing `modes.*` catalog (EN
  already present for every mode). `FormatGuideList`/`ModeGuideCard` shared
  component chrome is already in `formatGuide.*` (2b «?»-sheet).
- **Personvern `legal/privacy/page.tsx`** (~25 strings, prose-heavy):
  metadata title «Personvern – Tørny», TopBar `backLabel="Tilbake"`,
  `kicker="Personvern"`, 6 GDPR `<section>`s — each an `<h2>` heading + one or
  more `<p>`/`<ul>` blocks. Inline `<span className="font-medium">` emphasis on
  «Supabase» (§2) and the four rights terms «Innsyn/Retting/Sletting/
  Dataportabilitet» (§5), and a `mailto:` link in §6. Route bypasses the auth
  gate via `proxy.ts` matcher; sits under `[locale]`. **Decision (user):
  translate to English now** (full best-effort). No new namespace collision —
  `legal.*` is new.
- **Signup `signup/[shortId]/**`** (~90–110 strings, the heavy lift):
  - `page.tsx` — metadata «Påmelding – Tørny», TopBar `kicker="Påmelding"`,
    header `MODE_LABELS[game.game_mode]` (→ catalog), tee-off line (already
    locale-aware via `getLocale()`/`formatDate`/`formatTime`), and **~15
    branch banners/intros** in `renderBody` (already-registered, pending-
    request, game-locked with «i gang»/«avsluttet», signups-closed,
    club-member-direct, friend-skip-gate, invite-only ×3 incl. team variant,
    team-unsupported-mode with `MODE_LABELS`, bad-team-size, team-form intro,
    solo open/manual intros). Uses `redirect` from `next/navigation` (lines
    64, 80: `/login?next=…`, `/complete-profile?next=…`) — migrate to
    `@/i18n/navigation` object-form (`notFound` stays on `next/navigation`).
  - `RegistrationForm.tsx`, `TeamRegistrationForm.tsx` — form labels, button
    text, placeholders, side-picker (#544) copy.
  - `teamFormValidation.ts` (pure, Type A, co-located test) — returns Norwegian
    strings («Skriv inn et lag-navn.», «Lag-navnet må være minst {min} tegn.»,
    duplicate/own-email conflicts). Mirror of server rules in `teamActions.ts`.
    → return codes/keys + interpolation args, translate at call-site (see §2).
  - `teamActions.ts`, `actions.ts` — server-action error/redirect maps;
    redirect navigation swap; error codes translated page-side.
  - `registrationTypeView.ts` (pure view-resolver, Type A test) — returns
    a `kind` discriminant, no user copy (verify).
  - `team/TeamDashboardClient.tsx`, `team/page.tsx`, `not-found.tsx` — team
    captain dashboard + 404 copy.
- **Dates:** `lib/i18n/format.ts` already has every helper these pages need
  (`formatTeeOffDateLocale`/`TimeLocale`, `formatShortDateLocale`,
  `formatDate`/`formatTime`, `formatTeeOffLineLocale`) — no new date helper;
  only call-site swaps (home active/finished cards). No new lib date module.
- **#559 (open bug, folded in — user decision):** the logged-out signup smoke
  `e2e/signup/open-register.spec.ts:27` asserts `/signup/abcd1234` →
  `/login?next=%2Fsignup%2Fabcd1234`. `/signup` is in `PUBLIC_PATH_PATTERN`
  (proxy lets it through); `page.tsx` calls `getGameByShortId(shortId)` →
  `notFound()` (line 53–56) **before** the `auth.getUser()` redirect (line
  63–65), so an invalid shortId 404s instead of bouncing to login. **Fix:**
  reorder the auth-check before the game lookup so unauthenticated visitors
  always redirect to `/login` (preserving `?next=`), and `notFound()` only
  fires for authenticated users with a bad shortId. Behavior change → `fix`.
- **Public siblings already clean:** `app/[locale]/invite/**` and
  `app/[locale]/klubber/bli-med/**` return 0 Norwegian-letter literals
  (migrated in 2d/2e). No root `error.tsx`/`not-found.tsx` exist. No other
  un-migrated public route found.

## Inherited Architecture (locked — do not re-litigate)

- next-intl, `localePrefix: 'as-needed'`; `no.json` source of truth,
  deep-merge fallback; conventions per `messages/README.md`;
  `messages/catalogParity.test.ts` enforces full no/en key symmetry.
- vitest stub uses `createTranslator` against real `no.json` — component tests
  assert real Norwegian without a provider.
- **Norwegian output stays byte-identical.** Extraction is a refactor of where
  strings live; existing tests pass without assertion edits (except pure-logic
  signature changes — `teamFormValidation` returning codes — where the test
  adapts to assert codes or stub-translated output, per 2e precedent).
- **TS2589 trap:** translator props always typed
  `ReturnType<typeof useTranslations<'ns'>>` (scoped generic).
- i18n-redirect pattern: `redirect({ href, locale })` from `@/i18n/navigation`
  + `getLocale()`; `notFound` stays on `next/navigation`.
- ICU: literal apostrophes escaped `''`; no HTML in messages — inline emphasis
  via `t.rich` (with a tag→element map at the call-site) or split key-pairs;
  never reuse a key across different word orders.
- rootParams/cacheComponents: no `setRequestLocale`, no new `force-dynamic`,
  PPR route shape (route-summary diff vs origin/main) must hold. Metadata via
  `generateMetadata` + `getTranslations({ locale, namespace })` with explicit
  locale from `await params` (pattern set in 2e on finn-turneringer).
- Locale-aware date helpers live in `lib/i18n/format.ts`.

## Design

### 1. Scope = the public/reference surface

Extract every user-facing string (JSX text, aria-labels, placeholders, button
labels, validation/error/empty/status states, banners, metadata titles) in:

- `app/[locale]/page.tsx` — banners, empty state, greeting, section labels,
  discover card, `kl. ` separator + the two correctness fixes (`'no'`-pinned
  date → `getLocale()`; `STATUS_LABELS` → `gameStatus.*`) + active/finished
  card date helpers → `*Locale`.
- `app/[locale]/spillformater/page.tsx` + `[slug]/page.tsx` — chrome only;
  `MODE_LABELS` → `modes.*`; metadata via `generateMetadata`.
- `app/[locale]/legal/privacy/page.tsx` — full prose, inline emphasis via
  `t.rich`/key-pairs; metadata.
- `app/[locale]/signup/[shortId]/**` — page banners/intros, RegistrationForm,
  TeamRegistrationForm, teamFormValidation (→ codes), teamActions/actions
  (error maps + redirect swap), team dashboard, not-found; `MODE_LABELS` →
  catalog; #559 reorder.

**Namespaces:** new `home.*`, `legal.*`, `signup.*` (incl.
`signup.errors.*`); extend `formatGuide.*` (spillformater page chrome);
reuse existing `gameStatus.*`, `modes.*`, `nav.*`. Exact granularity =
builder's call; keys named for meaning, English camelCase; update
`messages/README.md` namespace list.

### 2. Pure-logic validators (`teamFormValidation.ts`)

Keep the functions pure. Two equivalent shapes (builder's call):
(a) return a discriminated code + interpolation values (e.g.
`{ code: 'teamNameTooShort', min: 3 }`), component maps code → `t(...)`; or
(b) accept a translator/label-bag param. Either way the quota/conflict logic
stays pure and testable. Co-located `teamFormValidation.test.ts` adapts to
assert codes (or stub-translated output) — this is the one allowed assertion
change. Server `teamActions.ts` and client must resolve to the **same**
catalog keys so client inline-feedback and server errors never diverge.

### 3. Server actions

No signature changes to the registration flow: failures stay
`?error=`/`?status=`-redirect-based; pages translate by code. `redirect`
imports migrate to `@/i18n/navigation` object-form with `getLocale()` in every
touched server file (`page.tsx`, `actions.ts`, `teamActions.ts`, team
`page.tsx`). `notFound` stays on `next/navigation`.

### 4. Mode-label decision

`MODE_LABELS` (Norwegian code constant in `lib/scoring/modes/types.ts`) is used
as display chrome on spillformater (title + metadata), signup (header + team-
unsupported banner) and home finished cards (via `formatDisplayLabel`). The
`modes.*` catalog already holds idiomatic EN for every `GameMode`. **Swap chrome
usages to the catalog** (`getTranslations('modes')` server-side / `useTranslations('modes')`
client-side). `MODE_LABELS` the TS constant stays as the type-safe key set; we
just stop using it for *display* in these surfaces. `formatDisplayLabel` (home
finished cards) composes mode label + variant suffix — if it reads `MODE_LABELS`
internally, make it locale-aware (locale/label param) so finished cards show EN
for `en` users; keep variant-suffix logic pure (Type A if it shifts). The
DB-sourced format *content* (summary/points/long/example) stays Phase D.

### 5. Privacy (`legal/privacy`) — full English

Translate all 6 GDPR sections to idiomatic English (GDPR is the same regulation
EU-wide; «personvern@tornygolf.no» mailto stays). Inline emphasis terms render
via `t.rich` (tag→`<span className="font-medium">` map) or term+description
key-pairs — builder's call; no HTML in catalog values. Norwegian stays
byte-identical.

### 6. #559 fix

Reorder `signup/[shortId]/page.tsx`: resolve auth (`auth.getUser()` →
redirect `/login?next=/signup/${shortId}` when no user) **before**
`getGameByShortId` + `notFound()`. Keep the `?next=` round-trip intact. The
logged-out smoke then passes (unauth → `/login` regardless of shortId
validity); `notFound()` fires only for authed users with a bad shortId.
`Closes #559`.

### 7. English catalog

Full idiomatic English for every new key, warm-companion register
(«Meld meg på» → "Sign me up", «Be om å bli med» → "Ask to join", «Påmelding»
→ "Sign-up"/"Registration", «Du melder på et helt lag som kaptein.» → "You're
signing up a whole team as captain.", «Slik fungerer det» → "How it works",
«Konkret eksempel» → "A concrete example", «Velkommen, {name}.» → "Welcome,
{name}.", «Pågår nå» → "In progress", «Avsluttede spill» → "Finished games").
British «organis-» spelling per existing convention. Idiomatic-English review
pass (opus) over the full new `en` surface before evaluation.

## Edge Cases & Guardrails

- **Byte-identical Norwegian:** full vitest suite green; assertion edits only
  in `teamFormValidation.test.ts` (code shape) + any server-action error-map
  test whose signature shifts.
- **ICU args:** «✓ «{name}» er slettet.», «Velkommen/Hei, {name}.», «Lag
  {teamNumber} · Flight {flightNumber}», team-name min/max, «Spillmodusen
  «{mode}» har ikke lag-konsept.» — interpolated; user/game/mode names render
  verbatim (mode name comes from the `modes.*` catalog, not user data).
- **User data untouched:** course/game/team/club/player names render verbatim
  in both locales.
- **`MODE_LABELS` display → catalog; constant stays** (§4). Don't delete
  `MODE_LABELS` (still the type-safe `GameMode` key source); just stop
  displaying it raw in scope surfaces. Verify no remaining raw-`MODE_LABELS`
  *display* in the four surfaces.
- **`STATUS_LABELS` display → `gameStatus.*`** on home; the constant may stay
  for non-display/type use. Verify home is the last *display* consumer in
  `app/**` (others migrated in 2a–2e).
- **No PPR regression:** branch `npm run build` route-summary diff vs
  origin/main = empty aggregate; no new `force-dynamic` (watch the two
  `generateMetadata` additions on spillformater).
- **Privacy auth-gate:** `/legal/privacy` stays publicly reachable (proxy
  matcher) under both locales after extraction.
- **#559 reorder safety:** the auth redirect must keep `?next=/signup/${shortId}`;
  `complete-profile` redirect likewise. Don't regress the club-member /
  friend-skip / invite-only / matchplay-side branches (all run after auth).
- **e2e copy assertions:** `open-register.spec.ts` asserts the Norwegian button
  name «Meld meg på» — byte-identical Norwegian keeps it green (dev server
  renders default `no`). Do NOT refactor those copy assertions (out of scope);
  only the #559 logged-out smoke changes (it asserts a URL, not copy).
- **humanizer:** privacy EN is new copy and the Norwegian is unchanged
  (extraction). Any genuinely NEW Norwegian string → run `humanizer`. The
  privacy EN is a translation from frozen NO → optionally sanity-check with
  `no-nb`/idiomatic-EN pass; primary register check is the opus EN pass.

## Key Decisions

- **2f is the final UI sweep** (master spec) — after it only Phase D/M/G
  remain; English source copy is then frozen for the Gaelic/Irish drafts.
- **Privacy translated now, full English** (user, 2026-06-13) — satisfies the
  «no hardcoded Norwegian» criterion and an EN user gets an EN privacy page;
  best-effort copy acceptable for a club-scale app.
- **#559 folded in, fixed via auth-before-lookup reorder** (user, 2026-06-13)
  — we own signup this phase; removes a known-red playwright gate.
- **`MODE_LABELS`/`STATUS_LABELS` display swaps to existing catalogs**
  (Claude, §4) — the catalogs already hold EN; leftover code-constant *display*
  on home/spillformater/signup is the last gap. Constants kept for typing.
- **Home `'no'`-pinned date + nb tee-off helpers fixed** (Claude) — real
  i18n-correctness bugs surfaced while in scope; in-phase since home is 2f.
- **DB format content (summary/points/long/example), mail, gd/ga out** —
  Phase D/M/G respectively.
- **No new E2E** (Claude, mirrors 2a–2e) — catalog-parity + build +
  byte-identical nb-pinned suite carry verification; #559 reuses the existing
  smoke.

**Claude's Discretion:** namespace granularity & key names; `t.rich` vs
key-pairs for privacy emphasis; `teamFormValidation` code-vs-translator shape;
`formatDisplayLabel` locale-param shape; chunking order.

## Success Criteria

- [ ] **No hardcoded Norwegian UI literals** remain in the §1 scope —
      `grep -rnE '"[^"]*[æøåÆØÅ][^"]*"'` over the four surfaces = 0 user-facing
      hits; common no-words-without-diacritics sweep (Velg/Lagre/Avbryt/Meld/
      Bli med/Tilbake/Påmelding/Personvern/Lag/Flight/…) = 0 hits. User-data
      and DB-content render paths excluded.
- [ ] **Norwegian output unchanged:** full `npm run test` green; assertion
      edits limited to `teamFormValidation.test.ts` (+ any error-map test whose
      signature shifts), documented in the eval.
- [ ] **English coverage:** `catalogParity.test.ts` green; `npm run build`
      exit 0; opus idiomatic EN pass committed.
- [ ] **Mode/status display localized:** spillformater title/metadata, signup
      header + team-unsupported banner, and home finished-card format label
      read `modes.*`; home StatusPill reads `gameStatus.*`; EN users see EN.
- [ ] **Locale-aware dates on home:** finished-card date uses `getLocale()`
      (not `'no'`); active-card tee-off uses `*Locale` helpers.
- [ ] **Privacy fully English:** all 6 sections + emphasis terms + metadata
      have `legal.*` keys in both locales; EN renders idiomatically; route
      still public under both locales.
- [ ] **Signup fully bilingual:** all branch banners, both forms, validation
      (client+server share keys), team dashboard, not-found localized;
      redirects locale-aware.
- [ ] **#559 fixed:** auth-check precedes game lookup; `open-register.spec.ts`
      logged-out smoke passes; `Closes #559`.
- [ ] **PPR shape holds:** branch build route-summary aggregate = main
      baseline; no new `force-dynamic`.
- [ ] **MINOR bump 1.118.0 → 1.119.0** + CHANGELOG series `1.119.y` (prior
      `1.118.y` series wrapped in `<details>`); #559 fix nests under the same
      theme; commit-msg hook passes.

## Gates (per chunk)

- [ ] `npx tsc --noEmit` after every chunk.
- [ ] Co-located `*.test.ts(x)` for changed files after every chunk.
- [ ] `npm run build` after the lib/chrome chunks and before evaluation
      (route-shape diff checked).
- [ ] Full `npm run test` before evaluation.
- [ ] `npx playwright test e2e/signup` before evaluation (worktree needs
      `.env.local` — recreate from Supabase MCP url + anon key if missing, else
      redirect specs fail silently). The #559 logged-out smoke must pass.
- [ ] Version bump + CHANGELOG in the same commit as the user-visible change;
      extraction-only commits use `refactor(...)`; #559 uses `fix(...)`.

## Chunking (builder's order — dependency-first)

1. **Home:** `page.tsx` — `home.*` keys, section/empty/banner extraction,
   `gameStatus.*` + `*Locale` date swaps, `formatDisplayLabel` locale-param.
2. **Spillformater:** both pages — `formatGuide.*` chrome + `modes.*` title/
   metadata; `generateMetadata`.
3. **Privacy:** `legal/privacy/page.tsx` — `legal.*` + EN translation +
   metadata.
4. **Signup core:** `page.tsx` banners/intros + `modes.*` + redirect swap +
   **#559 reorder** (`fix` commit).
5. **Signup forms:** RegistrationForm + TeamRegistrationForm +
   `teamFormValidation` (→ codes) + `teamActions`/`actions` error maps +
   team dashboard + not-found.
6. **English idiomatic pass (opus) + feat-commit:** MINOR bump + CHANGELOG +
   `messages/README.md` touch-up.

## Files Likely Touched

- `messages/no.json`, `messages/en.json` — new `home`/`legal`/`signup`
  namespaces; `formatGuide` extension
- `app/[locale]/page.tsx`
- `app/[locale]/spillformater/page.tsx`, `[slug]/page.tsx`
- `app/[locale]/legal/privacy/page.tsx`
- `app/[locale]/signup/[shortId]/**` (page, RegistrationForm,
  TeamRegistrationForm, teamFormValidation, actions, teamActions,
  registrationTypeView, team/page, team/TeamDashboardClient, not-found)
- possibly `lib/games/formatLabel.ts` (`formatDisplayLabel` locale-param)
- `e2e/signup/open-register.spec.ts` (#559 — logged-out smoke only)
- `package.json`, `package-lock.json`, `CHANGELOG.md`, `messages/README.md`

## Out of Scope

- DB format content (`summary/points/long/example`, `getModeContent`,
  `modeGuide.ts`, locale-keyed format caches) — **Phase D**
- Mail (Resend templates, Supabase Auth OTP copy) — **Phase M**
- Gaelic/Irish (`gd`/`ga`) drafts — **Phase G**
- `invite/**`, `klubber/bli-med/**` (already migrated)
- Copy EDITS in either language; translating user data; localizing route slugs
- e2e copy-assertion refactors (byte-identical NO keeps them green)
- `MODE_LABELS`/`STATUS_LABELS` constant *removal* (kept for typing)
