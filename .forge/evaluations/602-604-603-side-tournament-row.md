# Evaluation: Sideturnering-raden (#602 + #604 + #603)

ACCEPT

Evaluated commits on `origin/main..HEAD`:
- `d3453010` fix(leaderboard): attribuer vinnernavn på individuelle sideturnerings-kategorier (#602)
- `30e604c2` fix(leaderboard): rydd solo-copy i sideturnering-raden (#604 + #603)
- `a9656187` test(leaderboard): matchplay singles side-rad viser spillernavn (#604-følge)

All gates pass and every contract success criterion is met. One pre-existing, out-of-scope gap noted (does not block).

## Post-evaluation addendum (gap closed)

The flagged gap — `longest_bogey_free_streak` and `lowest_single_hole_brutto` showing the same `(?)` winner bug — was fixed in commit `207a1591` (1.127.3) rather than deferred: it is the identical bug as #602 in the same row, and the owner can't read code, so shipping a visibly-partial fix was worse than the tiny scope extension. TDD: assertions added to both existing single-winner tests (failed 2/154), then `winnerUserId: w.userId` added at both award sites; 154 passed.

Exhaustive re-check confirms **every** individual/streak award category the view renders with a name now carries a resolvable `winnerUserId` (the four that read as "missing" in a naive grep — `clean_front_9`/`clean_back_9` via the shared helper, `hardest_hole_winner`/`worst_single_hole_brutto` with the field >3 lines below `category:` — all set it). Zero `(?)` cases remain. Full suite: 3416 passed.

---

## 1. #602 completeness — the critical probe

**The contract's 11 newly-fixed categories all carry `winnerUserId` from scoring.** Cross-checked every name-rendering individual category in `SideTournamentView.tsx` against the award construction in `lib/scoring/sideTournament.ts`:

| View renders name (category) | view L | scoring sets winnerUserId | scoring L |
|---|---|---|---|
| best_brutto_18_individual | 398 | ✓ | 713 |
| king_par3_individual | 416 | ✓ | 857 |
| king_par5_individual | 434 | ✓ | 907 |
| most_eagles_individual | 452 | ✓ | 614 |
| king_par4_individual | 471 | ✓ | 1324 |
| most_albatrosses_individual | 490 | ✓ | 1210 |
| most_hole_in_ones_individual | 509 | ✓ | 1273 |
| clean_front_9 | 521 | ✓ (already had it) | 1362 |
| clean_back_9 | 533 | ✓ (already had it) | 1362 |
| no_double_plus_round | 545 | ✓ (already had it) | 1401 |
| best_brutto_f9_individual | 587 | ✓ | 759 |
| best_brutto_b9_individual | 605 | ✓ | 805 |
| most_birdies_individual | 623 | ✓ | 564 |
| most_pars_individual | 641 | ✓ | 664 |
| hardest_hole_winner | 672 | ✓ (already had it) | 1436 |
| comeback_kid | 691 | ✓ (already had it) | 1470 |
| all_par_groups_birdie | 709 | ✓ (already had it) | 1512 |
| even_par_round | 722 | ✓ (already had it) | 1540 |
| back_to_back_birdies | 745 | ✓ (already had it) | 1568 |
| turkey | 836 | ✓ (already had it) | 1026 |
| solid | 872 | ✓ (already had it) | 1092 |
| worst_single_hole_brutto | 966 | ✓ (already had it) | 1675 |
| most_double_bogeys_individual | 986 | ✓ (already had it) | 1705 |

All 11 issue-scope categories now resolve a real name. The fix is exactly the 11 lines named in the contract — verified by `git diff` (see criterion 2).

**GAP FOUND (pre-existing, out of contract scope): two name-rendering individual categories STILL render `?`.**

- `longest_bogey_free_streak` — view L558 `const name = winnerName(bf)`, then L564–565 `t('longestBogeyFreeDetail', { name, count, range })`. Scoring award (L942–949) has `streakLength/streakStartHole/streakEndHole` but **no `winnerUserId`** → `winnerName` returns `'?'` → renders e.g. `"?, 7 hull (3–9)"`.
- `lowest_single_hole_brutto` — view L653 `const name = winnerName(low)`, then L657–658 `t('scoreOnHole', { name, score, hole })`. Scoring award (L986–992) has `score/holeNumber` but **no `winnerUserId`** → renders e.g. `"?, 2 på hull 14"`.

Confirmed against `origin/main`: both already lacked `winnerUserId` there (`git show origin/main:lib/scoring/sideTournament.ts`), so this is a pre-existing bug of the *exact same shape* as #602, NOT introduced by this work, and NOT fixed by it. The contract explicitly scoped #602 to "11 individuelle award-konstruksjoner" and listed neither of these in its known-good set (lines 39–42). The original issue #602 text is broader ("Sørg for at `most_*_individual`-awardene bærer korrekt `winnerUserId`") but its observed examples are all count-based. So this is defensible as out-of-scope — but it leaves two visible "?" categories in the side-tournament row that look identical to the bug just fixed. **Recommend filing a follow-up issue** rather than blocking this PR.

## 2. No points/standings change

PASS. `git diff origin/main..HEAD -- lib/scoring/sideTournament.ts` filtered to non-comment, non-`winnerUserId: userId` lines returns **empty**. The only changes are: (a) the `winnerUserId` JSDoc block rewrite, and (b) 11 `winnerUserId: userId` field additions. No predicate, guard (`userIds.length >= 2`), points value, `award()` call, or team-total logic touched. Standings are byte-identical before/after. Additive field only — confirmed.

## 3. #604 solo header

PASS. `SideTournamentView.tsx`:
- L178–183: `soloMember = team && team.members.length === 1 ? team.members[0] : null;` then `title = soloMember ? soloMember.displayName : label;` and `memberNames = soloMember ? '' : (…firstName join …)`.
- L204 `{memberNames && (…subtitle…)}` — empty string is falsy, so the subtitle is dropped for solo. `displayName` (kallenavn-form) renders once as the title.
- 2+ member teams: `soloMember` is `null`, so `title = label` (e.g. "Lag 1") and `memberNames` is the firstName list — unchanged from origin/main.
- Edge cases: `team` undefined → `soloMember = null`, falls back to `label = t('teamFallback', …)` (L174). Empty `members` array → `members.length === 1` false → `soloMember = null`, no crash. Correct.

Render test confirms: `expect(text).toContain('Jørgen «Jørg»')` and `expect((text.match(/Jørgen/g) ?? []).length).toBe(1)` (solo); `'Lag 1'` + `'Alice · Bjørn'` (team).

## 4. #603 snowman + panel

PASS.
- **(a) snowman copy:** L938–946 switch on `isSoloTeam` (derived per-team at L302 `(teamById.get(teamId)?.members.length ?? 0) === 1`) to pick `snowmanDetailSolo`/`snowmanDetailHoleSolo`/`achievementRules.snowmanSolo`. Note: snowman gating reads per-team `isSoloTeam`, not the view-wide `isIndividual` — correct per the contract's "Claude's Discretion" allowance and actually *more* correct for mixed games (a lone 1-member team in an otherwise-team game still reads right).
- **(b) rules panel:** `isTeamOnlyCategory` (L1109–1115) returns true for `id.endsWith('_team') || id === 'team_all_birdied_bonus' || id === 'team_no_bogey_hole_coord'` — exactly the contract's set, nothing extra. L1232 filters those fragments out when `isIndividual`. Dual rows keep only the individual fragment; pure team rows get an empty fragment set and are dropped by the existing `if (activeFragments.length === 0) return []` (L1234). Snowman rule swapped to `panel.rules.snowmanSolo` when `isIndividual` (L1237–1240). `ruleKey` threaded through to render (L1274, L1283–1285).

Render test confirms: solo `not.toContain('Alle birdied (lag-bonus)')` + `toContain('din brutto ≥ par+5')`; team `toContain('Alle birdied (lag-bonus)')`.

## 5. i18n catalog parity

PASS. New keys exist in BOTH catalogs at matching paths:
- `achievementRules.snowmanSolo` + `panel.rules.snowmanSolo` (2× each in no.json and en.json)
- top-level `snowmanDetailSolo` (1× each)
- top-level `snowmanDetailHoleSolo` (1× each)

`grep -c` counts identical across no.json/en.json (2/1/1). `catalogParity.test.ts` passed in the targeted run (below). Norwegian strings mirror the approved team variants idiomatically ("din brutto ≥ par+5 på samme hull", "+{delta} på hull {hole}") — no AI tells.

## 6. Gates (run independently)

```
$ npx vitest run lib/scoring/sideTournament.test.ts \
    "app/[locale]/games/[id]/leaderboard/SideTournamentView.test.tsx" \
    "app/[locale]/games/[id]/leaderboard/MatchplaySideTournamentSection.test.tsx" \
    messages/catalogParity.test.ts
 Test Files  4 passed (4)
      Tests  160 passed (160)

$ npx tsc --noEmit
TSC_EXIT=0
```

Both green. (Full `npm run build` skipped per instructions; tsc clean + targeted suite green gives sufficient confidence.)

## 7. Test discipline

PASS. Strong.
- The 11 `winnerUserId` assertions were each added to an **existing single-winner test**, on the line immediately following the existing `points` assertion — zero duplicated fixtures, zero new test blocks. (e.g. `sideTournament.test.ts` L451, L651, L848, …) This is the ideal "no duplicated setup" pattern.
- New `SideTournamentView.test.tsx` is a focused Type C render test: two `it` blocks (solo + team), shared `renderView` helper, asserting copy/structure (#604 displayName-once, #603 snowman + panel filtering) — not re-asserting Type-A numbers. Within the "max one render-test per component" budget.
- Matchplay sister test (`MatchplaySideTournamentSection.test.tsx`) was correctly updated (not duplicated): singles = teams-of-1, so the #604 change makes rows show `displayName` instead of "Lag N"; the test's own fixture already supplies `displayName: 'Alice Andersen'` / `'Bjørn Berg'`, so the swapped assertions are valid.
- Render tests assert Norwegian copy — fine for Type C (the copy IS the contract); the "never assert Norwegian" rule is a Type D / E2E rule.

## Gaps / concerns

1. **(Medium, out of scope) Two more "?" categories remain.** `longest_bogey_free_streak` and `lowest_single_hole_brutto` render the same `?` winner-name bug #602 fixed elsewhere, because scoring never sets `winnerUserId` on them (pre-existing on origin/main, not regressed here). They sit in the same expanded row and will look like the bug "wasn't fully fixed" to the owner. Recommend a follow-up issue to add `winnerUserId: w.userId` to those two awards (the loop variable `w.userId` is already in scope at both sites — L939/L983) plus the two adjacent test assertions. Defensible to defer since the contract scoped #602 to 11 categories, but worth flagging explicitly so it isn't lost.

2. **(Minor) Version-bump granularity.** Two patch bumps (1.127.1 then 1.127.2) for what is effectively one PR. CHANGELOG nests both under the open 1.127.y series correctly. No issue — matches the "patch nests under open theme" convention.

No blocking issues. The three contract deliverables are implemented exactly as specced, additively, with clean TDD and passing gates.
