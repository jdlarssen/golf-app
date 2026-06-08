# Forge-evaluering: Solo / Modified Stableford «Hull for hull» + H2H (epic #496, PR 9)

## Verdict: ACCEPT

Independent, adversarial re-derivation of all 8 criteria against the actual code + command output. Every criterion PASSES on its own evidence. The high-risk shared-shell change (HeadToHeadResult tug-of-war bar) is a verified no-op for non-negative formats and correctly robust for negative ones. No regressions found. The epic-completeness claim is accurate.

---

## Gate results (run by evaluator)

| Gate | Result |
|------|--------|
| `npm run build` | **exit 0** — green. Full route table rendered, Proxy middleware present. |
| `npx tsc --noEmit` | **exit 0** — clean, no errors. |
| `npx vitest run` (6 target files) | **exit 0** — `Test Files 6 passed (6) / Tests 81 passed (81)`. |

Gate 3 (humanizer) run by evaluator on the 8 new UI strings + CHANGELOG tagline: clean. No anglicisms, no særskriving, no AI vocabulary. One single, brand-acceptable em-dash in the tagline; "hver for dere" / dere↔du switch is the established kompis-voice pattern matching the parallel 1.102 entry. No blocking issues.

---

## Per-criterion

### A1 — Scoring exposure — PASS
`computeSoloHoleRows` (stableford.ts:182-212) builds `perPlayer` with `gross: null` on unplayed (line 190: `?? null`) and `points` from the SAME `pointsFn` as ranking (line 193), so standard/modified can't diverge. `bestUserIds` is derived from `played = perPlayer.filter(c => c.gross !== null)` (line 197) then MAX points among played (line 200-201) — the spilt-0 vs uspilt-0 distinction is keyed on `gross !== null`, not `points !== 0`, exactly as required.
- **Tested on BOTH tables:** standard (stableford.test.ts:796-857, incl. the critical `'skiller spilt-0-poeng fra uspilt'` case: double-bogey 0pts SPILT → in bestUserIds, partner uspilt 0pts → excluded) AND modified/negative (modifiedStableford.test.ts:241-267: birdie +2 vs bogey −1 → bestUserIds=[u1]; double −3 vs par 0 → bestUserIds=[u2]; negative points exposed).
- **Team variant + existing solo `players` untouched:** types.ts:787-791 `StablefordTeamResult` unchanged; `StablefordSoloResult` gains only the additive `holes` field (types.ts:733-734). computeSolo still returns `players` identically; team test (`compute (team stableford...)`) passed.

### A2 — holes/page.tsx branch — PASS
Branch at page.tsx:205-215 narrows on `(mode_config.kind === 'stableford' || === 'modified_stableford') && team_size === 1` and sits BEFORE the generic `DrilldownBody` return (line 217). Team-stableford (team_size === 2) is not matched by this branch and falls through to `DrilldownBody` — verified. `SoloStablefordHolesBody` additionally narrows defensively on `result.kind === 'stableford' && result.variant === 'solo'` → `notFound()` otherwise (line 873). Render-test asserts `not.toContain('Lag')` (test:84).

### B1 — H2H at 2 players (highest wins) — PASS
In renderStableford SOLO path (page.tsx:1246+), AFTER the `result.variant === 'team'` return (1202-1243): gate is `result.players.length === 2 && !showSideTournament` (line 1251). `score: pl.totalPoints` (1262). NO `lowerWins` passed → default false → highest wins. `winnerUserId` = rank-1, tie when `a.rank === b.rank` (1275-1276). `strip` from per-hull `bestUserIds` → a/b/halved/unplayed (1266-1274). No `hangingNote`. A side-tournament-enabled 2-player game falls to the podium path (`showSideTournament = finished && side_tournament_enabled`, line 1192-1193; podium branch 1298-1323) — confirmed: H2H is suppressed, podium kept.

### C1 — Shared buildStablefordContext — PASS
`buildStablefordContext.ts` owns all three: game_mode passthrough (narrowed `gameMode`, line 73), team-variant teamNumber (`isTeamVariant` → team_size===2 sends `team_number`, else `null`, line 62-65, 81), and WD-filtering of BOTH players (line 78: `withdrawn_at == null`) and scores (line 98-99: `!withdrawnIds.has`). Used by BOTH renderStableford (page.tsx:1161, solo AND team flow through it) and SoloStablefordHolesBody (holes/page.tsx:861). The OLD inline ctx in renderStableford (isTeamVariant, withdrawnIds set, player/score filter, game_mode) is fully REMOVED — confirmed via `git diff` (removed `-` lines). The retained `stablefordWithdrawn` array (1152-1157) feeds only the display `WithdrawnPlayersSection`, not ctx-building — clean separation. Team teamNumber preserved (team test green).

### C2 — Design requirements — PASS
SoloStablefordHolesView.tsx: `isRevealHidden = scoreVisibility === 'reveal' && gameStatus !== 'finished'` (60-61) with dedicated reveal-hidden block (63-81). `tabular-nums` throughout (95, 196, 241, 309, 351, 354, 391). 44px back link `h-11 w-11` (141). Negative points via `formatPoints` using **U+2212** (verified byte-level: line 40 is the MINUS SIGN char, not hyphen) at 205/310/405. Champagne only for unique winner: `uniqueWinnerId = bestUserIds.length === 1 ? bestUserIds[0] : null` (333-334); halved (>1) is neutral → champagne avoided on halved holes. Reuses Card/Kicker/AppShell/LeaderboardBackdrop/formatRevealName/ScoreShape (imports 2-11).

### C3 — Tests + the shared-shell deviation — PASS
ONE Type C render-test (SoloStablefordHolesView.test.tsx) asserting structure (`not.toContain('Lag')`), champagne (★ + border-accent for unique winner; none for halved card 2), negative point (`−3` U+2212 on card 11). Explicitly does NOT re-assert Type A ranking numbers (comment 73-76). New `e2e/games/solo-stableford.spec.ts` = 3 auth-gate tests, URL-assertion only (no Norwegian copy) — Type D compliant. The contract-declared deviation (HeadToHeadResult bar changed despite "unchanged" plan) is honestly documented and locked with a negative-score `it`.

### C4 — No regression (HIGH-RISK shared shell) — PASS
`git diff` of HeadToHeadResult.tsx shows the ONLY change is the `lo`-baseline shift (lines 115-124). Independently verified:
- **(a) Non-negative byte-identical:** for scores ≥ 0, `lo = Math.min(a,b,0) = 0`, so `aShift = a`, `totalShift = a+b`, `rawPctA = round(a/(a+b)*100)` — identical to the removed `Math.round(sideA.score/total*100)`. The `total===0→50` edge maps to `totalShift===0→50`. NO visual change for Skins/BBB/Nassau/strokeplay.
- **(b) Existing tests pass:** HeadToHeadResult.test.tsx green — 5–3 higher-wins (verdict "5–3"), 78–85 lowerWins (verdict "78–85"), tie ("Uavgjort 3–3").
- **(c) Negative case:** a=2,b=−3 → `lo=−3`, aShift=5, bShift=0, totalShift=5, pctA=100, pctB=0. No negative widths; winner gets bigger share. Test 4 asserts exactly this.
- DrilldownBody/HoleRow/HoleTable/DrilldownView function bodies untouched (only a new comment line above the new branch). Team-stableford + side-tournament flow unchanged. Build green.

### D1 — Version + CHANGELOG + epic claim — PASS
`package.json` version = `1.103.0` (MINOR from 1.102.0). CHANGELOG: open `## 1.103.y — Stableford · hull for hull`; 1.102.y collapsed under "Tidligere versjoner" `<details>`. **Epic «fullført» claim accurate:** holes/page.tsx now has dedicated branches for all 8 `isSoloFormat` modes (skins, wolf, nines, round_robin, acey_deucey, bingo_bango_bongo, nassau, solo_strokeplay) + stableford/modified (team_size 1) — every solo format has its format-aware "Hull for hull". Tagline correctly states "alle spillemodi nå riktig «Hull for hull»".

---

## Issues (ranked by severity)

**None blocking.**

### Low / informational
1. **Test-fixture label is English ("Modified Stableford").** In HeadToHeadResult.test.tsx:122 the test fixture passes `formatLabel: 'Modified Stableford'`. This is a TEST fixture string only — the PRODUCTION call-sites correctly use the Norwegian **"Modifisert Stableford"** (page.tsx:1284 and holes/page.tsx:897). Zero user impact; the English string never reaches a user. Worth a one-word tidy if touched again, but not a defect.

2. **`StablefordSoloHoleRow.par` uses `hole.par` (par_mens), not per-gender par.** computeSoloHoleRows (stableford.ts:205) sets the display par from `hole.par`, while the per-player `points` correctly resolve per-gender via `parFor(hole, p.teeGender)` (line 193). For a mixed-gender solo stableford on a per-gender-override hole, the card's "Par N" header shows the mens par while each player's points are computed against their own par. This mirrors the existing team-stableford behavior (computeTeam uses `parFor(hole, members[0].teeGender)` as a single representative par too) and the solo-strokeplay PR 8 pattern, so it's consistent with the codebase — not a new regression. Solo stableford with mixed tee-genders is a rare combination; flag only as a known display nuance, not an action item for this PR.

Both items are sub-threshold for the test-discipline "substantielle funn → issue" bar (one is a test-only string, the other is pre-existing consistent behavior). No new GitHub issues warranted.
