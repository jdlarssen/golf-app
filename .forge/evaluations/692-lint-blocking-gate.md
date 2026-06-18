# Forge-evaluering: #692 — Rydd lint-feil så lint kan bli blokkerende CI-gate

**Evaluert:** 2026-06-18
**Branch:** `claude/pensive-pare-154a0d`
**Verdict: ACCEPT**

---

## K1 — 0 errors: PASS

`npm run lint` exited 0 with zero output (no errors, no warnings reported to stdout).
The command output was simply the npm script invocation line — no ESLint problem lines.

## K2 — html-link suppressed: PASS

`components/ui/AppVersionFooter.tsx` has a two-comment block:
1. An explanatory comment documenting WHY `<a>` is deliberate (auth-gate / proxy.ts matcher).
2. `{/* eslint-disable-next-line @next/next/no-html-link-for-pages */}` immediately before the `<a href="/legal/privacy">`.

The link itself is intact and unchanged — purely a suppression + documentation addition.
Lint passes; the 20-duplicate-report issue (flat-config rule duplication) is resolved.

## K3 — require() removed, InboxClient tests green: PASS

`InboxClient.test.tsx` no longer contains `require('react')`. The mock factory for
`@/i18n/navigation` was converted to `async` with `await vi.importActual<typeof
import('react')>('react')`, matching the existing `next/navigation` mock pattern in the
same file. The old `jsx-a11y/anchor-has-content` disable comment was removed as a
consequence (it was only needed to suppress the `createElement` call via `require`).

Test run: **13/13 passed** (`npx vitest run 'InboxClient'`).

## K4 — setState-in-effect suppressed + follow-up issue: PASS

`useGameFormState.ts` at line 511 has:
```ts
// eslint-disable-next-line react-hooks/set-state-in-effect
setRegistrationMode('invite_only');
```
preceded by a 4-line explanatory comment referencing #715 and explaining the deferral
rationale. The effect logic itself is **unchanged** — it still correctly forces
`invite_only` for club-scoped games; only the suppress comment + explanation were added.

Issue #715 confirmed: open, title "Refaktorer klubb-scope registration_mode fra effekt
til derivert verdi (useGameFormState)", milestone: Backlog (#9).

## K5 — 0 warnings: PASS

`eslint.config.mjs` adds a new config block with `@typescript-eslint/no-unused-vars`
configured with `argsIgnorePattern: "^_"`, `varsIgnorePattern: "^_"`,
`caughtErrorsIgnorePattern: "^_"`. This codifies the deliberate underscore-prefix
convention used throughout leaderboard views (`_gameId`, `_gameStatus`, etc.).

Seven dead items removed across 5 files:
- `ArchivedTeesSectionStrings` type import from `edit/page.tsx` (not referenced)
- `vi` import from `GameForm.test.tsx` (not used after refactor)
- `FlightJoinError` type import from `ScheduledWaitingRoom.tsx` (not referenced)
- `notFound` import from `liga/runde/spill/page.tsx` (not referenced)
- `notFound` import from `profile/page.tsx` (not referenced)
- Two block `eslint-disable/enable @typescript-eslint/no-unused-vars` from
  `useUnreadNotificationsCount.test.ts` (now handled by `^_` config)
- `playerById` Map + `key` dead variable in `GenerateMatchesWizard.tsx`

All verified via grep — none of the removed names appear in their respective files
after the change.

`npm run lint` exits 0 with no output = 0 problems total.

## K6 — gate flipped: PASS

`.github/workflows/ci.yml` has no `continue-on-error` anywhere in the file (grep
returned empty). The header comment now reads:

> "typecheck + test + lint are all BLOCKING (the pre-existing lint errors were
> cleaned in #692). lint fails on errors only; warnings don't block."

The lint step is:
```yaml
- name: Lint (blocking)
  run: npm run lint
```
No `continue-on-error: true`. Correctly blocking.

## K7 — no regression (typecheck + full test suite): PASS

`npm run typecheck` (tsc --noEmit): exited 0, no output.

`npm test` (vitest run): **3677 passed across 287 test files** — exact match with
the contract's stated baseline. Duration ~29s. No failures.

---

## Summary

All 7 criteria pass. The implementation is clean:

- No behavioral changes — only lint suppress comments, dead-import removals, and
  config adjustments.
- The `playerById`/`key` removals in GenerateMatchesWizard are genuinely dead code:
  `playerById` was created but never passed to Step4Preview's actual render path
  (confirmed: the prop was removed from Step4Preview's signature in the same commit,
  and the variable was never consumed elsewhere). `key` was a dead cast of
  `result.error` that the errorMap lookup never referenced.
- The eslint-config `^_` pattern is appropriate and well-documented.
- Follow-up issue #715 exists and is properly milestoned.
- CI lint gate is now blocking with no `continue-on-error`.
