# Evaluation: #498 — Kompakte format-kort + «?»-overlay + Spillformater-redesign

Fresh-context skeptical verification against `.forge/contracts/498-wizard-compact-format-cards.md`.
Commits evaluated: `e338406..HEAD` (5 commits).

## Per-criterion verdict

### A. FormatGrid — kompakt stil

| Criterion | Verdict | Evidence |
|---|---|---|
| Ikoner fjernet (`formatIconFor`/`icon_key` ikke brukt i FormatGrid) | MET | `FormatGrid.tsx` has no `formatIconFor` import; `icon_key` referenced only in the test fixture row() builder, never rendered. |
| Kollapset kort: navn + chip(s), ingen forklaring, 2-kol, ≥44px | MET | `FormatGrid.tsx:96-114` — collapsed card is `min-h-[44px]`, renders `display_name` + `FormatStyleBadge`, no `short_description`. Grid `grid-cols-2` at `:133,:148`. |
| Gruppe-inndeling: synlig `Vanligst` + `Flere muligheter` | MET | `FormatGrid.tsx:127` («Vanligst», gated by `showGroupHeaders`), `:143` («Flere muligheter»). |
| Valgt kort → full bredde + short_description + «Slik funker det →» som åpner ark (ikke nav) | MET | `FormatGrid.tsx:58` `col-[1/-1]`; `:79-81` short_description; `:82-90` «Slik funker det →» button calls `onShowGuide(f.slug)` (no `<a>`/href). |
| Bytte av format kollapser forrige, utvider nytt | MET | Single `value` prop drives `selected = value === f.slug` (`:54`); switching value re-renders one expanded card. |
| `prefers-reduced-motion`: ingen utvid/kollaps-animasjon | MET | Expand is pure grid-column reflow with no CSS transition/animation on the card — nothing to suppress. Sheet animation separately suppressed (globals.css:487-492). |

### B. Solo/Lag-chips

| Criterion | Verdict | Evidence |
|---|---|---|
| `PLAY_STYLE_LABELS.individual === 'Solo'` | MET | `types.ts:229`. |
| flexible UTEN teamSize → to chips (Solo+Lag) | MET | `FormatStyleBadge.tsx:64-71`. |
| flexible MED teamSize → én chip | MET | `FormatStyleBadge.tsx:75-94` (≥2→team, 1→solo). |
| Kategori-tokens i `:root` + `@media dark` + `[data-theme='dark']`; gull ikke brukt | MET | `globals.css` `:root` 44-49, `@media (prefers-color-scheme: dark)` (block at :135) 149-154, `[data-theme='dark']` (block at :223) 237-242. Chip CSS uses `var(--chip-*)`, never `--accent`. |

Note: `PLAY_STYLE_LABELS.flexible` retained as `'Solo eller lag'` (`types.ts:231`) but is dead-as-visible-chip (badge renders two chips for flexible). Documented intentional retention for Record exhaustiveness (`types.ts:222-226`). Not a contract violation — contract only required individual=Solo + two-chip flexible.

### C. «?»-overlay

| Criterion | Verdict | Evidence |
|---|---|---|
| «?» kun på steg 2 (ikke andre steg, ikke cup/locked); aria-label | MET | `GameWizard.tsx:498-509` — `step === 2 && intent !== 'cup' && !lockGameMode`; cup-flow branch (`:451`) has no `action`. aria-label «Spillformater, slik funker de» (`:503`). |
| role=dialog + aria-modal | MET | `FormatGuideSheet.tsx:115-117`. |
| Fokus-felle (Tab sykler, fokus gjenopprettet) | MET | `FormatGuideSheet.tsx:45-83` — getFocusable includes `summary`; cleanup restores `previouslyFocused` (:81). |
| Esc + backdrop lukk | MET | Esc `:55-58`; backdrop onClick `:109`; inner stopPropagation `:118`. |
| reduced-motion-trygg animasjon | MET | `globals.css:487-492` sets `animation: none` for sheet+backdrop under reduce. scrollIntoView uses `behavior: reduced ? 'auto' : 'smooth'` (`FormatGuideSheet.tsx:94-100`). |
| «Slik funker det →» åpner ark scrollet til formatet; id-skjema matcher | MET | FormatGrid passes `f.slug` (a game_mode) → sheet looks up `format-guide-${focusKey}` (:91) → matches CATALOG base entry whose `key === mode` for every GameMode. `<details>.open=true` + scrollIntoView (:92-101). No collision: `stableford` (key `stableford`) vs `stableford-4bbb` (key `stableford-4bbb`) are distinct ids. |
| Ark = delt FormatGuideList, withDetailLinks=false | MET | `FormatGuideSheet.tsx:138-142`. |
| modeContentMap/entries fetched server-side i BEGGE page.tsx, sendt inn | MET | `app/admin/games/new/page.tsx:326,371`; `app/opprett-spill/page.tsx:154,205`. Both call `getFormatGuideEntries()` and pass `formatGuide`. |

### D. /spillformer → /spillformater

| Criterion | Verdict | Evidence |
|---|---|---|
| Rute renamet (page + [slug] + co-located test) | MET | `app/spillformer/` gone; `app/spillformater/{page.tsx,[slug]/page.tsx,[slug]/page.test.tsx}` present (git R-renames). |
| Permanent redirect for begge stier | MET | `next.config.ts:16-29` — `/spillformer` og `/spillformer/:slug`, both `permanent: true`. |
| Ingen gjenstående /spillformer-refs utenom redirect-source | MET | grep: only `next.config.ts:19,24` (redirect sources). |
| Synlig tekst oppdatert | MET | slug Kicker «SPILLFORMAT» (singular, correct); page Kicker «SPILLFORMATER» (:29); metadata «Spillformater»; home `Section label="Spillformater"` + link `/spillformater` (`app/page.tsx`). No remaining «Spillformer» visible strings. |
| Siden bruker delt FormatGuideList | MET | `app/spillformater/page.tsx:6,38`. |
| Interne lenker (modeDetailHref, BackLink, mail) | MET | `app/games/[id]/page.tsx:359` `/spillformater/${mode}`; slug BackLink `/spillformater`; `lib/mail/inviteNotification.ts:81,86` `tornygolf.no/spillformater`. |

### Tester

| Criterion | Verdict | Evidence |
|---|---|---|
| FormatStyleBadge.test.tsx oppdatert, ingen nye filer | MET | Asserts solo/individual→Solo, team→Lag, flexible→two chips, flexible+teamSize→one (`FormatStyleBadge.test.tsx:11-48`). |
| FormatGrid.test.tsx beholdt/oppdatert (maks én render-test) | MET (minor note) | One render-test, role-based, passes against new component. NOT modified in these commits and does NOT assert «forklaring kun på valgt» (the contract's parenthetical hint). Literal criterion «beholdt/oppdatert» satisfied. |
| Snapshots med Hver for seg / Solo eller lag / spillformer re-snapshottet | MET | inviteNotification.test.ts updated to `/spillformater` (:114,124); ModeGuideCard.test.tsx → `/spillformater/wolf`; formatPlayStyle.test.ts → individual:'Solo'. |
| Co-located tester grønne | MET | 57/57 pass (see gates). |

### Versjon / copy

| Criterion | Verdict | Evidence |
|---|---|---|
| package.json → 1.104.0 | MET | `package.json` version `1.104.0`. |
| CHANGELOG 1.104.0-oppføring, velformet, 1.103.y wrapped | MET | `## 1.104.y` theme + `### [1.104.0]` entry with tagline+Teknisk; prior `1.103.y` collapsed under `## Tidligere versjoner` `<details>`. |

## Gate results

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | PASS (exit 0, no output) |
| `npx vitest run <7 scoped files>` | PASS — 7 files, 57 tests passed |
| `npm run build` | PASS — «✓ Compiled successfully»; `/spillformater` + `/spillformater/[slug]` in route list; NO `/spillformer` route |
| `npx eslint <14 changed files>` | PASS (exit 0, no output) |

## Bugs / Concerns found

- **[none — blocking]** No correctness bugs found.
- **[low] FormatGrid.test.tsx doesn't assert the new compact behavior.** It's retained and green, but doesn't verify «description shown only on selected card» that the contract parenthetically suggested. The behavior is enforced structurally in the component; the test gap is cosmetic, not a regression. Literal contract criterion («beholdt/oppdatert») is met.
- **[informational] `PLAY_STYLE_LABELS.flexible = 'Solo eller lag'` is dead-as-chip** but intentionally retained (documented) for Record exhaustiveness. No visible surface uses it. Acceptable.
- **[informational] No automated test for the «?» sheet / focus-trap / scroll-to.** Not required by contract or test-discipline (Type C cap = one render test/component; sheet a11y verified by code inspection). Focus-trap logic reviewed: getFocusable includes `summary`, handles empty-entries defensively, restores focus on unmount — correct.
- **a11y (radio semantics):** selected card wraps the `role="radio"` button in a role-less `<div>` inside the `radiogroup`. The radio is still a direct semantic child of the group — valid.
- **z-index:** sheet `z-50` over BottomNav `z-30` — no conflict, and sheet is `position: fixed inset-0` covering the viewport per contract.
- **client/server boundary:** FormatGuideList → ModeGuideCard → FormatStyleBadge/SmartLink/types.ts. None import `server-only`/supabase/`next/headers`/getModeContent. SmartLink is `'use client'`. Clean — no RSC boundary violation when bundled into the client sheet.

## Final verdict

**VERDICT: ACCEPT**

All four sections (A–D), the test criteria, and the version/CHANGELOG criteria are met with cited evidence. All four gates pass (tsc, vitest 57/57, build with correct routes, eslint). No blocking bugs; the only findings are a low-severity test-coverage observation and documented intentional dead-code retention.
