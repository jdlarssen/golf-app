# Evaluation: #715 — registration_mode derivation

## Verdict: ACCEPT

A clean, minimal refactor that replaces a `setState`-in-effect with a derived value.
All three gates pass, all 7 acceptance criteria independently re-verified, and the
behavior-preservation contract holds under a full reader audit. No scope creep.

## Gate results

### Gate 1 — co-located hook test (PASS)
```
$ npx vitest run "app/[locale]/admin/games/new/useGameFormState.test.ts"

 Test Files  1 passed (1)
      Tests  35 passed (35)
   Duration  784ms
```

### Gate 2 — eslint on the changed file (PASS)
```
$ npx eslint "app/[locale]/admin/games/new/useGameFormState.ts"
EXIT: 0
```
(No output, exit 0 = clean. No `react-hooks/set-state-in-effect`, no unused-import.)

### Gate 3 — typecheck (PASS)
```
$ npm run typecheck
> torny@1.133.16 typecheck
> tsc --noEmit
EXIT: 0
```
(Empty error output, exit 0 = whole-project tsc clean. Confirms the hook's return-shape
is unchanged for every consumer.)

## Criteria

### AC1 — Effect removed — PASS
`grep -n "useEffect" useGameFormState.ts` → `NONE`. The import on line 3 changed from
`{ useCallback, useEffect, useMemo, useState }` to `{ useCallback, useMemo, useState }`
(verified in `git show 5dcc486b`). `grep -n "eslint-disable"` → `NONE` — only a prose
comment (lines 507–513) names the rule, which does not affect eslint.

### AC2 — Derived effective mode — PASS
`useGameFormState.ts:514-516`:
```ts
const registrationMode: RegistrationMode = isClubScoped
  ? 'invite_only'
  : registrationModeChoice;
```
Raw choice held in `registrationModeChoice` state (`:471`), set by `setRegistrationMode`.
The return object (`:1589-1590`) still exposes `registrationMode` + `setRegistrationMode`
— return shape unchanged.

### AC3 — Club locks payload regardless of prior choice — PASS
Both #643 tests are green under the derived implementation:
- Test 1 (`:419-437`): `setRegistrationMode('open')` → `registrationMode === 'open'`, then
  `setGroupId('club-1')` → `registrationMode === 'invite_only'`.
- Test 2 (`:439-453`): pre-filled `group_id: 'club-1'` + `registration_mode: 'open'` at
  mount → `registrationMode === 'invite_only'`.

### AC4 — Non-club preserves choice — PASS
Test 3 (`:455-465`): `setRegistrationMode('open')` with no club → `registrationMode === 'open'`,
`isClubScoped === false`.

### AC5 — Lint green — PASS
See Gate 2. Exit 0, no findings.

### AC6 — Typecheck green — PASS
See Gate 3. `tsc --noEmit` exit 0 over the whole project.

### AC7 — Consumers untouched — PASS
`git show 5dcc486b --stat` → only `useGameFormState.ts` changed (14 insertions, 12
deletions, 1 file). `git status --short` → only the contract doc (`.forge/contracts/...`)
is modified in the working tree; the code change is committed. `GameForm.tsx`,
`GameWizard.tsx`, `RegistrationSection.tsx` are not in the diff.

## Skeptical probes

**Reader audit (behavior-preservation).** Grepped every reference to
`registrationMode` / `registration_mode` across `app/[locale]/admin/games/new/`, `lib/`,
`components/`. Every consumer of the hook reads the DERIVED value:
- `GameForm.tsx:368` hidden input `value={state.registrationMode}` ✓
- `GameWizard.tsx:1006` hidden input `value={registrationMode}` ✓
- `GameWizard.tsx:421` passthrough `registration_mode: state.registrationMode` ✓
- `useGameFormState.ts:526` `playersStepOptional = registrationMode !== 'invite_only'` ✓
- `RegistrationSection.tsx:119/139/214` radios `checked={registrationMode === mode}` ✓

The other `registration_mode` hits (`getDiscoverableGames.ts`, `getGameByShortId.ts`,
`gamePayload.ts`, `database.types.ts`, `actions.ts`) read the persisted DB value or
form-data — not the hook — exactly as the contract claims. **No reader needs the raw
admin choice.** Confirmed: nothing destructures `registrationModeChoice` anywhere
(`grep` returns only the 3 internal lines in `useGameFormState.ts`).

**Radio round-trip (the riskiest case).** For a club game in the full-form path,
`RegistrationSection` still calls `setRegistrationMode(mode)` on change — that now
mutates `registrationModeChoice` (raw), while the radio reads `checked={registrationMode === mode}`,
which re-derives to `'invite_only'` because `isClubScoped` is true. So clicking "open"
on a club game leaves the radio visually locked to invite_only — identical to the old
effect's snap-back, minus the extra render flash. The setter export name is unchanged,
so the round-trip wiring in RegistrationSection (`:62`, `:120`) needs no change. ✓

**Removed-effect dependency.** Nothing depended on the STATE physically mutating —
the only thing the effect did was overwrite the raw value to `'invite_only'`; that
overwrite is now expressed as a pure derivation at read time. The controlled radio's
`onChange` still fires `setRegistrationMode`; it just writes the raw slot instead of the
effective one. No consumer broke.

**Ordering / TDZ.** Declaration order is safe: `registrationModeChoice` at `:471` →
`isClubScoped` at `:506` → derived `registrationMode` at `:514` → first downstream use
(`playersStepOptional`) at `:526` and return at `:1589`. No code between `:471` and `:514`
references the old `registrationMode` name. No temporal-dead-zone hazard.

**Churn.** `--stat` confirms a single source file changed (+14/−12). No consumer file
touched — matches the contract's "no consumer churn" claim exactly.

**Scope creep / gold-plating.** None. No new export, no `effectiveRegistrationMode`
field, no extra tests added (correctly — the accepted non-destructive detach-restore
side-effect is documented in the contract as in-scope and intentionally not test-locked
to avoid a "while I was here" test). The commit is a single atomic `refactor(...)` with
no version bump and no CHANGELOG entry, which is correct for a no-user-visible-change
refactor.

**UI verification note.** This is a logic hook with no rendered-output change; all 7 ACs
are code/test/lint/typecheck criteria and the contract has zero UI criteria. Playwright /
browser verification is NOT applicable here — the co-located Type A hook tests
(`useGameFormState.test.ts`, 35 passing) are the correct and sufficient verification level.

## Findings

None. The refactor is behavior-preserving, minimal, and all gates and criteria pass under
independent re-verification.
