# Evaluation: #682 leaderboard god-file refactor

**VERDICT: ACCEPT**

Independent, skeptical re-verification of the strictly behavior-preserving refactor that breaks
`app/[locale]/games/[id]/leaderboard/page.tsx` (3902 → 866 lines) into per-format modules under
`formats/`, plus `leaderboardTypes.ts`, `leaderboardContext.ts`, and `sideTournament.tsx`.

- **Baseline (original):** `87c96c86:app/[locale]/games/[id]/leaderboard/page.tsx` (3902 lines).
  Confirmed: `be5a9ae0` (parent of the first refactor commit `ee5ed69c`) is a docs-only commit
  (the contract), so `87c96c86:page.tsx` is the true pre-refactor source.
- **HEAD:** `4477e9c0`.

## Criteria table

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | All 15 format + 2 state render fns extracted | **PASS** | `grep -cE "^async function render" page.tsx` → `0`; `grep -nE "async function render" page.tsx` → NONE; `ls formats/` → 16 files. All 17 fns defined in modules and imported by page.tsx (lines 48–63). The 3 side-tournament fns (computeSideTournament/renderSideTournamentTabs/renderMatchplaySideSection) live in `sideTournament.tsx`. |
| 2 | page.tsx < ~900 lines | **PASS** | `wc -l page.tsx` → **866** (orig 3902). |
| 3 | game_side_winners deduped to ONE helper | **PASS** | `grep -rn "from('game_side_winners')" … \| grep -v test` → exactly ONE site: `leaderboardContext.ts:33` inside `fetchSideWinners`. Both call-sites use it: `page.tsx:687` (best-ball finish path) and `sideTournament.tsx:49` (computeSideTournament). |
| 4 | NEAR-VERBATIM (no semantic rewrite) | **PASS** | Brace-counted extraction + diff of all 20 functions (17 render + computeSideTournament/renderSideTournamentTabs/renderMatchplaySideSection) **plus** rankAccent/TeamCard/ModeToggle. Every changed line is one of the 3 sanctioned categories — see "Near-verbatim findings" below. ZERO unsanctioned differences. |
| 5 | `npm run build` passes | **PASS** | `BUILD_EXIT=0`; log shows `✓ Compiled successfully in 3.9s` and full prerender completed. |
| 6 | All leaderboard tests green | **PASS** | `npx vitest run "app/[locale]/games/[id]/leaderboard"` → `Test Files 37 passed (37)` / `Tests 186 passed (186)` / `VITEST_EXIT=0`. Matches original count (37 files / 186 tests). NO test file added/changed/deleted (`git diff --name-status 87c96c86..HEAD` over the dir shows no `.test.` entries). |
| 7 | No realtime / View / Podium change | **PASS** | `git diff --name-only 87c96c86..HEAD -- leaderboard/ \| grep -E "View\|Podium\|Realtime"` → none. The only realtime diff is `PreRoundLeaderboardRealtime` *moving* with renderState3/35 into `state3.tsx` (import path `./` → `../`, 2 mounts removed from page.tsx + 2 added in state3.tsx — balanced relocation, no mount added/removed). |
| G1 | `npx tsc --noEmit` exit 0 | **PASS** | `TSC_EXIT=0`, no output. |
| G2 | eslint introduces no NEW errors on touched files | **PASS** | `npx eslint page.tsx formats/ sideTournament.tsx leaderboardContext.ts leaderboardTypes.ts` → `ESLINT_EXIT=0`, no output. Touched files are lint-clean. |

## Raw gate output

```
BUILD_EXIT=0
✓ Compiled successfully in 3.9s

 Test Files  37 passed (37)
      Tests  186 passed (186)
   Duration  7.50s
VITEST_EXIT=0

TSC_EXIT=0   (no output)
ESLINT_EXIT=0 (no output)
```

## Near-verbatim findings

Extracted each function from the ORIGINAL (`87c96c86:page.tsx`) and from its new module via a
brace-counting extractor, then diffed. The complete, deduplicated ledger of EVERY changed line
across all 20 functions:

- **20× `async function X` → `export async function X`** — the sanctioned `export ` prefix (one
  per function).
- **7× `React.ReactNode` → `ReactNode`** — sanctioned type-only swap (5 `let mainContent:` locals
  in stableford/soloStrokeplay/nassau/skins/bingoBangoBongo; 1 `mainContent:` field in
  renderSideTournamentTabs; 1 `Promise<React.ReactNode>` return in renderMatchplaySideSection).
- **9 lines removed + 1 added in `computeSideTournament` only** — sanctioned `game_side_winners`
  inline fetch → `fetchSideWinners(supabase, gameId)`. The removed block is byte-identical to the
  new `fetchSideWinners` body (same `.select('category, position, winner_user_id')`, `.eq`,
  `.order('category')`, `.order('position')`, `.returns<SideWinnerRow[]>()`, error-throw, `?? []`),
  and the resulting `sideWinnerRows: SideWinnerRow[]` variable + downstream usage are unchanged.

Functions diffed and confirmed byte-identical apart from the above: renderStableford, renderMatchplay,
renderFourballMatchplay, renderFoursomesMatchplay, renderSoloStrokeplay, renderTexasScramble, renderWolf,
renderNassau, renderSkins, renderBingoBangoBongo, renderNines, renderRoundRobin, renderAceyDeucey,
renderShamble, renderPatsome, renderState3, renderState35, computeSideTournament, renderSideTournamentTabs,
renderMatchplaySideSection, **rankAccent (RAW-IDENTICAL), TeamCard (empty diff), ModeToggle (empty diff)**.

No JSX, conditional, prop, string-literal, or class change was found in any body.

## Additional checks (contract-adjacent)

- **Dispatcher branch order unchanged:** extracted all top-level `LeaderboardBody` guards from both
  files. Full guard text + order is IDENTICAL: `isStablefordFamily` → `singles_matchplay` →
  `fourball_matchplay` → `isAlternateShotMatchplay` → `solo_strokeplay` → `isScrambleFamily` →
  `wolf` → `nassau` → `skins` → `bingo_bango_bongo` → `nines` → `round_robin` → `acey_deucey` →
  `shamble` → `patsome`, then state-machine (`state === 'live-always'` / `reveal-active`,
  `view === 'state3'` / `state3.5` / `reveal-active`). `diff` of the guard sequence = empty.
- **No circular imports:** no module imports `./page` or `../page`. Topology is a DAG:
  leaderboardTypes (leaf) ← leaderboardContext (types only) ← sideTournament ← formats/* ← page.tsx.
  `sideTournament` does not import `formats/`.
- **`getLeaderboardContext` defined once:** sole `export const getLeaderboardContext = cache(...)`
  at `leaderboardContext.ts:11`; imported-by-reference in page.tsx + sideTournament + the matchplay
  modules. Request-scoped `cache()` dedup preserved (single module instance).
- **`teamGrouping` literals preserved per format** (byTeamNumber for team-stableford / texasScramble /
  shamble / patsome; solo elsewhere) — matches the verbatim bodies.
- **Matchplay tournament-label fetch:** left inline in each matchplay module (discretionary dedup
  NOT taken — explicitly allowed by the contract; bodies remain byte-identical, no behavior change).

## Issues

None. The refactor is a clean, behavior-preserving structural extraction. The only logic delta is
the contract-sanctioned `game_side_winners` fetch dedup, verified byte-identical to the original
queries.
