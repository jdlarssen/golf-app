# Evaluation: Skins/Nassau/BBB 16-player cap (#460)

**Verdict: ACCEPT**

Independently verified against `.forge/contracts/460-skins-nassau-bbb-player-count.md`.
Commits evaluated: `c300bd5..bfce673` (5 commits) on `claude/jolly-lederberg-837695`.
All success criteria pass; all gates green. One cosmetic stale-comment nit (minor, non-blocking).

## Per-criterion results

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | Wizard filter `fitsPlayerCount` true for n=2..16, false for n=17 (skins/nassau/bbb) | PASS | `lib/wizard/fitsPlayerCount.ts:69-72` → `case nassau/skins/bingo_bango_bongo: return n >= 2 && n <= 16`. `npx vitest run lib/wizard/fitsPlayerCount.test.ts` green (part of 351 passed). |
| 2 | Validators accept 16, reject 17 with `too_many_players_for_mode`; loop ceiling above cap | PASS | `gamePayload.ts`: validateNassau loop `i < 17` (L1574) + cap `> 16` (L1588); validateSkins loop `i < 17` (L1637) + cap `> 16` (L1651); validateBingoBangoBongo loop `i < 17` (L1761) + cap `> 16` (L1775). 16-test asserts `toHaveLength(16)`; 17-test asserts `too_many_players_for_mode`. `gamePayload.test.ts` green. |
| 3 | Exact-count formats unchanged (acey_deucey, wolf, round_robin, matchplay, nines) | PASS | `validateAceyDeucey` (L1697) still loop `i < 8` (L1705) + cap `> 4` (L1719) — sits right after Skins, untouched. All other validators retain `i < 8` / `> 4` per grep. Their tests green. |
| 4 | Scoring count-agnostic; new 6-player tests genuinely exercise >4 | PASS | commit `505a3c5`: skins test (6 players, `toHaveLength(6)`, u1-u5 each win 1 skin, u6 wins 0 but represented, carriedPot=1); nassau test (u6 sweeps front9/back9/total18, u1 loses all); BBB test (points across all 6, asserts each player's totalPoints, sum=12). Non-vacuous. `skins/nassau/bingoBangoBongo.test.ts` → 75 passed. |
| 5 | Form-state flags allow 16; user strings reflect new cap | PASS | `useGameFormState.ts`: nassauPlayersValid `<= 16` (L1154), skinsPlayersValid `<= 16` (L1159), bingoBangoBongoPlayersValid `<= 16` (L1166). Strings: "Nassau tar maks 16" (L1426), "Skins tar maks 16" (L1438), "Bingo Bango Bongo tar maks 16" (L1450). Acey Deucey unchanged ("krever nøyaktig 4", L1489). |
| 6 | No leftover stale 4-cap; no hidden roster/8-cap preventing 16-player selection | PASS (with minor nit) | No `<= 4` / `> 4` / `2-4` *string* left for these formats. `PLAYER_COUNT_MAX = 16` (GameWizard.tsx:1114); stepper caps at 16 (L1133/1163). `togglePlayer` (L726) uncapped — pure append. `orderedPayload` solo branch `if (!requiresTeams)` (L978) maps ALL `selectedPlayerIds` (no slice). GameWizard emits `player_${i}_id` per row, uncapped (L1028-1030). The only `.slice(0,4)` calls (L892/914) are Wolf/RoundRobin-only. Nit: two stale *comments* (not behavior) — see Issues. |
| 7 | Gates: tsc 0, version bump 1.83.14 + CHANGELOG | PASS | `npx tsc --noEmit` → exit 0. `package.json` version `1.83.14`. CHANGELOG `### [1.83.14] - 2026-06-07 · #460` with tagline + Teknisk. `npm run build` not run — justified: no new GameMode union members added, so exhaustive switches/Record maps are untouched; tsc-clean is sufficient. |
| 8 | Broad regression suite green | PASS | `npx vitest run lib/wizard lib/games/gamePayload.test.ts lib/scoring/modes app/admin/games/new/sections` → 34 files, 894 tests, all passed. |

## Gates

| Gate | Command | Result |
|------|---------|--------|
| Type check | `npx tsc --noEmit` | exit 0 |
| Wizard + validators | `npx vitest run lib/wizard/fitsPlayerCount.test.ts lib/games/gamePayload.test.ts` | 2 files, 351 passed |
| Scoring | `npx vitest run lib/scoring/modes/{skins,nassau,bingoBangoBongo}.test.ts` | 3 files, 75 passed |
| Broad regression | `npx vitest run lib/wizard lib/games/gamePayload.test.ts lib/scoring/modes app/admin/games/new/sections` | 34 files, 894 passed |
| Version/CHANGELOG | inspect | 1.83.14 + matching #460 entry |
| Build | `npm run build` | not run — justified (no new GameMode members; exhaustive switches untouched; tsc clean) |

## Issues found

- **MINOR (cosmetic, non-blocking):** Two internal code comments still say "2-4" for these now-16-cap formats:
  - `app/admin/games/new/useGameFormState.ts:112` — `// Nassau / Skins / Bingo Bango Bongo: solo-formater (ingen lag), 2-4 // spillere.`
  - `app/admin/games/new/sections/NassauSetup.tsx:18` — `Nassau er solo-format (2-4 // spillere)`.

  These are stale relative to the comment-sweep commit `848a40a`, which updated the sibling `SkinsSetup.tsx` but missed `NassauSetup.tsx` and the form-state comment. No user-facing string, no behavior impact, no test impact. The contract explicitly marked comment cleanup as "Claude's discretion / cheap where convenient," so this does not violate a hard criterion. Fix suggestion: change both "2-4" → "2-16" in a follow-up `docs(games)` commit (or fold into closing). Not worth blocking ACCEPT.

## Notes

- **Loop-ceiling design (the headline risk) is correct.** The single most likely real bug — a 17th player silently truncated to 16 and wrongly accepted — is avoided. The read loop is `i < 17` (reads slots 0..16 = 17 players) while the cap is `> 16`. A 17-player payload populates index 16, pushes a 17th entry, `players.length === 17`, trips the cap. Confirmed both by reasoning and by the passing `17 → too_many_players_for_mode` test. The 16-player test additionally asserts `toHaveLength(16)`, which would fail under any truncation, so the boundary is double-locked. The `if (!user_id) continue` (not `break`) means empty slots are skipped without ending the scan, so count is exact.
- **Selection chain is uncapped end-to-end.** Verified the full path 16 players can travel: count stepper (max 16) → `togglePlayer` (append, no cap) → `orderedPayload` `!requiresTeams` branch (maps all selected, no slice) → GameWizard hidden-input emission `player_${i}_id` per row → validator `i < 17` loop. No layer silently truncates below 16. The claim "slot emission is dynamic and uncapped" holds.
- **Acey Deucey collateral-damage check is clean.** It sits immediately after Skins in `gamePayload.ts` and shares the `> 4` pattern; a careless edit could have loosened it. It retains `i < 8` + `> 4` + the "krever nøyaktig 4" form string. Wolf/RoundRobin/Nines/matchplay validators and `fitsPlayerCount` cases all unchanged.
- **BBB-at-scale caveat (documented, not a regression):** BBB remains one pot for the whole game (one bingo/bango/bongo per hole across all players, not per playing-group). This is the pre-existing ≤8 behavior; raising to 16 does not change it. Per-group BBB is explicitly out of scope. With 16 players sharing a single per-hole point this gets thin, but that is a product/UX consideration, not a correctness defect in this change.
- **Scoring tests are characterization-grade, non-vacuous.** Each genuinely sets up 6 players (>4), asserts `toHaveLength(6)`, and checks per-player outcomes including the 5th and 6th — not just <5-player assertions wearing a large-field label.
- **Build skip is reasonable.** No new `GameMode` union members were introduced (only numeric caps + strings changed), so the exhaustive `switch`/`Record` map breakages that normally require a full `npm run build` cannot occur here. tsc exit 0 covers the type surface.
