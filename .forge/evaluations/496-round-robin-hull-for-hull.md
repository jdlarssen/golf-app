# Skeptical Evaluation — #496 PR 4: Round Robin «Hull for hull»

**Verdict:** ACCEPT — every Success Criterion verified against source; all gates green; the rotation differentiator is real and provably correct, not cosmetic. One trivial non-blocking nit (unused `within` import, copied from the Nines sibling).

## Gates (run in the worktree)

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | **Clean** — empty output, exit 0 |
| `npx vitest run "app/games/[id]/leaderboard"` | **172 passed** (28 files) |
| `npx vitest run` (full regression) | **2943 passed** (243 files) — matches contract's claim exactly |
| `npm run lint` | **0 errors, 25 warnings** — 24 pre-existing (`_gameId`/`Button`/`userId` in untouched files); **1 introduced**: `RoundRobinHolesView.test.tsx:2` unused `within` import |
| `npm run build` | **Success** — all routes compiled, Proxy middleware built |

## Success Criteria

1. **Round Robin holes-page shows 3 rotating segments, each with constellation header + per-player net/winner/contributor (not the generic team scorecard)** — **VERIFIED.** `holes/page.tsx:145-151` adds the `'round_robin'` branch → `RoundRobinHolesBody` (page.tsx:394-459) builds ctx via `buildRoundRobinContext`, runs `computeModeResult`, narrows `kind === 'round_robin'`, renders `RoundRobinHolesView`. View (`RoundRobinHolesView.tsx`) groups `result.holes` by `segment` (lines 99-105), renders `SegmentBlock` (164-200) with constellation header, then `HoleCard` (217-267) with two `SideBlock`s showing per-player `net`, winner accent, and contributor ★.

2. **Purely additive: RoundRobinView (leaderboard) unchanged; the new flate is the only per-hole story** — **VERIFIED.** `git diff origin/main...HEAD --stat -- RoundRobinView.tsx` is empty (untouched). The leaderboard `renderRoundRobin` only swapped its inline ctx-map for the shared helper; it has no per-hole section. The framing is correct.

3. **`buildRoundRobinContext` used by both `renderRoundRobin` AND `RoundRobinHolesBody`; inline ctx-map removed** — **VERIFIED.** New file `lib/scoring/context/buildRoundRobinContext.ts`. `page.tsx` (leaderboard) diff shows the inline literal (lines 2830-2863) deleted, replaced by `buildRoundRobinContext({...})`. `holes/page.tsx:424-430` calls it too. Grep for `game_mode: 'round_robin' as const` in `app/`+`lib/` = **zero hits** — no leftover inline literal. **Crucially `teamNumber: p.team_number ?? 0` is preserved** (helper line 67), NOT forced to `null` like solo formats — confirmed this drives the rotation; getting it wrong would break everything.

4. **Other formats (Skins/Wolf/Nines/best-ball) unchanged** — **VERIFIED.** `holes/page.tsx` only adds the `round_robin` branch; Skins/Wolf/Nines bodies and `DrilldownBody` are byte-identical (the round_robin branch is inserted after the nines branch). Full suite 2943 green confirms no regression.

5. **Reveal-modus, dark mode, `tabular-nums`, ≥44px, unplayed + tied handled (no wrong highlight)** — **VERIFIED.** `isRevealHidden` (line 74-95) shows venterom when `reveal && !finished`. Back-link `h-11 w-11` (line 154 = 44px). `tabular-nums` on segment subtitle + hole header + score column (lines 115, 235, 238, 321). All colors are existing palette tokens (`accent`/`border`/`surface`/`muted`/`text`) → dark-mode auto via CSS vars; **no new tokens**. Winner highlight gated strictly on `result === 'side1_wins'`/`'side2_wins'` (lines 256, 260) — `tied` and `unplayed` get NO accent. `outcomeChip` (202-215): `tied`→«Delt», `unplayed`→«Venter», wins→null (marked on the side instead). All four `MatchplayHoleResult` enum members (`'side1_wins'|'side2_wins'|'tied'|'unplayed'`, types.ts:781) handled.

6. **Type C render-test (≥2 segments, 1 won, 1 tied, 1 unplayed; asserts segment headers, per-player net, winner highlight)** — **VERIFIED & honest.** `RoundRobinHolesView.test.tsx` is **exactly one `it()`** (Type C discipline). It asserts the real differentiators: 2 segment blocks, segment-1 constellation `Alice + Bjørn` vs `Camilla + David`, **ROTATED** segment-2 `Alice + Camilla` vs `Bjørn + David`, «Vant hullet» on the winning side, «brutto 5» on a gross≠net player, and the unplayed card showing «Venter» + «–» + no «Vant hullet» + `querySelector('[class*="border-accent"]') === null`. It does NOT re-assert Type-A scoring numbers (RoundRobinView has no per-hole view to duplicate). **Not hollow.**

7. **Norsk copy via humanizer** — **VERIFIED (spot check).** New strings: «Vant hullet», «Delt», «Venter», «{navn} mot {navn}», «Godt spilt.», «Resultatene avsløres etter runden». Clean, idiomatic, no AI-tells, no «X-spillet» redundancy, no em-dash chains.

8. **CHANGELOG + MINOR bump (1.98.0)** — **VERIFIED.** `package.json` = `1.98.0`. CHANGELOG has open `## 1.98.y — Round Robin · hull for hull` with `[1.98.0] - 2026-06-08`. The previous `1.97.y` Nines series (TWO entries: 1.97.1 + 1.97.0) is folded into `## Tidligere versjoner` under a `<details><summary>1.97.y … (2 oppføringer)</summary>` wrapper (lines 45-80), balanced. **Touched-region `<details>`/`</details>` balance verified** (wrapper opens line 45, inner Teknisk blocks 54/59 + 65/78 balanced, wrapper closes line 80). The whole-file count (390 open / 378 close) imbalance is **pre-existing** and not introduced by this diff.

## Skeptical findings

**Rotation correctness — the central claim — is genuinely correct.** `roundRobin.ts:65-76` defines `slotPairingsForSegment`: Seg1=[1,2]vs[3,4], Seg2=[1,3]vs[2,4], Seg3=[1,4]vs[2,3]. Sides are derived purely from `segmentForHole(hole.number)` (line 338-345) — identical for all 6 holes in a segment — so the view reading the constellation from `holes[0]` (`RoundRobinHolesView.tsx:173-175`) is **provably safe**. The test fixture's hardcoded `side1PlayerIds` exactly match these slot pairings (u1=slot1…u4=slot4), so the «rotation shown» claim is real, not decorative.

**Contributor ★ null-safety confirmed concretely.** The ★ renders only on `cell.isContributor && cell.net != null` (lines 303, 313). An unplayed-hole player with `net == null` gets no star and no crash — verified against the unplayed fixture (hull 8: all cells `net: null`, `isContributor: false`).

**Brutto shown discreetly only on net≠gross.** `showGross = cell.gross != null && cell.net != null && cell.gross !== cell.net` (line 294-295). Per-player `net` is shown prominently (`score-num`, line 328), never gross-as-net. Correct.

**`'tied'` both-contributor case handled.** Tie shows «Delt» chip, no side accent, and both sides can still render their ★ independently (gated per-cell, not per-winning-side) — matches the contract guardrail.

**Mixed-gender:** head par uses `hole.par` (= `side1Par`, backward-compat per types.ts:1742); per-player `cell.net` already gender-correct from scoring. Matches contract. (`cell.par` is unused in the view — harmless, the per-player vs-par display the team-scorecard had is intentionally not reproduced here.)

### Must-fix
None. All gates green, all criteria verified.

### Nice-to-have (non-blocking)
- **`RoundRobinHolesView.test.tsx:2`** imports `within` from `@testing-library/react` but never uses it → 1 lint warning. Copied verbatim from `NinesHolesView.test.tsx` (same dead import), so it's a propagated sibling-pattern nit, not new sloppiness. The contract's "nye filer 0 issues" is marginally inaccurate. Trivial — drop the `within` import. Not worth blocking; could be cleaned in this PR or a follow-up.
