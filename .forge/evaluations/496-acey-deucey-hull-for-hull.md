# Evaluation: Acey-Deucey — format-bevisst «Hull for hull» (PR 5 av epic #496)

**Verdict: ACCEPT** — every success criterion verified against real evidence; all gates green (with the documented parallel-load flakiness, which I confirmed is NOT this PR's fault). Solid, faithful mirror of the Nines/Round-Robin pattern with a clean, purely-additive TDD scoring extension.

## Gates (run in the worktree)

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | **Exit 0**, clean — no errors. |
| `npx vitest run lib/scoring/modes/aceyDeucey.test.ts` | **PASS** — ran together with integration: 20 tests / 2 files. aceyDeucey file = 19 tests (16 pre-existing + 3 new perPlayer cases), all green. |
| `npx vitest run lib/scoring/integration.test.ts` | **PASS** — snapshot intact; the perPlayer addition did not break it. |
| `npx vitest run "app/games/[id]/leaderboard/holes"` | **PASS** — 5 files / 5 tests (one render-test per holes view incl. AceyDeuceyHolesView). |
| `npx vitest run "app/games/[id]/leaderboard"` (full dir) | **Flaky under parallel load**: run 1 = 9 failed/164 passed, run 2 = 1 failed (NassauView)/172 passed. Different files fail each run, ~6.6s timeout-range durations, "navigation to another Document"-class. Re-ran the failing files **in isolation** (NassauView + WolfView + AceyDeuceyView + AceyDeuceyHolesView) → **4 files / 7 tests all pass**. NassauView and WolfView are **not touched by this PR** (confirmed via `git diff --name-only`), so the flakiness is the documented #506-class issue, not this work. |
| `npm run lint` | **Exit 0 — 0 errors**, 24 warnings, all pre-existing `_gameId`/`Button`/`userId` unused-var warnings in files NOT touched by this PR. **Zero warnings on any AceyDeucey file.** |
| `npm run build` | **Exit 0**, success. |

## Success Criteria

1. **`perPlayer` exposes `{gross, effectiveScore, points}`; points/ranking unchanged → VERIFIED.**
   - `aceyDeucey.ts:189-194` builds `perPlayer` from `effByPlayer` (has userId+eff, in `ctx.players` order) + `grossByKey` + `pointsByPlayer`. Strictly additive — placed AFTER points/ranking already computed.
   - Test `aceyDeucey.test.ts:564-587` asserts exact `toEqual` cells for a scored hole, AND `hole.perPlayer.map(c=>c.userId)` equals `['u1','u2','u3','u4']` (ctx order). Real assertions, not hollow.
   - 16 pre-existing cases still pass (19/19), points/ranking untouched.

2. **`effectiveScore` = net when scoring='net'; null when unplayed; points 0 on unfinished → VERIFIED.**
   - Test `aceyDeucey.test.ts:610-632`: u1 CH=18 on SI-1 → `gross:5, effectiveScore:4` (the HCP stroke flows through). Real net-allocation assertion.
   - Test `aceyDeucey.test.ts:589-608`: unfinished hole → `cell('u2')` = `{gross:null, effectiveScore:null, points:0}`, `scored:false`. The played-but-unfinished u1 cell still gets `points:0`.

3. **«Hull for hull» shows all 4 players + score + points + ace/deuce — not the team scorecard → VERIFIED.**
   - `holes/page.tsx:156-162` adds the `'acey_deucey'` branch → `AceyDeuceyHolesBody` (mirrors `NinesHolesBody`, no injection). `AceyDeuceyHolesView` HoleCard renders the full `perPlayer` array (`AceyDeuceyHolesView.tsx:177-244`).

4. **Richer than AceyDeuceyView's per-hole → VERIFIED (genuine differentiator).**
   - `AceyDeuceyView.tsx:304-371` HoleRow shows ONLY `aceName` (+3) / `deuceName` (−3) / "Delt" / "Venter" — no per-player scores, no middle two players.
   - `AceyDeuceyHolesView` shows all 4, score-ranked, with brutto/netto/points. Not equivalent; the intent holds.

5. **Ace/deuce highlight driven by `aceUserId`/`deuceUserId`, not raw min/max; shared extreme = no highlight → VERIFIED (the critical correctness point).**
   - View keys off `cell.userId === hole.aceUserId` and `=== hole.deuceUserId`, both guarded by `hole.scored` (`AceyDeuceyHolesView.tsx:182-183`).
   - Ace = `border-accent/40 bg-accent/[0.06]` + ★ (`:190-191`, `:202-206`); deuce = `border-border bg-surface-2` (`:193`) — a cold/muted token, NOT `border-accent`.
   - Render test `AceyDeuceyHolesView.test.tsx:140-142`: card2 (shared lowest — u1/u2 both eff 4, `aceUserId:null`) asserts `querySelector('[class*="border-accent"]')` is **null**, while deuce (−3) is still present. Symmetric: shared-highest would likewise leave `deuceUserId:null`.

6. **`buildAceyDeuceyContext` used by both `renderAceyDeucey` and `AceyDeuceyHolesBody`; no duplicated ctx-map → VERIFIED.**
   - `lib/scoring/context/buildAceyDeuceyContext.ts` created; `teamNumber: null` (solo, NOT slot) at `:63`.
   - `renderAceyDeucey` (leaderboard/page.tsx:2935) now calls it — the ~40-line inline literal is deleted (confirmed in diff). `AceyDeuceyHolesBody` (holes/page.tsx:508) calls it too.
   - `grep "game_mode: 'acey_deucey' as const"` → **NONE FOUND** (the leftover inline literal is gone).

7. **Other formats untouched; reveal/dark/tabular-nums/≥44px → VERIFIED.**
   - Only the `'acey_deucey'` branch added to holes/page.tsx; Skins/Wolf/Nines/Round Robin bodies unchanged.
   - reveal-hidden block `AceyDeuceyHolesView.tsx:54-75`; `tabular-nums` on numeric spans; back-link `h-11 w-11` (`:126`); deuce uses existing `border-border`/`bg-surface-2`/`text-muted` — token audit shows NO new color tokens.

8. **Type C render-test honesty → VERIFIED.**
   - `AceyDeuceyHolesView.test.tsx` is ONE `it` asserting the differentiators: list length 3, ★ present, `brutto 4`, `−3` (U+2212), score-ranked order (`card1Rows[0]`=Alice/ace top, `[3]`=David/deuce bottom), shared-lowest no `border-accent`, pending "Venter"/"–"/no highlight. Does not re-assert Type-A scoring numbers.

9. **CHANGELOG / version → VERIFIED.**
   - `package.json` 1.98.0 → **1.99.0** (MINOR).
   - New `## 1.99.y — Acey-Deucey · hull for hull` theme opened; previous `1.98.y` Round Robin folded into `## Tidligere versjoner` under `<details>`. PR's own contribution is balanced: +2 `<details>` / +2 `</details>` (390→392, 378→380). The residual 12-tag imbalance is pre-existing on `origin/main` (390 vs 378), NOT introduced here.

## Skeptical findings

**Minus sign (U+2212):** `formatPoints` (`AceyDeuceyHolesView.tsx:33-37`) uses `−` (U+2212) for negatives, matching the AceyDeuceyView convention. Verified.

**Pending-hole sort safety:** `HoleCard` only sorts when `hole.scored` (`:147-152`); pending holes keep `ctx.players` order. The sort uses `(a.effectiveScore ?? Infinity)` so even a stray null can't NaN the comparator. No crash path. Middle "0" is shown for scored holes (`formatPoints` returns `'0'`, rendered in `text-muted/40`); pending holes show no points chip (`{hole.scored && ...}` at `:216`). All correct.

**Deuce vs middle visual differentiation:** deuce points = `text-muted`, middle = `text-muted/40`, ace = `text-accent` (`:218-224`). Three distinguishable tones using existing tokens. Fine.

**NIT (nice-to-have, not blocking):** The render test's card1 `perPlayer` is already supplied in ascending-effective order (`[3,4,4,6]`), so a hypothetical no-op sort would still pass `card1Rows[0]=ace, [3]=deuce`. The sort's correctness is implicitly covered (tsc + the deuce-at-bottom assertion in a multi-award hole), but the test would be marginally stronger if card1's `perPlayer` were supplied out-of-order to force the sort to do real work. Pure test-robustness polish — the production sort logic is correct and the differentiator (shared-extreme no-highlight) IS hard-asserted.

**No invented problems.** The scoring extension is genuinely additive (verified by 16 unchanged cases + integration snapshot). The context helper de-duplicates real inline logic. The view is a faithful, correct mirror of the established pattern with the format-specific ace/deuce treatment driven by the right fields.

## Must-fix vs nice-to-have

- **Must-fix:** none.
- **Nice-to-have:** the card1 sort-robustness nit above (supply `perPlayer` out-of-order in the render test). Non-blocking; can ship as-is.
