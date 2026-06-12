# Spec: i18n Fase 2d — klubb, liga og cup (klubbrom, medlemskap, ligastyring, cupstyring, klubbhuset) — #566

> **Type:** Phase contract under epic #60 (master spec:
> `.forge/contracts/60-engelsk-ui-i18n.md`, also posted on #60). Phase 0
> (#475, PR #542) shipped plumbing, Phase 1 (#552, PR #553) the pilot, Phase
> 2a (#554, PR #560) the core game loop, Phase 2b (#561) the create flows,
> Phase 2c (#563, PR #564) the Sekretariat. This phase extracts the
> **club/league/cup surface** — an English user can run tournaments in
> English but every club room, membership flow, league table and cup bracket
> management screen is Norwegian.

## Problem

The klubb/liga/cup flats hold hardcoded Norwegian UI literals across ~55
source files: admin club management (`admin/klubber/**`), admin league
management (`admin/liga/**`, incl. the string-densest file in this phase,
`CreateLigaForm.tsx`, ~75 strings + 13-entry error map), admin cup
management (`admin/cup/**`, incl. the 5-step `GenerateMatchesWizard`), the
player-facing club rooms and membership flows (`klubber/**`), the player
league pages (`liga/**`), the arranger hub (`klubbhuset/page.tsx`), and the
shared league-standings components (`components/league/*`). Plus Norwegian
baked into shared libs: `getClubStatusBadge` (`lib/clubs/clubStatus.ts`),
`CUP_PRESETS` name/description (`lib/cup/cupTemplates.ts`), and hand-rolled
Norwegian month-abbreviation arrays in two liga files.

## Research Findings (scout 2026-06-12)

- **No scope file is migrated yet:** zero `useTranslations`/`getTranslations`
  calls; zero `@/i18n/navigation` imports. Only `klubber/[id]/page.tsx`
  already uses locale-aware `formatDate` + `getLocale()`.
- **Shared components cross the admin/player boundary:** `CreateLigaForm`
  serves `/admin/liga/new` + `/klubber/[id]/liga/ny`; `CupManagement`,
  `GenerateMatchesWizard`, `LigaManagement`, `LigaDeleteConfirm`,
  `CupDeleteConfirm` serve both the admin routes and the nested
  `klubber/[id]/{liga,cup}/**` routes. Each migrates ONCE; both routes get
  it for free.
- **`lib/clubs/clubStatus.ts`:** `getClubStatusBadge` returns Norwegian
  badge labels (incl. a `formatShortDateNb` call). Consumers:
  `admin/klubber/page.tsx` + `admin/klubber/[id]/page.tsx` only (both in
  scope) → make locale-aware (or return keys translated at call-site);
  no drift-guard needed, no out-of-scope consumer.
- **`lib/cup/cupTemplates.ts`:** `CUP_PRESETS` has 3 Norwegian
  `name`/`description` pairs; sole UI consumer is `GenerateMatchesWizard`;
  `cupTemplates.test.ts` asserts logic, not Norwegian. → presets carry
  stable ids; wizard translates via `cup.presets.*` keys.
- **Duplicated label maps:** `ROLE_LABELS` (eier/admin/medlem) duplicated in
  5 files; liga status labels in 3 files + `LEAGUE_STATUS_LABELS`; cup
  status labels in 2 files + `CUP_STATUS_LABELS` → centralize as
  `klubb.roles.*`, `liga.status.*`, `cup.status.*` keys.
- **Dates:** `formatShortDateNb` ×7 call-sites (admin/liga ×3 files,
  clubStatus), `formatShortDateNbWithYear` ×3 (liga player pages via
  `fmtWindow`) — locale-aware equivalents (`formatShortDateLocale`,
  `formatShortDateWithYearLocale`) already exist in `lib/i18n/format.ts`
  since 2c. Two hand-rolled month-abbr arrays (`LigaRoundRow.formatWindowDate`,
  `CreateLigaForm.MONTHS_ABBR` round-preview sentence) need a locale-aware
  date-window helper. `klubbhuset/page.tsx` uses legacy
  `formatTeeOffDate`/`formatTeeOffTime` → existing `*Locale` variants.
- **Error flow:** all scope server actions use the `?error=<code>` redirect
  pattern; Norwegian lives in ~20 page/component-level maps (largest:
  CupManagement 9+5, CreateLigaForm 13, RoundStartClient 10,
  `klubber/[id]/page.tsx` 8+8) → mechanical map-to-catalog conversion, no
  action-signature changes.
- **Navigation:** 4 files import `Link` from `next/link`; ~20 files import
  `redirect` from `next/navigation` (pages + actions). `notFound` stays.
  No `useSearchParams` in scope.
- **Catalog:** `messages/README.md` already plans top-level `klubb`, `liga`,
  `cup` namespaces; none exist yet in `no.json` (16 namespaces today).
- **Tests:** `ClubLeaguesSection.test.tsx`, `ClubCupsSection.test.tsx`,
  `GenerateMatchesWizard.test.tsx`, `LeagueStandingsPanel.test.tsx`,
  `LeagueStandingsTable.test.tsx` assert Norwegian copy — the vitest stub
  (`vitest.setup.ts`) renders real `no.json` via `createTranslator`, so
  byte-identical extraction keeps them green with zero assertion edits.
  `actions.test.ts` (cup generer) asserts redirect URLs/DB shapes only —
  redirect swap must keep the asserted paths (default locale unprefixed).

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

### 1. Scope = the club/league/cup surface

Extract every user-facing string (JSX text, aria-labels, placeholders,
button labels, `window.confirm` prompts, validation/error/empty/status
states) in:

- `app/[locale]/admin/klubber/**` — page, `[id]` (+ actions), `ny`
  (+ actions, `VarighetField`)
- `app/[locale]/admin/liga/**` — page, `new` (+ `CreateLigaForm`), `[id]`
  (page, `LigaManagement`, `LigaAddPlayers`, `LigaAddRound`,
  `LigaRemovePlayer`, `LigaRoundRow`, `LigaStatusActions`), `[id]/slett`
  (+ `LigaDeleteConfirm`)
- `app/[locale]/admin/cup/**` — page, `[id]` (page, `CupManagement`),
  `[id]/generer` (page, `GenerateMatches`, `GenerateMatchesWizard`,
  actions), `[id]/slett` (+ `CupDeleteConfirm`)
- `app/[locale]/klubber/**` — page, `[id]` (page, `ClubLeaguesSection`,
  `ClubCupsSection`, `CopyJoinLinkButton`, actions), `bli-med/[shortId]`,
  `[id]/forlat`, `[id]/fjern/[userId]`, `[id]/rolle/[userId]` (each page +
  actions), `[id]/liga/ny`, `[id]/cup/ny`, and the nested
  `[id]/liga/[ligaId]`/`[id]/cup/[cupId]` pages (mostly thin wrappers around
  the shared admin components)
- `app/[locale]/liga/**` — `[id]/page.tsx`, `[id]/meld-av`,
  `[id]/runde/[roundId]/spill` (page + `RoundStartClient`)
- `app/[locale]/klubbhuset/page.tsx`
- `components/league/LeagueStandingsPanel.tsx` + `LeagueStandingsTable.tsx`
- Lib (§2): `lib/clubs/clubStatus.ts`, `lib/cup/cupTemplates.ts`,
  `lib/i18n/format.ts` extension (date-window helper)

**Namespace:** new top-level `klubb.*`, `liga.*`, `cup.*` per
`messages/README.md`, plus `klubbhuset.*` (small). Admin-flavoured strings
live under the same feature namespaces (e.g. `klubb.manage.*`,
`liga.create.*`, `cup.generate.*`) — NOT under `admin.*`, because the
shared components render on both admin and player routes. Shared labels:
`klubb.roles.*`, `liga.status.*`, `cup.status.*`, `cup.presets.*`. Final
granularity = builder's call; keys named for meaning, English camelCase.

### 2. Lib modules

- `lib/clubs/clubStatus.ts`: `getClubStatusBadge` becomes locale-aware
  (locale param + catalog keys translated at call-site, or returns a
  tone + key pair) — builder's call; Norwegian output byte-identical; its
  internal `formatShortDateNb` call migrates to `formatShortDateLocale`.
- `lib/cup/cupTemplates.ts`: `CUP_PRESETS` entries get stable `id`s;
  `name`/`description` move to `cup.presets.*`; `GenerateMatchesWizard`
  translates at render. Logic/test untouched otherwise.
- `lib/i18n/format.ts` gains a locale-aware **date-window/short-month
  helper** covering `LigaRoundRow.formatWindowDate` («12. mai – 19. mai»
  style) and `CreateLigaForm`'s `MONTHS_ABBR` round-preview sentence — `no`
  path byte-identical to today's output, Type A parity tests. Reuse
  existing helpers where output already matches; name = builder's call.
- `klubbhuset/page.tsx`: `formatTeeOffDate`/`formatTeeOffTime` →
  `formatTeeOffDateLocale`/`formatTeeOffTimeLocale` (already exist).

### 3. Server actions

No signature changes: failures stay `?error=<code>`-redirect-based; pages
translate by code. `redirect` imports migrate to `@/i18n/navigation`
object-form with `getLocale()` in every touched `actions.ts`/server page
(~20 files). Redirect-URL assertions in `generer/actions.test.ts` must stay
green (default locale unprefixed).

### 4. Duplicated wordings

`ROLE_LABELS` (5 files), liga status labels (4 sites), cup status labels
(3 sites) centralize to single catalog keys — byte-identical Norwegian
today, so safe. The slett-confirmation boilerplate in
`LigaDeleteConfirm`/`CupDeleteConfirm` may share keys ONLY where Norwegian
copy is byte-identical today; deliberately different wordings stay
different.

### 5. English catalog

Full idiomatic English for every new key, golf/club register («Klubbrom» →
"Club room", «Bli med» → "Join", «Forlat klubben» → "Leave club",
«Tabell» → "Standings", «Runde» → "Round", «Sluttspill» → "Playoffs",
«Generer matcher» → "Generate matches"). British «organis-» spelling per
existing convention. Idiomatic-English review pass (opus) over the full new
`en` surface before evaluation. Club/league/cup NAMES are user data — never
translated.

## Edge Cases & Guardrails

- **Byte-identical Norwegian:** full vitest suite green with zero assertion
  edits (5 scope test files assert Norwegian via the stub).
- **ICU escaping:** apostrophes, «» quotes stay literal text; interpolated
  counts (`spiller/spillere`, `medlem/medlemmer`, `runde/runder`,
  `match/matcher`) become ICU plural/select; preset descriptions with
  numbers keep their exact Norwegian shape.
- **aria-labels + placeholders + sr-only + `window.confirm` are copy too.**
- **User data untouched:** club names, league names («Vårserien»), cup
  names, player names render verbatim in both locales.
- **No PPR regression:** build route-summary diff vs origin/main = empty;
  no new force-dynamic.
- **`notFound` stays on `next/navigation`;** split mixed import lines.
- **humanizer:** pure extraction, no new Norwegian expected; if any string
  is genuinely NEW, run humanizer.
- **Emoji/symbol-prefixed strings** keep symbols inside the message value.
- **`localeCompare`-style sort collation** (if present) is not display copy
  — stays.

## Key Decisions

- **`klubbhuset/page.tsx` is IN scope** (Claude) — it's the arranger hub,
  not club membership, but no other phase's enumerated scope covers it and
  it sits under the Klubbhuset bottom-nav tab next to the club rooms.
  Leaving it out would orphan one page until a phase that doesn't exist.
- **Shared admin/player components get feature namespaces (`liga.*`,
  `cup.*`, `klubb.*`), not `admin.*`** (Claude) — they render on player
  routes too; namespace must not lie about the surface.
- **`CUP_PRESETS` translated at call-site via stable ids** (Claude) —
  keeps `lib/cup/cupTemplates.ts` a pure-logic module, mirrors the
  `STATUS_LABELS`-to-catalog pattern.
- **Profile/friends/innboks/finn-turneringer stay 2e;
  signup/spillformer/legal 2f; DB format content D** (master spec).
- **No new E2E** (Claude, mirrors 2a/2b/2c) — catalog-parity + build +
  untouched nb-pinned suite carry verification.

**Claude's Discretion:** exact namespace granularity & key names; helper
name/shape for the date-window helper; `getClubStatusBadge` signature
(locale param vs key-returning); whether nested klubber liga/cup wrapper
pages share keys with admin pages; chunking order.

## Success Criteria

- [ ] **No hardcoded Norwegian UI literals** remain in the §1 scope —
      verified by non-comment æøå string-literal grep over
      `app/[locale]/{admin/klubber,admin/liga,admin/cup,klubber,liga,klubbhuset}/**`
      + `components/league/**` + the §2 lib modules, plus a
      common-no-words-without-æøå sweep (Velg/Lagre/Slett/Avbryt/Venter/
      Medlem/Runde/Tabell/…). User-data render paths excluded.
- [ ] **Norwegian output unchanged:** full `npm run test` green with zero
      assertion edits in existing tests; playwright smoke green (modulo
      known pre-existing failures).
- [ ] **English coverage:** `catalogParity.test.ts` green; `npm run build`
      green; no raw catalog key visible in either locale on the scope
      surfaces; opus idiomatic-English pass done.
- [ ] **Locale-aware dates:** all in-scope `formatShortDateNb`/`WithYear`,
      month-abbr arrays and teeOff call-sites render English under `en`,
      byte-identical Norwegian under `no` (Type A parity tests for the new
      helper).
- [ ] **Navigation imports migrated** in every touched file (grep-verified:
      no `next/link` Link, no `next/navigation` `redirect` in scope;
      `notFound` exempt); `generer/actions.test.ts` redirect assertions
      green unchanged.
- [ ] **PPR shape holds:** route-summary diff vs origin/main = empty.
- [ ] MINOR version bump + CHANGELOG entry per
      `docs/changelog-conventions.md` in the user-visible commit.

## Gates (per chunk)

- [ ] `npx tsc --noEmit` after every chunk.
- [ ] Co-located `*.test.ts(x)` for changed files after every chunk.
- [ ] `npm run build` after the lib chunk and before evaluation
      (route-shape diff checked).
- [ ] Full `npm run test` before evaluation.
- [ ] `npx playwright test` (existing smoke) before evaluation (worktree
      needs `.env.local` — recreate from Supabase MCP url + anon key if
      missing, else all redirect specs fail silently).
- [ ] Version bump + CHANGELOG in the same commit as the user-visible
      change; extraction-only commits use `refactor(...)`.

## Chunking (builder's order — dependency-first)

1. **Lib foundation:** date-window helper + Type A parity tests;
   `klubb`/`liga`/`cup`/`klubbhuset` namespace skeletons (roles, statuses,
   presets); `clubStatus.ts` + `cupTemplates.ts` migration.
2. **Admin klubber:** page, `[id]` (+ actions), `ny` (+ actions,
   VarighetField).
3. **Admin liga:** page, `new`/CreateLigaForm, `[id]` components, slett —
   including the klubber liga/ny + nested wrapper pages that share them.
4. **Admin cup:** page, CupManagement, generer wizard (+ actions), slett —
   including the klubber cup/ny + nested wrapper pages.
5. **Klubber player surface:** page, `[id]` room (+ sections,
   CopyJoinLinkButton, actions), membership flows (bli-med, forlat, fjern,
   rolle).
6. **Liga player surface + standings + klubbhuset:** `liga/**`,
   `components/league/*`, `klubbhuset/page.tsx`.
7. **English idiomatic pass (opus) + feat-commit:** MINOR bump + CHANGELOG
   + `messages/README.md` touch-up.

## Files Likely Touched

- `messages/no.json`, `messages/en.json` — new `klubb`/`liga`/`cup`/
  `klubbhuset` namespaces
- `app/[locale]/admin/{klubber,liga,cup}/**` — ~30 files
- `app/[locale]/{klubber,liga,klubbhuset}/**` — ~28 files
- `components/league/LeagueStandingsPanel.tsx`, `LeagueStandingsTable.tsx`
- `lib/clubs/clubStatus.ts`, `lib/cup/cupTemplates.ts`
- `lib/i18n/format.ts` + tests
- `package.json`, `package-lock.json`, `CHANGELOG.md`,
  `messages/README.md`

## Out of Scope

- Profile/friends/innboks/finn-turneringer (2e);
  signup/spillformer/legal/home (2f)
- DB format content, `modeGuide.ts`, locale-keyed caches (Phase D);
  mail (M); gd/ga (G)
- Copy EDITS in either language; translating user data (club/league/cup
  names); localizing route slugs (`/en/clubs`)
- Cup match play pages under `games/[id]` (2a turf, already migrated)
