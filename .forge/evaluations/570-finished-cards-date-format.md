# Evaluation: #570 — Avsluttede spill-kortene viser dato + spillform

**Verdict: ACCEPT**

Fresh-context skeptical evaluation of the single commit `2dc87bbc feat(home): show
format + end date on finished-game cards` against contract
`.forge/contracts/570-finished-cards-date-format.md`. All five success criteria pass,
all three runnable gates are green, and no scope creep or test-discipline violations
were found.

---

## Raw gate results

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | **TSC_EXIT=0** — clean, 0 errors. `next-intl`/`use-intl` resolve (npm install took). |
| `npx vitest run lib/games/formatLabel lib/format/date lib/i18n` | **4 files passed, 164 tests passed** (766ms). |
| `npm run build` | **✓ Compiled successfully in 5.7s** — full route tree + PPR legend printed; `/[locale]` (home) compiled as `◐` PPR. |

UI browser-render not feasible (confirmed): `app/[locale]/page.tsx:57-59` redirects to
`/login` without a session; no login codes in a headless/preview context. UI criteria
verified via code-wiring + unit-tested helpers, per the contract's own UI-verification
note. No feasible authenticated render path exists without login codes.

---

## Per-criterion verdict

### 1. Finished query selects `game_mode, mode_config`; shared `GameRow.games` type declares them — PASS
- Select string at `page.tsx:143` includes `game_mode, mode_config` in the `games!inner(...)` embed.
- Shared type at `page.tsx:116-117`: `game_mode: GameMode; mode_config: GameModeConfig;` (imported from `@/lib/scoring/modes/types` at line 21).
- `tsc --noEmit` clean.

### 2. Subtitle reads «<bane> · <format>» via `formatDisplayLabel`; «Leaderboard» is GONE — PASS
- `page.tsx:348-353`: `[g.courses?.name, formatDisplayLabel(g.game_mode, g.mode_config)].filter(Boolean).join(' · ')`.
- `grep "Leaderboard"` across `page.tsx` → only the `href={\`/games/${g.id}/leaderboard\`}` route at line 338 (the destination, not displayed copy). The subtitle literal «Leaderboard» is removed. Confirmed GONE.

### 3. End date via `formatShortDateLocale(ended_at, 'no')`, own muted tabular-nums line, guarded by `g.ended_at &&` — PASS
- `page.tsx:355-359`: `{g.ended_at && (<span className="block text-xs text-muted mt-1 tabular-nums truncate">{formatShortDateLocale(g.ended_at, 'no')}</span>)}`.
- `formatShortDateLocale(_, 'no')` → `formatShortDateNbLegacy` (`lib/i18n/format.ts:234`) → `${d.getDate()}. ${MONTH_NAMES_NB[d.getMonth()]}` (`lib/format/date.ts:53-55`). `MONTH_NAMES_NB[5] === 'jun'` (line 23), so June → «12. jun». Matches contract example. No-year by convention (correct, in scope).

### 4. Course-less games degrade gracefully (no leading « · ») — PASS
- `.filter(Boolean)` drops a null `courses?.name` before `.join(' · ')`, so a course-less game shows just the format with no leading separator.
- `formatDisplayLabel` returns `MODE_LABELS[mode]` as its fallback; `MODE_LABELS` is typed `Record<GameMode, string>` (total, `types.ts:35`), so it never returns an empty/undefined value — the array always has ≥1 truthy element.

### 5. `package.json` 1.117.3 + CHANGELOG `### [1.117.3]` nested under open `## 1.117.y` theme — PASS
- `package.json` version `1.117.3`.
- CHANGELOG: `## 1.117.y — i18n · engelsk i klubb, liga og cup` (line 20) is the open theme; `### [1.117.3] - 2026-06-13 · #570` (line 24) nests directly under it, above the prior `### [1.117.2]`. Tagline + `<details>Teknisk</details>` three-layer format respected.
- Commit prefix `feat(home):` — commit-msg hook accepted, which confirms the bump + CHANGELOG were staged together.

---

## Skeptical checks

- **Does adding `game_mode`/`mode_config` to shared `GameRow` break the active path?** No.
  The active query (`page.tsx:135`) omits both columns. `renderGameCard` (active cards,
  `page.tsx:255-294`) reads only `name`, `courses`, `scheduled_tee_off_at`, `teamNumber`,
  `flightNumber`, `status` — never the mode fields. At runtime the active rows simply lack
  those keys (`undefined`), but nothing dereferences them. Type-honesty is asserted via
  `.returns<GameRow[]>()`, mirroring the pre-existing `flight_number` precedent exactly as
  the contract states. Acceptable.

- **Could `formatDisplayLabel` throw on a real `mode_config` JSON?** No. The DB column is
  `Json` (non-null, `database.types.ts:636`). The helper narrows defensively on `mode`
  (family) + `modeConfig.kind` + `team_size`/`shamble_variant`, and falls back to the total
  `MODE_LABELS[mode]` record for any legacy/unknown shape. No unguarded dereference that
  could throw on a parsed-JSON object.

- **Is hardcoding `'no'` defensible?** Yes. The home page has zero `t()`/`useTranslations`
  usage — every visible string is a Norwegian literal («Avsluttede spill», «Pågår nå», «Mine
  spill»). An English date under a Norwegian header would be inconsistent. The builder used
  the locale-aware helper (`formatShortDateLocale`), so the #60 migration only needs to swap
  `'no'` for the route locale. Rationale sound.

- **Scope creep?** None. Diff is `page.tsx` (+20/-5), CHANGELOG (+16), package.json (+1
  version line), package-lock (benign bump artifact), and the contract file. No active-card
  changes, no new routes/components, no unrelated edits.

- **Test discipline?** Respected. No test files touched. Per CLAUDE.md Type C («maks én
  render-test per komponent») the home page has no existing render test, and the date/label
  logic is already covered by Type A tests on the helpers (164 green). Adding a brittle
  async-server-component render test would re-assert Type-A values — correctly avoided.

---

## Issues found

None blocking. One minor note for the record (not a defect): the shared `GameRow.games`
type declares `game_mode`/`mode_config` as non-optional even though the active query never
selects them — a deliberate type-honesty tradeoff via `.returns<>()` that mirrors the
existing `flight_number` pattern. The contract explicitly calls this out and accepts it.
No change required.
