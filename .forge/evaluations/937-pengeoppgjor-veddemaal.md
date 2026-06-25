# Evaluation — #937 Pengeoppgjør for veddemålsformatene

**Evaluator:** fresh-context skeptical reviewer
**Date:** 2026-06-25
**Branch:** claude/optimistic-banzai-4d7998
**Commits under review:** 5379c9d9, 87e8dfbf, e3eb11fe, 734f752e, 8bb5240e

---

## Gates

| Gate | Result | Evidence |
|------|--------|----------|
| `tsc --noEmit` | PASS | exit 0, no output |
| `vitest run settlement.test.ts formatKr.test.ts` | PASS | 2 files, 11 tests passed |
| `vitest run leaderboard/` | PASS | 37 files, 182 tests passed |
| `eslint` (new + changed files) | PASS (0 errors) | 3 warnings — see note |
| `npm run build` | SKIPPED | per evaluator instructions; tsc covers types. `kr_per_unit` adds an optional field to existing variants (no new `kind`), so no exhaustive-switch / Record-map drift is possible. |

ESLint warnings (non-blocking): two pre-existing complexity warnings (GameWizard 82, useGameFormState 285 — known large files), plus one **new** warning: `'wagerUnitKey' is assigned a value but never used` at GameWizard.tsx:980 — a dead destructure in the payload block; the JSX correctly uses `state.wagerUnitKey`. Cosmetic, not functional.

---

## Success criteria

### 1. settlement helper purity + null guards + sum(netKr)===0 — PASS
- `lib/scoring/settlement.ts` is pure (no imports, no side effects).
- Guards: `if (krPerUnit <= 0 || units.length < 2) return null;` (line 52). Tested for kr=0, kr<0, 1 player, 0 players.
- `sum(netKr)===0` invariant: independently fuzzed **5000 random cases** (n=2..9, units −5..15, kr 1..500) — all satisfied sum=0, payments ≤ N−1, payments sum to creditors, all kr>0.

### 2. Exact pot-model example — PASS
Independently re-derived (mean=2.333, kr=200): Per −66.67→−67, Ola −266.67→−267, Gustav +333.33→+333, residual +1 to largest |raw| (Gustav) → +334. Live run confirms `{gustav:334, per:-67, ola:-267}`, payments `[{ola→gustav 267}, {per→gustav 67}]`. Matches contract (same payment set; ordering largest-debtor-first is deterministic and acceptable). Test asserts this exactly (settlement.test.ts:42-65).

### 3. greedy payments ≤ N−1 and sum to creditors — PASS
`buildPayments` matches largest debtor vs largest creditor with stable userId secondary sort. Fuzz-verified ≤ N−1 and paid==credit across 5000 cases. Tested directly (settlement.test.ts:85-103).

### 4. formatKr Norwegian formatting — PASS
Space thousands-separator (`1 400 kr`, `1 234 567 kr`), `kr` suffix, real U+2212 minus (`−67 kr`), rounds to whole kr, avoids `−0 kr` (`-0.4`→`0 kr`). Tested (formatKr.test.ts).

### 5. kr_per_unit optional in all 6 mode_config variants + validator parses it + omitted when empty/0 — PASS
- `lib/scoring/modes/types.ts`: `kr_per_unit?: number` on wolf (481), nassau (493), skins (505), bingo_bango_bongo (517), nines (535), acey_deucey (570). All 6 present.
- `parseKrPerUnit` (gamePayload.ts:363): reads `formData.get('kr_per_unit')`, returns undefined for empty/non-finite/≤0, floors to non-negative int. Conditionally spread into mode_config in all 6 branches (`...(krPerUnit !== undefined && { kr_per_unit: krPerUnit })`).

### 6. Wizard kr field exists + correct unit label + edit-prefill round-trips — **FAIL**
- Field exists: `WagerStakeSetup.tsx` renders an optional number input gated on `state.isWagerFormat` (GameWizard.tsx:643-650). `wagerUnitKey` derives skin/seksjon/poeng correctly (useGameFormState.ts:1697). Hidden `kr_per_unit` input submits the canonical value (GameWizard.tsx:1102). State seeds from `initialValues?.kr_per_unit` (useGameFormState.ts:449). i18n keys present in both catalogs.
- **Edit-prefill does NOT round-trip — DATA LOSS BUG.** The edit producer chain is `buildEditInitialValues` → `buildSetupStepInitialValues(game.mode_config)` (editGameInitialValues.ts:164). `buildSetupStepInitialValues` (setupStepInitialValues.ts) **never returns `kr_per_unit`** — the `SetupStepInitialValues` type omits it, and no case maps it. (bingo_bango_bongo and acey_deucey aren't even in the switch — they fall to `default: return {}`.)
  - Proven live: `buildSetupStepInitialValues({kind:'skins', skins_scoring:'net', kr_per_unit:200})` → `{"skins_scoring":"net"}` — `kr_per_unit` absent.
  - Consequence: editing any wager game with a kr value pre-fills the kr field **empty** → hidden input submits empty → `parseKrPerUnit` → undefined → `kr_per_unit` omitted from rebuilt mode_config. The edit action writes `mode_config: payload.mode_config` (edit/actions.ts:181), so **the saved kr value is silently wiped on any edit/re-save.**
  - Contract criterion (line 101): "verdien overlever lagring **og spill-redigering**." The redigering half fails.

### 7. SettlementTable RENDERS in each View + hidden in active reveal — PASS (proven)
- Wrote a throwaway render test (`SkinsView` with a constructed `Settlement`): asserted 'Oppgjør' title + payment rows (`Per → Gustav`, `Ola → Gustav`), formatted net (`334 kr`, `−267 kr`), all rendered. With `scoreVisibility='reveal'` + `status='active'`: title and rows absent. With `settlement=null`: absent. All 3 passed. Throwaway deleted; tree clean.
- All 6 Views use the identical pattern: `isRevealHidden = scoreVisibility==='reveal' && status!=='finished'` early-return precedes `{settlement && <SettlementTable/>}` (verified line numbers in SkinsView/WolfView/NassauView/BingoBangoBongoView/AceyDeuceyView/NinesView).
- Unit mapping per format correct: skins→totalSkins/'skin', wolf→totalPoints/'poeng', nassau→units/'seksjon', bbb→totalPoints/'poeng', acey→`total` (signed, handles negatives)/'poeng', nines→totalPoints/'poeng'.
- Settlement passed to View in both finished-3+ and active paths for all 6 formats.

### 8. version 1.143.0 + CHANGELOG — PASS
package.json = 1.143.0. CHANGELOG has `## 1.143.y — Penger på spill` theme + `[1.143.0] - 2026-06-25 · #937` entry with tagline + Teknisk section.

---

## Bugs / gaps found

1. **[BLOCKING] Edit round-trip data loss for `kr_per_unit`.** `buildSetupStepInitialValues` (lib/games/setupStepInitialValues.ts) does not restore `kr_per_unit`, so editing a wager game silently wipes the stake. Violates success criterion #6 ("overlever … spill-redigering"). Fix is small + localized: add `kr_per_unit?: number` to `SetupStepInitialValues` and return it from the wolf/nassau/skins/nines cases, plus add bingo_bango_bongo + acey_deucey cases (currently they hit the default branch and restore nothing). Update setupStepInitialValues.test.ts accordingly.

2. **[Minor] Dead destructure** `wagerUnitKey` at GameWizard.tsx:980 (unused-var eslint warning). Harmless; remove for cleanliness.

## Things checked and found correct (no issue)
- Acey-Deucey uses the SIGNED `p.total` (can be negative) — correct; mean/negatives handled, tested.
- Nassau uses `p.units` (the NassauUnitLine field) — correct.
- 2-player H2H finished branch drops settlement in skins/nassau/bbb only (renders `HeadToHeadResult`, no settlement prop) — contract explicitly allows this. Wolf/acey/nines have no H2H branch and always pass settlement. The active (non-finished) path for all formats, including 2-player, still passes settlement to the View.
- i18n catalog parity: `leaderboard.common.settlement` and `wizard.sections.wager` fully present in both no.json and en.json.
- No console-error risk in SettlementTable (stable keys, null-safe name lookup).

---

## Verdict

The settlement engine, formatKr, mode_config wiring, validator, View integration, render behavior, reveal-gating, i18n, and version/CHANGELOG are all correct and well-tested. **However, one explicit success criterion fails with real user-facing data loss:** the wizard's kr value does not survive game-editing — re-saving an edited wager game silently wipes the stake. The fix is small and localized (one helper + its test).

VERDICT: NEEDS WORK

---

## Re-evaluation — kr_per_unit edit round-trip fix

**Evaluator:** fresh-context skeptical reviewer (re-run)
**Date:** 2026-06-25
**Focus:** Sole blocking bug from prior evaluation — criterion #6 edit-prefill data loss.

### Fix traced: `buildSetupStepInitialValues` (lib/games/setupStepInitialValues.ts)

All 6 wager kinds now return `kr_per_unit`:

| Kind | Line | Returns kr_per_unit? |
|------|------|----------------------|
| wolf | 49–52 | YES — `kr_per_unit: modeConfig.kr_per_unit` |
| nassau | 54–57 | YES — `kr_per_unit: modeConfig.kr_per_unit` |
| skins | 59–63 | YES — `kr_per_unit: modeConfig.kr_per_unit` |
| bingo_bango_bongo | 67–68 | YES — `{ kr_per_unit: modeConfig.kr_per_unit }` only |
| acey_deucey | 72–73 | YES — `{ kr_per_unit: modeConfig.kr_per_unit }` only |
| nines | 75–80 | YES — alongside nines_variant + nines_scoring |

`SetupStepInitialValues` type (line 31) now includes `kr_per_unit?: number`.

### Full round-trip chain confirmed (file:line citations)

1. **DB → prefill:** `buildSetupStepInitialValues({kind:'skins', skins_scoring:'net', kr_per_unit:200})` → `{skins_scoring:'net', kr_per_unit:200}` (proven by test at setupStepInitialValues.test.ts:121–133, passing).
2. **Prefill → state:** `useGameFormState.ts:449–450` — `useState<string>(initialValues?.kr_per_unit != null ? String(initialValues.kr_per_unit) : '')`. Reads `kr_per_unit` from `initialValues`, which flows from `buildEditInitialValues` → `buildSetupStepInitialValues`.
3. **State → hidden input:** `GameWizard.tsx:1101` — `<input type="hidden" name="kr_per_unit" value={krPerUnit} />` submits the state value.
4. **Hidden input → mode_config:** `GameWizard.tsx:414` — `parseKrPerUnit` reads `formData.get('kr_per_unit')` and conditionally spreads into mode_config. Chain is unbroken.

### Deliberate scope call verified

`acey_deucey_scoring` is intentionally NOT restored (per #322). The implementation returns `{ kr_per_unit: modeConfig.kr_per_unit }` — no `acey_deucey_scoring` field. Two tests lock this:
- `setupStepInitialValues.test.ts:145–154`: acey WITH kr → `{ kr_per_unit: 50 }` (passes).
- `setupStepInitialValues.test.ts:187–195`: acey WITHOUT kr → `{}` (passes; vitest `toEqual` ignores `undefined`-valued keys — `{ kr_per_unit: undefined }` deep-equals `{}`).

Both pass. Deliberate call is correctly preserved.

### Gates

| Gate | Result | Details |
|------|--------|---------|
| `tsc --noEmit` | PASS | exit 0, no output |
| `vitest run setupStepInitialValues.test.ts` | PASS | 15/15 tests (all 3 new kr_per_unit tests + 12 pre-existing) |
| `vitest run lib/scoring lib/games leaderboard` | PASS | 68 files, 1651 tests |

### New issues introduced by the fix

None found. The fix is minimal and localized: one type extension (`kr_per_unit?: number` added to `SetupStepInitialValues`) and one `kr_per_unit: modeConfig.kr_per_unit` line added per wager kind. No dead code introduced. The pre-existing minor `wagerUnitKey` dead-destructure warning (GameWizard.tsx:980) was already noted in the original evaluation and is unchanged by this fix.

### Conclusion

The blocking gap is closed. All links in the DB → prefill → hidden input → mode_config chain are intact. The #322 scope decision is preserved and locked by passing tests. No regressions introduced. All gates pass.

VERDICT: ACCEPT
