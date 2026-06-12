# Spec: i18n Fase 2e — profil, venner, innboks og finn-turneringer — #573

> **Type:** Phase contract under epic #60 (master spec:
> `.forge/contracts/60-engelsk-ui-i18n.md`, also posted on #60). Phase 0
> (#475, PR #542) shipped plumbing, Phase 1 (#552, PR #553) the pilot, Phase
> 2a (#554, PR #560) the core game loop, Phase 2b (#561) the create flows,
> Phase 2c (#563, PR #564) the Sekretariat, Phase 2d (#566) klubb/liga/cup.
> This phase extracts the **personal surface** — an English user can play,
> create and manage in English, but their profile, friends list, inbox and
> tournament discovery are Norwegian.

## Problem

The personal flats hold ~200 hardcoded Norwegian UI literals across ~25
files: the profile page (form, gender prompt, invite-a-friend card, account
actions, two error maps), slett-konto, historikk, statistikk, the friends
list (8-entry status-banner map, add-by-email/link flows) and the
venner/legg-til landing, the inbox (the string-densest file in this phase:
`NotificationCard` with 20 notification kinds × Norwegian title+detail plus
a 5-entry block-reason map; `InboxClient`; `MonthlyDigestToggle`; day
grouping «I dag»/«I går» in `lib/notifications/groupByDay.ts`), the
finn-turneringer page and the shared `HomeDiscoverySection`. Plus global
nav chrome: `BottomNav` tab labels (Hjem/Innboks/Klubbhuset/Profil) and the
`NotificationBell` unread-count aria-label, and Norwegian baked into
`lib/invitations/quota.ts` (`formatTimeUntil` → «snart»/«{n} t»/«{n} min»).

## Research Findings (scout 2026-06-13)

- **Almost nothing in scope is migrated:** only `profile/page.tsx` has one
  catalog lookup (`profile.languageRowLabel`, the Phase 1 pilot toggle).
  The `profile` namespace exists with that single key; `friends`, inbox and
  discovery namespaces don't exist yet. `messages/README.md` plans
  `profile` + `friends`; inbox/discovery names get added.
- **`HomeDiscoverySection.tsx` is shared** between `app/[locale]/page.tsx`
  (home — 2f turf) and `finn-turneringer/page.tsx` (2e turf), ~12 strings
  incl. section headings, «Bane ikke valgt», «Meld meg på», «Be om å bli
  med», «Venter på godkjenning» and a hardcoded `'kl. '` separator between
  legacy `formatTeeOffDate`/`formatTeeOffTime` calls. 2d precedent: shared
  components migrate ONCE; both routes get it free. Has a test file
  asserting Norwegian (stub keeps it green).
- **`NotificationCard.tsx`** (sole consumer: `InboxClient`) maps 20
  notification kinds → Norwegian title/detail and 5 block-reason codes;
  calls `formatRelativeNb` directly. DB payload values interpolated into
  the strings (game/team/club/player names, product_update title/body) are
  user data — ICU args, never translated.
- **`NotificationBell.tsx`** (mounted globally via `TopBar`) has Norwegian
  aria-labels incl. inline pluralization «ulest varsel/uleste varsler» →
  ICU plural. `BottomNav.tsx` (global layout) has the four tab labels +
  `aria-label="Hovednavigasjon"`; it already imports `usePathname` from
  `@/i18n/navigation`.
- **`lib/notifications/groupByDay.ts`** (sole consumer: `InboxClient`)
  returns «I dag»/«I går» labels and calls `formatShortDateNb`/`WithYear`.
- **`lib/invitations/quota.ts` `formatTimeUntil`** (sole UI consumer:
  `profile/page.tsx`) returns «snart»/«{n} t»/«{n} min».
- **Dates:** all needed locale-aware helpers already exist in
  `lib/i18n/format.ts` (`formatTeeOffDateLocale`/`TimeLocale`,
  `formatShortDateLocale`/`WithYearLocale`, `formatRelativeLocale`) — no
  new date helper expected; only call-site swaps (`historikk/page.tsx`,
  `HomeDiscoverySection`, `NotificationCard`, `groupByDay`).
- **Error flow:** standard `?error=<code>`/`?status=<code>` redirect
  pattern everywhere; Norwegian lives in page-level maps only
  (profile 5+8, slett-konto 2, venner 9-entry status map, legg-til single
  banner) → mechanical map-to-catalog conversion.
- **Navigation:** ~14 files import `redirect` from `next/navigation`
  (incl. `invite/actions.ts`, producer of the profile page's
  invite-error codes); `InboxClient` imports `useRouter`. `notFound`
  (venner/legg-til) stays on `next/navigation` (not re-exported by
  `@/i18n/navigation`). No `useSearchParams` in scope.
- **Metadata first:** `finn-turneringer/page.tsx` has a static
  `export const metadata = { title: 'Finn turneringer' }` — the epic's
  first metadata migration; next-intl pattern is `generateMetadata` +
  `getTranslations({ locale, namespace })` with explicit locale from
  `await params` (verify against `node_modules/next-intl` docs at build —
  rootParams/Server-Action quirks per commit 58b65e8a).
- **Server-side notification-payload fallbacks** («En venn» in
  venner/invite actions) are stored in DB payloads at write time, when the
  recipient's locale is unknown — see Key Decisions.
- **`window.prompt('Kopier lenken:', url)`** clipboard fallback in
  `VennerClient` is user-facing copy. `statistikk` has
  `localeCompare(..., 'nb')` sort collation (stays, 2c precedent) and
  prop-driven pluralization (`unitSingular="seier"`/`unitPlural="seire"`).
- **`profile/export/route.ts`** returns `{ error: 'Ikke innlogget' }` as a
  401 JSON body — machine-facing API response, out of scope.

## Inherited Architecture (locked — do not re-litigate)

- next-intl, `localePrefix: 'as-needed'`; `no.json` source of truth,
  deep-merge fallback; catalog conventions per `messages/README.md`;
  `messages/catalogParity.test.ts` enforces full no/en key symmetry.
- vitest stub uses `createTranslator` against real `no.json` — component
  tests assert real Norwegian without a provider.
- **Norwegian output stays byte-identical.** Extraction is a refactor of
  where strings live. Existing tests pass without assertion edits.
- **TS2589 trap:** translator props always typed
  `ReturnType<typeof useTranslations<'ns'>>` (scoped generic).
- i18n-redirect pattern: `redirect({ href, locale })` from
  `@/i18n/navigation` + `getLocale()`; `revalidateLocalePath` where paths
  are revalidated.
- ICU: literal apostrophes escaped `''`; no HTML in messages (key pairs or
  `t.rich`); never reuse a key across different word orders.
- rootParams/cacheComponents: no `setRequestLocale`, no new force-dynamic,
  PPR route shape (route-summary diff vs origin/main) must hold.
- Locale-aware date helpers live in `lib/i18n/format.ts`; the `no` path
  delegates to (or replicates byte-identically) legacy output, Type A tests.

## Design

### 1. Scope = the personal surface

Extract every user-facing string (JSX text, aria-labels, placeholders,
button labels, `window.prompt` fallbacks, validation/error/empty/status
states, metadata titles) in:

- `app/[locale]/profile/**` — page (incl. both error maps, GenderSoftPrompt,
  InviteAFriendCard, AccountActions, «Profil»/«snart» fallbacks),
  `ProfileFormBody` (labels, GENDER/LEVEL option labels, hints,
  `aria-label="Plusshandicap"`), `InviteFriendForm`, `slett-konto/**`,
  `historikk/page.tsx` (incl. 0/1/n «fullført(e) runde(r)» plural),
  `statistikk/page.tsx` (incl. seier/seire + spill units, «(ukjent)»
  fallback), `venner/**` (page status map, VennerClient incl.
  `window.prompt`, actions)
- `app/[locale]/venner/legg-til/[code]/**` (page 3-state card + actions)
- `app/[locale]/innboks/**` — page kicker, `InboxClient` (empty state,
  «Marker alle som lest», pendingLabel), `MonthlyDigestToggle`
- `components/notifications/NotificationCard.tsx` (20 kinds + block
  reasons + `formatRelativeNb` → `formatRelativeLocale`),
  `NotificationBell.tsx` (aria-labels, ICU plural)
- `components/ui/BottomNav.tsx` (4 tab labels + nav aria-label)
- `app/[locale]/finn-turneringer/page.tsx` (incl. `generateMetadata`) +
  `app/[locale]/HomeDiscoverySection.tsx`
- `app/[locale]/invite/actions.ts` — navigation swap only (its
  «En venn på Tørny» mail fallback is Phase M turf)
- Lib (§2): `lib/notifications/groupByDay.ts`,
  `lib/invitations/quota.ts`

**Namespace:** expand existing `profile.*`; new `friends.*`, `inbox.*`
(incl. `inbox.kinds.*`, `inbox.blockReasons.*`), `discover.*`
(finn-turneringer + HomeDiscoverySection), `nav.*` (BottomNav + bell) —
exact granularity = builder's call; keys named for meaning, English
camelCase; update `messages/README.md` namespace list.

### 2. Lib modules

- `lib/notifications/groupByDay.ts`: becomes locale-aware (locale param +
  `formatShortDateLocale`/`WithYearLocale`; «I dag»/«I går» via catalog
  keys translated at call-site or passed-in labels — builder's call).
  Norwegian output byte-identical; Type A test if logic shifts.
- `lib/invitations/quota.ts` `formatTimeUntil`: sole UI consumer is
  `profile/page.tsx` → make locale-aware (locale param or translate at
  call-site from a minutes/hours value — builder's call; keep the quota
  logic pure). «snart»/«{n} t»/«{n} min» byte-identical on `no`.
- No new date helpers expected — reuse existing `*Locale` helpers.

### 3. Server actions

No signature changes: failures stay `?error=`/`?status=`-redirect-based;
pages translate by code. `redirect` imports migrate to `@/i18n/navigation`
object-form with `getLocale()` in every touched `actions.ts`/server page
(~14 files). `notFound` stays on `next/navigation`.

### 4. Notification payload fallbacks

The «En venn» actor-name fallbacks in `profile/venner/actions.ts` +
`venner/legg-til/[code]/actions.ts` are written into DB payloads where the
recipient's locale is unknown. Move the fallback to render time:
actions store the real name when known (omit/null otherwise);
`NotificationCard` renders `actor_name ?? t('inbox.someoneFallback')`.
Already-stored «En venn» payloads render verbatim — acceptable legacy.

### 5. English catalog

Full idiomatic English for every new key, warm-companion register
(«Innboks» → "Inbox", «Venner» → "Friends", «Bli venner» → "Become
friends"/"Add friend", «Marker alle som lest» → "Mark all as read",
«Finn turneringer» → "Find tournaments", «Meld meg på» → "Sign me up",
«Husk å levere scorekortet» → "Remember to submit your scorecard").
British «organis-» spelling per existing convention. Idiomatic-English
review pass (opus) over the full new `en` surface before evaluation.

## Edge Cases & Guardrails

- **Byte-identical Norwegian:** full vitest suite green with zero
  assertion edits (`HomeDiscoverySection.test.tsx`, `InboxClient.test.tsx`
  a.o. assert Norwegian via the stub).
- **ICU plurals:** «ulest varsel/uleste varsler», 0/1/n «fullført(e)
  runde(r)», «seier/seire», «spill», venner counts → ICU plural; exact
  Norwegian forms preserved.
- **User data untouched:** game/team/club/tournament/player names,
  product_update title/body, rejection reasons render verbatim in both
  locales (ICU args in notification strings).
- **aria-labels + placeholders + `window.prompt` + metadata titles are
  copy too.**
- **Global chrome regression risk:** `BottomNav`/`NotificationBell` render
  on every authenticated page — keep them client-light (`useTranslations`
  in the client component; no new providers) and verify no hydration
  mismatch.
- **No PPR regression:** build route-summary diff vs origin/main = empty;
  no new force-dynamic (watch `generateMetadata` on finn-turneringer).
- **`localeCompare(..., 'nb')`** in statistikk is sort collation — stays.
- **`profile/export/route.ts`** 401 JSON body — out of scope
  (machine-facing).
- **humanizer:** pure extraction, no new Norwegian expected; if any string
  is genuinely NEW, run humanizer.

## Key Decisions

- **`HomeDiscoverySection` migrates in 2e although home (2f) shares it**
  (Claude) — shared-component precedent from 2d; finn-turneringer is 2e
  turf and the component translates itself, so home needs no edits.
- **Global nav chrome (`BottomNav`, `NotificationBell`) is IN scope**
  (Claude) — three of four tabs are 2e surfaces, the bell IS the inbox
  entry point, and no later phase covers global chrome (2f is
  reference/public). Mirrors 2d's klubbhuset orphan-avoidance call.
- **Payload fallback moves to render time** (Claude, §4) — write-time
  Norwegian in locale-agnostic DB payloads is the wrong layer; render-time
  catalog fallback is locale-correct and legacy-safe.
- **`finn-turneringer` metadata via `generateMetadata` + explicit-locale
  `getTranslations`** (Claude) — first metadata migration in the epic,
  sets the pattern for 2f's public pages.
- **Signup/spillformer/legal/home chrome stay 2f; DB format content D;
  mail M** (master spec).
- **No new E2E** (Claude, mirrors 2a–2d) — catalog-parity + build +
  untouched nb-pinned suite carry verification.

**Claude's Discretion:** exact namespace granularity & key names;
`groupByDay`/`formatTimeUntil` signature shape; whether «kl. »-line in
HomeDiscoverySection uses a composed catalog key or
`formatTeeOffDateLocale`+`TimeLocale` with a separator key; chunking
order.

## Success Criteria

- [x] **No hardcoded Norwegian UI literals** remain in the §1 scope —
      æøå-in-quotes grep over the full scope = 0 hits (last literal,
      `DEFAULT_LABELS_NO` in groupByDay, removed in 1d562230); common
      no-words-without-æøå sweep (Velg/Lagre/Slett/Avbryt/Venter/Venn/
      Innboks/Hjem/…) = 0 hits after `formatTimeUntil` removal
      (9f009071). User-data render paths excluded.
- [x] **Norwegian output unchanged:** full `npm run test` green — 263
      files, 3375 tests, zero assertion edits (only mock/signature
      adaptations in invite/actions.test, InboxClient.test,
      groupByDay.test, quota.test); playwright 48 passed, 1 failed =
      the known pre-existing #559 signup smoke (2f turf, untouched).
- [x] **English coverage:** `catalogParity.test.ts` 3/3 green;
      `npm run build` exit 0; opus idiomatic pass committed (69c535b2,
      6 rewrites).
- [x] **All 20 notification kinds + 5 block reasons** have
      `inbox.kinds.*`/`inbox.blockReasons.*` keys in both locales
      (catalogParity enforces symmetry); NotificationCard tests 14/14
      assert Norwegian via the stub.
- [x] **Locale-aware dates/relative time:** historikk →
      `formatTeeOffDateLocale`; HomeDiscoverySection →
      `*Locale` helpers + `discover.teeOffLine` ICU; NotificationCard →
      `formatRelativeLocale`; groupByDay + timeUntilStructured require
      locale/labels (Type A tests cover en + no paths, 91 tests in
      lib/notifications + innboks green).
- [x] **Navigation imports migrated:** grep over scope = only two
      `notFound` imports (exempt); `/invite` redirect stub made
      locale-aware (8ba53974).
- [x] **PPR shape holds:** branch build = 92 routes, 81 ◐ / 9 ƒ / 2 ○ —
      identical aggregate to the recorded main baseline; every scope
      route ◐, `/[locale]` home ◐, `profile/export` ƒ as before.
- [x] MINOR bump 1.117.0 → 1.118.0 + CHANGELOG series 1.118.y in the
      feat commit (028ee90f); commit-msg hook passed.

## Gates (per chunk)

- [ ] `npx tsc --noEmit` after every chunk.
- [ ] Co-located `*.test.ts(x)` for changed files after every chunk.
- [ ] `npm run build` after the lib/chrome chunks and before evaluation
      (route-shape diff checked).
- [ ] Full `npm run test` before evaluation.
- [ ] `npx playwright test` (existing smoke) before evaluation (worktree
      needs `.env.local` — recreate from Supabase MCP url + anon key if
      missing, else all redirect specs fail silently).
- [ ] Version bump + CHANGELOG in the same commit as the user-visible
      change; extraction-only commits use `refactor(...)`.

## Chunking (builder's order — dependency-first)

1. **Lib + namespace skeletons:** `profile`/`friends`/`inbox`/`discover`/
   `nav` keys; `groupByDay` + `formatTimeUntil` locale-aware (+ tests).
2. **Global chrome:** `BottomNav` + `NotificationBell`.
3. **Profile core:** page + ProfileFormBody + InviteFriendForm +
   slett-konto + historikk + statistikk + actions/invite navigation swaps.
4. **Venner:** profile/venner (page, VennerClient, actions) +
   venner/legg-til/[code] + payload-fallback move.
5. **Innboks:** NotificationCard + InboxClient + MonthlyDigestToggle +
   page + groupByDay integration.
6. **Finn-turneringer + HomeDiscoverySection** (+ generateMetadata).
7. **English idiomatic pass (opus) + feat-commit:** MINOR bump + CHANGELOG
   + `messages/README.md` touch-up.

## Files Likely Touched

- `messages/no.json`, `messages/en.json` — expanded `profile`, new
  `friends`/`inbox`/`discover`/`nav` namespaces
- `app/[locale]/{profile,venner,innboks,finn-turneringer}/**` — ~20 files
- `app/[locale]/HomeDiscoverySection.tsx`, `app/[locale]/invite/actions.ts`
- `components/notifications/NotificationCard.tsx`, `NotificationBell.tsx`
- `components/ui/BottomNav.tsx`
- `lib/notifications/groupByDay.ts`, `lib/invitations/quota.ts`
- `package.json`, `package-lock.json`, `CHANGELOG.md`,
  `messages/README.md`

## Out of Scope

- Home page chrome (`app/[locale]/page.tsx` greeting/cards beyond the
  shared HomeDiscoverySection), signup/spillformer/legal (2f)
- DB format content, `modeGuide.ts`, locale-keyed caches (Phase D);
  mail incl. «En venn på Tørny» mail fallback (M); gd/ga (G)
- `profile/export/route.ts` JSON error body (machine-facing)
- Push notifications (#24 — not built)
- Copy EDITS in either language; translating user data; localizing route
  slugs (`/en/friends`)
