# Contract: #624 — App-bred sveip: lokaliser `game.name` på gjenstående flater

**Issue:** https://github.com/jdlarssen/golf-app/issues/624 (follow-up to #617)
**Branch:** `claude/zen-murdock-784768`
**Type:** i18n bugfix (user-visible) → PATCH bump + CHANGELOG
**Scope decision (owner, 2026-06-14):** FULL sweep — include the heavy leaderboard main-view + hull-for-hull surfaces.

## Problem

`game.name` for auto-generated games is frozen in the creation language (`suggestGameName` runs client-side in the wizard, stores a finished string in `games.name`). A Norwegian-created "Byneset North 12. juni" therefore shows the Norwegian month on `/en`, even though the date line directly beneath is correctly localized — a mixed NO/EN surface. #617 introduced `localizeGameName(name, courseName, locale)` in `lib/games/autoGameName.ts` and applied it to 3 surfaces (Hjem, admin GamesLedger, FinishedGameCard). This issue sweeps it across all remaining surfaces.

`localizeGameName` parses day+month OUT of the stored Norwegian string (anchored to the course name) and reformats for the active locale. It is timezone-free, no-ops safely (returns name untouched) when `courseName` is null or the name isn't the exact auto-format, and leaves custom names alone. `/no` is byte-identical (early return).

## Architectural decisions (made, not open)

1. **Do NOT extend the cached `getGameWithPlayers` / `GameForHole` to join `courses`.** CLAUDE.md «Server-actions og caching» keeps course joins out of the cache by design (caching them would require cross-game fan-out on course edits). The leaderboard + holes surfaces instead get a **slim parallel `courses(name)` fetch** at the call-site, and localize the name **once at the source** so all downstream `gameName=` props receive the localized string for free.
2. **Interpolated `t()` sites** localize the name BEFORE passing into the translation: `t('heading', { name: localizeGameName(game.name, courseName, locale) })`.
3. **No new tests.** Per issue + Type C ceiling: the helper's logic is already covered in `lib/games/autoGameName.test.ts` (9 cases). Wrapping render-sites adds no testable logic. Existing tests must stay green.

## Success criteria

Group A — surfaces where `courseName` is already in scope (import + wrap only):
- [ ] `app/[locale]/games/[id]/(home)/page.tsx` — PageHeader title (~729) AND the `.toUpperCase()` Kicker (~494) use `localizeGameName(..., game.courses?.name ?? null, locale)`.
- [ ] `app/[locale]/games/[id]/submit/page.tsx` (~148) uses helper with `courseTee.courses?.name`.
- [ ] `app/[locale]/games/[id]/trekk-fra/page.tsx` (~117) localizes name before the `t('heading', { name })` interpolation, with `game.courses?.name`.
- [ ] `app/[locale]/admin/games/[id]/page.tsx` (~264) uses helper with `game.courses?.name`.
- [ ] `app/[locale]/admin/games/[id]/slett/page.tsx` (~149) uses helper with `game.courses?.name`.
- [ ] `app/[locale]/klubbhuset/page.tsx` (~91) uses helper with `g.courses?.name`.
- [ ] `app/[locale]/HomeDiscoverySection.tsx` (~135/181/229) — all three cards use helper with `game.course_name` (already present on `Discoverable*Game`).

Group B — surfaces needing a slim projection extended (add `courses(name)` to the select + type, then wrap):
- [ ] `app/[locale]/games/[id]/rediger/page.tsx` (~102) — extend `GAME_SELECT` + `EditGameRow` (in `lib/games/editGameInitialValues.ts`) to carry `courses: { name: string } | null`; wrap title.
- [ ] `app/[locale]/admin/games/[id]/edit/page.tsx` (~145) — same shared `EditGameRow`; extend its local select string too; wrap `<h1>`.
- [ ] `app/[locale]/admin/games/[id]/status/page.tsx` (~177) — extend select + local `GameRow`; wrap `<h1>`.
- [ ] `app/[locale]/admin/games/[id]/signups/page.tsx` (~172) — extend select + local `GameRow`, ADD `getLocale()` (not currently called); wrap subtitle.
- [ ] `app/[locale]/profile/historikk/page.tsx` (~162) — extend nested `games!inner(...)` select + `GameRow` type; `locale` already passed to `GameHistoryCard` (wrap there with `game.courses?.name`).
- [ ] `app/[locale]/signup/[shortId]/page.tsx` (~239) — extend `getGameByShortId` (`lib/games/getGameByShortId.ts`) select + `ShortIdGame` type to carry course name; wrap `<h1>`.
- [ ] `app/[locale]/signup/[shortId]/team/page.tsx` (~127 `t()` interpolation, ~202 kicker) — uses same extended `getGameByShortId`; wrap both.

Group C — heavy leaderboard surfaces (slim parallel `courses(name)` fetch + localize at source):
- [ ] `app/[locale]/games/[id]/leaderboard/page.tsx` — fetch `courses(name)` + `locale` in `LeaderboardBody`, compute one `displayName = localizeGameName(game.name, courseName, locale)`, route it to ALL `gameName={...}` props and both `TopBar kicker={...}` sites (so no raw `game.name` reaches a rendered title).
- [ ] `app/[locale]/games/[id]/leaderboard/holes/page.tsx` — each mode body computes its own `displayName` (slim `courses(name)` fetch + `getLocale()`) and passes it as `gameName`; no raw `game.name` reaches a rendered title.

Cross-cutting:
- [ ] `/en` shows English month names in game-name titles on EVERY surface above (spot-checked via grep that no rendered `game.name`/`gameName={game.name}`/`{ name: game.name }` title site remains unwrapped in the swept files).
- [ ] `/no` output is byte-identical (helper early-returns for `'no'`; verified by reading that every wrap passes the real `locale`, never a hardcoded one).
- [ ] No new render tests added; `lib/games/autoGameName.test.ts` unchanged and green.
- [ ] `package.json` PATCH bump + `CHANGELOG.md` entry (user-visible i18n fix), per the commit-msg hook.

## Gates (run scoped to what changed; full build before final commit)

- `npx tsc --noEmit` — type safety, incl. every exhaustive switch/Record map (Vercel build trap per project memory). MUST pass.
- `npx vitest run lib/games/autoGameName.test.ts` — helper coverage stays green (no edits expected). MUST pass.
- `npx eslint <changed files>` — no new warnings/errors on touched lines.
- `npx next build` — final gate before declaring done; catches the exhaustive-switch / force-dynamic / PPR traps that `tsc` alone misses.

## Out of scope

- Editing `localizeGameName` itself or its tests (logic is complete + covered).
- Renaming code identifiers (`roster`, etc. — unrelated, #622).
- Any non-`game.name` copy.
- Touching `lib/scoring/` (none of these surfaces require it).
- Extending the cached `getGameWithPlayers` helper (deliberately avoided — see decision 1).

## Notes for the builder

- The `gameName` prop in leaderboard views flows into the shared `LeaderboardChrome`/`LeaderboardHeader` (#598). Localizing once at the source in `LeaderboardBody` is sufficient — do NOT localize inside the chrome (it lacks course name).
- `EditGameRow` and `getGameByShortId` are each SHARED by two surfaces — extend the shared type/projection once, fixes both.
- Commit atomically per logical group (A, B-shared-projections, C-leaderboard, C-holes), each with `Refs #624` in the body. Final commit may use `Closes #624`.
