# Contract: #727 — Retrofit expectAffected into lower-risk cup/liga UPDATE-by-id paths

Follow-up to #712 (high-risk paths). Pure hardening per bug-prevention principle
#2 ("0-row write = failure, not success"). **No version bump** — `refactor(...)`
commits only.

## Branch
`claude/vigorous-williams-1b3864`

## Background
`lib/supabase/affectedRows.ts` provides `expectAffected` / `expectOne` to make a
silent 0-row write an explicit failure. #712 retrofitted the high-risk paths
(stuck-state). This issue covers the lower-risk cup/liga UPDATE-by-id paths that
#712 deferred: a 0-row there is a *cosmetic* miss (id-gated update after a
pre-flight fetch), not a stuck-state — but the hardening is cheap and uniform.

Established #712 pattern (mirror exactly):
```ts
try {
  expectAffected(
    await supabase.from('…').update({…}).eq('id', id).select('id'),
    'context',
  );
} catch (err) {
  console.error('[…] … failed', { id, err });
  <existing error path>   // redirect(...) for cup, return { error } for league
}
```
The success redirect/return stays **outside** the try (Next's `redirect()` throws
`NEXT_REDIRECT`; a catch around it would swallow the redirect).

Helper choice: **`expectAffected`** throughout (matches #712's dominant usage;
every target is a by-PK single-row update or single-row insert, so 1 row is the
happy path and `expectAffected` is sufficient without the stricter "exactly 1"
constraint of `expectOne`).

## Scope notes / decisions

- **`updateLeagueSettings` does not exist** anywhere in the codebase (named in the
  issue scope and the #712 deferred table, but there is no such function).
  Nothing to do — documented, not skipped silently.
- **`setLeagueStatus` / `finishLeague` INCLUDED** (owner decision 2026-06-20).
  Not in the literal issue list, but `finishLeague` routes its identical
  UPDATE-by-id (`leagues … .eq('id', leagueId)`) through `setLeagueStatus`. Same
  pattern, same risk as the listed `startLeague`. Hardening it keeps start+finish
  consistent. Documented expansion beyond the literal list.
- **`confirmLeagueParticipation` is idempotent-by-design** (TRAP).
  `maybeAutoConfirmLeagueParticipation` runs on *every* liga-page load with
  `.is('accepted_at', null)`. After the first confirm it legitimately matches
  **0 rows on every subsequent visit**. A naïve `expectAffected` would log
  "failed" on every page load. Correct retrofit: route through `expectAffected`
  (which surfaces the *real* current gap — PostgREST errors are presently
  swallowed because the result is never inspected), but in the catch treat
  `NoRowsAffectedError` as the expected idempotent no-op (swallow silently) and
  only `console.error` genuine errors.

## Call sites to retrofit

### Area 1 — `lib/cup/actions.ts` (redirect-based, 1 commit)
| Function | UPDATE | On 0-row/error |
|----------|--------|----------------|
| `updateTournament` | `tournaments … .eq('id', id)` | `redirect(\`${base.path}?error=update_failed\`)` |
| `startTournament` | `tournaments {status:'active',…} .eq('id', id)` | `redirect(\`${base.path}?error=start_failed\`)` |
| `finishTournament` | `tournaments {status:'finished',…} .eq('id', id)` | `redirect(\`${base.path}?error=finish_failed\`)` |

Add `.select('id')` to each update; wrap in `try/catch` per the pattern. The
existing `if (error) { console.error; redirect }` blocks are replaced by the
catch. Context labels: `'updateTournament'`, `'startTournament'`,
`'finishTournament'`. Import `expectAffected`.

### Area 2 — `lib/league/actions.ts` (return-based, 1 commit, + test)
| Function | Mutation | On 0-row/error |
|----------|----------|----------------|
| `updateLeagueRound` | `league_rounds … .eq('id', roundId)` (inside `if patch>0`) | `return { error: 'update_failed' }` |
| `addLeagueRound` | `league_rounds.insert({…})` | `return { error: 'insert_failed' }` |
| `overrideRoundWindow` | `league_rounds … .eq('id', roundId)` | `return { error: 'update_failed' }` |
| `startLeague` | `leagues {status:'active',…} .eq('id', leagueId)` | `return { error: 'status_failed' }` |
| `setLeagueStatus` (→ `finishLeague`) | `leagues {status,…} .eq('id', leagueId)` | `return { error: 'status_failed' }` |

Add `.select('id')`; wrap in `try/catch`; catch returns the same error code the
existing `if (error)` returned. Context labels match the function names. Import
`expectAffected`.

### Area 3 — `lib/league/confirmLeagueParticipation.ts` (1 commit)
`maybeAutoConfirmLeagueParticipation`: add `.select('user_id')` →
`expectAffected(…, 'autoConfirmLeagueParticipation')`. In the catch:
`if (!(e instanceof NoRowsAffectedError)) console.error('[autoConfirmLeagueParticipation] failed', e);`
Import `expectAffected` + `NoRowsAffectedError`. Net effect: real DB errors now
logged (current gap); idempotent 0-row stays silent.

## Tests
- Add **one** minimal Type-A 0-row regression test to `lib/league/actions.test.ts`
  (reuses the shared `buildSupabaseMock` infra — no copy-pasted mocks). Target a
  return-based path (`updateLeagueRound`): queue `{ data: [] }` for the
  update-select and assert the action returns `{ error: 'update_failed' }`. Locks
  the throw→return-error wiring.
- **No cup-side action test**: would need fresh auth + notification mock
  scaffolding for a cosmetic-risk path; the helper itself is already unit-tested
  in `lib/supabase/affectedRows.test.ts`. Documented, not a silent skip.

## Gates
- `npx tsc --noEmit` clean after each commit.
- `npx vitest run lib/cup lib/league lib/supabase/affectedRows.test.ts` green.
- Atomic `refactor(...)` commit per area, each with `Refs #727`.
- No `package.json` / `CHANGELOG.md` change (pure hardening; commit-msg hook lets
  `refactor(...)` pass without a bump).

## Acceptance criteria
- [ ] Area 1: cup `updateTournament` / `startTournament` / `finishTournament`
      route their UPDATE through `expectAffected` + `.select('id')`; 0-row/error
      hits the existing redirect path. Happy path unchanged.
- [ ] Area 2: league `updateLeagueRound` / `addLeagueRound` / `overrideRoundWindow`
      / `startLeague` / `setLeagueStatus` route their mutation through
      `expectAffected` + `.select('id')`; 0-row/error returns the existing error
      code. Happy path unchanged.
- [ ] Area 3: `maybeAutoConfirmLeagueParticipation` routes through `expectAffected`;
      real errors logged, `NoRowsAffectedError` swallowed as idempotent no-op.
- [ ] One Type-A 0-row test added for a league path; green.
- [ ] `npx tsc --noEmit` clean.
- [ ] `npx vitest run lib/cup lib/league lib/supabase/affectedRows.test.ts` green.
- [ ] No version bump; one `refactor(...)` commit per area with `Refs #727`.
