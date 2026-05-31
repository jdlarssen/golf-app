# Forge-evaluering — #345: Cup opprettes kun via den ene Opprett-veiviseren

**Date:** 2026-05-31
**Branch:** `claude/crazy-tesla-a3678f`
**Commit evaluated:** `7b908e0`

---

## Verdict: ACCEPT

---

## AC-by-AC verification

| AC | Status | Evidence |
|----|--------|----------|
| AC1 | PASS | `grep -r "Opprett ny cup" app/` → 0 treff. `git show 7b908e0` confirms `<Button className="w-full">Opprett ny cup</Button>` + `<Link>`-wrapper + `<div className="mb-5">` removed from `app/admin/cup/page.tsx:96-101` (pre-patch lines). |
| AC2 | PASS | `app/admin/cup/page.tsx:99-111` — empty-state renders `<Card><p>Du har ingen cuper ennå.{' '}<SmartLink href="/admin/games/new?intent=cup" className="text-text underline hover:no-underline">Sett opp en cup</SmartLink>{' '}for å komme i gang.</p></Card>`. SmartLink is a small inline text link, no competing primary button. |
| AC3 | PASS | `app/admin/cup/page.tsx:81` — `<TopBar backHref="/admin" kicker="Sekretariatet" userId={userId} />` — no `action` prop present. No TopBar create-action added. |
| AC4 | PASS | `app/admin/games/new/IntentSelector.tsx:73` — `{ intent: 'cup', icon: CupIcon }` intact. `GameWizard.tsx` cup branch (lines 233-435) untouched. `lib/cup/actions.ts:143` — `redirect('/admin/cup/${data.id}?status=created')` confirms creation lands on `/admin/cup/[id]`. No diff on wizard files in this commit. |
| AC5 | PASS | `app/admin/cup/[id]/page.tsx:202-232` — six match deep-links with `?intent=cup&tournament_id=${id}&game_mode=...` all intact. `git diff 35305c6..HEAD -- app/admin/cup/[id]/page.tsx` → empty (file untouched). `app/admin/games/new/page.tsx:30,91` — `?intent=cup` parsing logic present and unchanged. |
| AC6 | PASS | `import Link from 'next/link'` and `import { Button } from '@/components/ui/Button'` both removed in diff. File now imports only what it uses. `npm run lint` → 0 errors, 0 cup-related warnings. `npm run build` → compiled successfully. |
| AC7 | PASS | `grep -r "Opprett ny cup" **/*.test.* e2e/` → 0 results. No test file references the removed button. No new test added (correct: this is a pure removal, Type C discipline satisfied). |
| AC8 | PASS | Copy: "Du har ingen cuper ennå. Sett opp en cup for å komme i gang." Manual humanizer check: no em-dash chain, no «Vennligst», no «Tap» anglism, no X-spillet redundans, no AI hedging phrases. «Sett opp» is an action verb, idiomatic Norwegian. Copy is clean. |
| AC9 | PASS | `package.json` version field: `"version": "1.60.1"` (bumped from 1.60.0). `CHANGELOG.md` — `### [1.60.1] - 2026-05-31` entry present with tagline blockquote + Teknisk details-block. Both files staged in commit `7b908e0` alongside the feature change. |

---

## Gate results

### `npm run lint`
```
✖ 18 problems (0 errors, 18 warnings)
```
All 18 warnings are pre-existing `_gameId` unused-vars in leaderboard views (`NinesView.tsx`, `PatsomeView.tsx`, `RoundRobinView.tsx`, `SkinsView.tsx`, `SoloStablefordView.tsx`, `SoloStrokeplayView.tsx`, `TeamStablefordView.tsx`, `TexasScrambleView.tsx`, `WolfView.tsx`). Zero errors. Zero warnings from cup-related files. **PASS**

### `npm run build`
```
✓ Compiled successfully in 2.4s
✓ Generating static pages using 9 workers (29/29) in 242ms
```
One non-error warning about lockfile/turbopack root (pre-existing infrastructure notice). No build errors. `/admin/cup` route present in output. **PASS**

### `npx vitest run app/admin/games/new`
```
Test Files  17 passed (17)
Tests  121 passed (121)
Duration  3.70s
```
All 121 tests green. No regressions in cup/wizard-adjacent tests. **PASS**

### `npx tsc --noEmit`
Errors found only in pre-existing test files:
- `app/admin/games/[id]/signups/actions.test.ts` — TS2556, TS2352, TS2493
- `app/games/[id]/withdrawActions.test.ts` — TS2556
- `app/signup/[shortId]/actions.test.ts` — TS2556, TS2493
- `app/signup/[shortId]/teamActions.test.ts` — TS2556

None of these files are touched by this commit. Zero errors in `app/admin/cup/page.tsx` or any file modified in `7b908e0`. Pre-existing errors confirmed as out-of-scope per contract. **PASS (pre-existing errors not introduced by this change)**

---

## Regressions / concerns

None found.

- Removed `Link` and `Button` imports have no remaining usages in `app/admin/cup/page.tsx` (verified by read of full file).
- `app/admin/cup/[id]/page.tsx` and all match deep-links are unmodified.
- Cup creation redirect (`lib/cup/actions.ts:143`) lands on `/admin/cup/[id]` unchanged.
- `SmartLink` component exists at `components/ui/SmartLink.tsx` and is already imported in the file.
- Live Playwright skipped: no running authenticated dev server available; change is static render-only (server component with no interactive state). Source + build verification is sufficient.

---

## Summary

All 9 ACs pass. All 4 gates pass (lint 0 errors; build clean; vitest 121/121 green; tsc errors are pre-existing in unrelated test files). No regressions. The implementation is a minimal, focused removal + signpost replacement as specified by the contract.
