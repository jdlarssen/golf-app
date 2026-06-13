# Contract: #570 — Avsluttede spill-kortene viser dato + spillform

**Issue:** [#570](https://github.com/jdlarssen/golf-app/issues/570) · Tier 1 — Onboarding & førsteinntrykk
**Branch:** `claude/romantic-albattani-566b0f`
**Type:** enhancement (PATCH, design-polish on existing cards)

## Problem

The «Avsluttede spill» cards on the home page (`app/[locale]/page.tsx`,
`HomeBody`) show only `name` + «<bane> · Leaderboard» + a 🏆 emoji. Two
information gaps:

1. **No end date.** `ended_at` is already fetched in the finished-games query
   but never rendered. Games whose name lacks a date («Fullsjuksøndag»,
   «SICKlestad») have no time anchor.
2. **No format.** Skins, matchplay, modified stableford and bingo bango bongo
   look identical in the list — you only learn the format inside the
   leaderboard.

## Approach

Extend the existing finished-games card render only — no new routes, no new
components, no query restructuring beyond two added columns.

**Card layout (owner-chosen, stacked, drop «Leaderboard»):**

```
Fullsjuksøndag                  ← name (serif, unchanged)
Byneset North · Skins           ← «<bane> · <format>» (muted xs)
12. jun                  🏆     ← end date (muted xs, tabular-nums) + trophy
```

- **Format label:** variant-aware via `formatDisplayLabel(game_mode, mode_config)`
  from `lib/games/formatLabel.ts` — same helper `ModeChip` uses. Gives «4BBB
  Stableford» / «Champagne Scramble» where a base `MODE_LABELS[mode]` would
  flatten the variant. Requires fetching `game_mode` + `mode_config`.
- **Date:** `formatShortDateLocale(ended_at, 'no')` from `lib/i18n/format.ts`
  → «12. jun». Hardcoded `'no'`: the whole home page is still Norwegian-
  literal (zero `t()` usage), so an English date under a Norwegian
  «Avsluttede spill» header would be inconsistent. The helper is the locale-
  aware one — when home is migrated under #60, swapping `'no'` for the route
  locale is the only change. Date renders only when `ended_at != null`
  (defensive; finished games normally have it).
- **Drop «Leaderboard»** from the subtitle — the 🏆 + tap-through to the
  leaderboard already communicate the affordance.

**Query change:** add `game_mode, mode_config` to the *finished* select in
`HomeBody` and to the shared `GameRow.games` type (typed as `GameMode` /
`GameModeConfig`). The active query keeps its current columns — active cards
never read mode; this mirrors the existing precedent where the finished query
already omits `flight_number` that the shared type declares. `.returns<GameRow[]>()`
is an assertion, so tsc stays green and finished rows carry the real values.

## Out of scope (don't gold-plate)

- #571 (cap to last 5 + archive page) — separate issue.
- #572 (per-player result on cards) — needs-brainstorming, datamodell decision.
- Year in the date — `formatShortDateNb` is no-year by convention (current
  season implied); the issue example has no year.
- i18n-migrating the home page — out of #570's scope; tracked under #60.
- Any change to the active-games card render.

## Success criteria

- [ ] Finished-games query in `HomeBody` selects `game_mode, mode_config`; the
      shared `GameRow.games` type declares them (`GameMode` / `GameModeConfig`).
- [ ] Each finished card's subtitle reads «<bane> · <format>» using
      `formatDisplayLabel(game_mode, mode_config)`; «Leaderboard» is gone.
- [ ] Each finished card shows the end date «12. jun» via
      `formatShortDateLocale(ended_at, 'no')` on its own muted, tabular-nums
      line, rendered only when `ended_at` is present.
- [ ] Course-less games degrade gracefully (subtitle is just the format; no
      leading « · »).
- [ ] `package.json` bumped to **1.117.3** + CHANGELOG entry nested under the
      open `## 1.117.y` theme; commit prefix `feat(home)`.

## Gates

- `npx tsc --noEmit` — exhaustive-switch / type honesty (changed file + types).
- `npx vitest run lib/games/formatLabel lib/format/date lib/i18n` — the label +
  date helpers this leans on (Type A logic, already green; confirm no break).
- `npm run build` — Next.js 16 prod build; the home page is a server component,
  build is the real compile gate (per CLAUDE.md tsc-gate-preexisting-trap).
- UI verification: render `/` finished section in preview/Playwright — confirm
  date line + format label appear and «Leaderboard» is gone.

## Notes

- No new render test: per CLAUDE.md test-discipline Type C («maks én render-test
  per komponent»), the home page has no existing render test and the date/label
  logic is already covered by Type A tests on the helpers. Adding a brittle
  async-server-component test would violate «ikke re-assert tall fra Type A».
- Humanizer: no new Norwegian prose strings (format names + dates come from
  existing catalogs/helpers), so the copy-style hook has nothing new to flag.
