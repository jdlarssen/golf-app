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
- [x] `app/[locale]/games/[id]/(home)/page.tsx` — PageHeader title (729) AND `.toUpperCase()` Kicker (494) wrapped with `game.courses?.name`. (commit dc3b05c1)
- [x] `app/[locale]/games/[id]/submit/page.tsx` (148) wrapped with `courseTee.courses?.name`.
- [x] `app/[locale]/games/[id]/trekk-fra/page.tsx` (117) localizes inside `t('heading', { name })` with `game.courses?.name`.
- [x] `app/[locale]/admin/games/[id]/page.tsx` (264) wrapped with `game.courses?.name`; ALSO StartGameButton confirm-dialog name (caught by sweep) wrapped.
- [x] `app/[locale]/admin/games/[id]/slett/page.tsx` — bullet (149) AND heading interpolation (122, caught by sweep) wrapped with `game.courses?.name`.
- [x] `app/[locale]/klubbhuset/page.tsx` (91) wrapped with `g.courses?.name`.
- [x] `app/[locale]/HomeDiscoverySection.tsx` (135/181/229) — all three cards wrapped with `game.course_name`.

Group B — surfaces needing a slim projection extended:
- [x] `app/[locale]/games/[id]/rediger/page.tsx` (102) — `GAME_SELECT` + shared `EditGameRow` extended with `courses`; title wrapped.
- [x] `app/[locale]/admin/games/[id]/edit/page.tsx` (145) — local select extended; shared `EditGameRow`; `<h1>` wrapped.
- [x] `app/[locale]/admin/games/[id]/status/page.tsx` (177) — select + local `GameRow` extended; `<h1>` wrapped.
- [x] `app/[locale]/admin/games/[id]/signups/page.tsx` (172) — select + local `GameRow` extended; `getLocale()` added; subtitle wrapped.
- [x] `app/[locale]/profile/historikk/page.tsx` (162) — nested `games!inner(...)` select + `GameRow` extended; wrapped in `GameHistoryCard`.
- [x] `app/[locale]/signup/[shortId]/page.tsx` (239) — `getGameByShortId` + `ShortIdGame` extended; `<h1>` wrapped.
- [x] `app/[locale]/signup/[shortId]/team/page.tsx` (127 `t()`, 202 kicker) — shared `getGameByShortId`; both wrapped.

Group C — heavy leaderboard surfaces (slim parallel `courses(name)` fetch + localize at source):
- [x] `leaderboard/page.tsx` — `LeaderboardBody` fetches `courses(name)` + `getLocale()` in parallel, shadows the prop with a localized copy (`const game = { ...gameRow, name: localizeGameName(...) }`) BEFORE all branch returns. All 48 `gameName`/`kicker` sites (in body + ~18 render helpers) inherit the localized name with zero per-helper edits. Verified no `gwp.game.name` bypass.
- [x] `leaderboard/holes/page.tsx` — shared `localizeHolesGameName(game)` helper (cached `getDrilldownContext` + slim `courses(name)` + `getLocale()`); all 9 mode bodies' `gameName={game.name}` → `gameName={await localizeHolesGameName(game)}`.

Cross-cutting:
- [x] `/en` localizes every display surface — sweep confirms only remaining raw `game.name` are (a) the `notifyPlayersGameStarted` notification payload (home:363, intentionally raw) and (b) leaderboard helpers reading the shadowed localized `game`. tsc clean, build succeeds.
- [x] `/no` byte-identical — every wrap passes the real `locale` (no hardcoded locale anywhere); helper early-returns for 'no'.
- [x] No new render tests; `autoGameName.test.ts` unchanged, 46 tests green.
- [x] `package.json` → 1.129.5 + `CHANGELOG.md` entry under the open `1.129.y` theme; commit-msg hook passed.

## Gates (run scoped to what changed; full build before final commit)

- `npx tsc --noEmit` — type safety, incl. every exhaustive switch/Record map (Vercel build trap per project memory). MUST pass.
- `npx vitest run lib/games/autoGameName.test.ts` — helper coverage stays green (no edits expected). MUST pass.
- `npx eslint <changed files>` — no new warnings/errors on touched lines.
- `npx next build` — final gate before declaring done; catches the exhaustive-switch / force-dynamic / PPR traps that `tsc` alone misses.

## Extension wave (post-evaluation, 1.129.6)

The skeptical evaluation (ACCEPT) noted the issue's enumerated list under-covered the owner's chosen "engelsk måned **overalt**" intent. A fresh whole-app sweep found more player-facing `game.name` display surfaces. Since #624 is the app-wide-sweep umbrella, these were wrapped too (same patterns):

- [x] `games/[id]/slett/page.tsx` (player delete) — heading + list bullet (courseName already in scope).
- [x] `admin/games/[id]/avslutt/page.tsx` + `avslutt-likevel/page.tsx` — subtitle (select + inline type extended).
- [x] `games/[id]/avslutt/page.tsx` (player) — both side/plain subtitles (select + type extended).
- [x] `admin/games/[id]/trekk-spiller/[userId]/page.tsx` — subtitle (select + inline type extended).
- [x] `games/[id]/spillere/page.tsx` — subtitle (slim course fetch; added `getLocale`).
- [x] `games/[id]/approve/page.tsx` + `scorecard/page.tsx` — back-label (slim course fetch via existing context client).
- [x] `games/[id]/holes/[holeNumber]/page.tsx` — per-hole header (slim course fetch).
- [x] `signup/[shortId]/team/page.tsx` — `teamName` H1 fallback `?? game.name` (courseName from extended `getGameByShortId`).
- Deliberately still raw: `(home)` notification payloads (`notifyPlayersGameStarted`, `maybeSendDeliveryReminder` — recipient-locale, not request-locale), `editGameInitialValues` form value, `leaderboard/export` CSV cell (not a UI title surface).

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
