# Evaluation: Round Robin (issue #280)

**Verdict: ACCEPT**

Evaluated independently against `.forge/contracts/280-round-robin.md` on branch
`claude/sleepy-herschel-faafd5` (commits `aa3f862`, `36391e4`, `f991ad2`,
`1596874`, `afe8eb8` over base `06bb1f5`). All four gates green, scoring logic is
correct on independent re-derivation, every exhaustive `Record<GameMode>`/switch
site has a `round_robin` entry, and all 11 buildable success criteria pass
(the 12th — applying the migration — is deliberately deferred to merge-time per
the contract). No blockers.

---

## Gates

| Gate | Result | Notes |
|---|---|---|
| `npx tsc --noEmit` | **PASS** | 0 non-test errors. The only errors are pre-existing in `*.test.ts` files (`app/admin/games/[id]/signups/actions.test.ts`, `app/games/[id]/withdrawActions.test.ts`, `app/signup/[shortId]/actions.test.ts`, `app/signup/[shortId]/teamActions.test.ts`) — all unchanged since base `06bb1f5` (verified via `git diff`), none touch round_robin. Contract explicitly accepts pre-existing test-file errors. |
| `npx vitest run` | **PASS** | 2006 passed, 171 files. |
| `npm run lint` | **PASS** | 0 errors, 14 warnings — all pre-existing `_gameId`/`_gameStatus` unused-var patterns shared across every leaderboard View; `RoundRobinView.tsx:86` (`_gameId`) follows the identical established convention. |
| `npm run build` | **PASS** | Full route manifest printed, exit 0. This is the Vercel gate that catches missing exhaustive `Record<GameMode>` entries — it passing confirms all compile-enforced maps are complete. |

Direct sub-runs: `roundRobin.test.ts` 45 passed; `gamePayload.test.ts` 162
passed (incl. 16 round_robin validator cases); 4 RR component test files 7 passed.

---

## Criterion-by-criterion

1. **Scoring module reuses fourball helpers** — **PASS.** `lib/scoring/modes/roundRobin.ts:282` `compute()` imports and uses `applyAllowance` (`courseHandicap.ts:13`), `strokesForHole` (`strokeAllocation.ts:5`), `bestBallForHole` (`bestBall.ts:17`), `classifyMatchplayHole` (`singlesMatchplay.ts:125`), `parFor`. The allowance→strokes→net pipeline (`roundRobin.ts:306-309, 348-362`) is byte-for-byte the same shape as `fourballMatchplay.ts:148-150`. The match *outcome* genuinely routes through `bestBallForHole`→`classifyMatchplayHole` (not a reimplementation).

2. **Type A unit tests** — **PASS.** `roundRobin.test.ts` has 45 real-assertion tests: emptyShell (≠4, dup slots, 0 players), segment pairing per hole, partner/opponent rotation, hole-wins counting (delt=0), full 18-hole mixed round, allowance 0 vs 85, unplayed/pending, ranking + tiebreak. Spot-checked (see Scoring correctness below) — assertions are computed-value-correct, not tautological.

3. **index.ts case + type re-export; tsc green** — **PASS.** `index.ts:61` `case 'round_robin': return roundRobin.compute(ctx);`; all 5 RR types re-exported (`index.ts:132-136`). tsc green.

4. **types.ts has RR types + extended unions/MODE_LABELS** — **PASS.** `GameMode` `| 'round_robin'` (`types.ts:18`), `MODE_LABELS.round_robin` (`:39`), `GameModeConfig` round_robin variant (`:191`), `ModeResult` includes `RoundRobinResult` (`:1383`), all RR interfaces present (`:1238-1342`).

5. **validateRoundRobin wired + tests** — **PASS.** `gamePayload.ts:1221` `validateRoundRobin`, wired in `parseGameMode` (`:244`) + `modeValidators` (`:1324`). 16 validator tests assert every error code: `min_players_for_mode` (3 players), `too_many_players_for_mode` (5), `team_balance` (4 with dup slot), `bad_team` (slot 5), `bad_allowance` (101/-1/empty), `duplicate_player`, allowance 0/100 ok, draft tolerance, flight=team. mode_config output `{kind, team_size:1, teams_count:4, allowance_pct}` asserted exactly.

6. **Wizard shows RR under Kompis, requires 4, allowance field; ENABLED_COMBOS/MODE_SUMMARY_LABELS/MODE_GUIDE/ICON_MAP entries** — **PASS.** `RoundRobinSetup.tsx` rendered in `GameWizard.tsx:459` (generic `TeamSizeSelector` excluded via `!state.isRoundRobin` at `:426`); `AllowanceField` `round_robin_allowance_pct` default 85 (`:493`); hidden submit field (`:710`). `useGameFormState.ts`: `isRoundRobin` (`:441`), `roundRobinAllowancePct`=85 (`:250`), `roundRobinPlayersValid` = exactly 4 (`:864`), canPublish enforces 4 (`:1049-1060`). `ENABLED_COMBOS.round_robin = Set([1])` (`TeamSizeSelector.tsx:84`), `MODE_SUMMARY_LABELS.round_robin` (`ReadyStep.tsx:59`), `MODE_GUIDE.round_robin` (`modeGuide.ts:133`), `ICON_MAP.round_robin = RoundRobinIcon` (`icons.tsx:242`). Live wizard visibility correctly deferred to migration (see note).

7. **Scorecard badge via shared helper (Type C)** — **PASS.** `RoundRobinBadge.tsx` calls `roundRobinConstellationForHole()` (the shared pure helper in `roundRobin.ts:133`), NOT duplicated rotation logic. Wired into `HoleClient.tsx:743` (`isRoundRobin && roundRobinPlayers`), data built in `page.tsx:498`. 1 Type C render test, multi-rerender, explicitly cites test-discipline.

8. **RoundRobinView + Podium render tests** — **PASS.** `RoundRobinView.tsx` shows per-player ranking (totalHoleWins, tabular-nums, champagne on leader) + segment summary (3 constellations w/ partner + W–L). `RoundRobinPodium.tsx` shows 1/2/3 with gold only on rank-1. Both narrow on `kind === 'round_robin'` at the call-site (`page.tsx:2458`). View: 3 tests (render / reveal-hidden / reveal-finished — distinct behaviors). Podium: 1 test. Fixtures use `holes: []` and arbitrary totals — no Type A scoring re-assertion.

9. **renderRoundRobin routing** — **PASS.** `page.tsx:449` routes round_robin → `renderRoundRobin` (`:2404`); builds ScoringContext (incl. `parByGender` for #240), `computeModeResult` (alias of `computeLeaderboard` → the exhaustive index switch), narrows kind, `finished`→Podium+chromeless View (`:2477`), active/scheduled→View alone (`:2501`).

10. **Migration 0054** — **PASS (file correct; apply deferred).** `0054_round_robin.sql`: `formats` row slug='round_robin', display_name='Round Robin', icon_key='round_robin', scoring_module='@/lib/scoring/modes/roundRobin', is_active=true, is_cup_eligible=false; intent_mapping 'kompis'/is_visible=true/is_primary=false/**sort_order=100**. Verified 100 is the next free kompis slot (existing: 10,20,30,40,50,60,70,80,90 — no collision). Contract's section-7 example said 80, but 80 is taken by modified_stableford; the criterion + "Claude's Discretion" both said to confirm against existing rows. Correct, documented deviation.

11. **Norsk copy via humanizer** — **PASS.** Ran `humanizer:humanizer` on all 7 string groups. Copy reads as natural, human Norwegian; `hullseire`/`besteball` are the app's consistent house spellings. `afe8eb8` genuinely fixed the changelog em-dash chain (old: double em-dash parenthetical; new: colon list + separate sentence — verified in diff). One single em-dash remains in the setup-card string, which is within the humanizer's own "minimization not abolition" guidance. See non-blocker #2.

12. **CHANGELOG + minor bump 1.49.0→1.50.0** — **PASS.** `package.json` version=1.50.0; `CHANGELOG.md:24` `[1.50.0] - 2026-05-30` with three-layer format (action-oriented tagline + Teknisk details).

---

## Scoring correctness (independent reasoning)

**Rotation table** (`roundRobin.ts:65-76`), independently derived:
- Seg1 [1,2] vs [3,4]; Seg2 [1,3] vs [2,4]; Seg3 [1,4] vs [2,3].
- Partner pairs across segments: (1,2),(3,4),(1,3),(2,4),(1,4),(2,3) = all 6 unordered pairs, **each exactly once** → every player partners each other exactly once. ✓
- Player 1 opposes: seg1→{3,4}, seg2→{2,4}, seg3→{2,3} → opposes 2 twice, 3 twice, 4 twice. By symmetry holds for all → **each player opposes each other exactly twice**. ✓

This matches the issue's pairings exactly. `segmentForHole = floor((h-1)/6)+1` correctly maps 1–6→1, 7–12→2, 13–18→3.

**Hole-wins model** (`roundRobin.ts:391-396, 404-424`): `side1_wins` → +1 to each side-1 player; `side2_wins` → +1 to each side-2 player; `tied`/`unplayed` → 0 to everyone (tied also increments `totalHolesHalved`, unplayed increments nothing). Matches the canonical "+1 to each golfer on winning side, halved=0" rule from the contract's research. Asserted in `roundRobin.test.ts:250-299`.

**Worked mini-example** (the full-round test, `roundRobin.test.ts:324-388`, allowance 0 so net=gross), re-derived from scratch:
- Seg1 h1-3: A=3,B=5 vs C=5,D=5 → side1 best 3, side2 best 5 → A,B win ×3. h4-6 all 4 → tied.
- Seg2 h7-8: A=5,C=3 vs B=5,D=5 → side1(A+C) best 3 → A,C win ×2. h9-12 tied.
- Seg3 h13-15: A=5,D=5 vs B=3,C=5 → side2(B+C) best 3 → B,C win ×3. h16-18 tied.
- Totals: **A=5, B=6, C=5, D=0.** Test asserts exactly (5,6,5,0). ✓ Non-tautological — the test reasons through rotation + best-ball + hole-wins correctly.

**Unplayed edge case** (`roundRobin.ts:380` via `classifyMatchplayHole`/`bestBallForHole`): `bestBallForHole` returns `teamNet: null` only when BOTH players on a side have null gross; one partner with a gross gives the side a best. So a hole is `unplayed` only when an entire side is missing — matching the "best-ball tradition" guardrail. Asserted at `roundRobin.test.ts:286-317`.

**Ranking** (`roundRobin.ts:220-276`): totalHoleWins DESC → totalHolesLost ASC → teamNumber ASC; `tiedWith` lists players with identical (wins, losses); shared rank = first tied index + 1. Tie cases asserted at `:609, :661, :672`.

---

## Issues found

1. **[NON-BLOCKER] Duplicated (but correct) rotation table in `RoundRobinSetup.tsx`.** `app/admin/games/new/sections/RoundRobinSetup.tsx:24` hardcodes `PARTNER_BY_SLOT` for the static display card instead of reusing the shared `roundRobinConstellationForHole()` helper (which the badge correctly uses). I re-derived all four rows — they are correct. Risk is low (static display copy, no per-hole input), but if the 6-6-6 segmentation ever changes, this table won't track automatically. Optional future cleanup.

2. **[NON-BLOCKER] One single em-dash in the setup-card string.** `RoundRobinSetup.tsx:61` "Partnere roterer hvert 6. hull — du spiller med og mot alle de andre." A single, well-placed em-dash is within the humanizer's "minimization not abolition" guidance, so this is a nit, not a violation. Could be split into two sentences for full consistency with the team's copy-style preference.

3. **[NON-BLOCKER] `RoundRobinView` has 3 render tests vs the "max one Type C per component" guideline.** `RoundRobinView.test.tsx` has render / reveal-hidden-midround / reveal-finished. These cover three *distinct rendering behaviors* (the reveal-gating branch is real logic, also tested in sibling Views), not three assertions of the same thing, and none re-assert Type A scoring numbers. Not egregious; consistent with how other reveal-gated Views are tested.

4. **[NON-BLOCKER] gameFinished email falls back to neutral best-ball copy for round_robin** (`lib/mail/gameFinishedRecipients.ts:124`, `if (!isStablefordFamily(...))`). This is the same documented fallback wolf/nassau/skins/bbb use — the result email won't have RR-specific copy. Consistent with all other kompis modes; out of scope per the contract ("Achievements/bragging-stats utover segment-sammendraget" is Out of Scope).

No blockers.

---

## Key Decisions — honored?

- **Hull-seire delt = 0** ✓ (`roundRobin.ts:396`, tested).
- **allowance_pct 85 default** ✓ (validator `:1301`, scoring `:192`, wizard `:250`).
- **No new table** ✓ (migration is seed-only; rotation is a pure function).
- **Eget format reusing fourball engine** ✓ (own `game_mode`, `compute()` wraps fourball helpers).
- **Per-player ranking + segment summary** ✓ (`RoundRobinView` + `RoundRobinPlayerLine.segments`).
- **Slot assignment cosmetic / selection-order, no forced shuffle** ✓ (`useGameFormState.ts:689-693, 727-731`; no shuffle button, documented).
- **View + Podium (not combined)** ✓.
- **camelCase filename `roundRobin.ts`, DB slug `round_robin`** ✓.

---

## Note on live-UI / Playwright

The wizard reads its format list from the Supabase `formats` table via
`getFormatsForIntent`. Migration `0054_round_robin.sql` is intentionally NOT yet
applied (applied at merge-time to avoid prod-code/DB mismatch), so Round Robin
will not appear in the live wizard right now. This is by design and is NOT
treated as a failure. round_robin is not hardcoded-excluded anywhere in the
wizard — it will surface the moment 0054 runs. UI verified via code inspection
+ render tests instead, all green.
