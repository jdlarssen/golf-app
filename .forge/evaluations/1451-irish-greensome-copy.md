# Evaluation: Irish greensome-variant-copy i cup-oppsettet (#1451)

Commit under evaluation: `971ea755` (HEAD, clean tree). Evaluated 2026-08-07 by fresh-context skeptical evaluator.

## Success Criteria

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | `cup.generate.irishGreensomeHint` in both locales, "irish" in both strings | PASS | Parsed both JSON files with node (not grep): `no.cup.generate.irishGreensomeHint` and `en.cup.generate.irishGreensomeHint` both present as strings; `/irish/i` matches both. |
| 2 | Hint renders once in step-4 bundle editor, above flight list, not per flight | PASS | `GenerateMatchesWizard.tsx:1242-1244` — the `<p data-testid="cup-wizard-irish-hint">` sits inside `Step4BundlePreview`'s root `<div data-testid="cup-wizard-step4-bundle">` (line 1227), after the heading/regenerate row (1228-1237) and before `flights.map(...)` (1247). One occurrence in file. |
| 3 | `GenerateMatchesWizard.test.tsx` unchanged AND green | PASS | Commit stat lists 6 files, no test file. `npx vitest run` on Node v22.23.0: 1 file, 5/5 tests passed (1.06s). |
| 4 | Patch bump + CHANGELOG line | PASS | `git show 971ea755^:package.json` = 1.218.5 → HEAD = 1.218.6 (exactly one patch; package-lock.json bumped in both spots). CHANGELOG line 1396: `1.218.6 · #1451` Feilrettinger entry; August section summary incremented 15 → 16 rettinger. |
| 5 | Staging verification | DEFERRED | Per orchestrator instruction: handled at PR stage. Not counted as failure. VERIFICATION GAP until the staging click-through runs. |

## Gates

| Gate | Result |
|---|---|
| `npx vitest run "app/[locale]/admin/cup/[id]/generer/GenerateMatchesWizard.test.tsx"` | PASS — 5/5 (Node 22) |
| `npm run build` | PASS — exit 0 |
| `npm run lint` | PASS — 0 errors (57 pre-existing warnings, none in touched files) |

## Skeptic pass

- **Scope:** 6 files touched — exactly the contract's "Files Likely Touched" list (wizard, both locale files, package.json, package-lock.json, CHANGELOG.md). No drive-bys.
- **No leak into other presets:** `Step4BundlePreview` renders only under `step === 4 && isSplitDay` (line 1768), with `isSplitDay = presetId === 'splittet-cup-dag'` (line 1503). The non-split branch renders `Step4Preview`, which has no hint. The «tilpasset» preset never reaches the bundle component.
- **Golf-rule correctness:** Irish greensome = both tee off, each plays partner's ball for the second shot (swap), then the pair selects one ball and plays alternate shots. Both locale strings state exactly this sequence, plus the app-only-tracks-team-ball caveat. Correct.
- **Norwegian voice:** «Begge slår ut … spiller annenhver gang derfra» mirrors the sibling `formatGuide.content.greensome_matchplay.summary` verbatim phrasing; question-opener + «dere»-address matches helper-hint voice (`teamStrokesPrefillHint`). No AI-tells, no anglicism issues («irish» is the deliberate variant name per contract). Final wording deviates slightly from the contract draft («den samme som i vanlig greensome» vs «lik vanlig greensome») — within the contract's explicit Claude's Discretion.
- **Styling nit (non-blocking):** hint uses `text-xs text-muted`; `lineupHint` inside cards uses `text-[11px] text-muted`. Both muted helper text; the size difference fits its section-level placement. Cosmetic, no action needed.
- **i18n wiring:** component `t` is `useTranslations<'cup'>`, so `t('generate.irishGreensomeHint')` resolves to the added key in both locales. Keys added once (no duplicate-key shadowing).

## Verdict

All success criteria verifiable at this stage pass; all gates green; no scope creep; copy is idiomatic and rule-accurate. The only open item is the staging click-through, explicitly deferred to the PR stage by the orchestrator.

VERDICT: ACCEPT
