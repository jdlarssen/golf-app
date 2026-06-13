# Evaluation: i18n Fase D — spillformat-innhold på engelsk (#592)

**Verdict: ACCEPT**

Independent re-verification of branch `claude/lucid-curie-90200f` against
`.forge/contracts/592-i18n-fase-d-db-innhold.md`. All gates pass, all success
criteria verified by reading code (not trusting the implementer's claims), and
no scope creep. Two minor, non-blocking notes recorded.

## Gate results

| Gate | Result | Evidence |
|------|--------|----------|
| `npx tsc --noEmit` | **PASS** | exit 0 |
| Targeted `npx vitest run messages lib/formats lib/mail/inviteNotification.test.ts app/[locale]/admin/games/new app/[locale]/admin/formats app/[locale]/spillformater components/ModeGuideCard.test.tsx` | **PASS** | 26 files / 178 tests passed |
| `npm run build` | **PASS** | exit 0; `/[locale]/spillformater` and `/[locale]/spillformater/[slug]` both render ◐ PPR |
| Version bump | **PASS** | `package.json` = 1.125.0 (MINOR), CHANGELOG entry present |

## Per-criterion verification

| Criterion | Result | Evidence |
|-----------|--------|----------|
| Wizard `/en`: FormatGrid + CupSetup show EN name + EN short desc; NO byte-identical | **PASS** | `FormatGrid.tsx:59,62-66` and `CupSetup.tsx:202,206-211` render `tModes(f.slug)` + `tContent.raw('content.<slug>.shortDescription')`. EN catalog fully translated (0 untranslated, 0 empty). NO summary/points byte-identical (see below). |
| Format overview `/en/spillformater`: label/summary/points EN for 22 + 4BBB; NO unchanged | **PASS** | `buildFormatGuide.ts:62-90` reads label from `modes.*`/`modeVariants.*` (via `formatDisplayLabelKey`) and content from `formatGuide.content.<key>` via `tContent.raw`. CATALOG has 22 modes + `stableford-4bbb`. Build shows ◐ PPR. |
| Detail page `/en/spillformater/[slug]`: summary/points/long/example EN; NO unchanged | **PASS** | `[slug]/page.tsx:48-67` reads `formatGuide.content.<mode>` via `tFg.raw`; `long`/`example` rendered only when present (`merged.long &&` / `merged.example &&`). `page.test.tsx` green. |
| Editor removed; matrix unchanged | **PASS** | `actions.ts` — `updateFormatContent` + `parsePointsTextarea` import deleted (diff confirms). `FormatsManager.tsx` — 0 refs to `ContentEditor*`/`updateFormatContent`; 22 refs to matrix toggles (`toggleVisible/Primary/CupEligible/Active`, `is_cup_eligible`, `is_active`) remain. `admin.formats.contentEditor.*` = 0 occurrences in BOTH catalogs. |
| No DB content reads left | **PASS** | All 6 files (`getModeContent.ts`+test, `modeGuide.ts`+test, `parsePointsTextarea.ts`+test) git-deleted (status `D`). Grep for `getModeContent\|mergeModeContent\|modeGuide\|MODE_GUIDE\|resolveModeGuide\|parsePointsTextarea\|...` over app/lib/components: only 2 hits, both comments (`inviteNotification.ts:17`, `formatLabel.ts:92`). `getFormatsForIntent` selects `slug, icon_key, is_active`; `getCupEligibleFormats` selects `slug, icon_key`; `getAllFormatsWithMappings` selects `slug, icon_key, is_active, is_cup_eligible`. No query selects display_name/short_description/rules_*. |
| Catalog parity | **PASS** | `catalogParity.test.ts` green. Node check: 23 keys both sides, key sets identical, 0 field-structure mismatches, 22 formats with all 5 fields, `stableford-4bbb` has only {summary, points} both sides. |
| Drop migration exists, post-deploy | **PASS** | `supabase/migrations/0097_drop_format_content_columns.sql` — `DROP COLUMN IF EXISTS` for all 6 columns, header documents post-deploy ordering. `database.types.ts` still declares the columns (lines 340/347/349) so the PR compiles pre-drop. |
| No raw-key / NO-on-`/en` leaks in touched surfaces | **PASS** | All consumers use `t.raw()` (returns `undefined`, not a raw key string, on miss) or `t()` on known keys. EN catalog has zero values byte-identical to NO and zero empties. |

## Byte-identical Norwegian (spot-check + full automated compare)

Reconstructed the old `MODE_GUIDE` + `STABLEFORD_4BBB_GUIDE` from
`git show origin/main:lib/formats/modeGuide.ts` and compared `summary`+`points`
against `messages/no.json` `formatGuide.content.*`:

- **22 MODE_GUIDE entries + 4BBB variant: 0 summary/points byte-mismatches.**
- Manual spot-check (wolf, skins, nassau, stableford, stableford-4bbb) confirms
  exact match including special chars («», –).
- DB-sourced `shortDescription`/`long`/`example` are not in git history; per
  evaluation instructions, the implementer's md5-round-trip claim (22/22) is
  trusted and noted as un-reverifiable here.

## Scope discipline

- All 34 non-doc changed files fall within the contract's "Files Likely Touched"
  set. No gold-plating.
- `lib/mail/inviteNotification.ts` touched **necessarily and minimally**: it
  imported the deleted `MODE_GUIDE`. New code reads the NO summary directly from
  `no.json` (`FORMAT_CONTENT[gameMode].summary`) — correct, since mail
  localization is explicitly Phase M / out of scope, so invite mail stays
  Norwegian-only. `MODE_LABELS` guard replaces the old `MODE_GUIDE` guard
  equivalently.
- `lib/scoring/modes/gruesomeMatchplay.ts`: one-word comment update
  (`modeGuide.ts` → `formatGuide.content-katalogen`). Trivial, justified.
- `lib/games/formatLabel.ts`: added `resolveFormatContentKey()` — faithfully
  mirrors the deleted `resolveModeGuide` (stableford family + team_size 2 →
  `stableford-4bbb`). In-scope helper, replaces deleted logic.
- Matrix-styringen (format_intent_mapping, is_active, is_cup_eligible, icon_key)
  untouched. Mail content (Phase M) and gd/ga (Phase G) untouched.

## Non-blocking notes

1. **Detail page uses `content.long ?? null` rather than an explicit
   `t.has()`-guard** (contract Edge Cases asked for `t.has()`). Because the page
   reads via `tFg.raw()` (not `tFg()`), a missing key yields `undefined`, not a
   raw key string — so the functional intent (never render a raw key) holds and
   there is no leak. Cosmetic deviation from the prescribed mechanism; not a
   defect. `[slug]/page.tsx:62-67`.
2. **DB `shortDescription`/`long`/`example` byte-identity is unverifiable from
   the repo** (DB rows not in git). md5 claim trusted per instructions. If the
   owner wants certainty, a one-off prod query against the still-present columns
   (before applying 0097) could confirm.

## Required changes

None. Ship.
