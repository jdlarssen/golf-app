# Evaluation: #727 — ACCEPT

Pure refactor (#727, follow-up to #712): route lower-risk cup/liga UPDATE-by-id
mutations through `expectAffected` so a silent 0-row write becomes an explicit
failure. Verified independently against the contract on branch
`claude/vigorous-williams-1b3864`. Every acceptance criterion passes.

## Per-criterion verdict

| # | Criterion | Verdict | Evidence |
|---|-----------|---------|----------|
| 1 | Area 1 (cup): `updateTournament` / `startTournament` / `finishTournament` route UPDATE through `expectAffected` + `.select('id')`; 0-row/error hits existing redirect; happy path unchanged | **PASS** | `lib/cup/actions.ts:301-322` (update), `:359-370` (start), `:447-462` (finish). Each `expectAffected(... .eq('id', id).select('id'), 'context')` is inside `try`; catch logs + does the **error** redirect; the **success** redirect (`?status=updated/started/finished`) is OUTSIDE the try (`:327`, `:418`, `:480+`). Import at `:7`. |
| 2 | Area 2 (league): `updateLeagueRound` / `addLeagueRound` / `overrideRoundWindow` / `startLeague` / `setLeagueStatus` route mutation through `expectAffected` + `.select('id')`; 0-row/error returns existing error code; happy path unchanged | **PASS** | `lib/league/actions.ts:258-266` (updateLeagueRound, inside `if patch>0`, returns `update_failed`), `:314-324` (addLeagueRound insert, `insert_failed`), `:358-366` (overrideRoundWindow, `update_failed`), `:506-514` (setLeagueStatus, `status_failed`), `:536-548` (startLeague, `status_failed`). All chain `.select('id')`; catch returns same code the old `if (error)` returned. `finishLeague` (`:554-558`) routes through `setLeagueStatus` → covered. Import at `:6`. |
| 3 | Area 3: `maybeAutoConfirmLeagueParticipation` routes through `expectAffected`; real errors logged, `NoRowsAffectedError` swallowed as idempotent no-op | **PASS** | `lib/league/confirmLeagueParticipation.ts:22-31` chains `.select('user_id')` and keeps `.is('accepted_at', null)`. Catch `:32-35`: `if (!(e instanceof NoRowsAffectedError)) console.error(...)`. `NoRowsAffectedError` extends `Error` with `Object.setPrototypeOf` (`affectedRows.ts:29`) so `instanceof` is reliable. Imports both symbols at `:2`. |
| 4 | One Type-A 0-row test added for a league path; green | **PASS** | `lib/league/actions.test.ts:155-185` (`updateLeagueRound — 0-row update is a failure (#727)`). Queues `{ data: [] }` for the update-select, asserts `{ error: 'update_failed' }`, AND asserts `.select()` was chained. Uses shared `buildSupabaseMock` — no copy-pasted mocks. Meaningful (see Skeptic's findings). |
| 5 | `npx tsc --noEmit` clean | **PASS** | `TSC_EXIT=0`. |
| 6 | `npx vitest run lib/cup lib/league lib/supabase/affectedRows.test.ts` green | **PASS** | 14 files / 157 tests passed, 0 failed, 1.49s. |
| 7 | No version bump; one `refactor(...)` commit per area with `Refs #727` | **PASS** | Three-dot stat for `package.json` / `package-lock.json` / `CHANGELOG.md` is EMPTY. Commits: `e96dfda refactor(cup): …` (Area 1), `7ebaee5 refactor(league): …` (Area 2 + test), `d4fcd4f refactor(league): … auto-confirm` (Area 3), plus `968bf79 docs(forge): contract`. All carry `Refs #727`. |

## Gate output

```
$ npx tsc --noEmit
TSC_EXIT=0

$ npx vitest run lib/cup lib/league lib/supabase/affectedRows.test.ts
 Test Files  14 passed (14)
      Tests  157 passed (157)
   Duration  1.49s

$ git diff origin/main...HEAD --stat -- package.json package-lock.json CHANGELOG.md
(empty — no version bump)
```

## Skeptic's findings (probed, even where it passed)

1. **Redirect-in-catch trap (cup) — CLEAN.** Verified all three cup actions: the
   success redirect is reached only when `expectAffected` does NOT throw, and it
   sits AFTER the `try/catch` block, not inside it. A catch around the success
   redirect would have swallowed `NEXT_REDIRECT` and sent a successful save to the
   error page — that does not happen here. The catch's own `redirect()` throws
   `NEXT_REDIRECT` which propagates out (not re-caught). Happy path is behaviorally
   identical to before.

2. **`.select()` actually chained everywhere — CLEAN.** Every retrofit chains
   `.select('id')` (or `.select('user_id')` in Area 3). Without it, PostgREST
   returns `data: null` and `expectAffected` would throw on EVERY call, breaking
   the happy path. Grepped all 9 call sites; all present.

3. **`confirmLeagueParticipation` idempotent handling — CLEAN.** This is the
   highest-risk trap: it runs on every liga-page load with `.is('accepted_at',
   null)`, so 0 rows is the steady state once the player is confirmed. The catch
   correctly swallows `NoRowsAffectedError` silently and only `console.error`s
   OTHER errors. No log-spam-on-every-page-load defect. The `.is()` filter is
   preserved, so the idempotent reasoning still holds.

4. **Completeness — CLEAN.** All 9 contract-scoped sites retrofitted (3 cup + 5
   league + 1 confirm). Out-of-scope confirmed correctly excluded:
   - `deleteTournament` / `deleteLeague` / `removeLeaguePlayer` are DELETEs
     (idempotent) — untouched.
   - `createTournamentDraft` / `createLeagueDraft` already use
     `.select('id').single()` with `if (error || !data)` guards
     (`lib/cup/actions.ts:236-242`) — already hardened, correctly not in scope.
   - `updateLeagueSettings` does not exist anywhere (`grep -rn` empty) — matches
     contract's documented note.

5. **Test is meaningful, not vacuous — VERIFIED.** Traced the queue ordering
   against the real `updateLeagueRound` path:
   `requireAdminOrClubAdminOfLeague` reads `leagues.group_id` via the admin client
   (`adminMock` → `{ group_id: null }`), delegates to `requireAdmin` which reads
   `users.is_admin` via the server client (`supabaseMock` 1st entry), then the
   update-select pops the 2nd entry `{ data: [] }`. If the retrofit were reverted
   to `const { error } = await ...; if (error) return ...`, the awaited update
   resolves to `{ data: [], error: undefined }`, `if (error)` is falsy, and the
   action falls through to `return { error: '' }` — so the test's
   `.toEqual({ error: 'update_failed' })` assertion would FAIL. The test genuinely
   exercises the new throw→error-code path, and additionally asserts `.select()`
   was chained.

6. **No frontend / no browser verification needed — CONFIRMED.** All four changed
   source/test files are under `lib/` (`'use server'` actions + a pure helper +
   a unit test). No `.tsx`/route/component touched, so no Playwright/Chrome check
   applies. Contract stated this explicitly.

7. **Helper semantics double-checked.** `expectAffected` throws plain `Error` on
   `result.error` and `NoRowsAffectedError` on null/empty data
   (`affectedRows.ts:53-65`). The cup catches treat both identically (redirect to
   error), which is correct — both are failures for a by-PK status flip. Only
   Area 3 needs to distinguish them, and it does.

## Conclusion

Every acceptance criterion passes with independent evidence. The two named
high-risk traps (redirect-in-catch, idempotent confirm) are correctly handled,
`.select()` is chained on all 9 sites, the regression test is non-vacuous, both
gates are green, and there is no version bump. **ACCEPT.**
