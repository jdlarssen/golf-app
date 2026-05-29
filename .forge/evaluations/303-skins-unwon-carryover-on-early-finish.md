# Forge Evaluation: #303 — Skins unwon-carryover on early finish

**Verdict: ACCEPT**

**Evaluated:** 2026-05-29
**Branch:** `claude/optimistic-banzai-8e4c79`
**Evaluator:** Independent skeptical re-verification (re-ran all gates, read all code)

---

## Gate Results

| Gate | Result | Detail |
|------|--------|--------|
| `npx vitest run lib/scoring/modes/skins.test.ts` | PASS | 27 passed (27) |
| `npx vitest run "app/games/[id]/leaderboard/SkinsView.test.tsx"` | PASS | 1 passed (1) |
| `npm run build` | PASS | TypeScript clean, 29 static pages generated, no errors |

All three gates green on independent re-run.

---

## Per-Criterion Verdict

### C1 — `SkinsResult` exposes `carriedPot`; `unwonSkins` fully removed

**PASS**

- `lib/scoring/modes/types.ts:1087–1101`: `SkinsResult` interface has `carriedPot: number` with correct JSDoc explaining the raw-pot semantics. No `unwonSkins` field present.
- `lib/scoring/modes/skins.ts:234–240`: `compute()` returns `{ kind: 'skins', scoring, holes, players, carriedPot }`. No `unwonSkins` local variable or return field.
- `grep -rn unwonSkins --include=*.ts --include=*.tsx`: **zero results** across all executable code. Only references found are in the historical evaluation `.forge/evaluations/275-skins.md` (describing the bug that existed before this fix) — not in any compiled source.

### C2 — New scoring test: early-finish-after-tie → `carriedPot` = raw pot (not 0)

**PASS**

- `lib/scoring/modes/skins.test.ts:442–469`: Test "Tidlig avslutning på delt hull + trailing uspilte hull → carriedPot eksponerer rå pott (#303)" sets up hole 1 tied (carryover), hole 2 tied (carryover), hole 3 pending (no scores). Asserts `result.carriedPot === 2` (not 0).
- The comment at line 445 explicitly documents the old broken path: `` `frozen ? 0 : carriedPot` = 0 → henger-banneret forsvant ``.
- `compute(ctx: ScoringContext)` signature at `skins.ts:127` — unchanged, no `gameStatus` parameter. Module stays pure.

### C3 — Existing scoring tests pass with `carriedPot` semantics

**PASS**

- 27 tests pass. Spot-checked in the test file:
  - Complete round, last hole won → `carriedPot === 0` (line 159, 204, 240, 336)
  - Live gap, hole 1 tied + hole 2 pending → `carriedPot === 1` (raw frozen pot, not 0) (line 439)
  - Complete round, last hole tied → `carriedPot === 1` or `=== 2` depending on chain length (lines 278, 488, 508)

### C4 — `SkinsView` gates banner on `gameStatus === 'finished' && result.carriedPot > 0`

**PASS**

- `app/games/[id]/leaderboard/SkinsView.tsx:132–133`:
  ```ts
  const showUnwonSkins =
    gameStatus === 'finished' && result.carriedPot > 0;
  ```
- Banner rendered at line 173 behind `{showUnwonSkins && ...}` with `data-testid="skins-unwon"`.
- Banner renders `result.carriedPot` (lines 180–181) and copy «ikke vunnet. Siste spilte hull ble delt.» (line 183).

### C5 — SkinsView test covers frozen-finished scenario + active hidden case

**PASS**

- `app/games/[id]/leaderboard/SkinsView.test.tsx:168–191`:
  - Sub-case 2 (lines 172–183): `carriedPot: 3`, `gameStatus: 'finished'` → `getByTestId('skins-unwon')` succeeds, text contains `'3'`, `'ikke vunnet'`, `'Siste spilte hull ble delt'`. Importantly, the `makeResult()` fixture already has a trailing `pending` hole (hole 3), so this directly covers the frozen-early-finish scenario.
  - Sub-case 2b (lines 185–191): same `carriedPot: 3` but `gameStatus: 'active'` → `queryByTestId('skins-unwon')` is null. Banner correctly hidden during active play.
- 1 test file, 1 test, passes.

### C6 — All three gates green, version bump 1.45.1, CHANGELOG entry present

**PASS**

- `package.json`: `"version": "1.45.1"` confirmed.
- `CHANGELOG.md`: Entry `### [1.45.1] - 2026-05-29` present with tagline blockquote and collapsible technical details referencing #303, explaining the `unwonSkins → carriedPot` rename and the SkinsView gating change.
- All three gates independently re-run: all green.

### C7 — Banner copy through humanizer pass, no AI-tells

**PASS** (spot-checked against copy-style.md patterns)

- «Siste spilte hull ble delt.» — clean bokmål, no anglicisms, no em-dash chains, no «vennligst», no «tap kort», no «-spillet»-redundancy.
- «ikke vunnet» — direct action phrasing, not passive.
- No false-positive hook patterns detected.

---

## Skeptical Gap Analysis

**Gap 1 — `SkinsPodium.tsx` is an unmigrated consumer of `SkinsResult`.**
`SkinsPodium.tsx` imports `SkinsResult` and destructures `result.players` and `result.scoring`. It never references `carriedPot` or the old `unwonSkins` — so there is nothing to migrate. The build confirms no type error. Not a gap.

**Gap 2 — Could `carriedPot > 0` ever show the banner spuriously (false positive)?**
Per the module logic: `carriedPot` starts at 0 and only increases via the `carryover` branch (`carriedPot = atStake`) when 2+ players tie on a scored hole. It is reset to 0 by the `won` branch whenever a single player wins. A pending hole freezes `carriedPot` at its current value but does not increase it. Therefore `carriedPot > 0` when the game is finished implies the last resolved (non-pending) hole ended in a tie — which is precisely when the contract says «Siste spilte hull ble delt» is accurate. No false-positive scenario identified.

**Gap 3 — Active-game, complete-round, last-hole-tied: could banner show?**
Contract edge case noted: when `gameStatus === 'active'` but all holes are scored and last is tied, `carriedPot > 0` but `gameStatus !== 'finished'` → banner hidden. Correct behaviour, confirmed by gate at C4 and the existing C3 tests (test at line 473 has complete round, delt siste hull, `carriedPot=1` — but this scenario only shows the banner when finished, consistent with the gate logic).

**Gap 4 — `lib/scoring/index.ts:113` re-exports `SkinsResult`.**
Verified: this is a pass-through re-export of the type. No field access, no migration needed.

**No gaps found that require a NEEDS WORK verdict.**

---

## Summary

The fix is clean, complete, and correctly scoped. The API rename (`unwonSkins → carriedPot`) is total with zero stale references in compiled code. The module purity constraint (no `gameStatus` param) is preserved. The SkinsView gating is correct and covers the reported scenario. The new test directly reproduces the bug scenario (two tied holes + trailing pending + `carriedPot === 2`). The SkinsView test covers both the banner-shown and banner-hidden cases. Version bump and CHANGELOG are present and correct.

**ACCEPT**
