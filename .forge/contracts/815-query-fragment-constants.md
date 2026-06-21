# Contract: #815 — extract COURSE_HOLES_SELECT/SCORES_SELECT constants + collapse inline mail row-types

**Issue:** https://github.com/jdlarssen/golf-app/issues/815
**Type:** `refactor` — no behavior change, no version bump
**Branch:** claude/condescending-mahavira-28f376

## Goal

Two byte-identical PostgREST `.select(...)` column strings are copy-pasted across the codebase
with no shared constant. Extract them into `lib/supabase/queryFragments.ts` and replace every
call-site. Also collapse the 4× course-holes + 4× scores inline anonymous `.returns<>` types in
`lib/mail/gameFinishedRecipients.ts`, and delete the duplicate private interfaces in
`lib/scoring/buildModeResultForGame.ts` in favor of the new exported types.

This is a single rename-point + inline-type collapse. **NOT** a type-safety fix — `.returns<>`
stays a manual cast. Do **NOT** thread `SupabaseClient<Database>` (that is a separate slice, #672
follow-up). Do **NOT** touch the tee-box rating block.

## New file: `lib/supabase/queryFragments.ts`

Server-safe (no `'use client'`), exports:

```ts
export const COURSE_HOLES_SELECT =
  'hole_number, par_mens, par_ladies, par_juniors, stroke_index' as const;
export const SCORES_SELECT = 'user_id, hole_number, strokes' as const;

export type CourseHoleRow = {
  hole_number: number;
  par_mens: number;
  par_ladies: number;
  par_juniors: number;
  stroke_index: number;
};
export type ScoreRow = {
  user_id: string;
  hole_number: number;
  strokes: number | null;
};
```

## Call-sites to replace

### COURSE_HOLES_SELECT — exact-string `.select('hole_number, par_mens, par_ladies, par_juniors, stroke_index')`
- lib/mail/gameFinishedRecipients.ts:153, 352, 522, 647
- lib/scoring/buildModeResultForGame.ts:90
- app/[locale]/admin/courses/[id]/edit/page.tsx:234
- app/[locale]/games/[id]/submit/page.tsx:201
- app/[locale]/games/[id]/leaderboard/page.tsx:241
- app/[locale]/games/[id]/leaderboard/export/route.ts:112
- app/[locale]/games/[id]/leaderboard/holes/holesData.ts:87
- app/[locale]/games/[id]/approve/page.tsx:167
- app/[locale]/games/[id]/holes/[holeNumber]/page.tsx:175, 195, 218, 234
- app/[locale]/games/[id]/scorecard/page.tsx:217

### COURSE_HOLES with `course_id,` prefix → `` `course_id, ${COURSE_HOLES_SELECT}` ``
- lib/cup/getCupSnapshot.ts:170
- lib/league/getLigaSnapshot.ts:191
- app/[locale]/profile/statistikk/page.tsx:95

### SCORES_SELECT — exact-string `.select('user_id, hole_number, strokes')`
- lib/mail/gameFinishedRecipients.ts:146, 345, 515, 640
- lib/scoring/buildModeResultForGame.ts:96
- app/[locale]/games/[id]/leaderboard/page.tsx:247
- app/[locale]/games/[id]/leaderboard/holes/holesData.ts:93
- app/[locale]/games/[id]/leaderboard/export/route.ts:118
- app/[locale]/games/[id]/approve/page.tsx:190
- app/[locale]/games/[id]/holes/[holeNumber]/page.tsx:211, 227
- app/[locale]/games/[id]/scorecard/page.tsx:223

### SCORES with `game_id,` prefix → `` `game_id, ${SCORES_SELECT}` ``
- lib/cup/getCupSnapshot.ts:152
- lib/league/getLigaSnapshot.ts:183
- app/[locale]/profile/statistikk/page.tsx:100

### Inline `.returns<>` collapse in lib/mail/gameFinishedRecipients.ts
- scores returns (multi-line) at 148, 347, 517, 642 → `.returns<ScoreRow[]>()`
- course-holes returns (single-line) at 156, 355, 525, 650 → `.returns<CourseHoleRow[]>()`
- (Leave the `game_players` `.returns<>` at line 72 untouched — out of scope.)

### Delete private interfaces in lib/scoring/buildModeResultForGame.ts
- Delete `CourseHoleRow` (44-50) and `ScoreRow` (52-56); import the exported ones.
- TYPE-ONLY. Do **NOT** touch the mapper math (~285-289).

## Explicitly OUT of scope (different column sets — do not touch)
- app/[locale]/games/[id]/RealtimeMount.tsx:20 (`...entered_by, client_updated_at, updated_at`)
- app/[locale]/games/[id]/submit/page.tsx:207 (`hole_number, strokes, entered_by`)
- app/[locale]/games/[id]/holes/[holeNumber]/page.tsx:202 (`hole_number, strokes`)
- The ~15 leaderboard `rawHolesRows` **prop** types in `formats/*.tsx` / `sideTournament.tsx` — these
  are component prop types, not query call-sites. Leave them.
- `SupabaseClient<Database>` typing of helper params (#672 follow-up).
- The tee-box `course_rating` block (#817).

## Success criteria
- [x] `lib/supabase/queryFragments.ts` created with the two `as const` string constants and two row types. — file created, 36 lines.
- [x] All exact-string COURSE_HOLES_SELECT call-sites replaced with the constant. — 13 sites (incl. holes page ×4, mail ×4) → `.select(COURSE_HOLES_SELECT)`.
- [x] All exact-string SCORES_SELECT call-sites replaced with the constant. — 11 sites (incl. mail ×4) → `.select(SCORES_SELECT)`.
- [x] All `course_id,`/`game_id,` prefixed variants replaced with template-literal concat. — cup/liga/statistikk ×6 → `` `course_id, ${COURSE_HOLES_SELECT}` `` / `` `game_id, ${SCORES_SELECT}` ``.
- [x] The 8 inline `.returns<>` in gameFinishedRecipients.ts (4 scores + 4 course holes) replaced with `ScoreRow[]`/`CourseHoleRow[]`. — 4× `.returns<ScoreRow[]>()` + 4× `.returns<CourseHoleRow[]>()`; game_players `.returns<>` at L72 untouched.
- [x] Private `CourseHoleRow`/`ScoreRow` interfaces in buildModeResultForGame.ts deleted and imported from the new module; mapper math untouched. — interfaces (old L44-56) removed; diff ends at L99, math (~L285) untouched.
- [x] Out-of-scope variants verifiably unchanged (RealtimeMount, submit:208, holes:203, leaderboard prop types). — grep confirms `RealtimeMount.tsx:20`, `submit/page.tsx:208`, `holes/[holeNumber]/page.tsx:203` all present & unchanged; `rawHolesRows` object-type literals untouched.
- [x] No remaining bare copies of either exact string anywhere in `lib/`/`app/`/`components/` (except `.test.` mocks if any). — grep: only remaining literal is the constant def in `queryFragments.ts:20`; zero `.select('...')` bare literals.

## Gates
- [x] `npx tsc --noEmit` — green. → **exit 0**.
- [x] `npx vitest run` — full suite green, **no test changes expected**. → **295 files / 3873 tests passed**, 0 test files changed.

## Commit
- ONE atomic commit. No version bump (pure refactor — `refactor(...)` prefix passes the commit-msg hook).
- `refactor(supabase): extract COURSE_HOLES_SELECT and SCORES_SELECT query-fragment constants`
- Body includes `Refs #815`.

## Risk
Low-to-medium — wide blast radius (~31 call-sites / 13 files). One missed/altered string is a silent
regression; the mail test mocks selects as opaque strings so a typo surfaces only at runtime. Mitigate
with a final grep proving no bare copies remain + full vitest. `buildModeResultForGame.ts` is TDD-strict
`lib/scoring` — type-only swap, do not touch the math.
