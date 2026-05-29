# Evaluation (re-verify): #281 Modifisert Stableford — pro-stil poeng-tabell

## Verdict: ACCEPT

Both prior NEEDS WORK issues are genuinely fixed (commit `324d111` "refactor(scorecard):
complete modified stableford family routing on scorecard + admin surfaces (#281)"). I
verified by reading the code, by running the team-MAX negative-points test, and by running
all gates including the full `npm run build`. Standard Stableford behavior is unchanged
(`stableford.test.ts` has no diff vs HEAD).

One NEW low-severity finding surfaced in my independent audit that the prior eval missed:
the public `/spillformer` guide page omits `modified_stableford` from its hardcoded
`MODE_ORDER` array, so the format does NOT surface there — contradicting the contract's
stated "Surfaces automatisk på game-home og `/spillformer`" (contract lines 11, 66). This
is informational-only (the guide content exists and DOES surface on game-home), does not
affect scoring or any player flow, and is latent until 0052 is applied. It does not block
ACCEPT but is logged below for a follow-up issue. Everything in the two flagged scoring/
admin/scorecard paths is correct.

---

## Prior issue resolution status

### Issue 1 — admin game-detail page `isSolo`/`isParStableford` gated on `=== 'stableford'` — RESOLVED
`app/admin/games/[id]/page.tsx:383-387`:
```ts
const isSolo =
  (isStablefordFamily(game.game_mode) && game.mode_config.team_size === 1) ||
  game.game_mode === 'solo_strokeplay';
const isParStableford =
  isStablefordFamily(game.game_mode) && game.mode_config.team_size === 2;
```
Both branches now route through `isStablefordFamily(game.game_mode)`, which returns true for
both `'stableford'` and `'modified_stableford'` (`types.ts:47`). A solo modified game hits
`isSolo`; a par modified game hits `isParStableford`. The dead-fall-through that the prior
verdict described is gone. Verified by direct read.

### Issue 2 — scorecard par variant fell to solo layout + hardcoded standard points — RESOLVED (both defects)

(a) **Layout routing — fixed.** `lib/games/scorecardLayout.ts:261-264`:
```ts
const isStablefordTeam =
  isStablefordFamily(mode) &&
  (cfg.kind === 'stableford' || cfg.kind === 'modified_stableford') &&
  cfg.team_size === 2;
```
`isStablefordTeam` now accepts both config kinds, so a par modified game renders Layout B
(2-column team) instead of falling to variant 'a'. Confirmed by test
`scorecardLayout.test.ts:246` ("par modified stableford (team_size=2) → Layout B med
isStableford=true").

(b) **Points function — fixed (no longer hardcoded).** `computeLayoutBTotals` now takes an
optional `opts.pointsFn` (default `computeStablefordPoints`, line 432) and uses it for
per-player points (line 466) AND the team-MAX (line 480). It no longer hardcodes the
standard table. The scorecard page wires the correct fn:
- `app/games/[id]/scorecard/page.tsx:119-121` derives
  `stablefordPointsFn = game.game_mode === 'modified_stableford' ? computeModifiedStablefordPoints : computeStablefordPoints`.
- Threaded `ScorecardTable` (`pointsFn={stablefordPointsFn}`, line 156) → `LayoutBTable`
  (line 246) → used both for per-hole display points (line 512) and passed into
  `computeLayoutBTotals` (line 571). `LayoutBTable` declares `pointsFn: StablefordPointsFn`
  (line 487). Full chain verified.

(c) **Team-MAX does NOT clamp negatives — CRITICALLY VERIFIED.** `scorecardLayout.ts:480`:
```ts
const teamPoints = Math.max(...pointsPerPlayer.map((p) => p ?? 0));
```
No `Math.max(0, ...)` floor. An all-negative par modified hole produces a negative team
total. Test `scorecardLayout.test.ts:587` ("bruker modified-tabellen … negative poeng")
asserts me bogey → −1, partner double-bogey → −3, `teamTotalPoints === -1` (= MAX(−1,−3),
not clamped to 0). This matches the scoring engine `stableford.ts:269`
(`Math.max(...players.map(pc => pc.points))`, no floor) — scorecard footer and leaderboard
will not drift. Verified by running the test (green), not just reading.

Note on unplayed-partner parity: both the scorecard helper (`p ?? 0`) and the engine
(`pointsFn({netStrokes: null})` → 0) treat an unplayed partner as 0 inside the MAX. So a
hole where one partner shot a negative and the other did not play yields MAX = 0 on BOTH
surfaces — consistent, no drift.

---

## Independent exhaustive audit of `'stableford'` comparison sites

Grepped `app/` + `lib/` (excluding `*.test.*`) for every `'stableford'` occurrence and
classified each:

| Site | Pattern | Status |
|---|---|---|
| `app/admin/games/[id]/page.tsx:383,386` | `isStablefordFamily(game_mode)` | CORRECT (fixed) |
| `lib/games/scorecardLayout.ts:262-263` | `isStablefordFamily(mode)` + both cfg kinds | CORRECT (fixed) |
| `app/games/[id]/leaderboard/page.tsx:989-990` | `cfg.kind === 'stableford' \|\| 'modified_stableford'` | CORRECT |
| `app/games/[id]/leaderboard/page.tsx:1248-1250` | both cfg kinds (side-tournament team grouping) | CORRECT |
| `app/admin/games/[id]/edit/page.tsx:390-391` | both cfg kinds (team_size pre-fill) | CORRECT |
| `lib/games/scorecardTitle.ts:33` | `isStablefordFamily` + both cfg kinds | CORRECT |
| `lib/scoring/modes/stableford.ts:167` | both cfg kinds (team_size narrow) | CORRECT |
| `app/admin/games/new/useGameFormState.ts:88,90` | explicit cases, both return 1 | CORRECT (default team-size) |
| `lib/games/gamePayload.ts:233-234` | parser allowlist, both members | CORRECT |
| `lib/scoring/index.ts:37,39` | switch, explicit `modified_stableford` case | CORRECT |
| `lib/games/allowanceCopy.ts:17,19` | switch, explicit `modified_stableford` case | CORRECT |
| `app/games/[id]/leaderboard/page.tsx:1038` | `result.kind !== 'stableford'` | CORRECT to leave (modified returns kind:'stableford') |
| `lib/mail/gameFinishedRecipients.ts:199` | `result.kind !== 'stableford'` | CORRECT to leave (result-kind guard) |
| `lib/mail/gameFinishedNotification.ts:166` | `mode?.kind === 'stableford'` | CORRECT to leave (reads computed ModeResult.kind) |
| `lib/scoring/modes/types.ts:42,43,47,1128` | helper body + comments | CORRECT (the helper itself) |
| `app/games/[id]/page.tsx:83` | type-union member | CORRECT (object shape) |
| `lib/games/gamePayload.ts:378,429` | `variant` default param | CORRECT (construction) |

No `game_mode === 'stableford'` equality comparison sites remain in app/ or lib/ (verified
via dedicated grep — empty). Every comparison-site flagged by the prior eval is now fixed;
all result-kind guards correctly left as-is.

### NEW finding — `/spillformer` MODE_ORDER omission (LOW, informational)
`app/spillformer/page.tsx:16-27` defines a hardcoded `MODE_ORDER: GameMode[]` that lists 10
modes but OMITS `'modified_stableford'`. The page maps this array to `<ModeGuideCard>`
(line 47-49), so the public formats guide does NOT show modified stableford. This
contradicts the contract (lines 11, 66): "Surfaces automatisk på game-home og
`/spillformer`."

- Game-home DOES surface it correctly: `app/games/[id]/page.tsx:407,523` pass
  `<ModeGuideCard mode={game.game_mode} />` (the real mode), and `MODE_GUIDE` is
  `Record<GameMode, ModeGuide>` so the entry exists.
- Only the `/spillformer` index iteration misses it. `MODE_ORDER` is a plain array (not an
  exhaustive switch), so omission is type-valid and build-clean — it would never surface as
  a tsc/build error. The prior eval's SC5 PASS checked `MODE_GUIDE` content + the hole-side
  banner but not the spillformer iteration source.

Severity LOW: informational guide page, no scoring/admin/player-flow impact, latent until
0052 applied. Does not block ACCEPT. Recommend a follow-up issue to add
`'modified_stableford'` to `MODE_ORDER` (e.g. right after `'stableford'`).

---

## Scoring tables re-verified by hand

**Modified** (`modifiedStableford.ts:34-43`): null→0, diff ≤−3→8 (albatross cap incl.
condor), −2→5, −1→2, 0→0, +1→−1, ≥+2→−3. Matches spec comment + contract table exactly.

**Standard** (`stableford.ts:61-70`): null→0, ≤−3→5, −2→4, −1→3, 0→2, +1→1, ≥+2→0.
UNCHANGED. `git diff HEAD -- lib/scoring/modes/stableford.test.ts` is empty → standard
regression suite byte-for-byte unchanged and green (part of the 593-test run below).

---

## Gates (run independently this pass)

| Gate | Result |
|---|---|
| `npx tsc --noEmit` (non-test filtered) | PASS — zero `error TS` lines after filter |
| `npx vitest run` (5 target specs: scorecardLayout, lib/scoring, HoleClient, modeGuide, admin/[id]) | PASS — 27 files, 593 tests passed |
| Team-MAX negative-points (no clamp) | PASS — `scorecardLayout.test.ts:587` asserts `teamTotalPoints === -1` |
| Standard stableford unchanged | PASS — `stableford.test.ts` diff vs HEAD empty, green |
| `npm run build` (Vercel exhaustiveness gate) | PASS — full route table emitted, no errors |

---

## Summary

The two NEEDS WORK issues are real fixes, fully wired and test-covered, with the
critical no-clamp team-MAX semantics matching the scoring engine. All gates green including
the full build. One low-severity contract-deviation found (`/spillformer` guide omission) —
logged for a follow-up issue, not a blocker. ACCEPT.
