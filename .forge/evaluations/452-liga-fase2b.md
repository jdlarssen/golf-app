# Evaluation: #452 Liga — Fase 2b (Poeng per plassering)

**Date:** 2026-06-07
**Branch:** `issue-452-liga-fase2b`
**Evaluator:** skeptical fresh-context review (code + tests + gates; no live browser — admin-gated + needs seeded data)

## Verdict: **ACCEPT**

Every contract criterion is met. The points model awards descending placement points with correct tie-averaging, the direction inversion is applied at all four required sites, and the three lower-is-better models reduce byte-for-byte to the previous behavior when `higherIsBetter === false`. All gates green.

## Gate results

| Gate | Result |
|---|---|
| `npx vitest run lib/league/ components/league/` | **PASS** — 4 files, 33 tests passed |
| `npx tsc --noEmit` | **PASS** — exit 0, clean |
| `npm run build` | **PASS** — build succeeds, all routes compiled |
| `git diff main --stat` | **CLEAN** — 12 files, no migration touched (as expected); only league code/tests/wizard/admin + CHANGELOG/version |

## Per-criterion verification

| Criterion | Verdict | Evidence |
|---|---|---|
| Points compute: descending from field size, ties share average, season = sum, highest-first | PASS | `computeLeagueStandings.ts:56-76`. Hand-traced 6-player round with tie for 2nd–3rd → **6, 4.5, 4.5, 3, 2, 1** exactly. While-loop tie grouping correct, no off-by-one: `while (j+1<n && entries[j+1].score===entries[i].score) j++` then `sum += n-k` for k in i..j, `avg=sum/(j-i+1)`. Test `splits points by the average of tied placements` confirms 2.5/2.5/1. |
| Direction inversion applied everywhere | PASS | (a) season compare `compare()` uses `byValue` (line 188); (b) countback per-round uses `byValue` (line 192); (c) sentinel `worst = higherIsBetter ? -Infinity : +Infinity` (line 171) used in `cellValue` (line 178); (d) unranked sort uses `byValue` (line 205). All four covered. `tied()` uses `===` (direction-neutral, correct). |
| REGRESSION: total/average/best_n unchanged (lower-is-better) | PASS | `byValue` reduces to `av-bv` when false (= old code). `worst` reduces to `+Infinity` (= old). `cellValue` new form (`v==null ? worst : v`) is behaviorally identical to old (`cell && toPar!==null ? toPar : +Infinity`) for non-points. All pre-existing total/average/best_n tests still green (part of 33). |
| Missed round = 0 pts, cell null, 0-played player unranked | PASS | Compute: `if (p === undefined) continue` → 0 contribution, cell.points stays null (line 131-132); `if (roundsPlayed === 0) ranked = false` (line 138). Test `gives 0 points for a missed round (cell null) and leaves a no-show unranked` asserts value 0, ranked false, last row, cell.points null. |
| Active metric (net vs gross) drives placement | PASS | Points pre-rank sorts on `metricOf(s)` which honors the `metric` arg (line 36-37, 60). Test `assigns placement on the active metric` uses A net=2/gross=12, B net=5/gross=7 → net: A wins (2 pts), gross: B wins (2 pts). Genuinely different placements tested. |
| Table: "Poeng" header, per-round cell.points (plain), formatPoints handles .5, descending order from compute | PASS | `LeagueStandingsTable.tsx`: `valueHeader` points→'Poeng' (line 104); `RoundCell` model-aware reads `cell.points` for points else `cell.toPar` (line 36); `formatPoints` shows 1 decimal only when fractional (line 19-21); ordering comes from compute (component just splits ranked/unranked). Render test asserts 'Poeng' present, 'Totalt' absent, Alice shows points 2 (not to-par +3) and total 5. No model shows the wrong number. |
| Wizard "Poeng per plassering"; actions accepts points + rejects garbage; admin label; no dead config UI | PASS | `CreateLigaForm.tsx:378-383` adds the option + desc; `actions.ts:81-88` whitelist now includes `points` (still rejects anything else → `standings_model` error). `LigaManagement.tsx:61` STANDINGS_LABEL+=points. No dead UI: best_n_count field gated to `best_n` only; missed-policy/penalty blocks gated to total/best_n; for points `bestNCount` stays null (actions line 115-118), `missed_round_policy` passes harmless default never read by points branch. |
| Version MINOR + CHANGELOG + Part of #452 | PASS | package.json 1.91.x → **1.92.0** (minor, correct for new feature). CHANGELOG: new `1.92.y` theme + `[1.92.0]` entry with tagline + Teknisk details; previous series re-wrapped in `<details>`. Commit body ends with **`Part of #452`** (epic stays open — correct per closes-on-epic rule). |

## Adversarial deep-dives

- **Countback sentinel correctness:** For points, a missing/null cell → `Number.NEGATIVE_INFINITY` (worst possible for a high-is-better metric), so a player who skipped the most-recent round loses the countback tie. Correct. For non-points, `+Infinity`. Verified.
- **Tie at value=4 (A vs B), first points test:** countback on newest round r2 → B.points=2 > A.points=1, `byValue(1,2)=1>0` → B sorts first. Matches test `res.rows[0].userId === 'B'`. Direction-aware countback genuinely exercised.
- **Fractional totals + `===` equality:** Season values are exact dyadic-ish sums of `n-k` integers divided by small integers (e.g. 4.5, 2.5). `a.value !== b.value` and cell `=== ` comparisons are safe for these magnitudes; no float drift risk at golf-field sizes. `formatPoints` renders 2,5 (comma) for ties, integers plain.
- **New required `cell.points` field — construction sites:** Only one runtime construction site (`computeLeagueStandings.ts:79-95`), both branches set `points: null`. grep found no other `LeagueStandingCell`/`perRound` literal missing `points` (Panel test uses `perRound: []`; Table test literals all include `points`). tsc clean confirms.
- **Exhaustiveness over standings_model:** getLigaSnapshot maps points→points (line 334); compute if/else handles points; table valueHeader + RoundCell handle points; admin label Record has points. No switch/Record dropped points. No default-fallthrough mis-labels points as total.
- **getLigaSnapshot metric flow:** net/gross split unchanged; points works on top of whichever metric `standingsFor` passes. Correct.

## Issues

None blocking. None of severity.

Minor (non-blocking, no action required):
- `missed_round_policy` hidden input passes the default `'penalty'` for a points league (CreateLigaForm:312). The points branch never reads `missedRoundPolicy`, so this is inert. Cosmetic only.

## Notes

- Live browser verification not performed: UI is admin-gated and requires seeded league + delivered flights. Coverage substituted via the `LeagueStandingsTable.test.tsx` render test (Poeng header + per-round points + total), the passing `LeagueStandingsPanel.test.tsx`, the Type-A compute tests, and a green production build.
