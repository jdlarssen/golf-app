# Evaluation: #936 — VERDICT: ACCEPT

**Date:** 2026-06-24
**Evaluator:** skeptical fresh-context review against `.forge/contracts/936-personal-scoring-trend.md`
**Commits:** `a1028e6e` (geometry), `50542ccc` (component), `58d82056` (page wiring + version + CHANGELOG + i18n), `3c8a1e0e` (contract tick)

## Per-criterion verdict

| # | Result | Evidence |
|---|--------|----------|
| C1 | PASS | `lib/stats/scoringTrend.ts:87` returns `null` for `rounds.length < MIN_POINTS` (2). y-mapping is golf-correct: `mapY(v) = padTop + ((yMax - v)/domain) * innerHeight` (line 117–118) — higher score (larger v) → smaller svg-y → higher on screen, so a falling line = improvement. Domain padded (`pad = span===0 ? 2 : max(1, round(span*0.1))`, line 108) so `domain` is always `> 0` ⇒ no div-by-zero even on a flat line. |
| C2 | PASS | `npx vitest run lib/stats/scoringTrend.test.ts` → 14 tests pass. Covers: null <2 (`it.each`), one brutto point/round, netto skips null, empty netto line, even x-spacing (`[0,50,100]`), y-direction (lower score → larger y), monotonic improvement, domain spans brutto+netto, points strictly inside padded domain, flat-line centres at 50 without NaN, polyline string rounding. |
| C3 | PASS | `ScoringTrendChart.tsx`: two `<polyline>` (brutto solid `var(--color-primary)`, netto dashed `var(--color-muted)` via `strokeDasharray`), HTML `<figcaption>` legend, `role="img"` + `aria-label={ariaLabel}` (line 40–41). No hardcoded hex (grep `#[0-9a-fA-F]{3,6}` matches only the `#936` comment). No `'use client'`, no hooks, no animation — static. |
| C4 | PASS | `ScoringTrendChart.test.tsx` has 2 render tests (with-netto + no-netto branch). Asserts polyline **count** (2 vs 1), `getByRole('img', {name})`, and legend text «Brutto»/«Netto» presence/absence. Does NOT re-assert any Type A coordinate numbers — geometry is built from the real `buildScoringTrend`, only structure is checked. |
| C5 | PASS | `page.tsx:168` `{trend && (…)}` gates the chart; `buildScoringTrend` returns `null` for <2 rounds (C1, unit-covered). Chart sits inside `<Card>` after `TopBar` + `roundCount`, before the list (line 168–181). End-to-end real-page render is build+unit-proven only (see Concerns). |
| C6 | PASS | `page.tsx:148-151` filters `gamesWithStats` to `g.holeCount === COMPLETE_ROUND_HOLES (18) && g.bruttoSum != null`, then `.map(... netto: g.nettoSum).reverse()`. `gamesWithStats` is sorted newest-first (line 114–126, `bTime - aTime`), so `.reverse()` correctly yields oldest→newest. 9-hole/incomplete rounds (`holeCount !== 18`) excluded. |
| C7 | PASS | Both `messages/no.json` and `messages/en.json` carry `profile.historikk.trendHeading`, `trendSubtitle`, `trendAriaLabel` (ICU plural, both locales). Both files `JSON.parse` OK. Legend labels reuse existing `colBrutto`/`colNetto` («Brutto»/«Netto» · «Gross»/«Net») — a deliberate reuse named in the contract i18n section, not a missing key. |
| C8 | PASS | `package.json` version `1.143.0` (minor bump from 1.142.1). CHANGELOG `### [1.143.0] - 2026-06-24 · #936` with tagline + Teknisk details, under a new `## 1.143.y — Tallene dine` series heading. Source tag `· #936` present. |

## Gate results

| Gate | Result | Evidence |
|------|--------|----------|
| `npm run typecheck` (`tsc --noEmit`) | PASS | exit 0, no errors |
| `npx eslint <5 changed files>` | PASS | exit 0, no warnings |
| `npx vitest run scoringTrend.test.ts ScoringTrendChart.test.tsx` | PASS | 2 files / 16 tests passed |
| `npm run build` | PASS | exit 0, "✓ Compiled successfully in 3.8s"; full route tree printed, no exhaustive-switch/Record drift |

## Test-discipline check

- **Type C "max one render-test per component":** technically 2 `it()` blocks, but they cover two distinct render branches (netto present vs all-null netto), not duplicated coverage. This matches the contract's own C4 ("with-netto + no-netto branch") and is the intended structural-branch split, not a Type A duplication. Acceptable.
- **Type C does not duplicate Type A:** confirmed — no coordinate assertions in the component test.
- **Type A edge coverage:** strong (guard, counts, x, y-direction, domain, flat-line, polyline serialization). No meaningful gap.

## Concerns / gaps

1. **No end-to-end real-page render test.** Staging has 0 finished games, so `/profile/historikk` cannot exercise the `trend && (…)` branch against real data. Mitigation: the data-flow is build-proven (route compiles, page wires the real builder + component) and unit-proven (filter→reverse→builder→null-gate all covered), and the implementer verified the real `ScoringTrendChart` renders in the real app shell (light+dark, 0 console errors, v1.143.0 footer) via a temporary preview route since deleted. **Assessment: acceptable.** The only untested seam is the live filter feeding ≥2 real 18-hole rounds into the builder — that seam is pure data transformation with no I/O, fully covered by the page logic + Type A tests. Risk of a prod-only failure is low. Recommend the contract's staging click-through be run opportunistically once staging has ≥2 finished 18-hole rounds, but it should not block merge.
2. **Single-netto-round edge:** if exactly one round has netto, `hasNetto` is true (legend shows «Netto») but the netto `<polyline>` is suppressed by the `nettoPoints.length >= 2` guard (component line 45) — only the netto circle renders. Defensible (one point cannot form a line) and visually coherent; not a defect.
3. **Pre-existing CHANGELOG drift (NOT introduced by this PR):** the convention (`docs/changelog-conventions.md`) says when a new minor opens, the prior series should be moved into a collapsed `<details>` drawer. 22 series headings (1.122–1.143) are currently open above the drawer section (drawers start at 1.121). The 1.142.y series sitting open right above 1.143.y is consistent with this long-standing drift, not a regression from #936. Worth a separate cleanup pass but out of scope here.
4. **`preserveAspectRatio="none"`** on the SVG (line 42) will stretch the chart non-uniformly to the container width. Intentional for a full-width trend strip and consistent with the contract's "non-scaling-stroke" choices; circles use `vectorEffect="non-scaling-stroke"` so the stroke isn't distorted (fills still scale, but radius distortion of small dots is visually negligible). Not a defect; noting for awareness.

## Verdict

All 8 criteria PASS, all 4 gates green. The work genuinely meets the contract. **ACCEPT.**
