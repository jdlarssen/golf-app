# Evaluation: #941 — Handicap-trend (WHS score-differential)

## Verdict: ACCEPT

Work under evaluation: commits `045d89d5..d7cbc294` on branch `claude/vigilant-saha-f29912`.
Evaluated independently against `.forge/contracts/941-handicap-trend.md`. Every automated
gate was re-run by me; every success criterion was checked against the code. No substantive gap found.

---

## Gates (re-run by evaluator)

| Gate | Result | Evidence I observed |
|---|---|---|
| `npx vitest run lib/scoring/scoreDifferential scoringTrend ScoringTrendChart messages` | **PASS** | `Test Files 5 passed (5)` / `Tests 41 passed (41)` |
| `npx tsc --noEmit` | **PASS** | exit 0, **zero** errors. The contract's noted pre-existing `web-push` error did not appear (node_modules installed) — a cleaner result than the contract hedged for. |
| `npx eslint <4 touched files>` | **PASS** | exit 0, no warnings/errors on `historikk/page.tsx`, `ScoringTrendChart.tsx`, `persistScoreDifferentials.ts`, `scoreDifferential.ts` |
| Diff scope | **PASS** | 14 files, matches "Files Likely Touched" + `lib/database.types.ts` (clean regen: only `score_differential` column) + `package-lock.json` (bump). No unrelated files. |
| Version bump | **PASS** | feat `b4245e9b` 1.152.0→1.153.0 (minor); fix `d7cbc294` 1.153.0→1.153.1 (patch) with `[no-changelog]`; CHANGELOG Funksjoner entry for #941 present; all 4 commits carry `Refs #941` |

---

## Success Criteria

| Criterion | Result | Evidence |
|---|---|---|
| **`scoreDifferential.ts` pure + correct** | **PASS** | Formula `min(strokes, par+2+strokesForHole(ch,si))` per hole → AGS → `round1((113/slope)(AGS−CR))` matches contract exactly (`scoreDifferential.ts:47-58`). Null guards: 18-hole length (`:38`), non-null strokes (`:41-45`), non-null CH/slope/CR (`:33-35`). Negatives preserved (no clamp). Tests hand-compute every value; the cap test genuinely binds — `scoreDifferential.test.ts:95-146` proves uncapped scores 7 and 8 both floor to the same 2.0, i.e. the cap is active. 13 differential tests + null cases. |
| **Migration 0117: column + write guard** | **PASS** | `add column score_differential numeric(4,1)` (`0117:24-25`). New `guard_game_players_score_differential` trigger bypasses service-role (`auth.uid() is null`) AND admin (`is_admin()`) (`0117:45`), blocks non-admin writes with `errcode='insufficient_privilege'` = SQLSTATE 42501 → HTTP 403 (`0117:52-56`). `SECURITY DEFINER`, `search_path=''`, schema-qualified — mirrors 0103/0107 family. Additive: a **separate** function+trigger; `guard_game_players_self_update` untouched. Both BEFORE UPDATE no-op for service role, so trigger order is irrelevant to correctness. |
| **Every finish path freezes** | **PASS** | `persistScoreDifferentials` awaited in `endGame` (`actions.ts:530`, after `status='finished'`) and `endGameWithSideWinners` (`avslutt/actions.ts:198`). `endGameMarkingWithdrawals` delegates via `endGame(gameId, true)` (`avslutt-likevel/actions.ts:72`) — covered. Uses `getAdminClient()` (service role → trigger bypass). Per-gender ratings via `getRatingForGender`. **0-row write guarded** inline: `.select('user_id')` + throw on empty (`persistScoreDifferentials.ts:198-212`). Best-effort: `Promise.allSettled` + outer try/catch, returns count, never throws out (`:140,231-234`). |
| **Formula has ONE home** | **PASS** | `grep computeScoreDifferential`: def (`scoreDifferential.ts`), one helper consumer (`persistScoreDifferentials.ts:180`), one page consumer (`historikk/page.tsx:533`), plus its own tests. No SQL re-implementation — migration stores only, computes nothing. |
| **Historikk renders differential trend** | **PASS** | Effective differential = `stored ?? live`: `computeDifferentials` returns stored when non-null (`page.tsx:505-507`), else live + queues lazy-freeze (`:533-545`). Window = last-20 complete-18-hole rounds with a differential, oldest→newest: `.filter(holeCount===18 && byGame.has(id)).slice(0,20).reverse()` (`:569-572`). Card guarded ≥2 via `diff.trend && diff.summary` — `buildScoringTrend` returns null below `MIN_POINTS=2` (`scoringTrend.ts:89,113`). Placed after the scoring-trend card, before SeasonRecap (`page.tsx:317→334→357`). |
| **Lazy-freeze legacy rounds** | **PASS** | `scheduleDifferentialFreeze` runs in `after()` (`page.tsx:458`), writes own rows only (`.eq('user_id', userId)`), idempotent (`.is('score_differential', null)`, `:468`), wrapped in try/catch so it can't break render (`:459-476`). Frozen vs live agree: both finish-path and page resolve null `tee_gender`→`mens` for rating AND par (`parForGender` default case = `par_mens`), so `stored` and `live` produce identical values for the same round. |
| **Graceful sparse/empty** | **PASS** | <2 qualifying rounds → `buildScoringTrend` null → card omitted (no error/empty box). <18-hole or null-strokes rounds → `computeScoreDifferential` null → excluded from window. Missing tee/slope/CR/CH → excluded (`computeDifferentials:513,532,543`). |
| **i18n parity + clean copy** | **PASS** | `diffHeading/diffSeriesLabel/diffWindow/diffAriaLabel` present in both `no.json:273-276` and `en.json:273-276` with matching ICU plural structure. `messages` parity+apostrophe tests pass (part of the 41). Copy «Handicap-form»/«Differanse» mirrors existing trend* brand voice. |
| **No new GameMode** | **PASS** | No enum/exhaustive-switch change; tsc + lint clean confirms. |

---

## Hand-verification of staging claims

Recomputed the builder's claimed staging numbers (slope 129, CR 69.7) from the formula:

| Brutto (=AGS, no cap) | raw `(113/129)(AGS−69.7)` | round1 | Builder claimed |
|---|---|---|---|
| 72 | 2.01473 | **2.0** | 2.0 ✓ |
| 90 | 17.78217 | **17.8** | 17.8 ✓ |
| 108 | 33.54961 | **33.5** | 33.5 ✓ |

All three are internally consistent with the code (assuming no net-double-bogey cap fired, which holds when brutto=AGS for those seeds). The live-endGame claim (`score_differential=17.8` at brutto 90) and hostile-PATCH→42501 are both consistent with the migration's errcode and the formula. Standard-round unit test (CH=18, slope 113, all bogey → AGS 90 → 18.0) re-derived by hand and confirmed correct.

---

## Notes (non-blocking)

1. **Helper name deviates from contract.** Contract section "Design"/"Files" names the freeze helper `freezeDifferentials.ts`; the delivered file is `persistScoreDifferentials.ts`. The success criteria themselves refer to `persistScoreDifferentials`, so the work is internally consistent — purely a naming choice, no functional impact.
2. **0-row guard is inline, not `expectAffected`.** The contract named `lib/supabase/affectedRows.ts`'s `expectAffected`; the helper instead chains `.select('user_id')` and throws on empty data (`persistScoreDifferentials.ts:208-212`). AGENTS.md trap #2 explicitly permits "chain `.select()` and assert row count **or** use the `expectAffected` helper", so this satisfies the trap. Minor stylistic deviation only.
3. **chore commits don't bump version.** Scoring calc + migration landed as `chore` (no bump); the user-visible `feat` carries the 1.153.0 bump. Compliant with the discipline (only the user-visible commit must bump).
4. **`getRatingForGender` also requires `par_total_<gender>` non-null** to return a rating — slightly stricter than "slope/CR present", but applied identically on both code paths, so it only narrows which rounds qualify (consistent with "missing rating → excluded"). Harmless.

None of these change behavior or violate the contract. No bugs, RLS holes, 0-row-write risks, formula duplication, i18n gaps, or new lint warnings found.
