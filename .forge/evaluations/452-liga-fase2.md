# Evaluation: #452 Liga — Fase 2a (netto + brutto parallelt + Beste-N)

**Verdict: ACCEPT**

Branch: `issue-452-liga-fase2`. Evaluated by skeptical independent verification (code reading + gates + live prod schema check via Supabase MCP). UI was verified via code reading and the `LeagueStandingsPanel` render test only — see "Live-browser verification" below.

## Gate results

| Gate | Result |
|------|--------|
| `npx vitest run lib/league/ components/league/` | **PASS** — 3 files, **28 tests** green |
| `npx tsc --noEmit` | **PASS** — exit 0, clean |
| `npm run build` | **PASS** — exit 0, "✓ Compiled successfully in 3.2s", full route tree, no errors |
| `git diff main --stat` | 16 files, +518/−55. Nothing unexpected touched (only the contract's listed files + migration 0085). |

## Per-criterion verification

| Criterion | Pass/Fail | Evidence |
|-----------|-----------|----------|
| Migration 0085 adds `best_n_count` + both CHECKs; applied to prod | **PASS** | `supabase/migrations/0085_league_best_n.sql` adds `best_n_count int` + `leagues_best_n_count_positive` (`>= 1 or null`) + `leagues_best_n_requires_count` (`standings_model <> 'best_n' or not null`). **Live prod check (Supabase MCP):** column `best_n_count integer, nullable=YES` exists; both CHECK constraints present with exact definitions. |
| best_n: sums lowest N | **PASS** | `computeLeagueStandings.ts:93-97` — `candidates.sort((a,b)=>a-b).slice(0,n).reduce(...)`. Ascending sort = lower-is-better correct. Test `computeLeagueStandings.test.ts:163-173` asserts `best 2 of {5,1,8}=6`. |
| best_n: penalty-fill missing rounds reusing penalty fn | **PASS** | `:85-88` candidate per counting round = played score else `penaltyForRound(...)` (same helper as Total). Tests at `:175-208` assert worst+1 fill, fixed-penalty fill, and mixed played+penalty fill (e.g. B `{9,9}+pen 5 → 23`). |
| best_n: cap N at rounds-with-results | **PASS** | `:92` `Math.min(config.bestNCount ?? candidates.length, candidates.length)` where `candidates.length === counting.length`. Test `:210-215` asserts N=5 with 1 round → sums the single round. |
| best_n: uses active metric | **PASS** | `metricOf` selects `grossToPar`/`netToPar` (`:35-36`); candidates and penalty both run through it. Gross-metric penalty test `:149-156`. No off-by-one or wrong-direction bug found. |
| best_n always penalty-fills regardless of missed_round_policy | **PASS** | best_n branch never reads `missedRoundPolicy`; wizard also forces `missed_round_policy='penalty'` for best_n (`CreateLigaForm.tsx:312`). |
| gross metric distinct from net, derived from totalGrossStrokes | **PASS** | `getLigaSnapshot.ts:316` `grossToPar: line.totalGrossStrokes - par` (same tee par as net). Test `:131-147` proves net ranks A first, gross ranks B first (distinct), asserts exact gross sums. |
| `{net,gross}` decided by `league.scoring` | **PASS** | `getLigaSnapshot.ts:346-349`. net: `scoring==='gross' ? null : net`. gross: `scoring==='gross' \|\| scoring==='both' ? gross : null`. Verified all three: net→{net,null}, gross→{null,gross}, both→{net,gross}. Ternary correct. |
| Public `/liga/[id]`: toggle only when both, default net, single table otherwise; best_n header "Beste N"/"Beste {n}" | **PASS** | `LeagueStandingsPanel.tsx:28-33` `both = net!==null && gross!==null`; default `useState(net!==null?'net':'gross')`; toggle rendered only when `both`; gross-only gets a "Brutto" caption. `LeagueStandingsTable.tsx:93-100` header = `best_n ? (bestNCount ? \`Beste ${bestNCount}\` : 'Beste N') : ...`. Render test (`LeagueStandingsPanel.test.tsx`) is non-vacuous: net/gross orderings differ, so the top-row name proves the table flips; second test asserts no toggle when single metric. |
| Wizard creates any scoring + any model; best_n requires count; invalid rejected; admin shows scoring + best_n label | **PASS** | Wizard: scoring radio Netto/Brutto/Begge (`CreateLigaForm.tsx:321-353`); model radios total/average/best_n (`:361-405`); best_n_count input required min=1 shown only for best_n (`:409-428`). Actions: `scoring∈{net,gross,both}` (`actions.ts:89`), `standings_model∈{total,average,best_n}` (`:84`), best_n_count parsed int `>=1` required iff best_n (`:110-114`), written to insert (`:136`). Admin detail (`LigaManagement.tsx:159,163-168`) shows `SCORING_LABEL` + `STANDINGS_LABEL` with `(N)` suffix for best_n. |
| `points` NOT selectable AND remains unimplemented — no dead UI | **PASS** | `points` absent from wizard model array; rejected by actions `:84` (falls through to `standings_model` error). `LeagueStandingsConfig.standingsModel` type narrows to `Extract<…,'total'\|'average'\|'best_n'>`. Grep: `'points'` appears only in the `StandingsModel` union type + a doc comment — no switch/Record renders over it. |
| Version MINOR → 1.91.0 + CHANGELOG; PR uses `Part of #452` | **PASS** | `package.json` = `1.91.0`. CHANGELOG has `## 1.91.y` theme + `[1.91.0] - 2026-06-07 · #452` entry (tagline + Teknisk). Commits use `Refs #452` / `Part of #452`; no `Closes #452` anywhere — epic stays open. |
| database.types.ts regenerated | **PASS** | `best_n_count: number \| null` present in Row/Insert/Update for `leagues` (`lib/database.types.ts:1068,1090,1112`). |

## Active bug hunt

| Hunt | Result |
|------|--------|
| Stale `.netToPar` on cells | **Clean.** Only occurrence is the `metricOf` selector on score objects (`computeLeagueStandings.ts:36`). Cell field renamed to `toPar` throughout; CHANGELOG notes the rename. |
| Old flat `LeagueStandings` shape consumers in app/ | **Clean.** Only the Panel renders rows. Other `getLigaSnapshot` consumers (spill route, RoundStartClient, LigaRoundRow, LigaManagement) read league/rounds/participants, never `.standings.rows`. tsc + build green confirm no type-incompatible consumer remains. |
| best_n × missed_round_policy interaction | **Correct.** best_n branch ignores `missedRoundPolicy` and always penalty-fills; wizard forces `penalty` for best_n. |
| Exhaustiveness over standings_model / scoring | **Clean.** No switch/Record over `points`. `STANDINGS_LABEL` and `SCORING_LABEL` have `?? raw` fallbacks → graceful degradation, no crash even on an unexpected value. |

## Issues found

**Minor (non-blocking, spec-precision nit — not a code bug):**
The contract's Design prose (line 44) states *"Played ≥ N → penalties never selected."* This holds within any single round (penalty = worst-in-round + 1 ≥ any played score that round), but NOT across rounds: a missed-round penalty CAN beat a disastrous played round from a different round. Example — played {1,2,3,4,20}, missed round penalty 8, N=5 → lowest-5 = {1,2,3,4,8}=18, so the penalty (8) displaces the played 20. The **implemented behavior is the mathematically natural and fairer "best N of all candidates" interpretation** and is internally consistent; the over-stated guarantee is only in the contract's descriptive prose, not in any test assertion or user-facing copy. No fix required; flag only so it isn't mistaken for a regression later. Not covered by a test (the cross-round displacement case), which is acceptable per Tørny Type-A discipline (the N-selection, penalty-fill, and cap are each covered).

## Live-browser verification

NOT performed. The feature is admin-auth-gated and requires seeded league + flight + score fixtures to produce a non-empty standings table; a local Playwright/preview run is impractical without that fixture. UI correctness was verified via (a) code reading of `LeagueStandingsPanel` / `LeagueStandingsTable` / `page.tsx`, (b) the non-vacuous `LeagueStandingsPanel.test.tsx` render test (toggle flip + single-metric no-toggle), and (c) the passing production build. Live visual confirmation is left to the owner's prod testing.
