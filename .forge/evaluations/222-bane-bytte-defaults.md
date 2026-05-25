# Evaluation — #222 Bane-bytte beholder M/D/J auto-default

**Contract:** `Forge-kontrakt tilgjengelig` posted on issue [#222](https://github.com/jdlarssen/golf-app/issues/222)
**Commit evaluated:** `3f5cd53` on branch `claude/admiring-grothendieck-1a0b84`
**Evaluated:** 2026-05-25
**Verdict:** **ACCEPT**

## Summary

Implementation matches the contract's Design section verbatim:

- `deriveDefaultGenders(players: PlayerOption[])` extracted as an exported helper in [`app/admin/games/new/useGameFormState.ts:86-94`](app/admin/games/new/useGameFormState.ts#L86) (with the Norwegian comment explaining its dual use at mount + bane-bytte).
- Mount initializer at [`useGameFormState.ts:138-140`](app/admin/games/new/useGameFormState.ts#L138) collapses the prior inline loop to `initialValues?.player_genders ?? deriveDefaultGenders(players)` — `initialValues.player_genders` still wins, preserving edit-flow semantics.
- `setCourseId` at [`useGameFormState.ts:222-226`](app/admin/games/new/useGameFormState.ts#L222) now calls `setPlayerGenders(deriveDefaultGenders(players))` instead of `setPlayerGenders({})`. `setTeeBoxId('')` remains (tee is course-specific). Comment block above the function updated to explain the new behavior.

No scope creep, no out-of-scope work, all gates green.

## Per-Criterion Verification

| # | Success Criterion | Pass/Fail | Evidence |
|---|---|---|---|
| 1 | Bane-bytte preserves M/D/J defaults from profile | PASS | New test `useGameFormState — playerGenders ved bane-bytte (regresjon fra #92) > beholder profil-deriverte D/J-defaultene når banen byttes` at [`useGameFormState.test.ts:71-104`](app/admin/games/new/useGameFormState.test.ts#L71). Mounts with `p-dame` (ladies), `p-junior` (junior), `p-mann` (mens), verifies `{ 'p-mann': 'M', 'p-dame': 'D', 'p-junior': 'J' }` after `setCourseId('course-a')` AND after `setCourseId('course-b')` — would have been all `'M'` pre-fix. |
| 2 | Mount-behavior unchanged — `initialValues.player_genders` wins | PASS | New test `useGameFormState — initialValues.player_genders vinner ved mount > bruker initialValues.player_genders i stedet for derive ved mount` at [`useGameFormState.test.ts:135-150`](app/admin/games/new/useGameFormState.test.ts#L135). Passes inverted `{ 'p-mann': 'D', 'p-dame': 'J', 'p-junior': 'M' }` (deliberately opposite of profile derive) and asserts hook state equals the override. Catches any regression where derive would clobber initialValues. |
| 3 | New vitest case that simulates bane-bytte and verifies playerGenders not collapsed | PASS | See criterion 1 evidence. Additionally: `nullstiller tee_box_id ved bane-bytte (uendret oppførsel)` ([`useGameFormState.test.ts:106-119`](app/admin/games/new/useGameFormState.test.ts#L106)) confirms `tee_box_id` reset is still in effect, and `re-deriver også når banen deselectes (tomt course-id)` ([`useGameFormState.test.ts:121-133`](app/admin/games/new/useGameFormState.test.ts#L121)) covers the "tomt course-id" edge-case explicitly called out in the contract's Edge Cases section. |

## Per-Gate Verification

| Gate | Command | Exit | Output |
|---|---|---|---|
| TypeScript | `npx tsc --noEmit` | 0 | No diagnostics (silent success) |
| Vitest — admin/games/new | `npx vitest run app/admin/games/new/` | 0 | `Test Files  6 passed (6) / Tests  79 passed (79)` — baseline was 73 per contract, +6 new = 79. Confirmed. |
| Vitest — playerGenderDefault | `npx vitest run lib/games/playerGenderDefault.test.ts` | 0 | `Test Files  1 passed (1) / Tests  8 passed (8)` |
| ESLint | `npx eslint app/admin/games/new/useGameFormState.ts app/admin/games/new/useGameFormState.test.ts` | 0 | No errors (silent success) |
| Pre-commit hook | (commit landed, so hook passed) | 0 | No humanizer warnings on commit; tagline checked manually below. |

### Regression-catch sanity check

I also verified that the new tests *would* have caught the bug by checking out the pre-fix source while keeping the new test file in place:

```
git checkout 3f5cd53^ -- app/admin/games/new/
# (then re-run vitest)
Test Files  1 failed | 5 passed (6)
Tests  4 failed | 75 passed (79)
```

The 4 failing tests are exactly the new bane-bytte regression tests — confirming the test suite is load-bearing, not vacuous. Restored to `3f5cd53` state before continuing.

## Scope-Creep Check

Files touched in `3f5cd53`:
- `app/admin/games/new/useGameFormState.ts` — in contract
- `app/admin/games/new/useGameFormState.test.ts` (new) — explicitly named as an option in contract ("ELLER ny `app/admin/games/new/useGameFormState.test.ts`")
- `CHANGELOG.md` — in contract
- `package.json` — in contract (PATCH bump)
- `package-lock.json` — implicit byproduct of `npm version patch`, allowed per CLAUDE.md version-bump discipline

**No scope creep.** Implementation stayed within the contract's "Files Likely Touched" list. The `deriveDefaultGenders` helper is `export`ed (not just a local function as the contract suggested as one option) — this is well within Claude's Discretion clause and is the right call since the test file imports it directly to test it in isolation.

## CHANGELOG Tagline Review

> «Når du bytter bane mens du setter opp et spill, beholdes nå dame- og junior-merkene på spillerne du har valgt. Tidligere måtte du klikke dem inn igjen.»

Checked against CLAUDE.md `### Språk-kvalitet i bruker-rettet copy`:

- No "X-spillet"-redundancy (e.g., "spillet"-doubled)
- No "vennligst", no "Tap"-anglism
- No em-dash chains (single em-dash usage acceptable; here there is none)
- No anglicisms (`feature/release/entry/by default`) — uses native Norwegian throughout
- No curly quotes — uses guillemets-compatible plain text
- No "markerer/representerer/spennings-moment"-puffery
- Active voice ("beholdes nå", "måtte du klikke") not passive abstraction
- Concrete user-observable behavior ("dame- og junior-merkene", "klikke dem inn igjen") — Jørgen can map this to the toggles he sees in the wizard

Maps to a real behavior change: pre-fix, switching courses collapsed M/D/J toggles to all-`'M'`; post-fix, the profile-derived defaults survive bane-bytte. User-observable, action-orientert, idiomatic. Clean.

## Other Notes

- Commit message follows conventional commits, includes `Closes #222`, and explains the why (pre-#92 vs. post-#92 semantic shift) in the body. Good audit trail.
- The new `deriveDefaultGenders` is `export`ed — fine for test isolation and future reuse. Doesn't violate any prior decision.
- `tee_box_id` reset preserved as required.
- Edge cases from the contract (tomt course-id, edit-flyten precedence) are exercised by tests.

## Verdict

**ACCEPT.** All gates green, all success criteria verified by both reading the diff and running the regression-catch sanity check. No scope creep. CHANGELOG tagline maps cleanly to user-observable behavior and is free of AI-tells.

Ready to push branch + open PR + close issue (task #6 in the in-session todo list).
