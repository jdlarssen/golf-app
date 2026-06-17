# Contract: #681 — i18n leak: par-tooltip hardcoded Norwegian + 4-way duplicated ParAsideInline

## Problem
`lib/games/parDisplay.ts:formatOtherGendersPar()` builds the gender-par fragment with
hardcoded Norwegian labels (`Herrer:`, `Damer:`, `Junior:`). These strings are interpolated
into the `parAsideTooltip` / `parAsideTitle` / `parAsideAriaLabel` i18n keys on the
score-entry hull-page (`HoleHero.tsx:104`) and the per-hole leaderboard
(`leaderboard/holes/page.tsx:1423-1424`). The English wrapper sentence is translated
correctly, but the injected `{genders}` fragment stays Norwegian on all locales.

Additionally, identical `ParAsideInline` component implementations exist in 3 page files
(`submit/page.tsx`, `approve/page.tsx`, `scorecard/page.tsx`) — the correct, i18n-aware
version — while the shared helper used by HoleHero and the leaderboard stays broken.

## Approach

### 1. Extend `formatOtherGendersPar` to accept pre-translated labels
Add an optional second argument `labels?: { mens: string; ladies: string; juniors: string }`.
When provided, use them; when absent, fall back to the current hardcoded Norwegian (preserving
existing behavior for any test that exercises it directly). Callers that pass translated labels
get locale-aware output.

### 2. Fix HoleHero.tsx (client component)
Already has `const ts = useTranslations('scorecard')`. Build the labels inline before calling
the helper:
```tsx
const gendersStr = formatOtherGendersPar(parByGender!, playerGender, {
  mens: ts('parGenderMens', { par: parByGender!.mens }),
  ladies: ts('parGenderLadies', { par: parByGender!.ladies }),
  juniors: ts('parGenderJuniors', { par: parByGender!.juniors }),
});
const tooltip = ts('parAsideTooltip', { genders: gendersStr });
```

### 3. Add parGenderMens/Ladies/Juniors to leaderboard.holes namespace
The leaderboard `HoleRow` component uses `useTranslations('leaderboard.holes')`. Rather than
switching namespace, add the three gender-label keys directly to `leaderboard.holes` in both
`no.json` and `en.json`. Then pass them from the existing `t` instance.

New keys in `leaderboard.holes`:
- `parGenderMens` → no: `"Herrer: {par}"`, en: `"Men: {par}"`
- `parGenderLadies` → no: `"Damer: {par}"`, en: `"Ladies: {par}"`
- `parGenderJuniors` → no: `"Junior: {par}"`, en: `"Juniors: {par}"`

### 4. Fix leaderboard HoleRow
Replace the two `formatOtherGendersPar(row.parByGender, undefined)` calls with label-aware
calls using the `t` already in scope.

### 5. Consolidate ParAsideInline (out of scope for this fix)
The three identical `ParAsideInline` copies in submit/approve/scorecard pages are a separate
refactor task. They use the correct i18n pattern already and don't have the bug. De-duplicating
them is tracked in issue #681 but is a low-risk cosmetic refactor that should not block this
bug fix. Leave them in place; focus on fixing the two buggy call sites.

## Files touched
- `lib/games/parDisplay.ts` — extend signature, keep backward compat
- `lib/games/parDisplay.test.ts` — extend tests for label-aware path
- `components/hole/HoleHero.tsx` — pass translated labels
- `app/[locale]/games/[id]/leaderboard/holes/page.tsx` — pass translated labels
- `messages/no.json` — add 3 keys under `leaderboard.holes`
- `messages/en.json` — add 3 keys under `leaderboard.holes`

## Out of scope
- Consolidating the 3 correct `ParAsideInline` copies (separate refactor)
- Any schema or data changes
