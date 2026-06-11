# Spec: i18n Fase 2b — create-flows (wizard, GameForm, CourseForm, opprett-spill/-bane) — #561

> **Type:** Phase contract under epic #60 (master spec:
> `.forge/contracts/60-engelsk-ui-i18n.md`, also posted on #60). Phase 0
> (#475, PR #542) shipped plumbing, Phase 1 (#552, PR #553) the pilot, Phase
> 2a (#554, PR #560) the core game loop. This phase extracts the **create
> flows** — an English user can play a round in English but cannot *create*
> a game or course without hitting a wall of Norwegian.

## Problem

The game-creation wizard (`admin/games/new/**`, ~25 files, shared by the
user-facing `/opprett-spill` door and the admin door), the quick-setup
`GameForm`, the `CourseForm` (shared by `/opprett-bane` and the admin door),
and their server actions hold ~300 hardcoded Norwegian UI literals, plus
Norwegian baked into create-flow lib modules: `lib/wizard/intent.ts`
(intent labels/descriptions), `lib/games/allowanceCopy.ts` (21 per-mode
brutto helper sentences), `lib/admin/gameErrorMessages.ts` (~16 new-game
error strings), and **two independent hardcoded `NORWEGIAN_MONTHS` arrays**
(`lib/games/autoGameName.ts` + `ReadyStep.tsx`) that render Norwegian month
names even under `/en/`.

## Research Findings (scout 2026-06-12)

- **Wizard lives under `app/[locale]/admin/games/new/`** but is the engine
  for BOTH doors: `opprett-spill/page.tsx` imports `GameWizard`,
  `opprett-bane/page.tsx` imports `CourseForm` + `createCourse` from the
  admin tree. `games/[id]/rediger` (2a-migrated) also mounts the wizard.
  Liga flows (`admin/liga/**`, `klubber/[id]/liga/ny`) import `GameForm` —
  those PAGES are phase 2d, but the shared component translating
  in-component is safe (byte-identical `no`, bonus-English under `/en`).
- **`CREATE_GAME_LABEL`** (`lib/games/createGameLabel.ts`): only remaining
  consumer is `admin/games/page.tsx` (phase 2c) → NOT touched here.
- **`ERROR_MESSAGES_NEW_GAME`** consumers are `admin/games/new/page.tsx` +
  `opprett-spill/page.tsx` — both in scope, so the map can be fully replaced
  by catalog lookups. `ERROR_MESSAGES_EXISTING_GAME` (same file) is consumed
  by `admin/games/[id]` (2c) and stays Norwegian/untouched.
- **`COURSE_ERROR_MESSAGES`** (9 entries) is inline in `opprett-bane/page.tsx`;
  `admin/courses/[id]/edit/page.tsx` has its OWN map with deliberately
  different wording (`'tee'` vs `'tee-boks'`) — do NOT unify; the edit map
  is 2c.
- **`MODE_SUMMARY_LABELS`** in `ReadyStep.tsx` deliberately diverges from
  `MODE_LABELS` (`'Solo slagspill netto'` vs `'Slagspill'`) — extract as its
  own keys, never merged with `modes.*`.
- **`bruttoHelperFor`** (`lib/games/allowanceCopy.ts`) consumers: GameForm +
  GameWizard only — both in scope; Norwegian can leave the lib entirely.
- **`INTENT_LABELS`/`INTENT_DESCRIPTIONS`** (`lib/wizard/intent.ts`): only
  IntentSelector renders them; all other importers take `type Intent` /
  `parseIntent` only. (`FormatsManager.tsx` has a local same-named map —
  different module, 2c, untouched.)
- **DB boundary:** `FormatGrid`/`CupSetup`/`FormatGuideList` render
  `formats.display_name` / `short_description` / guide rules from DB or
  `modeGuide.ts` — **Phase D**, untouched. Only structural chrome strings
  («Vanligst», «Flere muligheter», «Velg spillform», «Slik funker det →»,
  «Slik funker de. Trykk for å lese mer.») are extracted.
- **`getFormatsForIntent` `unstable_cache`** caches DB format copy without a
  locale key — irrelevant while DB copy is Norwegian-only; MUST be
  locale-keyed in Phase D (noted there, no change now).
- **Navigation:** scope files import `redirect` (3 pages + 2 server actions),
  `Link`/`useRouter`/`usePathname` (GameWizard) from next/*. `useSearchParams`
  has no i18n wrapper and stays `next/navigation`. `notFound` stays.
- **No `data-testid` in scope; no `force-dynamic`.** Tests select via
  role/name/text — byte-identical Norwegian is what keeps them green.

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
  `@/i18n/navigation` + `getLocale()`; `userId as string` after guard is
  the established narrowing pattern.
- ICU: literal apostrophes escaped `''`; no HTML in messages (key pairs or
  `t.rich`); never reuse a key across different word orders.
- rootParams/cacheComponents: no `setRequestLocale`, no new force-dynamic,
  PPR route shape (82 ◐ baseline) must hold.
- Locale-aware date helpers live in `lib/i18n/format.ts`; the `no` path
  delegates to (or replicates byte-identically) legacy output.

## Design

### 1. Scope = the create surface

Extract every user-facing string (JSX text, aria-labels, placeholders,
button labels, validation/error/empty states) in:

- `app/[locale]/opprett-spill/page.tsx`, `app/[locale]/opprett-bane/page.tsx`
- `app/[locale]/admin/games/new/**` — page, GameWizard, GameForm,
  IntentSelector, ModeSelector, FormatGrid (chrome only), CupSetup,
  TeamSizeSelector, SideTournamentsBanner, all `sections/*`, `actions.ts`
  (user-facing error codes), `useGameFormState.ts` (any user-visible strings)
- `app/[locale]/admin/courses/CourseForm.tsx` +
  `app/[locale]/admin/courses/new/page.tsx` + `new/actions.ts`
- Shared components: `components/admin/AllowanceField.tsx`,
  `components/FormatGuideSheet.tsx` + `FormatGuideList.tsx` (structural
  labels only), `components/ui/FormatStyleBadge.tsx`
- Lib modules (§2): `lib/wizard/intent.ts`, `lib/games/allowanceCopy.ts`,
  `lib/admin/gameErrorMessages.ts` (NEW_GAME half),
  `lib/games/autoGameName.ts`

**Namespaces** (final granularity = builder's call per `messages/README.md`):
`wizard.*` (intent tiles, step chrome, modeSelector, formatGrid chrome,
teamSize, cupSetup, sections, readyStep incl. mode-summary labels, wizard
errors), `gameForm.*` (or `wizard.form.*`), `courseForm.*` (form + errors +
opprett-bane page), extend `modes` with `playStyle` keys for
FormatStyleBadge if natural.

### 2. Lib modules — Norwegian leaves lib where consumers allow

- `lib/wizard/intent.ts`: labels/descriptions move to catalog;
  IntentSelector translates by intent id. Type/`parseIntent` stay.
- `lib/games/allowanceCopy.ts`: `bruttoHelperFor` becomes key-returning (or
  call-sites translate by mode); Norwegian deleted (grep-verify only GameForm
  + GameWizard consume it first).
- `lib/admin/gameErrorMessages.ts`: `ERROR_MESSAGES_NEW_GAME` replaced by
  `t()`-by-error-code at the two rendering pages; map deleted.
  `ERROR_MESSAGES_EXISTING_GAME` untouched (2c).
- `lib/games/autoGameName.ts`: `suggestGameName` gets a locale param; `no`
  path byte-identical to today (keep the Norwegian month array or delegate),
  `en` via `Intl.DateTimeFormat('en-GB', { month: 'long' })`-equivalent in
  `lib/i18n/format.ts`. Type A tests: `no` === legacy output.
- `ReadyStep.tsx` local `formatTeeOff` + months array: replace with a
  locale-aware helper (reuse/extend `lib/i18n/format.ts` tee-off helpers
  from 2a where they fit); `no` output byte-identical.
- `MODE_LABELS` consumer in GameWizard (line ~542) translates via existing
  `modes.*` keys. Existing drift-guards already cover the constants;
  GameWizard was the last *wizard-side* consumer but admin (2c), signup +
  spillformater (2f), mail (M) still read the constants — **constants stay,
  drift-guards stay** (removal happens when the last consumer migrates).

### 3. Shared components translate in-component

`AllowanceField`, `FormatStyleBadge`, `FormatGuideSheet`/`List` chrome:
`useTranslations` inside the component. Out-of-scope consumers (liga pages,
spillformater) keep byte-identical Norwegian on `no` and get bonus English
under `/en` — acceptable, same precedent as the wizard being shared with
`games/[id]/rediger`.

### 4. Server actions

User-facing failures stay error-CODE-based (`?error=<code>` redirect →
page translates by code), per Phase 1 `auth.errors.*` precedent. Log-only
strings stay as-is. `redirect()` calls in `admin/games/new/actions.ts` +
`admin/courses/new/actions.ts` migrate to `@/i18n/navigation` object-form
with `getLocale()`.

### 5. Navigation imports

Every touched file: `next/link` → `@/i18n/navigation` `Link`;
`redirect`/`useRouter`/`usePathname` → wrapper versions. `useSearchParams` +
`notFound` stay `next/navigation`.

### 6. English catalog

Full idiomatic English for every new key, golf register («spillform» →
"game format", «hurtig-oppsett» → "quick setup", «Opprett spill» → "Create
game", «bane» → "course", «tee» → "tee"). Idiomatic-English review pass
(opus) over the full new `en` surface before evaluation. Spelling: British
«organis-» per existing catalog convention.

## Edge Cases & Guardrails

- **Byte-identical Norwegian:** full vitest suite green with zero assertion
  edits (IntentSelector/ModeSelector/GameWizard/TeamSizeSelector/section
  tests/CourseForm tests all assert Norwegian copy via the stub).
- **ICU escaping:** apostrophes (`lagets`), `{`/`}` in any extracted string;
  CupSetup `pointsHint` template literal becomes ICU with `{matchCap}`
  (plural if grammatically needed).
- **aria-labels are copy too** («Hva slags arrangement?», «Færre spillere»,
  «Fjern X fra spill», «Søk i spillere») — extract them all; the æøå-grep
  criterion covers attributes.
- **DB content untouched:** `display_name`/`short_description`/guide rules
  render exactly as before in both locales (Norwegian DB copy under `/en`
  is known Phase D debt).
- **Deliberately different wordings stay different:** opprett-bane error map
  vs admin-edit error map; `MODE_SUMMARY_LABELS` vs `MODE_LABELS`. Never
  merge keys with different copy.
- **Wizard URL state:** GameWizard's `router.replace`/`usePathname` step
  tracking must keep working under `/en/...` (i18n wrappers handle prefix).
- **No PPR regression:** build route shape stays at the current main
  baseline (82 ◐); no new force-dynamic.
- **humanizer:** no new Norwegian expected (pure extraction); if any
  Norwegian string is genuinely NEW, run humanizer on it.
- **Worktree discipline:** all edits under the worktree root; subagents must
  be given absolute worktree paths.

## Key Decisions

- **Whole `admin/games/new/**` wizard tree + CourseForm/new-course actions
  in scope although under `admin/`** (Claude) — the wizard IS the create
  flow for both doors; clean grep boundary. Admin ledger/edit/slett pages,
  liga pages, `CREATE_GAME_LABEL` stay 2c/2d.
- **Shared components translate in-component, no dual-sourcing** (Claude) —
  consumers outside scope get bonus English, Norwegian stays byte-identical;
  no drift-guard needed for strings that fully leave their module.
- **Error maps replaced by catalog lookups where all consumers are in scope;
  EXISTING_GAME map untouched** (Claude).
- **`suggestGameName` + ReadyStep tee-off become locale-aware now** (Claude)
  — they'd render Norwegian months under `/en` otherwise; `no` byte-identical
  via delegation, covered by Type A tests.
- **No new E2E** (Claude, mirrors 2a) — catalog-parity + build + untouched
  nb-pinned suite carry verification.

**Claude's Discretion:** exact namespace granularity & key names; key-pair
vs `t.rich`; whether `bruttoHelperFor` returns keys or call-sites map mode →
key directly; chunking order.

## Success Criteria

- [ ] **No hardcoded Norwegian UI literals** remain in
      `app/[locale]/opprett-spill/**`, `app/[locale]/opprett-bane/**`,
      `app/[locale]/admin/games/new/**`, `admin/courses/CourseForm.tsx`,
      `admin/courses/new/**`, the §1 shared components, and the §2 lib
      modules — verified by non-comment æøå-grep (DB-content render paths
      excluded as Phase D).
- [ ] **Norwegian output unchanged:** full `npm run test` green with zero
      assertion edits in existing tests; playwright smoke green (modulo the
      known pre-existing #559 failure).
- [ ] **English coverage:** `messages/catalogParity.test.ts` green (every
      new `no` key has an `en` key); `npm run build` green; no raw catalog
      key visible in either locale on the wizard/course-form surfaces.
- [ ] **Locale-aware month/date rendering:** `suggestGameName` and the
      ReadyStep tee-off line render English months under `en`, byte-identical
      Norwegian under `no` (Type A tests for both paths).
- [ ] **Navigation imports migrated** in every touched file (grep-verified:
      no `next/link`, no bare-string `redirect` from `next/navigation` in
      scope; `useSearchParams`/`notFound` exempt).
- [ ] **PPR shape holds:** `npm run build` route shape unchanged vs main
      baseline (82 ◐).
- [ ] MINOR version bump + CHANGELOG entry per
      `docs/changelog-conventions.md` in the user-visible commit.

## Gates (per chunk)

- [ ] `npx tsc --noEmit` after every chunk.
- [ ] Co-located `*.test.ts(x)` for changed files after every chunk.
- [ ] `npm run build` after the lib/shared-modules chunk and before
      evaluation (route-shape diff checked).
- [ ] Full `npm run test` before evaluation.
- [ ] `npx playwright test` (existing smoke) before evaluation.
- [ ] Version bump + CHANGELOG in the same commit as the user-visible
      change; extraction-only commits use `refactor(...)`.

## Files Likely Touched

- `messages/no.json`, `messages/en.json` — `wizard`, `gameForm`,
  `courseForm` (+ possibly `modes.playStyle`) namespaces
- `app/[locale]/opprett-spill/page.tsx`, `app/[locale]/opprett-bane/page.tsx`
- `app/[locale]/admin/games/new/**` — ~25 files
- `app/[locale]/admin/courses/CourseForm.tsx`, `admin/courses/new/*`
- `components/admin/AllowanceField.tsx`, `components/FormatGuideSheet.tsx`,
  `components/FormatGuideList.tsx`, `components/ui/FormatStyleBadge.tsx`
- `lib/wizard/intent.ts`, `lib/games/allowanceCopy.ts`,
  `lib/admin/gameErrorMessages.ts`, `lib/games/autoGameName.ts` (+ tests)
- `lib/i18n/format.ts` + tests (month/tee-off helpers)
- `package.json`, `package-lock.json`, `CHANGELOG.md`

## Out of Scope

- `app/[locale]/admin/**` beyond `games/new/**` + `courses/{CourseForm,new}`
  (ledger, `[id]/edit`, `[id]/slett`, formats manager, spillere — Phase 2c;
  incl. `formatShortDateNb` call-sites and `ERROR_MESSAGES_EXISTING_GAME`)
- `lib/games/createGameLabel.ts` (consumer is 2c)
- Liga/Klubb/Cup pages (2d); profile/friends/innboks/finn-turneringer (2e);
  signup/spillformater/legal/home (2f)
- DB format content, `modeGuide.ts` guide rules, locale-keying
  `getFormatsForIntent` cache (Phase D)
- Mail (M); gd/ga (G)
- Copy EDITS in either language; unifying the two course error maps
