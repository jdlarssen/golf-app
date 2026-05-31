# Evaluation: Gruesome matchplay (#291)

2026-05-31

## Verdict: ACCEPT

All 10 contract success criteria verified independently. The build is green, the full
test suite is 2273/2273, the scoring delegate uses the correct (sum) handicap strategy and
is proven distinct from chapman's 60/40 by an assertion-rich test, the family leaderboard
dispatch routes all four alternate-shot modes correctly without shadowing, the tee-starter
banner gate stays strict, and the migration is correctly written + not yet applied (per
post-deploy convention). Zero blockers.

Evidence was re-derived from source and live tooling — not taken from the implementer's
"criteria complete" commit (68a0fae). Where the contract's evidence notes disagreed with
reality (it claimed gruesome test was "5/5"; it is actually 11/11), reality was stronger,
not weaker.

## Per-criterion results

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | Scoring delegate uses `combinedSideHandicap` (not chapman), reads gruesome config, returns right kind; test proves sum ≠ 60/40 | PASS | `lib/scoring/modes/gruesomeMatchplay.ts:29,43` imports + calls `computeFoursomesCore(ctx, allowancePct, combinedSideHandicap)`; reads `mode_config.allowance_pct` when kind is `gruesome_matchplay`, else fallback 50 (lines 39-42). Returns `FoursomesMatchplayResult` (kind `foursomes_matchplay`). `gruesomeMatchplay.test.ts:91-111` asserts concrete handicap values: side1 sum=30, side2 sum=10, diff 20 × 50% = 10 strokes — and the test comment + structure explicitly contrasts this with chapman's 60/40 (which would give 14/5, diff 9). `npx vitest run lib/scoring/modes/gruesomeMatchplay` → 11/11 passed. |
| 2 | `validateGruesomeMatchplay` produces correct mode_config, default 50, rejects bad input; gruesome block exists + passes | PASS | `lib/games/gamePayload.ts:1375-1448` — validator emits `{kind:'gruesome_matchplay', team_size:2, teams_count:2, allowance_pct}`, enforces exactly 4 players (1403-1408), 2+2 balance (1414-1416), team 1/2 only (1395). `parseGruesomeAllowancePct` returns draft default 50, publish requires explicit value, range 0..100 enforced (1442-1447). `modeValidators` registers it (line 2156); `parseGameMode` lists it (line 253). 6 test cases at `gamePayload.test.ts:3575-3692` (publish ok allowance 50, allowance 0, allowance 101 reject, bad team, draft-default). `npx vitest run lib/games/gamePayload` → 219/219 passed. |
| 3 | `npm run build` green (exhaustive coverage) | PASS | `npm run build` → `BUILD_EXIT=0`, full route listing emitted, zero error/Type-error lines. This is the real gate that every `Record<GameMode>`/exhaustive switch covers `gruesome_matchplay`. |
| 4 | Family leaderboard: (a) all 4 modes via `isAlternateShotMatchplay`; (b) recomputes with actual game_mode; (c) view reads foursomes fields; (d) label from MODE_LABELS | PASS | (a) `lib/scoring/modes/types.ts:104-111` — `isAlternateShotMatchplay` = foursomes OR greensome OR chapman OR gruesome. Dispatch at `leaderboard/page.tsx:370` routes via it, placed AFTER specific `singles_matchplay` (337) and `fourball_matchplay` (353) branches → no shadowing. (b) `page.tsx:1758` passes `game_mode: game.game_mode` as-is (not hardcoded); `:1787` `computeModeResult(ctx)` recomputes; `:1788` guards kind. (c) `FoursomesMatchplayView.tsx` uses `FoursomesMatchplayResult` type, `side1Net`/`side2Net` (lines 506,509), side-level `effectiveExtraHandicap` (402,404) — NOT fourball `side1BestNet`/`contributorIds`/per-player `effectiveHandicap`. (d) `page.tsx:1833` `formatLabel={MODE_LABELS[game.game_mode]}`. `npx vitest run FoursomesMatchplayView` → 16/16 passed. |
| 5 | No regression for siblings (cup path is separate) | PASS | Cup uses `lib/cup/getCupSnapshot.ts` (gruesome has its own dedicated compute branch lines 423-440, siblings keep theirs) + `computeCupLeaderboard.ts` (gruesome in union, line 37). These are independent of the individual-game leaderboard view. Full suite `npx vitest run` → **2273 passed / 0 failed** (191 files), including all cup + foursomes/greensome/chapman tests. |
| 6 | Tee-starter banner NOT triggered by gruesome (strict `=== 'foursomes_matchplay'`); gruesome gets Layout B via family helper | PASS | `holes/[holeNumber]/page.tsx:109` `const isFoursomes = game.game_mode === 'foursomes_matchplay'`. Banner gate at `:577` `if (isFoursomes && me.team_number != null)` → strict, excludes gruesome. Layout B + sum-handicap path includes gruesome via `isGruesome` (line 112, used at 441 and 453); `isSixtyForty = isGreensome || isChapman` (line 457) correctly EXCLUDES gruesome → gruesome uses `combinedCH` (sum), matching foursomes. |
| 7 | Migration 0065: cup-eligible, intent kompis, `gruesome_allowance_pct` default 50, no tee-starter cols, no number collision, not auto-applied | PASS | `supabase/migrations/0065_gruesome_matchplay.sql:18-21` format-row `is_cup_eligible=true`; `:24-25` intent-mapping `kompis` is_visible=true is_primary=false; `:30-32` `tournaments.gruesome_allowance_pct smallint not null default 50 check (0..100)` — default 50 not 100; no tee-starter columns anywhere. `ls migrations` → highest is 0064; 0065 is free (0062 is a pre-existing gap, not a collision). Live `list_migrations` on project glofubopddkjhymcbaph → latest applied is `chapman_matchplay` (20260531063644); NO gruesome migration applied → correct post-deploy posture. |
| 8 | modeGuide explains rule; no AI-tells / shouty caps / em-dash chains; idiomatic Norwegian | PASS | `lib/formats/modeGuide.ts:133-141` — summary + 3 points clearly state: both tee off, opponent picks the ball (usually the worst), partner of the chosen ball's owner plays next, alternate from there, lowest score wins the hole, matchplay counts holes won. Ran `humanizer:humanizer` over the modeGuide entry + format short_description + CHANGELOG tagline: clean. No anglicisms beyond intentional golf vocabulary (foursomes/matchplay/alternate shot — consistent with established Tørny format-name precedent), no særskriving, no shouty caps, parentheses (not em-dash chains) for asides, correct V2 word order. `npx vitest run lib/formats/modeGuide` → 51/51 passed. |
| 9 | package.json 1.59.0; CHANGELOG 1.59.0 entry with 1.58.y series wrapped in `<details>`; nesting balanced at boundary | PASS | `package.json` → `"version": "1.59.0"`. `CHANGELOG.md:24` `### [1.59.0] - 2026-05-31` under a `## 1.59.y` series heading (line 20); 1.59.0 Teknisk block `<details>` (28) → `</details>` (57). 1.58.y series re-wrapped: outer `<details>`+`<summary>` (61-62) → inner 1.58.0 Teknisk `<details>` (70) → `</details>` (98) → `</details>` (100). The 1.58/1.59 boundary is balanced (verified by direct read AND running-balance returns cleanly to 0 through line ~100). See non-blocking note on a whole-file count artifact. |
| 10 | Anything promised-but-missing / risky / incorrect | PASS | No blocking issues found independently. Dispatch order is correct (family branch after the two narrower matchplay branches). Handicap math correct (gruesome=sum, excluded from 60/40). Cup snapshot has a dedicated gruesome branch. mail/scorecard/spillformer/icons/allowanceCopy all wired (per diff stat + grep). MODE_LABELS, GameModeConfig variant, GameMode union all present. The deliberately-untracked tee-choice twist is described in modeGuide as intended (not flagged — per evaluation scope). |

## Blockers

None. This is mergeable.

## Non-blocking observations

1. **CHANGELOG whole-file `<details>` count is +1 imbalanced, but PRE-EXISTING and outside this PR's diff.** A raw count over the entire file shows ~225 structural opens vs 226 closes (after stripping inline-code mentions). The running balance goes briefly negative at lines ~3932, 4040, 4378, 4397 — all in archived entries from many releases ago. `git diff 504c4f3..HEAD -- CHANGELOG.md` touches only two hunks (lines ~17-65 and ~55-103); it does not touch anything below line ~103. The region this PR added/modified (the 1.58/1.59 boundary) is correctly balanced. The residual imbalance is in old, untouched entries and is plausibly a `<details>` string appearing in descriptive prose that my heuristic couldn't fully isolate. Not introduced here; worth a separate cleanup pass if a strict markdown linter ever runs, but not a merge blocker.

2. **Minor diacritic typos in code comments (cosmetic, not user-facing).** Migration `0065:12` has "seeder ogsa" (should be "også"); `gameFinishedRecipients`/comment-level "speilar" nynorsk slip appears in unrelated solo-strokeplay comment. The migration is a `.sql` comment, never rendered to a user. No action needed.

3. **Contract evidence note understated the gruesome test count.** Contract success-criteria block (`291-gruesome-matchplay.md:264`) claims "gruesomeMatchplay.test.ts 5/5"; actual is 11 tests, all passing — including a 6-row parametrized `combinedSideHandicap` table and the sum-vs-60/40 differentiation case. Reality is stronger than the claim. No action.

## Static vs preview-confirmed

**Verified statically / by tests (high confidence):** criteria 1, 2, 3, 4, 5, 6, 7 (file + applied-migration state), 8, 9, 10. Scoring math, validator behavior, dispatch routing/order, build exhaustiveness, full suite, banner gating, migration contents, copy quality, and version/changelog are all confirmed without a browser.

**Can only be confirmed on Vercel preview (visual smoke):** the end-to-end create flow rendering the gruesome card in the DB-driven wizard grid requires the migration to be applied (post-deploy), so the wizard card + standalone 2v2 assignment + live leaderboard render are NOT verifiable until after merge→deploy→`apply_migration`. The code paths exist and compile; the visual confirmation is deferred to preview/prod per the project's DB-driven-grid + post-deploy-migration convention. These were never expected to pass pre-merge and are not blockers.
