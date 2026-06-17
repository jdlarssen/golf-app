# Evaluation: #663 — extend cup bulk-generator to greensome/chapman/gruesome + fix silent "Neste"

**VERDICT: ACCEPT**

Commit: `aebc45a0`

---

## Per-criterion table

| Criterion | Status | Evidence |
|---|---|---|
| `CupSessionFormat` widened to 6 | PASS | `cupTemplates.ts` L14-20: union now includes `greensome_matchplay`, `chapman_matchplay`, `gruesome_matchplay` |
| All exhaustive `Record<CupSessionFormat, …>` maps updated | PASS | 4 maps found: `cupPairing.ts:41` `FORMAT_LABEL`, `GenerateMatchesWizard.tsx:272` Step3, `GenerateMatchesWizard.tsx:490` Step4, `GenerateMatchesWizard.tsx:625` Step5 — all 6 keys present in every map |
| `<select>` options updated | PASS | `GenerateMatchesWizard.tsx:388-393` custom-session select has all 6 options |
| `cupMatchModeConfig` routes allowances correctly | PASS | `actions.ts:44-71`: greensome→`greensomePct` (default 100), chapman→`chapmanPct` (default 100), gruesome→`gruesomePct` (default 50). Matches contract defaults and format definitions |
| SELECT query reads new allowance columns | PASS | `actions.ts:110`: SELECT includes `greensome_allowance_pct, chapman_allowance_pct, gruesome_allowance_pct` |
| Pairing reuses `playersPerSide === 2` path | PASS | `cupPairing.ts:54-56`: `playersPerSide()` returns 2 for any non-singles format — greensome/chapman/gruesome all get 2. No new algorithm added |
| CupSetup AllowanceFields for 3 new formats | PASS | `CupSetup.tsx:163-188`: all three `AllowanceField`s present with correct defaults (100/100/50) |
| `createTournamentDraft` parses + persists | PASS | `lib/cup/actions.ts:189-209`: parse helpers + redirect on invalid, insert includes all 3 columns |
| `updateTournament` parses + persists | PASS | `lib/cup/actions.ts:270-294`: identical parse chain + UPDATE includes all 3 columns |
| Step-3 0-matches message renders | PASS | `GenerateMatchesWizard.tsx:863-868`: `step3ValidationMsg` computed when `step === 3` and `total === 0`, returns `t('generate.step3ZeroMatchesMsg')`. Rendered L946-947 inside the navigation block when truthy |
| i18n: new keys in both locale files | PASS | `no.json:3906-3909` + `en.json:3906-3909`: `formatGreensome/Chapman/Gruesome` + `step3ZeroMatchesMsg` present in both files; allowance keys also present in `wizard.cupSetup` namespace (L479-490 both files) |
| Norwegian copy naturalness | PASS | No AI-tells detected; no em-dash chains; text reads idiomatic (e.g. «Valgt format krever minst 2 spillere per lag», «krevende variant av greensome») |
| Tests extended (`cupTemplates.test.ts`) | PASS | `cupTemplates.test.ts:22-31`: `it.each` covering `greensome_matchplay@4→2`, `@5→2`, `@1→0`, `chapman@4→2`, `@6→3`, `gruesome@4→2`, `@1→0` |
| Tests extended (`cupPairing.test.ts`) | PASS | `cupPairing.test.ts:109-133`: `it.each` for all 3 new formats asserting 2-per-side, label prefix match, all players used once |
| `npx tsc --noEmit` | PASS | Clean — no output |
| `npx vitest run lib/cup messages/catalogParity.test.ts` | PASS | 7 test files, 79 tests, all green |
| `npm run build` | PASS | Completed without errors |

---

## Gate outputs

```
tsc --noEmit:          (no output — clean)
vitest run lib/cup:    7 test files, 79 tests passed
npm run build:         All routes compiled, no errors
```

---

## Gaps / observations

None blocking. Two minor observations for awareness:

1. **`step3ValidationMsg` only fires when `total === 0`** — if the preset has sessions but the team size is 0 (both teams empty), `getSessionPlan()` returns sessions with `matchCount 0`, `total` is 0, and the message fires correctly. The `overCap` branch (total > matchCap) correctly falls through to `null` since the Banner already explains that case. Logic is sound.

2. **`canAdvance()` check at step 3 also covers the overcap case** (`return false` when `total > matchCap`) but `step3ValidationMsg` returns `null` there — deliberately, per the code comment "overCap already shown by Banner". This is correct behaviour, not a gap.

3. The `gruesome_matchplay` default of 50 in `cupMatchModeConfig` (line 64, the else-branch fallback) is correct and matches the named constant `DEFAULT_GRUESOME_ALLOWANCE = 50`. The chained ternary is complete — no format falls through incorrectly.

---

**Summary bullets:**

- All 4 `Record<CupSessionFormat, …>` maps (3 in wizard + 1 in pairing) were widened to 6 entries; TypeScript confirmed complete via clean `tsc --noEmit`.
- Pairing genuinely reuses the existing `playersPerSide === 2` code path — no new algorithm; greensome/chapman/gruesome simply aren't singles, so they automatically get 2-per-side.
- Allowance defaults are correct per format: greensome=100, chapman=100, gruesome=50 — consistent across `CupSetup.tsx`, `lib/cup/actions.ts` parse helpers, and `actions.ts` generator defaults.
- The 0-matches message fires on `step === 3` when `total === 0` and renders in the navigation block, replacing the silent grey button.
- All gate checks (tsc, vitest ×79, build) pass clean.
