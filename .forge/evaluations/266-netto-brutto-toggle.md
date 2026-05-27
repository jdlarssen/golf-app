# Evaluation: #266 Netto/brutto-toggle på tvers av alle wizards

**Branch:** claude/stoic-vaughan-576685
**Contract:** .forge/contracts/266-netto-brutto-toggle.md
**Verdict:** ACCEPT
**Evaluator:** general-purpose, Opus, fresh context
**Date:** 2026-05-27

## Criterion-by-criterion

### 1. Migration `0046_drop_netto_suffix.sql` exists and is syntactically correct
**PASS.** `supabase/migrations/0046_drop_netto_suffix.sql` exists. Wraps drop-update-recreate in `begin;` / `commit;` (atomic). Constraint recreated with new set: `best_ball`, `stableford`, `singles_matchplay`, `solo_strokeplay`, `texas_scramble`, `fourball_matchplay`. Backfill UPDATEs both old keys. Application to live Supabase is intentionally deferred to ship-time (per evaluator instructions).

### 2. No remaining `best_ball_netto` / `solo_strokeplay_netto` / `FourballAllowanceField` / `bestBallNetto` / `soloStrokeplayNetto` references in app/lib/components
**PASS.** `grep -rln` against `app lib components` (excluding `.git`/`node_modules`) returns exactly one hit:
- `components/admin/AllowanceField.tsx:8` — JSDoc history-note (`Generalisert fra FourballAllowanceField (#217)...`). This is the only allowed reference per evaluator instructions.

Historical migrations (`0030_game_modes.sql`, `0031_solo_visibility_rls.sql`, `0033_texas_scramble.sql`, `0045_fourball_matchplay.sql`) still mention old keys — correctly untouched per contract.

### 3. `<AllowanceField>` component has parameterized props
**PASS.** `components/admin/AllowanceField.tsx` has all expected props: `fieldName`, `defaultPct`, `legend`, `description`, `nettoHelperText`, `bruttoHelperText`, `inputLabel`, `initialPct`, `value`, `onChange`, `hideHiddenInput`. Controlled/uncontrolled hybrid is preserved. `lastNettoPct`-memo is intact (lines 109-129). `radioGroupName` is derived from `fieldName` so multiple instances coexist without `name`-collision.

### 4. `<AllowanceField>` rendered in Section 3 for all 6 modes (both GameForm and GameWizard)

**PASS.** Verified per file:

**`app/admin/games/new/GameForm.tsx`:**
- L343-355: `fourball_matchplay` → `fourball_allowance_pct`, default 85, `hideHiddenInput`
- L360-374: `best_ball | stableford | singles_matchplay | solo_strokeplay` → `hcp_allowance_pct`, default 100 (no `hideHiddenInput` — toggle emits own hidden input in GameForm path)
- L382-402: `texas_scramble` → `texas_team_handicap_pct`, default `texasHandicapPct`, with `key={teamSize}` remount + sibling hidden `hcp_allowance_pct=100`

**`app/admin/games/new/GameWizard.tsx`:**
- L306-318: `fourball_matchplay` → `fourball_allowance_pct`, default 85, `hideHiddenInput`
- L323-338: `best_ball | stableford | singles_matchplay | solo_strokeplay` → `hcp_allowance_pct`, default 100, `hideHiddenInput`
- L344-362: `texas_scramble` → `texas_team_handicap_pct`, with `key={state.teamSize}`, `hideHiddenInput`

All 6 mode keys × 2 wizards = 12 mount paths verified.

### 5. `AdvancedSettingsSection.tsx` has no allowance-input code
**PASS.** `grep -n "allowance\|hcp_allowance\|texas_team_handicap"` returns only one hit at line 9 — a JSDoc comment explicitly noting the migration. No input/UI code remains for allowance. File now contains only peer-approval + visibility radios + sideturnering fieldset.

### 6. `components/cup/FourballAllowanceField.tsx` is deleted
**PASS.** `find . -name 'FourballAllowanceField*'` returns no results. The file is gone from the working tree (deleted in commit `82f89ff`). Per CHANGELOG, the empty `components/cup/` directory was also removed.

### 7. Texas-specific edge cases
**PASS.**
- Texas in GameForm.tsx L385 and GameWizard.tsx L346 both use `fieldName="texas_team_handicap_pct"` with `key={teamSize}` / `key={state.teamSize}`.
- Defaults: `useGameFormState.ts:187-195` sets `texasHandicapPct` via `defaultTexasHandicapPct(teamSize)` (25 for 2-mann, 10 for 4-mann per NGF). Switching team-size while in texas mode triggers `setTexasHandicapPct(defaultTexasHandicapPct(next))` (L300-302).
- DB NOT NULL satisfied: GameForm L400 renders explicit `<input type="hidden" name="hcp_allowance_pct" value="100" />` for texas. GameWizard L514 emits `hcp_allowance_pct` from state (defaults to 100; user could theoretically change it before switching to texas, but server-validator accepts any 0..100, so no breakage).

### 8. Type consistency: `hcpAllowance` and `texasHandicapPct` as `number`
**PASS.**
- `useGameFormState.ts:174` declares `hcpAllowance` as `useState<number>(...)`, line 187 same for `texasHandicapPct`.
- All call-sites in `GameForm.tsx` (L371-372) and `GameWizard.tsx` (L334-335, 358-359) pass them through to `AllowanceField`'s `value`/`onChange` (typed `number` / `(pct: number) => void`).
- Boundary wraps: `GameWizard.tsx:231` wraps `String(state.hcpAllowance)` for `InitialValues.hcp_allowance_pct` (string-typed contract); L242 wraps `String(state.texasHandicapPct)`; L493 and L514 wrap `String(...)` for HTML hidden-input `value`.
- Validators in `gamePayload.ts:865-870` parse from FormData strings via `Number(...)` → `Number.isInteger` range-check, so receiving stringified numbers is correct.

### 9. AllowanceField tests
**PASS.** 7 tests in `components/admin/AllowanceField.test.tsx`:
1. `initialPct=0 → renderes i brutto-modus, hidden field = "0"`
2. `initialPct=85 → renderes i netto-modus, hidden field = "85"`
3. `default (ingen initialPct) → bruker defaultPct og starter i netto`
4. `klikker brutto → input forsvinner, hidden field = "0"`
5. `lastNettoPct-memo: bytte til brutto og tilbake gjenoppretter pct`
6. `controlled mode kaller onChange ved klikk, hidden input droppet med hideHiddenInput`
7. `fieldName parametriserer hidden-felt-navnet`

Covers init state per `initialPct`, toggle transitions, `lastNettoPct` memo, controlled-mode `onChange`, `hideHiddenInput`, and `fieldName` parameterization. Solid coverage of the state machine.

### 10. `npm test` clean
**PASS.** Full suite: `129 files, 1549 tests, all passed.` Matches the expected baseline (1542 pre-existing + 7 new = 1549).

### 11. `npx tsc --noEmit` clean (modulo exempted pre-existing failures)
**PASS.** All typecheck errors are confined to the 4 exempted test files:
- `app/admin/games/[id]/signups/actions.test.ts`
- `app/games/[id]/withdrawActions.test.ts`
- `app/signup/[shortId]/actions.test.ts`
- `app/signup/[shortId]/teamActions.test.ts`

Filtering these out: zero typecheck errors.

### 12. `npm run lint` clean
**PASS.** 0 errors, 9 warnings — all warnings are pre-existing `_gameId` unused-var warnings in leaderboard view components unrelated to this PR.

### 13. CHANGELOG entry
**PASS.**
- `## 1.39.y — Netto/brutto-bryter på tvers av alle spillmodi` opens at L13 (new fresh series, open).
- `## 1.38.y — Four-ball matchplay (Ryder Cup fase 2)` at L42 is wrapped in `<details>` (L44-71) per discipline.
- Tagline at L19 is action-oriented Norwegian, explains the user-visible change ("Du kan nå spille brutto..."), no AI-tells, no anglisismer.
- Technical section has Added / Changed / Removed bullets with file-link references.

### 14. `package.json` version bump
**PASS.** `"version": "1.39.0"` (was 1.38.0). Minor bump appropriate for new user-facing feature.

## Findings

### Must-fix (blocks ACCEPT)
- None.

### Should-fix (could be follow-up issue)
- None observed. The implementation matches the contract spec faithfully across all surfaces.

### Nits (cosmetic)
- `GameForm.tsx:400` renders `<input type="hidden" name="hcp_allowance_pct" value="100" />` as a sibling inside the `isTexas && (...)` fragment, while `GameWizard.tsx` relies on the generic `hcpAllowance` state being 100 by default. The two paths are functionally equivalent (validators accept any 0..100), but the GameWizard path has a theoretical edge where a user toggles `hcpAllowance` to non-100, then switches to texas, and ships `hcp_allowance_pct != 100`. The server doesn't care (it's just `NOT NULL`), and `mode_config.team_handicap_pct` carries the real value — so no actual bug, just a minor inconsistency between the two wizard paths. Not worth a fix in this PR.

## Verdict

**ACCEPT** — the build delivers every promised criterion in the contract: the mode-rename is complete across ~50 files with a clean migration, the generalized AllowanceField has the exact prop-shape specified, all 6 modes get toggles in Section 3 of both GameForm and GameWizard with correct fieldName/defaultPct/key-remount semantics, Section 6 is stripped clean, FourballAllowanceField is deleted with all callers migrated, the type-shape change to `number` is consistent end-to-end, all 1549 tests pass including 7 new AllowanceField tests, lint and typecheck are clean modulo exempted pre-existing failures, and the CHANGELOG follows the established stakeholder-tagline + technical-details + minor-series-collapse discipline.
