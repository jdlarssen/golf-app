# Spec: Handicap-trend (WHS score-differensial-historikk)

Issue: #941 · Milestone: Runde 2 — Neste · Effort: L · Branch: `claude/vigilant-saha-f29912`

## Problem
For many Norwegian golfers, Golfbox/Golfmore *is* the handicap journal — every round moves the number. Tørny shows the handicap index as a single editable field; a golfer expects rounds to move it but sees nothing. The app already stores every raw input needed to compute a proper WHS **score differential** per round (brutto per hole, slope/CR per tee, frozen `course_handicap`, par + stroke-index per hole), but never computes or stores one. We deliver the **form/differential trend** — one differential per finished round, plotted over time in the personal-stats hub — without yet reconstructing the official index (the deferred XL piece).

## Prior Decisions (carried forward)
- **#940 cemented `/profile/historikk` as the personal-stats HUB** (Statistikk/Runder toggle; default Statistikk = trajectory + period + breakdown). New personal-stats sections live here, **not** in the club tavla `/profile/statistikk`. → The differential trend is a new card in the Statistikk tab.
- **#936/#949 scoring-trend** already renders a hand-rolled SVG line chart over the **last-20 complete-18-hole window** (the WHS window) via `buildScoringTrend()` + `ScoringTrendChart` + `summarizeTrendRounds()`. We reuse this machinery rather than build a new chart.
- **lib/scoring discipline** (CLAUDE.md): no change without a new test first. The differential function is Type A pure-logic → TDD.
- **Five build traps** (AGS): 0-row write = failure (assert affected rows), RLS is the real authz layer (column needs a write guard), a rule has one home (the differential formula lives in **one** TS function, never duplicated in SQL).

## User Decisions (this contract's discussion)
1. **Storage = frozen at round end.** Each round's differential is computed once and stored permanently, so the journal never shifts retroactively (e.g. if an admin later corrects a course's slope/CR). → new nullable column + write at finish.
2. **Accuracy = full WHS.** Adjusted Gross Score with per-hole **net-double-bogey** caps (`par + 2 + strokes received`), so the number matches what Golfbox shows. Reuse `strokesForHole()`.
3. **Scope = trend graph only.** v1 renders the trend in profil → historikk. The editable `users.hcp_index` field stays manual. Reconstructing the official index (best-8-of-20) is explicitly out of scope.

## Design

### The number — WHS score differential per round
For one finished, complete 18-hole round where slope, course rating, and `course_handicap` are all known:
```
received_i = strokesForHole(courseHandicap, strokeIndex_i)   // existing lib/scoring
cap_i      = par_i + 2 + received_i                          // net double bogey
adj_i      = min(strokes_i, cap_i)                           // adjusted hole score
AGS        = Σ adj_i  (i = 1..18)
differential = round1( (113 / slope) × (AGS − courseRating) )
```
- `round1` = round to **one decimal** (WHS convention). Differentials can be **negative** (plus-handicap or easy course) — that is valid, keep the sign.
- `par_i` is gender-resolved (the page already builds `genderByGame` + `parForGender`); `strokeIndex_i` from `course_holes`; `strokes_i` from `scores`.
- **PCC = 0** (no playing-conditions adjustment) — out of scope.

New pure module **`lib/scoring/scoreDifferential.ts`**:
```ts
export type DifferentialHole = { strokes: number | null; par: number; strokeIndex: number };
export type DifferentialInput = {
  holes: DifferentialHole[];        // expect 18 with non-null strokes
  courseHandicap: number | null;
  slope: number | null;
  courseRating: number | null;
};
/** Returns the WHS score differential (1-decimal), or null when the round can't
 *  produce a valid one (not 18 scored holes, or missing CH/slope/CR). */
export function computeScoreDifferential(input: DifferentialInput): number | null;
```
Pure Type A (I/O-free), TDD per `lib/scoring/AGENTS.md`.

### Storage — frozen at finish
- **Migration `0117_game_players_score_differential.sql`**: add `score_differential numeric(4,1) NULL` to `game_players`, plus a **write guard** so players cannot set/alter it via a hostile PATCH (extend the protected-columns trigger in the `0103`/`0107` family, or add an equivalent trigger — only the service/system context writes it). RLS read is already covered (a user reads their own `game_players` rows; finished-game rows are world-readable per existing policy).
- **Freeze at finish:** a shared helper (e.g. `lib/games/freezeDifferentials.ts`) computes each player's differential and stores it, invoked from **every** finish path: `endGame` ([app/[locale]/admin/games/[id]/actions.ts:430](app/[locale]/admin/games/[id]/actions.ts)), `endGameWithSideWinners`, and `endGameMarkingWithdrawals`. DRY — one call site shared by all three, not copy-pasted. Use the admin/service client and **assert affected rows** (`lib/supabase/affectedRows.ts`) — a 0-row update is a failure, not success.
- **Legacy rounds (finished before this column existed):** the historikk page **lazy-freezes** them. When it computes a differential for one of the viewing user's own rounds that still has `score_differential IS NULL`, it persists the value via `after(() => …)` (same post-render-write pattern as the auto-start fallback) using the admin client, scoped to that user's finished rounds. Idempotent (only fills NULLs). This delivers the "frozen" guarantee for existing data with **no manual prod backfill step**.

### Display — reuse the scoring-trend chart
In the **Statistikk tab** of `/profile/historikk` ([app/[locale]/profile/historikk/page.tsx](app/[locale]/profile/historikk/page.tsx)), add a new `<Card>` directly **after** the scoring-trend chart (both are trajectory views), before SeasonRecap.
- Add a `tee_boxes` fetch keyed by the games' `tee_box_id` set (the page does not fetch tee ratings today); resolve slope/CR via `getRatingForGender(tee, gender)` ([lib/games/teeRating.ts](lib/games/teeRating.ts)).
- Per round in the window, the **effective differential = `score_differential` (stored) ?? computed-live**. Compute-live uses `computeScoreDifferential` so the chart works immediately for everyone, including rounds finished before the migration.
- **Window:** the last **20** complete-18-hole rounds **that have a computable differential** (skip rounds missing slope/CR/CH), oldest→newest — reuse `MAX_TREND_ROUNDS` / `COMPLETE_ROUND_HOLES`. This window may hold fewer/different rounds than the scoring-trend window; that is expected.
- **Render:** reuse `buildScoringTrend()` + `ScoringTrendChart` with the differential as the single series (map each round to `{ brutto: differential, netto: null }`). Lower differential = better, so a falling line = improving — the chart's existing y-axis intuition already matches. Pass differential-specific labels (heading e.g. «Handicap-form», series label «Differanse», window «Siste N runder», Start/Nå/Beste where Beste = lowest). A thin wrapper component is at Claude's discretion if it reads cleaner than threading labels.
- **i18n:** add the new keys to **both** `messages/no.json` and `messages/en.json` (catalogParity + apostropheParity tests enforce parity). Run `humanizer:humanizer` on the new Norwegian copy.

## Edge Cases & Guardrails
- **< 2 qualifying rounds** → omit the card entirely (no error, no empty box) — mirror how the scoring-trend chart is conditionally rendered.
- **Round with < 18 scored holes / null holes** → `computeScoreDifferential` returns `null`; excluded from the window.
- **Missing `tee_box_id`, slope, CR, or `course_handicap`** → `null`; excluded. (The round can still appear in the scoring-trend, which only needs brutto — point counts differing between the two charts is acceptable.)
- **Negative differential** → valid; do not clamp to 0.
- **Hostile PATCH** of `score_differential` by a player → blocked by the write guard; cover with the hostile-PATCH rig (#440 pattern).
- **0-row write** on the finish-path store → caught by `expectAffected` assertion.
- **Lazy-freeze idempotency** → the `after()` upsert only fills NULLs; re-viewing is a no-op. Must not throw inside render (use `after`, not inline await).
- **No new `GameMode`** is introduced → no exhaustive-switch fan-out; `tsc --noEmit` + lint is sufficient (full `npm run build` as final sanity).

## Claude's Discretion
- Exact new i18n key names and the card heading/subtitle copy (keep brand voice; humanizer-clean).
- Whether to render via a thin `DifferentialTrendChart` wrapper or pass labels straight into `ScoringTrendChart`.
- Whether the shared finish-path helper takes a loaded game context or re-fetches — pick whichever avoids an extra round-trip in `endGame`.
- Numeric column precision detail (`numeric(4,1)` assumed; widen if a realistic differential can exceed ±99.9 — it cannot for 18-hole golf, so `(4,1)` is fine).

## Success Criteria
- [x] **`lib/scoring/scoreDifferential.ts` is pure and correct.** ✔ 13 TDD tests green (`vitest run lib/scoring/scoreDifferential`): standard round, net-double-bogey cap clips a blow-up hole, negative differential, `null` on 17-hole / null-strokes / missing slope·CR·CH. Independent SQL oracle on staging agreed to the digit (brutto 72/90/108 → 2.0/17.8/33.5). Commit `045d89d5`.
- [x] **Migration `0117` adds the column + write guard.** ✔ `game_players.score_differential numeric(4,1)` + `guard_game_players_score_differential` trigger applied to staging (MCP). Hostile PATCH by a confirmed non-admin player → **HTTP 403, code `42501`** ("…cannot be changed by a player"). Commit `81c5ee4d`.
- [x] **Every finish path freezes the differential.** ✔ **Live endGame** on staging (real "Avslutt spillet" action) → `status='finished'` + `score_differential=17.8` (brutto 90 oracle). `persistScoreDifferentials` awaited in `endGame` (actions.ts:530) + `endGameWithSideWinners` (avslutt/actions.ts:198); `endGameMarkingWithdrawals` delegates to `endGame`. `computeScoreDifferential` has one home (grep: only def + helper + page).
- [x] **Historikk renders the differential trend.** ✔ Staging: user with 3 rounds → "Handicap-form" card in Statistikk tab (h2 order: Formkurven din → Handicap-form → Sesongen din → Baner); boxes render **2,0 / 33,5 / 2,0** (locale-comma 1-decimal), matching oracle. Legacy NULL rounds lazy-froze on view (DB → 2.0/17.8/33.5). Commits `b4245e9b`, `d7cbc294`.
- [x] **Graceful sparse/empty state.** ✔ Staging: user reduced to 1 round → `data-testid="scoring-trend"` count = 0, only "Sesongen din"+"Baner" render, HTTP 200, no error.
- [x] **i18n parity + clean copy.** ✔ `diffHeading/diffSeriesLabel/diffWindow/diffAriaLabel` in both `no.json`+`en.json`; `vitest run messages` green (parity + apostrophe); copy mirrors humanizer-blessed `trend*` patterns («Handicap-form», «Differanse»).

## Gates
- [x] `npx tsc --noEmit` — 0 errors (one pre-existing unrelated `web-push` module error, fixed locally via `npm install`).
- [x] `npx vitest run lib/scoring/scoreDifferential scoringTrend ScoringTrendChart messages` — **41 tests passed (5 files)**.
- [x] `npm run lint` (touched files) — clean (page complexity refactored 39→under-25 via extracted helpers).
- [x] Staging end-to-end via `preview_*` + MCP: chart renders, values match oracle, lazy-freeze writes, hostile-PATCH blocked, sparse clean. **0 prod writes** (URL host asserted `snwmueecmfqqdurxedxv`; all seed data cleaned up — 0 test games / 0 frozen diffs left).
- [x] Version bump 1.152.0 → 1.153.0 (`feat` minor) + CHANGELOG Funksjoner line; polish as 1.153.1 (`fix` `[no-changelog]`). Every commit carries `Refs #941`.

## Files Likely Touched
- `lib/scoring/scoreDifferential.ts` (+ `.test.ts`) — new pure WHS-differential function (TDD).
- `supabase/migrations/0117_game_players_score_differential.sql` — column + player write-guard trigger.
- `lib/games/freezeDifferentials.ts` (new shared helper) — compute + store, affected-rows asserted.
- `app/[locale]/admin/games/[id]/actions.ts` (+ `avslutt/actions.ts`, `avslutt-likevel/actions.ts`) — wire the helper into all finish paths.
- `app/[locale]/profile/historikk/page.tsx` — add tee_boxes fetch, build differential window (`stored ?? live`), render card, lazy-freeze via `after()`.
- (optional) `components/stats/DifferentialTrendChart.tsx` — thin wrapper if it reads cleaner than reusing `ScoringTrendChart` directly.
- `messages/no.json`, `messages/en.json` — new keys (parity).
- `package.json`, `CHANGELOG.md` — version bump + Funksjoner line.

## Out of Scope (deferred ideas)
- **Reconstructing the official WHS handicap index** (average of best 8 of last 20 differentials) and auto-moving `users.hcp_index` — the XL piece #941 explicitly defers. The editable field stays manual.
- **9-hole-round differentials** (WHS 9-hole scaling) — the trend is 18-hole-only, mirroring the scoring-trend.
- **A standalone `handicap_revisions` history table** — frozen per-round differential on `game_players` is sufficient for the trend; a dedicated revisions table is unneeded for v1.
- **A mass one-time prod backfill job** — lazy-freeze-on-view covers legacy data organically; no separate prod migration script.
- **PCC / playing-conditions adjustment.**
