# Evaluation: 907-atomic-roster-swap

**Verdict: ACCEPT**

Evaluated: 2026-06-23
Branch: `claude/dazzling-robinson-946c3d`
Commit: `9a882f91`

---

## Gate Results

| Gate | Result | Evidence |
|------|--------|----------|
| `npx tsc --noEmit` | PASS (exit 0) | No errors emitted |
| `npx eslint "…/actions.ts" "…/actions.test.ts"` | PASS (exit 0) | 1 warning only: complexity 32 on `updateGameInternal` — pre-existing, known-acceptable per contract. No new errors. |
| `npx vitest run "…/actions.test.ts"` | PASS (11/11) | 9 pre-existing + 2 new rollback tests, all green |

---

## Per-Criterion Table

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | `select('*')` for snapshot; `priorRosterIds` derived from same query (no second round-trip) | PASS | `actions.ts:219` `.select('*')`, `.returns<Tables<'game_players'>[]>()` resolves at `:221`; `:222` `priorRosterRows = priorRoster ?? []`; `:223` `priorRosterIds = new Set(priorRosterRows.map(...))`. Single round-trip, no second query. |
| 2 | On `insertError`: snapshot re-inserted before redirect; rollback failure logged (not silently swallowed); redirect still `?error=db_players` | PASS | `actions.ts:264–275`. Guard at `:264`; `supabase.from('game_players').insert(priorRosterRows)` at `:267`; `rollbackError` logged at `:269–273`; `redirect({href: \`${editBase}?error=db_players\`})` at `:275` (always reached, after both rollback branches). |
| 3 | Rollback only fires when `priorRosterRows.length > 0` | PASS | `actions.ts:264` `if (priorRosterRows.length > 0)` wraps the entire rollback block. |
| 4 | Existing tests (mode-lock, notify-diff, creator-gate) still pass unchanged | PASS | All 9 pre-existing tests pass. `priorRosterIds` still derived from `.map(r => r.user_id)` (`:223`); snapshot widening is backward compatible — the `.user_id` field is present on `Tables<'game_players'>` rows and the mock returns objects with `user_id`. No existing test behaviour changed. |
| 5 | New tests genuinely exercise rollback; would fail without rollback code | PASS | Test 1 (`actions.test.ts:408`): asserts `expect(inserts).toHaveLength(2)` and `expect(inserts[1]!.args[0]).toEqual(priorRows)`. Without rollback, only 1 `game_players.insert` call would be recorded → `toHaveLength(2)` fails; `inserts[1]` is `undefined` → `.args[0]` throws. Test 2 (`actions.test.ts:473`): also asserts `toHaveLength(2)` — same failure mode without rollback. Both tests are falsifiable. |
| 6 | Snapshot typed `Tables<'game_players'>[]` | PASS | `actions.ts:14` `import type { Tables } from '@/lib/database.types'`; `:221` `.returns<Tables<'game_players'>[]>()`. The `insert(priorRosterRows)` call at `:267` typechecks against the live schema type (confirmed by `tsc --noEmit` exit 0). |
| 7 | Bump 1.140.7 in `package.json` + CHANGELOG `[1.140.7] · #907` nested under open `## 1.140.y` theme, in same commit as code | PASS | `package.json` `"version": "1.140.7"`. `CHANGELOG.md:24` `### [1.140.7] - 2026-06-23 · #907` sits at depth 3 under `## 1.140.y — Tall på flisene` (line 20) — correct nesting, no new theme/minor opened. `git show --stat HEAD` shows all five files (`actions.ts`, `actions.test.ts`, `CHANGELOG.md`, `package.json`, `package-lock.json`) in a single commit (`9a882f91`). |

---

## Notes

- The `redirect()` at line 275 is unconditionally after the rollback block (not inside either `if (rollbackError)` branch), so both double-failure and single-failure paths always redirect to `db_players`. This is correct.
- The second test does not assert `notifyInvitedToGameMock` was not called — it doesn't need to, since the redirect is asserted and the mock-queue would have no entry for a notify call anyway. Minor gap but not a failing criterion.
- No staging round-trip performed (contract explicitly deems it low value for this error path).
