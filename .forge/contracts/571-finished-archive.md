# Contract: #571 — Hjem viser siste 5 avsluttede + «Spill-arkiv»-side

**Issue:** [#571](https://github.com/jdlarssen/golf-app/issues/571) · Backlog (scale-triggered)
**Branch:** `claude/romantic-albattani-566b0f`
**Type:** enhancement (MINOR — ny side)

## Problem

`HomeBody` (`app/[locale]/page.tsx`) renders **all** finished games under
«Avsluttede spill» with no cap. With one round per day the home page grows to
30–50+ cards over a season — it should be the play + discover hub, not an
archive. The list also fetches every finished row each render.

Owner's steer: «Hva er best på lang sikt? Det kommer til å være mange spill
fremover.» → optimise for volume.

## Decision (owner-delegated)

A **focused «Spill-arkiv»** (finished-only), **grouped by month**, not a broad
«Mine spill»-hub. Rationale: finished games are what accumulate with volume
(active games are always few), so the archive is the right primitive for the
scale problem; month-grouping keeps it navigable at 50+ games. A «Mine spill»-
hub is a navigation concern that can later link to/absorb this archive without
rework — and would duplicate home's active section.

## Approach

Extract the two pieces home and the archive must share, then add the page.

1. **`lib/games/getFinishedGamesForUser.ts`** — shared fetch. Runs the finished
   query (the one currently inline in `HomeBody`), filters non-null `games`,
   sorts via `byEndedAtDesc` (#569), returns a typed `FinishedGame[]`. Exports
   the `FinishedGame` type (`id, name, ended_at, game_mode, mode_config,
   courses`). One source of truth for "my finished games".
2. **`components/games/FinishedGameCard.tsx`** — the finished-card render lifted
   verbatim from `HomeBody` (server-safe module, no `'use client'`; imports
   `formatDisplayLabel` + `formatShortDateLocale`). Both surfaces render through
   it so they can never visually drift (#570 layout: name / «bane · format» /
   date / 🏆).
3. **`lib/games/groupFinishedByMonth.ts`** — pure helper bucketing a
   `FinishedGame[]` into ordered `{ key, label, games }[]` groups by
   `ended_at` month (newest month first; `null`-dated games in a trailing
   «Uten dato»-bucket). Label via `formatMonthLongNb` («juni 2026»). Pure → unit
   tested (Type A).
4. **Home `page.tsx`** — fetch via the helper inside the existing `Promise.all`;
   render `finishedGames.slice(0, 5)` through `FinishedGameCard`; add a «Vis alle
   avsluttede spill →» link to `/spill-arkiv` **only when** `finishedGames.length
   > 5` (≤5 ⇒ all already shown). Remove the now-unused `game_mode`/`mode_config`
   from the shared `GameRow` type (finished query moved out; active never used
   them).
5. **`app/[locale]/spill-arkiv/page.tsx`** — auth-gated (`redirect('/login?next=
   /spill-arkiv')`, `getProxyVerifiedUserId`), `AppShell` + `BackLink` to home +
   `PageHeader`, fetch via the helper, render month groups (each a section
   header + its `FinishedGameCard`s). Empty-state when the user has no finished
   games. Follows the `finn-turneringer/page.tsx` pattern.

## Out of scope (don't gold-plate)

- DB-level `LIMIT 5` on the home query: blocked by the JS-sort `byEndedAtDesc`
  forced by #569 (supabase foreignTable-order is a no-op for to-one embeds), so
  a true DB limit needs a query restructure (select from `games` with RLS
  re-derivation). The columnar fetch is tiny (5 small cols) even at hundreds of
  rows; the DOM cap (5) is the real cost saved. Note it; don't restructure.
- A «Mine spill»-hub / active games on the archive — explicitly not this issue.
- Redirecting the #428 delete-flow landing to the archive — separate concern.
- Pagination — month-grouping is the volume answer; pagination is unneeded.
- i18n-migrating these surfaces — home is still Norwegian-literal (`'no'` per #570).

## Success criteria

- [x] `getFinishedGamesForUser` exists, returns the sorted `FinishedGame[]`, and
      is the single fetch used by BOTH home and the archive page.
      — `lib/games/getFinishedGamesForUser.ts`; home `page.tsx:135`, archive
      `spill-arkiv/page.tsx:32`.
- [x] `FinishedGameCard` renders the #570 layout and is used by BOTH surfaces
      (no duplicated card JSX remaining in `page.tsx`).
      — `components/games/FinishedGameCard.tsx`; used at `page.tsx:313` and
      `spill-arkiv/page.tsx:67`. No card JSX left in `page.tsx`'s finished section.
- [x] Home renders at most 5 finished cards; «Vis alle avsluttede spill →» links
      to `/spill-arkiv` and appears only when there are >5 finished games.
      — `page.tsx:312` `slice(0, 5)`, `page.tsx:315` `length > 5` guard,
      `page.tsx:316` link to `/spill-arkiv`.
- [x] `/spill-arkiv` lists ALL the user's finished games grouped by month
      (newest first), auth-gated, with a back-link to home and an empty-state.
      — `spill-arkiv/page.tsx`: auth-gate `:28`, group `:33`, back-link `:38`,
      empty-state `:52`, month label `:61`.
- [x] `groupFinishedByMonth` is pure and has a co-located Type A test (month
      bucketing + ordering + null-date handling).
      — `lib/games/groupFinishedByMonth.ts` + `.test.ts` (4 cases, in the 532
      passing). 
- [x] Shared `GameRow` in `page.tsx` no longer declares `game_mode`/`mode_config`.
      — `grep game_mode|mode_config page.tsx` → none.
- [x] `package.json` MINOR bump (1.118.0) + CHANGELOG entry; commits split
      refactor(games)+feat(home). New `## 1.118.y` theme opened; 1.117.y series
      collapsed into a `<details>` drawer per changelog-conventions.md.
      — `package.json` 1.118.0; commits `ccb37737` + `9234c915`.

### Gate evidence
- `npx tsc --noEmit` → clean (0 errors).
- `npx vitest run lib/games lib/format/date` → 25 files, 532 tests passed
  (incl. new `groupFinishedByMonth` 4 cases).
- `npm run build` → ✓ Compiled successfully; `/[locale]/spill-arkiv` present as
  ◐ PPR, home compiled.
- UI browser-render not feasible: both `/` and `/spill-arkiv` are auth-gated
  (no login codes in preview). Verified via types + build + the pure-helper
  test + render-wiring read. Owner spot-checks the Vercel preview.

## Gates

- `npx tsc --noEmit` — type honesty across the extraction + new page.
- `npx vitest run lib/games` — `groupFinishedByMonth` (new) + `finishedOrder` +
  `formatLabel`; plus `lib/format/date` for `formatMonthLongNb`.
- `npm run build` — home + the new `/spill-arkiv` server route must compile
  (PPR/cacheComponents — mirror `finn-turneringer`'s no-force-dynamic note).
- UI: `/spill-arkiv` is auth-gated like `/`, so no headless authed render
  (no login codes). Verify via types + build + the pure-helper test + wiring
  read. Owner spot-checks the Vercel preview.

## Notes

- Test-discipline: ONE new Type A test (`groupFinishedByMonth`). No render test
  for the page (Type C: no existing one; logic is in the tested pure helper).
  No Supabase-mock test for `getFinishedGamesForUser` (system boundary; the sort
  is already covered by `byEndedAtDesc`'s test).
- Humanizer: the only new Norwegian prose is «Vis alle avsluttede spill», the
  archive title/empty-state, and month labels (from `formatMonthLongNb`). Run
  the humanizer mental-check on the empty-state copy before commit.
