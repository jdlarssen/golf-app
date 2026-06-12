# Spec: i18n Fase 2c — Sekretariatet (admin-ledger, spillstyring, spillere, baner, formats, lanseringer) — #563

> **Type:** Phase contract under epic #60 (master spec:
> `.forge/contracts/60-engelsk-ui-i18n.md`, also posted on #60). Phase 0
> (#475, PR #542) shipped plumbing, Phase 1 (#552, PR #553) the pilot, Phase
> 2a (#554, PR #560) the core game loop, Phase 2b (#561) the create flows.
> This phase extracts the **Sekretariat** — the admin management surface. An
> English admin can create a game in English but then manages it (start,
> invite, flights, signups, remind, end, delete), manages players, courses,
> formats and lanseringer entirely in Norwegian.

## Problem

The admin management flats hold ~350 hardcoded Norwegian UI literals across
~40 files: the dashboard (`admin/page.tsx`, greeting + tiles + activity
ledger), the game ledger (`admin/games/page.tsx`), the game detail page
(`admin/games/[id]/page.tsx`, ~60 strings — the largest single file in the
epic so far) plus its 8 action-button components and 8 sub-routes
(edit/slett/avslutt/avslutt-likevel/status/signups/trekk-spiller), player
management (`admin/spillere/**`), the course catalog/edit/slett
(`admin/courses/**` minus the 2b-migrated CourseForm/new), the formats
manager, and lanseringer. Plus Norwegian baked into shared libs:
`CREATE_GAME_LABEL`, both halves of `lib/admin/gameErrorMessages.ts`, and
five hardcoded-Norwegian date/relative-time render paths
(`formatShortDateNb`/`formatShortDateNbWithYear`/`formatRelativeNb`
call-sites + two hand-rolled inline relative-time functions).

## Research Findings (scout 2026-06-12)

- **`CREATE_GAME_LABEL`** (`lib/games/createGameLabel.ts`): single Norwegian
  string; only consumer is `admin/games/page.tsx` (this phase) → constant
  dies here.
- **`lib/admin/gameErrorMessages.ts`:** `ERROR_MESSAGES_EXISTING_GAME` (15
  entries) is consumed solely by `admin/games/[id]/page.tsx` → replaced by
  catalog lookups, map dies. `ERROR_MESSAGES_NEW_GAME` (22 entries, marked
  `@deprecated` since 2b) is still read by `admin/games/[id]/edit/page.tsx`
  (this phase) **and** `games/[id]/rediger/page.tsx` (2a-migrated page that
  still reads the map — known 2c debt per the drift-guard comment). Migrating
  BOTH to `wizard.errors.*` lookups kills the map, `buildErrorMessage`, and
  the drift-guard test `lib/admin/gameErrorMessages.i18n.test.ts` — the file
  can be deleted whole.
- **`STATUS_LABELS`** (`lib/games/status.ts`): NOT a 2c target. 2c-scope
  pages map status → `StatusChipTone` only; the dual-source + drift-guard
  from 2a stays untouched.
- **`MODE_LABELS`/`formatDisplayLabel`:** the game detail page renders
  «Spillform» via the constants → translate via existing `modes.*` keys
  (same move GameWizard made in 2b). Constants + drift-guards stay (signup +
  spillformater (2f) and mail (M) still consume).
- **Date/relative-time:** `formatShortDateNb` ×10 call-sites,
  `formatShortDateNbWithYear` ×4, `formatRelativeNb` ×1 in scope; plus
  hand-rolled `relativeNb()` (`admin/spillere/[id]/page.tsx:44–58`) and
  `timeAgo()` (`PendingInvitations.tsx:17–29`) with their own deliberate
  granularities («i går», «akkurat nå»). 2a established the pattern:
  locale-aware helpers in `lib/i18n/format.ts` whose `no` path delegates to
  (or replicates byte-identically) the legacy helper, with Type A parity
  tests.
- **Error flow:** all 2c server actions already use the `?error=<code>`
  redirect pattern; Norwegian lives only in page-level inline maps (games
  ledger, signups, spillere ×2, courses ×3, formats, lanseringer) →
  mechanical map-to-catalog conversion, no action-signature changes.
- **`admin/courses/[id]/edit/page.tsx`** has its own 12-entry error map with
  deliberately different wording from opprett-bane («tee» vs «tee-boks») —
  extract as its own keys, never unified (2b decision carried forward).
- **Navigation:** 4 files import `Link` from `next/link`; ~17 `actions.ts`
  files import `redirect` from `next/navigation`; `CoursesLedgerClient.tsx`
  imports `useRouter` + `useSearchParams` from `next/navigation` on one line
  → split (`useRouter` → wrapper, `useSearchParams` stays). `notFound`
  stays.
- **`localeCompare('nb')`** in CoursesLedgerClient is sort collation, not
  display copy — stays.
- **Catalog:** `messages/no.json` is 1871 lines, 15 top-level namespaces; no
  `admin.*` yet, but `messages/README.md` already lists `admin` as a planned
  top-level key.
- **DB boundary:** FormatsManager/AuditLogList render `formats` table
  content (`display_name` etc.) — Phase D, untouched. Only structural chrome
  («Vis inaktive», «Synlig», «Endringslogg…», change-type labels) is
  extracted.
- **`window.confirm` strings** (Start/End/Reopen/Approve buttons) are
  user-facing copy — extracted like any other string.

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
  `@/i18n/navigation` + `getLocale()`.
- ICU: literal apostrophes escaped `''`; no HTML in messages (key pairs or
  `t.rich`); never reuse a key across different word orders.
- rootParams/cacheComponents: no `setRequestLocale`, no new force-dynamic,
  PPR route shape (main baseline, route-summary diff vs origin/main) must
  hold.
- Locale-aware date helpers live in `lib/i18n/format.ts`; the `no` path
  delegates to (or replicates byte-identically) legacy output, Type A tests.

## Design

### 1. Scope = the admin management surface

Extract every user-facing string (JSX text, aria-labels, placeholders,
button labels, `window.confirm` prompts, validation/error/empty/status
states) in:

- `app/[locale]/admin/page.tsx` (dashboard incl. greeting, tiles, activity
  ledger, PlayerKlubbhus view) + `admin/games/page.tsx` (resultatprotokoll)
- `app/[locale]/admin/games/[id]/page.tsx` + the button/section components
  (`StartGameButton`, `StartScheduledGameButton`, `EndGameButton`,
  `ReopenGameButton`, `ReopenScorecardButton`, `ApprovePlayerButton`,
  `InviteToGameSection`, `InviteToGameClient`,
  `RegistrationOverviewSection`, `CopyShareLinkButton`, `FlighterSeksjon`)
- `app/[locale]/admin/games/[id]/{edit,slett,avslutt,avslutt-likevel,status,signups,trekk-spiller}/**`
  (incl. `SideWinnersForm`, `RemindButton`, `PåmeldingerClient`)
- `app/[locale]/admin/spillere/**` (page, `InviteForm`,
  `PendingInvitations`, `PlayersList`, `[id]/page`, `[id]/slett`,
  `invitations/[id]/trekk-tilbake`)
- `app/[locale]/admin/courses/{page.tsx,CoursesLedgerClient.tsx}` +
  `courses/[id]/{edit,slett}/**` (incl. `ArchivedTeesSection`; CourseForm
  itself is 2b-done — only the edit-page chrome/error map is new)
- `app/[locale]/admin/formats/**` (chrome only) +
  `app/[locale]/admin/lanseringer/**`
- `games/[id]/rediger/page.tsx` — only the `ERROR_MESSAGES_NEW_GAME` →
  `wizard.errors.*` lookup swap (kills the lib map)
- Lib (§2): `lib/games/createGameLabel.ts`,
  `lib/admin/gameErrorMessages.ts`, `lib/i18n/format.ts` extensions

**Namespace:** new top-level `admin.*` per `messages/README.md`, sub-spaced
by surface (`admin.dashboard`, `admin.games` (ledger), `admin.game` (detail
+ buttons + sub-routes, possibly further split), `admin.players`,
`admin.courses`, `admin.formats`, `admin.launches`). Final granularity =
builder's call; keys named for meaning, English camelCase.

### 2. Lib modules

- `lib/games/createGameLabel.ts`: consumer translates via catalog key;
  constant + file deleted (grep-verify single consumer first).
- `lib/admin/gameErrorMessages.ts`: `admin/games/[id]/page.tsx` translates
  existing-game error codes via `admin.game.errors.*`;
  `admin/games/[id]/edit/page.tsx` + `games/[id]/rediger/page.tsx` translate
  new-game codes via the existing `wizard.errors.*` keys (already in
  catalog since 2b). Then both maps, `buildErrorMessage`, the drift-guard
  test, and the whole file are deleted.
- `lib/i18n/format.ts` gains `formatShortDateLocale`,
  `formatShortDateWithYearLocale`, `formatRelativeLocale` (names = builder's
  call; reuse existing helpers if 2a already added equivalents) — `no` path
  byte-identical to `formatShortDateNb`/`formatShortDateNbWithYear`/
  `formatRelativeNb`, Type A parity tests. All in-scope call-sites migrate.
- Hand-rolled `relativeNb()` and `timeAgo()`: become locale-aware with their
  own deliberate granularities preserved byte-identically on `no` (own keys
  or own helper — do NOT force them onto `formatRelativeNb`'s scale).
- `admin/page.tsx` `greeting()` time-of-day words + `formatDateNb()` «uke
  {n}» line → catalog keys (ICU args for name/date/week).

### 3. Server actions

No signature changes: failures stay `?error=<code>`-redirect-based; pages
translate by code. `redirect` imports migrate to `@/i18n/navigation`
object-form with `getLocale()` in every touched `actions.ts` (~17 files).

### 4. Duplicated wordings

`TABS` vs `STATUS_LABEL` in signups (same four words, same surface) may
share keys; the slett-confirmation boilerplate («Bekreft sletting»,
«Handlingen kan ikke angres.», «Avbryt») recurs across 4 slett/trekk-tilbake
pages — builder may centralize under `admin.confirm.*` (or `common.*`)
ONLY where the Norwegian copy is byte-identical today. Deliberately
different wordings (course-edit vs opprett-bane error maps) stay different.

### 5. English catalog

Full idiomatic English for every new key, golf/secretariat register
(«Resultatprotokoll» → "Results ledger", «Sak» → "Case", «Faresone» →
"Danger zone", «Trekk spiller» → "Withdraw player", «Påminnelse» →
"Reminder"). British «organis-» spelling per existing convention.
Idiomatic-English review pass (opus) over the full new `en` surface before
evaluation.

## Edge Cases & Guardrails

- **Byte-identical Norwegian:** full vitest suite green with zero assertion
  edits (admin component tests assert Norwegian via the stub).
- **ICU escaping:** apostrophes, `«»` quotes stay literal text;
  `'Slett «{name}»?'`, `'Sak {year}-{caseNumber}'`, pluralised counts
  (`spiller/spillere`, `slaggerad/slaggerader`, `invitasjon/invitasjoner`,
  `bane/baner`, `hull`, `tee-boks(er)`) become ICU plural/select.
- **aria-labels + placeholders + sr-only + `window.confirm` are copy too.**
- **DB content untouched:** `formats` table copy renders as before in both
  locales (Phase D debt).
- **Emoji-prefixed status strings** («⏳ Venter», «✓ Levert», «✓ Kopiert»)
  keep emoji inside the message value (presentation is part of the copy).
- **No PPR regression:** build route-summary diff vs origin/main = empty;
  no new force-dynamic.
- **`useSearchParams`/`notFound` stay on `next/navigation`;** split mixed
  import lines.
- **humanizer:** pure extraction, no new Norwegian expected; if any string
  is genuinely NEW, run humanizer.
- **Drift-guards:** `status.i18n.test.ts` and `allowanceCopy`/`MODE_LABELS`
  guards stay (other consumers remain); ONLY
  `gameErrorMessages.i18n.test.ts` dies (its module dies).

## Key Decisions

- **`games/[id]/rediger/page.tsx` error-lookup swap is IN scope although
  the page is 2a turf** (Claude) — it's a ≤10-line mechanical swap to keys
  that already exist, and it's what lets the deprecated lib file die whole.
  Leaving it would keep a dead-flagged map + drift-guard alive a full phase
  for nothing.
- **Klubber/liga/cup admin pages stay 2d; profile/friends/innboks 2e;
  signup/spillformer/legal 2f** (master spec).
- **STATUS_LABELS untouched** (Claude) — no 2c-scope consumer renders it.
- **Slett-boilerplate may centralize only where byte-identical** (Claude).
- **No new E2E** (Claude, mirrors 2a/2b) — catalog-parity + build +
  untouched nb-pinned suite carry verification.

**Claude's Discretion:** exact namespace granularity & key names; helper
names in `lib/i18n/format.ts`; whether signups TABS/STATUS_LABEL share keys;
chunking order.

## Success Criteria

- [ ] **No hardcoded Norwegian UI literals** remain in the §1 scope —
      verified by non-comment æøå string-literal grep over
      `app/[locale]/admin/**` (excluding `games/new/**`, `courses/new/**`,
      `klubber/**`, `liga/**`, `cup/**`) + the §2 lib modules, plus a
      common-no-words-without-æøå sweep (Velg/Lagre/Slett/Avbryt/Venter/…).
      DB-content render paths excluded (Phase D).
- [ ] **`lib/admin/gameErrorMessages.ts` + drift-guard test +
      `lib/games/createGameLabel.ts` deleted**; no remaining importer
      (grep-verified).
- [ ] **Norwegian output unchanged:** full `npm run test` green with zero
      assertion edits in existing tests; playwright smoke green (modulo
      known pre-existing failures).
- [ ] **English coverage:** `catalogParity.test.ts` green; `npm run build`
      green; no raw catalog key visible in either locale on the admin
      surfaces; opus idiomatic-English pass done.
- [ ] **Locale-aware dates/relative time:** in-scope
      `formatShortDateNb`/`WithYear`/`formatRelativeNb` call-sites +
      `relativeNb()`/`timeAgo()` render English under `en`, byte-identical
      Norwegian under `no` (Type A parity tests).
- [ ] **Navigation imports migrated** in every touched file (grep-verified:
      no `next/link` Link, no `next/navigation` `redirect`/`useRouter` in
      scope; `useSearchParams`/`notFound` exempt).
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

1. **Lib foundation:** `lib/i18n/format.ts` extensions + Type A tests;
   `admin.*` namespace skeleton; `CREATE_GAME_LABEL` +
   `gameErrorMessages.ts` retirement (incl. the three consumer-page lookup
   swaps + drift-guard deletion).
2. **Dashboard + ledger:** `admin/page.tsx`, `admin/games/page.tsx`,
   `admin/loading.tsx` (if any copy).
3. **Game detail:** `admin/games/[id]/page.tsx` + the 11 button/section
   components.
4. **Game sub-routes:** edit, slett, avslutt (+SideWinnersForm),
   avslutt-likevel, status (+RemindButton), signups (+PåmeldingerClient),
   trekk-spiller + their actions.ts navigation swaps.
5. **Spillere:** all of `admin/spillere/**`.
6. **Courses:** ledger + CoursesLedgerClient + [id]/edit
   (+ArchivedTeesSection) + [id]/slett.
7. **Formats + lanseringer** chrome.
8. **English idiomatic pass (opus) + feat-commit:** MINOR bump + CHANGELOG
   + README touch-up.

## Files Likely Touched

- `messages/no.json`, `messages/en.json` — new `admin.*` namespace
- `app/[locale]/admin/**` — ~40 files (see §1)
- `app/[locale]/games/[id]/rediger/page.tsx` — error-lookup swap
- `lib/games/createGameLabel.ts` (deleted),
  `lib/admin/gameErrorMessages.ts` + `.i18n.test.ts` (deleted)
- `lib/i18n/format.ts` + tests
- `package.json`, `package-lock.json`, `CHANGELOG.md`, `README.md`

## Out of Scope

- `admin/klubber/**`, `admin/liga/**`, `admin/cup/**` (Phase 2d)
- Profile/friends/innboks/finn-turneringer (2e);
  signup/spillformer/legal/home (2f)
- DB format content (`formats` table values in FormatsManager/AuditLogList),
  `modeGuide.ts`, locale-keying `getFormatsForIntent` cache (Phase D)
- Mail (M); gd/ga (G)
- Copy EDITS in either language; unifying deliberately-different error maps;
  `STATUS_LABELS`/`MODE_LABELS` constant removal (other consumers remain)
