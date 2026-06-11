# Spec: i18n Fase 2a — kjernesløyfa (game-home, hull, scorekort, leaderboard) — #554

> **Type:** Phase contract under epic #60 (master spec:
> `.forge/contracts/60-engelsk-ui-i18n.md`, also posted on #60). Phase 0
> (#475, PR #542) shipped the plumbing; Phase 1 (#552, PR #553) proved the
> vertical slice. This phase extracts the **core game loop** — the largest
> per-area rollout phase — so an English user can play a full round in English.

## Problem

The language switcher exists, but everything past login is hardcoded Norwegian.
The core loop — game-home, hole-by-hole score entry, scorecard, submit/approve,
leaderboard with ~20 format-specific views + podiums — contains ~89 files with
Norwegian UI strings (~600+ user-visible literals), plus Norwegian baked into
shared lib modules (`STATUS_LABELS`, `MODE_LABELS`, wolf labels, side-tournament
achievement labels, `scorecardTitle`) and date helpers with hand-rolled
Norwegian day/month arrays. An English user who switches language gets an
English login page and a Norwegian app.

## Research Findings

- **next-intl 4.13.0 (installed):** `useTranslations` IS exported in the
  react-server build — **synchronous server components can call it directly**;
  only `async` components need `getTranslations` from `next-intl/server`.
  Verified in `node_modules/next-intl/dist/esm/production/index.react-server.js`.
  This means the ~20 sync server view components keep their component tests
  working through the existing vitest stub.
- **`createTranslator` is exported from `next-intl`** — needed to upgrade the
  vitest stub (see Design §6): the current stub does raw dot-path lookup with
  NO ICU support, so any plural/interpolated key would render its raw ICU
  source in tests.
- **Scout inventory (2026-06-11):** largest string-dense files:
  `leaderboard/page.tsx` (3506 lines, ~192 NOR lines),
  `SideTournamentView.tsx` (1655, ~96), `(home)/page.tsx` (1605, ~61),
  `HoleClient.tsx` (~55), 31 leaderboard test files assert Norwegian copy via
  the vitest stub resolving real `no.json`.
- **`revalidatePath` call-sites in core-loop actions already use
  `lib/i18n/revalidateLocalePath`** (done in Phase 0). **Zero** core-loop files
  have migrated `Link`/`redirect`/`useRouter` to `@/i18n/navigation` yet.

## Inherited Architecture (locked — do not re-litigate)

- next-intl, `localePrefix: 'as-needed'`; negotiation `users.locale` →
  `NEXT_LOCALE` cookie → `Accept-Language` → `no`.
- `no.json` is source of truth, deep-merged under active locale in
  `i18n/request.ts` — missing `en` key renders Norwegian, never a raw key.
- Catalog conventions per `messages/README.md`: top-level key = feature area,
  English camelCase keys named for meaning, ICU for plurals/interpolation.
- Navigation primitives from `i18n/navigation.ts` in every file this phase
  touches (`Link`, `redirect`, `usePathname`, `useRouter`). `notFound` stays
  `next/navigation` (not locale-dependent).
- ICU cannot carry HTML — `<strong>{x}</strong>` patterns use prefix/suffix
  key pairs or `t.rich` (builder's call; Phase 1 used key pairs).
- **Norwegian output must stay byte-identical** — extraction is a refactor of
  where strings live, not a copy edit. Existing tests asserting Norwegian copy
  must pass without assertion changes.
- rootParams/cacheComponents pattern from Phase 0 must hold: no
  `setRequestLocale`, no new force-dynamic. The 81-route ◐ PPR build shape
  must not regress.

## Design

### 1. Scope = the player-facing game surface

Extract every user-facing string (JSX text, aria-labels, alt, title, button
labels, error/empty states, screen-reader text) in:

- `app/[locale]/games/[id]/(home)/` + `layout.tsx` + `ScheduledWaitingRoom.tsx`
- `app/[locale]/games/[id]/holes/[holeNumber]/**` (HoleClient, WolfChoiceModal,
  BingoBangoBongoEntry, RoundRobinBadge, banners, page)
- `app/[locale]/games/[id]/scorecard/**`, `submit/**`, `approve/**`
- `app/[locale]/games/[id]/avslutt/`, `slett/`, `trekk-fra/`, `rediger/`,
  `spillere/` (player/creator-facing management pages — included so the whole
  `games/[id]` tree is clean)
- `app/[locale]/games/[id]/leaderboard/**` — page, tabs, PreRoundLeaderboard,
  State4View, all `*View.tsx`, all `*Podium.tsx`, `holes/*HolesView.tsx`,
  `SideTournamentView.tsx`, `MatchplayDuelCard.tsx`, `HeadToHeadResult.tsx`,
  `WithdrawnPlayersSection.tsx`
- `components/hole/**` (ScoreCard, BottomActionBar, OnboardingBanner,
  SpecificValueSheet, HoleHero, SyncStatusLine, HoleStrip)
- Server-action **user-facing** error/return messages in
  `games/[id]/**/actions.ts` (strings rendered in UI; log-only strings stay).

**Namespaces** (final granularity = builder's call, README conventions apply):
`game` (game-home + management sub-pages + waiting room), `holes` (score
entry + components/hole), `scorecard`, `leaderboard` (incl. podiums,
side-tournament, duel/H2H), plus shared `gameStatus` and `modes` (see §2).

### 2. Shared lib modules — lib stays presentation-free

Pattern: **lib returns stable ids/keys; components translate.** Norwegian
never lives in two places without a drift-guard.

- `lib/games/status.ts` `STATUS_LABELS` (app-wide): add `gameStatus.<status>`
  catalog keys; core-loop call-sites render via `t()`. The constant STAYS for
  unmigrated surfaces (admin/wizard) + a **drift-guard test** asserting
  `STATUS_LABELS[s] === no.json gameStatus[s]` for every status.
- `lib/scoring/modes/types.ts` `MODE_LABELS` (app-wide): same —
  `modes.<game_mode>` keys + drift-guard over all 23 modes.
- `lib/games/formatLabel.ts` `formatDisplayLabel` (app-wide): variant-aware;
  expose a key/id-returning variant the core loop translates; legacy function
  stays + drift-guard over all (mode, variant) combos it supports.
- `lib/games/scorecardTitle.ts` (core-loop only): convert to return keys;
  callers translate. No legacy retained (verify via grep that no other
  consumer exists before removing Norwegian).
- `lib/wolf/holeLabels.ts` (core-loop only): return semantic ids; WolfView /
  WolfHolesView translate.
- `lib/leaderboard/formatHolesList.ts` (core-loop only): the hardcoded `hull`
  prefix becomes caller-supplied (param or structured return) so
  SideTournamentView renders `hull 1–3` / `holes 1–3`.
- `lib/scoring/sideTournament.ts` labels/rules (core-loop only): category and
  achievement label/rule strings move to catalog keyed by stable ids;
  SideTournamentView translates. **Achievement names that are deliberate
  English sports terms (Turkey, Solid, Snowman, Lone Wolf, Blind Wolf …) stay
  identical in both catalogs** (per `docs/copy-style.md`).

### 3. Date/number helpers — locale-aware variants in `lib/i18n/format.ts`

For helpers whose call-sites are in this phase: tee-off date/time
(`lib/format/teeOff.ts`), countdown (`lib/format/countdown.ts`), short date
with year (used by `slett`-page). Add locale-aware equivalents in
`lib/i18n/format.ts` taking a `locale` param:

- **`no` path delegates to (or replicates byte-identically) the existing
  hand-rolled Norwegian helpers** — their output is deliberate and tested.
- `en` (and future locales) renders via `Intl.*` with `en-GB` mapping from
  Phase 0, Europe/Oslo timezone preserved.
- Type A tests: `no` output === legacy helper output (parametrized over
  representative dates), `en` output sane.
- Legacy helpers in `lib/format/` stay untouched for unmigrated call-sites
  (admin uses `formatShortDateNb`, `formatRelativeNb` — NOT this phase).

### 4. DB-content boundary (Phase D — do not touch)

- `mergedModeContent` rules text (FormatGuideSheet on game-home) stays
  Norwegian — DB/`modeGuide` fallback is Phase D.
- `game.name`, player/course/club names = user data, never translated.
- `'(ukjent)'` display-name fallback (3× in leaderboard/page.tsx) IS UI copy →
  catalog.

### 5. Component mechanics

- Sync server components (all `*View.tsx`, `*HolesView.tsx`, shared hole
  components without `'use client'`): `useTranslations` from `next-intl`.
- Async server components (`page.tsx` files): `getTranslations`.
- Client components (podiums, HoleClient, modals, tabs): `useTranslations`.
- Every touched file migrates `next/link` → `@/i18n/navigation` `Link` and
  `next/navigation` `redirect`/`useRouter`/`usePathname` → wrapper versions.

### 6. vitest stub upgrade (prerequisite chunk)

Replace the dot-path `makeTranslator` in `vitest.setup.ts` with next-intl's
`createTranslator({ locale: 'no', messages: noMessages, namespace })` so ICU
plurals/interpolation resolve to real Norwegian in component tests. Must keep
missing-key behavior non-throwing (return the key path, mirroring today's
fallback) via `onError`/`getMessageFallback`. All existing tests must stay
green after the swap — this lands BEFORE any extraction.

### 7. English catalog

Full idiomatic English for every new key (`en.json`), translated by intent —
golf register: «slagspill» → "stroke play", «hull» → "hole(s)", «Lever
scorekort» → "Submit scorecard", «På banen» → context-appropriate. No raw key
visible under `/en/games/...`. A **catalog-parity test** asserts every key
added to `no.json` in this phase's namespaces exists in `en.json` (scoped to
the new namespaces; `no`-only fallback is for FUTURE locales, not English).

## Edge Cases & Guardrails

- **Byte-identical Norwegian:** the full vitest suite (3027+) and e2e smoke
  must pass WITHOUT changing test assertions. Only `vitest.setup.ts` mechanics
  (§6) may change. If a test asserts a string that becomes ICU-interpolated,
  the rendered output must still match exactly.
- **ICU escaping:** strings containing `{`, `}`, `'` (apostrophes in
  Norwegian genitives like «lagets») must be ICU-escaped correctly — `'` is
  the ICU escape char; literal apostrophes need `''`.
- **tabular-nums / markup-adjacent strings:** extraction must not change DOM
  structure around numbers (leaderboard alignment depends on it). Where copy
  wraps markup, prefer key pairs over restructuring.
- **`data-testid` attributes are sacred** — e2e selects on them; never
  translate or rename.
- **Plural correctness:** Norwegian and English plural rules both `one/other`
  — every count-bearing string becomes ICU plural, not string concatenation.
- **No new `force-dynamic` / no PPR regression:** `npm run build` route shape
  stays 81 ◐ (or current main baseline); locale never read in a way that
  drops a route out of PPR.
- **Realtime/score-entry paths are latency-sensitive:** HoleClient renders
  per-keystroke — `useTranslations` lookups are fine, but don't move
  translation into hot loops re-creating translators per render item.
- **Server actions returning user-visible errors:** translate at the
  rendering site by error CODE where feasible (Phase 1 `auth.errors.*`
  precedent); never `t()` inside the action with a stale locale.
- **humanizer** on any NEW Norwegian strings (should be ~none — extraction
  only); idiomatic-English pass on the full new `en` surface.

## Key Decisions

- **Whole `games/[id]` tree in scope incl. management sub-pages** (Claude) —
  clean grep boundary beats a fuzzy "player-only" split; admin/** stays out.
- **lib returns ids, components translate; dual-sourced labels get
  drift-guards** (Claude) — avoids silent NO/EN drift while admin/wizard still
  read the legacy constants.
- **`no` date output delegates to legacy hand-rolled helpers** (Claude) —
  byte-identical Norwegian is a hard criterion; Intl approximation is not.
- **Stub upgrade to `createTranslator` first** (Claude) — ICU support is a
  prerequisite for extracting any plural/interpolated string.
- **No new E2E** (Claude, mirrors Phase 1) — no authenticated game fixture
  rig exists; EN coverage is verified by catalog-parity test + build + the
  existing nb-NO-pinned e2e staying green.

**Claude's Discretion:** exact namespace granularity & key names; key-pair vs
`t.rich` for markup-adjacent copy; `formatHolesList` API shape; chunking/batch
order of view migrations.

## Success Criteria

- [x] **No hardcoded Norwegian UI literals** remain in
      `app/[locale]/games/[id]/**`, `components/hole/**`, and the
      core-loop-only lib modules (§2) — verified by the repo's æøå-grep
      (comments/test files excluded; `modeGuide`/DB fallback excluded as
      Phase D). *Evidence: non-comment æøå-grep over scope returns only JSX
      comments + the `'påmelding'` StatusChipTone enum value (code id, not
      copy); string-literal sweep clean after CSV-export extraction
      (commit 0beb715); lib modules return ids/keys (scorecardTitle,
      holeLabels) or take the word as param (formatHolesList).*
- [x] **Norwegian output unchanged:** full `npm run test` green with zero
      assertion edits; `npx playwright test` smoke green unmodified.
      *Evidence: 3260/3260 vitest (262 files); component Norwegian-copy
      assertions untouched (only sanctioned changes: redirect-mock targets +
      lib return-contract tests per §2). Playwright: 48 passed, 7 env-skipped,
      1 failed — `e2e/signup/open-register.spec.ts:27` verified failing
      identically on clean origin/main (isolated worktree @ 2e983d8) →
      pre-existing, filed as #559.*
- [x] **English coverage:** catalog-parity test passes (every new `no` key
      has an `en` key); `npm run build` green; no raw catalog key in either
      locale. *Evidence: `messages/catalogParity.test.ts` asserts full no/en
      key symmetry; build green; opus idiomatic-English pass (commit 5b4bdff)
      reviewed all six namespaces, fixed 12 values incl. broken `{suffix}`
      interpolations → ICU selectordinal.*
- [x] **Drift-guards in place** for `STATUS_LABELS`, `MODE_LABELS`,
      `formatDisplayLabel` (Type A, parametrized over all members).
      *Evidence: `lib/games/status.i18n.test.ts` (4 statuses),
      `lib/scoring/modes/types.i18n.test.ts` (22 modes + 6 variant cases).*
- [x] **Locale-aware date/countdown helpers** in `lib/i18n/format.ts` with
      Type A tests proving `no` === legacy output; core-loop call-sites
      migrated. *Evidence: formatTeeOffDateLocale/-TimeLocale,
      formatShortDateWithYearLocale, formatCountdownLocale delegate to legacy
      for 'no' (lib/i18n/format.test.ts); call-sites in (home)/page.tsx,
      trekk-fra, slett, ScheduledWaitingRoom migrated.*
- [x] **Navigation imports migrated** in every touched file
      (`@/i18n/navigation`), verified by grep over the phase's file set.
      *Evidence: zero `from 'next/link'` in scope; redirect object-form with
      getLocale in 14 files (commit 5225f2f + holes carry-over); notFound
      stays next/navigation by design.*
- [x] **PPR shape holds:** build output shows no route in `games/[id]`
      losing ◐/static status vs current main. *Evidence: 82 ◐ routes after
      chunk 1 (stub/catalog-only state) and 82 ◐ in the final build — stable
      across all extraction chunks.*
- [x] MINOR version bump + CHANGELOG entry per `docs/changelog-conventions.md`
      in the user-visible commit. *Evidence: commit cf00d55 — v1.114.0, new
      open 1.114.y series, 1.113.y wrapped per convention, tagline through
      humanizer.*

## Gates (per chunk)

- [x] `npx tsc --noEmit` after every chunk.
- [x] Co-located `*.test.ts(x)` for changed files after every chunk.
- [x] `npm run build` after the shared-modules chunk, after the leaderboard
      page chunk, and before evaluation (route-shape diff checked — 82 ◐
      stable).
- [x] Full `npm run test` before evaluation (3260/3260, post-rebase onto
      origin/main @ 2e983d8).
- [x] `npx playwright test` (existing smoke) before evaluation (48 passed /
      7 env-skipped / 1 pre-existing main failure → #559).
- [x] Version bump + CHANGELOG in the same commit as the user-visible change;
      extraction-only commits use `refactor(...)`.

## Files Likely Touched

- `vitest.setup.ts` — createTranslator stub upgrade
- `messages/no.json`, `messages/en.json` — `game`, `holes`, `scorecard`,
  `leaderboard`, `gameStatus`, `modes` namespaces
- `app/[locale]/games/[id]/**` — ~50 components/pages (extraction + nav imports)
- `components/hole/*` — 7 components
- `lib/games/status.ts`, `lib/scoring/modes/types.ts`,
  `lib/games/formatLabel.ts`, `lib/games/scorecardTitle.ts`,
  `lib/wolf/holeLabels.ts`, `lib/leaderboard/formatHolesList.ts`,
  `lib/scoring/sideTournament.ts` — id/key pattern + drift-guards
- `lib/i18n/format.ts` + tests — tee-off/countdown/short-date locale variants
- `package.json`, `package-lock.json`, `CHANGELOG.md`

## Out of Scope

- `app/[locale]/admin/**` (Phase 2c — incl. `formatRelativeNb`,
  `formatShortDateNb` admin call-sites)
- Wizard / create flows (2b), Klubb/Liga/Cup (2d), Profile/Friends beyond
  Phase 1 (2e), public/reference surfaces (2f)
- DB format content + FormatGuideSheet rules text (Phase D)
- Mail (Phase M); gd/ga (Phase G)
- New E2E rig for authenticated EN rendering
- Copy EDITS in either language (extraction is 1:1; copy improvements are
  separate issues)
