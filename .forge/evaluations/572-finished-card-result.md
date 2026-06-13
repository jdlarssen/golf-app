# Evaluation: #572 — Vis spillerens eget resultat på avsluttede spill-kort

## Verdict: **ACCEPT**

All 6 success criteria pass independently. All gates green (tsc clean, eslint clean, 26/26 targeted tests, no regressions across lib/scoring 854, lib/games+messages+components/games 542). The per-mode field-extraction — the highest-risk part — is correct for all 16 ModeResult kinds, verified against the actual type definitions. Persist is genuinely best-effort and can never block a game finish. Read path roots at the viewer's own `game_players` row (no data leak). i18n keys parity-matched in both catalogs with valid ICU (verified by compiling every message). Tightly scoped to the contract — no scope creep.

---

## Gate results (actual output)

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | **PASS** — exit 0, no errors |
| `npx eslint <9 changed files>` | **PASS** — exit 0, no output |
| `npx vitest run` (4 targeted files) | **PASS** — 4 files, 26 tests passed |
| `npx vitest run lib/scoring` | **PASS** — 36 files, 854 tests passed (no regression) |
| `npx vitest run lib/games messages components/games` | **PASS** — 27 files, 542 tests passed |

---

## Per-criterion

### 1. `computeResultSummaries` pure helper + Type A tests — **PASS**
`lib/scoring/resultSummary.ts` is pure (no I/O), exhaustive switch with `assertNever`. `resultSummary.test.ts` has 10 cases covering placement-solo, placement-team(best_ball), texas (`members[].userId`), shamble (`members` string[]), matchplay win/loss, AS-tie, `result=null`→skip, fourball both-players, skins, points-modes. Green. (Nit: uses `it`-style not `it.each` as the contract literally said — substance is equivalent.)

### 2. Migration + database.types — **PASS**
`0096_game_players_result_summary.sql` adds nullable `result_summary jsonb` with `if not exists` (idempotent) + a column comment. `lib/database.types.ts:437/454/471` has the field in Row/Insert/Update as `Json | null`. tsc green. (Prod-apply verified by orchestrator via MCP per contract evidence.)

### 3. Both end-game actions call persist after status flip — **PASS**
- `actions.ts` `endGame`: games.update→finished at L422, error-redirect at L425 (before persist), `persistResultSummaries(...)` at L429. Game select (L362 area) includes `course_id, game_mode, mode_config`.
- `avslutt/actions.ts` `endGameWithSideWinners`: games.update→finished at L179, error-redirect at L181, persist at L185. Game select includes the same fields.

### 4. FinishedGameCard renders mode-natural result + 🏆 fallback — **PASS**
`FinishedGameCard.tsx`: `text-accent` (gold) when `badge.isWin`, `text-muted` otherwise, 🏆 only when `result_summary == null`. `finishedResultBadge.ts` maps all 3 kinds correctly. `FinishedGameCard.test.tsx` (3) + `finishedResultBadge.test.ts` (10, incl. the `skins===0` edge) green. Both consumers (`app/[locale]/page.tsx`, `app/[locale]/spill-arkiv/page.tsx`) feed rows from `getFinishedGamesForUser`, so the field is populated end-to-end.

### 5. i18n keys in both catalogs, catalogParity green — **PASS**
`finishedCard.result.*` present and key-identical in `no.json` and `en.json`. catalogParity green. **Eyeballed + compiled every ICU message** via `intl-messageformat`: English `selectordinal` (one→st/two→nd/few→rd/other→th) and `plural` both render correctly ("2nd of 4", "Team finished 3rd of 4", "1 skin"/"4 skins"); Norwegian "{rank}. plass av {fieldSize}" correct. Badge `values` ({rank,fieldSize}/{margin}/{count}) match the placeholders.

### 6. Backfill correctness for the 6 prod modes — **PASS** (computation verified; prod 0-nulls verified by orchestrator)
Verified the computation that produced the backfilled values is correct:
- **best_ball** → team placement via `BestBallTeamLine.playerIds` ✓
- **stableford** (solo) → `emitPlacements`; uses `buildStablefordContext` — the SAME builder `renderStableford` uses on the leaderboard (page.tsx:1147) ✓
- **modified_stableford** → routes through stableford context, returns `kind:'stableford'` ✓
- **skins** → `totalSkins`/`rank`/`fieldSize` from `SkinsPlayerLine`; `buildSkinsContext` ✓
- **singles_matchplay** → `emitMatchplay` reads `sides[].userId` + `result.{winner,formatted}` (shape matches `MatchplayMatchResult`) ✓
- **bingo_bango_bongo** → `emitPlacements` from `players[].rank`; `buildBingoBangoBongoContext` with per-hole rows fetched directly ✓

`buildModeResultForGame` dispatch is exhaustive (`assertNever` on GameMode). Uniform-context branch matches the leaderboard render functions' inline mapping (`teamNumber: p.team_number ?? 0`, `flightNumber: null`, gross passthrough). `backfillResultSummaries.ts` uses the canonical `persistResultSummaries` (same compute as endGame), idempotent UPDATE.

---

## Correctness deep-dive: per-mode field extraction (all 16 kinds)

Checked each switch arm in `resultSummary.ts` against the type in `modes/types.ts`:

| ModeResult kind | Extraction | Source type | OK |
|---|---|---|---|
| stableford solo | `players[].{userId,rank}` | StablefordPlayerLine | ✓ |
| stableford team | `teams[].{rank,playerIds}` | StablefordTeamLine.playerIds | ✓ |
| solo_strokeplay/wolf/nassau/bbb/nines/round_robin/acey_deucey | `players[].{userId,rank}` | each has both | ✓ |
| best_ball | `teams[].{rank,playerIds}` | BestBallTeamLine.playerIds | ✓ |
| texas_scramble | `teams[].members.map(m=>m.userId)` | members: TexasScramblePlayerCell[] | ✓ |
| shamble | `teams[].members` | members: string[] | ✓ |
| patsome | `teams[].playerIds` | PatsomeTeamLine.playerIds | ✓ |
| singles_matchplay | `result`, `sides[0/1].userId` | SinglesMatchplayResult | ✓ |
| fourball/foursomes_matchplay | `result`, `sides[].players[].userId` | Fourball/FoursomesSide.players | ✓ |
| skins | `players[].{userId,totalSkins,rank}` | SkinsPlayerLine | ✓ |

Matchplay family: `greensome`/`chapman`/`gruesome` all return `kind:'foursomes_matchplay'` from scoring (confirmed in type JSDoc), so the `foursomes_matchplay` arm covers them. `result===null` (undecided) → no entries → 🏆 fallback. AS → `outcome:'tie', margin:null`. All correct, all matching the contract edge-cases.

---

## Issues found

**None blocking.**

Non-blocking / nits:
1. **(nit) Deliberate spec deviation — skins gold gate.** `finishedResultBadge` gates gold on `rank===1 && skins > 0` (contract said just `skins.rank===1`). This is the right call ("🥇 0 skins" is nonsense) and is explicitly tested. Documented as an intentional refinement.
2. **(nit) Benign divergence in uniform-context WD filtering.** `buildUniformContext` filters `withdrawn_at == null` from players AND removes withdrawn scores; the leaderboard's matchplay/scramble/shamble render functions do NOT (they only filter `users != null`). This only matters if a withdrawn player existed in those modes — but `supportsWithdrawal()` is `false` for all of them, so `withdrawn_at` is always null in practice. No observable difference; the extra filter is a safe no-op. Not worth a fix.
3. **(nit) No dedicated test for `buildModeResultFromData`.** Not required by the contract (which scoped the test to the pure `computeResultSummaries`). Its correctness rides on reusing the leaderboard's own (tested) `build*Context` helpers.

## Security / RLS
- `getFinishedGamesForUser` roots the query at `game_players` filtered `eq('user_id', userId)`, so `result_summary` is read from the **viewer's own row** — no leak of other players' outcomes. Uses the RLS-respecting cookie client. ✓
- Writes use the service-role admin client (intended RLS-bypass to write all players' rows). ✓
- No new RLS policy needed (column lives on an already-readable row). ✓

## Copy quality
Norwegian strings ("🥇 Du vant", "{rank}. plass av {fieldSize}", "Laget ble nr {rank} av {fieldSize}", "Du vant {margin}", "Du tapte {margin}", "Uavgjort", skins-pluralis) are idiomatic, action-oriented bokmål in the sporty brand voice. No AI-tells, no em-dash chains, no "vennligst", no "X-spillet" redundancy. Clean.

## Scope
Diff (20 files, +1485/−15) maps 1:1 to the contract's "Files Likely Touched". No unrelated changes, no gold-plating. Version bumped 1.119→**1.120.0** (MINOR, correct for new user-visible feature) with a proper three-layer CHANGELOG entry.
