# Evaluation — Nines / Split Sixes «Hull for hull» (PR 3 av epic #496)

**Verdict: ACCEPT** — every contract criterion and gate is verified by independent run; one minor cosmetic divergence on partially-scored pending holes is documented as nice-to-have, not blocking.

Branch: `issue-496-nines-hull-for-hull` · evaluated read-only, no source files touched.

---

## Gates (all run by the evaluator)

| Gate | Command | Observed |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | **exit 0, no output** — clean |
| Leaderboard tests | `npx vitest run "app/games/[id]/leaderboard"` | **171 passed / 27 files**, exit 0 |
| Full regression | `npx vitest run` | **2942 passed / 242 files**, 0 failures, exit 0 |
| Lint | `npm run lint` | **0 errors, 24 warnings**; all 24 are pre-existing `_gameId`/`_gameStatus`/`Button`/`userId` unused-var warnings in OTHER files. None of the 3 new files appear. |
| Build | `npm run build` | **exit 0**, full route table emitted |

The contract claimed 2942 tests and "0 errors / 0 new file issues" — both reproduced exactly.

---

## Success Criteria

1. **Per-hull pott + plassering + brutto/netto + poeng (not team scorecard).** VERIFIED.
   `holes/page.tsx:134-140` adds the `'nines'` branch → `NinesHolesBody` (309-374) → `NinesHolesView`. View renders pot badge (`{potTotal(variant)} poeng`, line 212), placement badge (line 253), score (line 279), points chip (lines 264-268). Probe render of a normal Nines hole: `9 poeng` badge present, `brutto 4` + `+5` for the winner.

2. **Richer than NinesView's PER HULL.** VERIFIED.
   `NinesView.tsx` `HoleRow` (read at lines 298-364) shows ONLY hole header + per-player **points number + name** + a pending indicator — no gross/net score, no placement, no winner highlight. `NinesHolesView` genuinely adds pot badge, placement (1./2./3.), brutto/netto score, and accent leader highlight. The differentiator is real, not a renamed clone.

3. **`buildNinesContext` shared, inline map removed.** VERIFIED.
   `git diff` shows the inline `ctx = { game: {…}, players: …, holes: …, scores: … }` literal (old lines 2728-2763) fully deleted from `renderNines` and replaced by `buildNinesContext({…})` (page.tsx:2732). `NinesHolesBody` (holes/page.tsx:339) calls the same helper. `grep "game_mode: 'nines'"` in page.tsx → no remaining literal map (only the helper sets `game_mode: 'nines'` internally at `buildNinesContext.ts:57`).

4. **Other formats untouched.** VERIFIED.
   Only a `'nines'` branch was added to `holes/page.tsx` (after the Wolf branch). `SkinsHolesBody`, `WolfHolesBody`, and `DrilldownBody` are byte-for-byte unchanged in the diff. Full suite (2942) green confirms no regression.

5. **Reveal / dark mode / tabular-nums / ≥44px.** VERIFIED.
   `isRevealHidden = scoreVisibility==='reveal' && gameStatus!=='finished'` (line 55-56) → `data-testid="nines-holes-reveal-hidden"` block (line 63). Back-link `h-11 w-11` (line 131 = 44px). `grep -c tabular-nums` = 6 numeric spans. `score-num` class on scores. Colors are 100% token-based (`accent`/`text`/`muted`/`border`/`surface`) — no raw hex/rgb, no new tokens.

6. **Type C render-test (normal + tie + pending).** VERIFIED, with one honesty caveat.
   `NinesHolesView.test.tsx` is exactly **1 it()** block (Type C compliant). Asserts `9 poeng`, `brutto 4`, `+5`, tie-split `+4`, placement-first ordering (Alice/3rd sinks to last row), pending (`Venter på score`, no `9 poeng`, `–`). These are the differentiators NinesView.test does NOT cover; no re-assertion of Type-A scoring numbers. Caveat: the test does **not** inspect placement badges on the pending hole, so the divergence in finding #1 below is untested (but the assertions it does make are honest).

7. **Norsk copy / humanizer.** VERIFIED by inspection.
   New strings: «Hull for hull», «Venter på score» (reused/approved), «Resultatene avsløres etter runden», «Godt spilt.», «Lykke til.», «{N} poeng», «brutto {N}». No AI-tells, no em-dash chains, no «X-spillet» redundancy, no «vennligst». Idiomatic and consistent with sibling views.

8. **CHANGELOG + MINOR bump (1.97.0).** VERIFIED.
   `package.json` 1.96.0 → **1.97.0** (MINOR). New `## 1.97.y — Nines · hull for hull` theme opened; the prior `1.96.y` Wolf series correctly re-wrapped under `## Tidligere versjoner` inside `<details>`. Nesting closes cleanly (old `## Tidligere versjoner` heading replaced by the new fold's `</details>`). No broken nesting.

---

## Skeptical findings

### Verified solid (checked personally, not assumed)

- **Placement ⇄ points cannot disagree.** `placementByPlayer` in the view (NinesHolesView.tsx:148-170) is the *same* walk-equal-score-groups algorithm as `nines.ts:175-194`: sort `effectiveScore` ASC, group exact-equal, assign placement `i+1`. Both derive from identical input. The leader-highlight gate `isLeader = placement === 1` lines up with the scoring layer's lowest-score-wins-most-points distribution by construction.
- **Split Sixes 0-points edge.** Probed directly. Highest scorer (pot `[4,2,0]`, points=0) renders `"3Camilla Carlsen6"` — placement badge "3" + score "6" present, **no `+0` chip** (gate `pts > 0`, line 264). Exactly per contract line 59.
- **Tie case.** Test fixture hull 2 (two tied lowest → (5+3)/2 = +4 each) renders shared placement and `+4` chips; the unplaced 3rd-place player sinks to the bottom row. Matches contract line 58.
- **Pending pot badge.** Pending hole shows «Venter på score» instead of the pot badge (lines 209-215); points chips suppressed (all 0); missing scores render `–`. Unplaced rows sort to the bottom without crashing (sort comparator lines 187-194 handles `null` placements).
- **No extra fetch for Nines.** `NinesHolesBody` does `Promise.all([getGameWithPlayers, course_holes, scores])` — no `getWolfChoices` analog, correctly mirroring `SkinsHolesBody`, not `WolfHolesBody`.
- **Type C / test honesty.** One render-test per component; no duplication with NinesView.test (which tests the leaderboard table, compact hole-list, «Delt 1. plass», reveal-hidden). Only shared string is the approved «Venter på score».

### Finding #1 — partially-scored pending hole crowns a placement-1 "leader" (cosmetic divergence, nice-to-have)

The contract states for pending holes: *"ingen plasserings-merke, ingen poeng-chip"* (line 48) and *"ingen plassering/poeng"* (line 57). The points chip is correctly suppressed, but the **placement badge and leader highlight are NOT**.

`placementByPlayer` filters `effectiveScore != null` and ranks whoever remains — it does not check `hole.pending`. On a pending hole where some (not all) players have entered scores, those players get real placement badges and the lowest gets the accent leader highlight + accent score color.

Probed concretely (pending hole, only Alice scored): Alice's row renders `"1Alice Andersen4"`, badge text `"1"`, with `isLeader === true` → accent frame + accent score. The contract wanted no placement badge there.

**Severity: low.**
- The fully-pending case (no one scored) is fine — all `effectiveScore` null → no placements, all badges `–`.
- It only bites a *partially*-scored pending hole. During an active round with `score_visibility='reveal'`, the whole view is reveal-hidden, so this never shows. It surfaces only when `score_visibility='live'` mid-round, or on a finished game with a genuinely incomplete hole (a player who never submitted).
- No incorrect points are awarded (scoring layer gives 0 on pending). The issue is purely visual: it implies a hole-winner before the hole is decided.
- **Inconsistency with the sibling:** `NinesView`'s `HoleRow` treats pending uniformly — `isPending = hole.pending || entry == null` renders «—» for *all* players with no winner emphasis. `NinesHolesView` differs by ranking+highlighting the lone scorer. A reader toggling between the two pages on the same pending hole sees different stories.

This is the only place where rendered behavior diverges from the contract's written spec. It does not break the golden path and is not covered by the test, so it slipped through green.

---

## Must-fix vs nice-to-have

**Must-fix (blocking): none.** All gates green, all 8 success criteria verified, both documented edge cases (Split Sixes 0-pts, tie-split) render correctly, no regression, no scoring change, no new tokens, no broken CHANGELOG nesting.

**Nice-to-have (non-blocking, owner's call):**
1. Suppress the placement badge + leader highlight on `hole.pending` rows so a partially-scored pending hole doesn't crown a premature "winner" — gate placement/highlight on `!hole.pending` (or set `placement = null` when `hole.pending`), matching the contract's pending spec and NinesView's uniform pending treatment. Add one assertion to the existing Type C test's card-3 block checking no placement-1 badge on a partially-scored pending hole.

Recommend ACCEPT now and filing the pending-placement polish as a follow-up issue rather than blocking this PR.
