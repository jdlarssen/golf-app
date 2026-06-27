# Contract: #969 — Wolf & Round Robin rotation assigned at start, not publish

Worktree: `.claude/worktrees/vigorous-shamir-790ac2` · Branch: `claude/vigorous-shamir-790ac2`
Spec/anchor: `docs/superpowers/specs/2026-06-28-wolf-rr-rotation-at-start-design.md` (also issue #969 body).
All commits include `Refs #969` in the body.

## Problem
Open-signup Wolf/Round Robin can't be published: a roster with only the admin fails
with `bad_team` («Hver spiller må tilhøre et lag (1–4)»). The rotation slot
(`team_number`) is assigned at publish but should be drawn at game start over the
final active roster.

## File boundaries
- `lib/games/assignRotationSlots.ts` (+ `.test.ts`) — NEW pure helper
- `lib/games/gamePayload.ts` (+ `.test.ts`) — `validateWolf`, `validateRoundRobin`
- `lib/games/startScheduledGame.ts` (+ `.test.ts`) — guard + slot assignment
- `lib/notifications/autoStartBlocked.ts` (+ test if present) — reason surfacing
- `app/[locale]/admin/games/[id]/actions.ts`, `app/[locale]/games/[id]/(home)/page.tsx` — surface reason
- `app/[locale]/admin/games/new/sections/WolfSetup.tsx` (+ `.test.tsx`) — trim
- `app/[locale]/admin/games/new/sections/RoundRobinSetup.tsx` (+ `.test.tsx`) — DELETE
- `app/[locale]/admin/games/new/useGameFormState.ts` (+ `.test.ts`)
- `app/[locale]/admin/games/new/GameWizard.tsx` / `GameForm.tsx` (+ tests)
- `messages/no.json`, `messages/en.json` — start-blocked copy; remove dead rotation keys
- `package.json`, `package-lock.json`, `CHANGELOG.md` — version bump

NO DB migration (team_number/flight_number already nullable; CHECK satisfied).

## Build order
1. Server logic (`feat`, user-visible → minor bump + CHANGELOG):
   helper + validators + start guard/assign + reason surfacing + i18n start copy + server tests.
   (After this commit, open-signup publish already works with the existing wizard.)
2. Wizard UI cleanup (`refactor`, no bump): remove rotation UI/state, delete RoundRobinSetup,
   add info notes, update UI tests, remove dead rotation i18n keys.

## Success criteria
- [ ] C1 `assignRotationSlots(activeUserIds, shuffle?)` → contiguous `team_number = flight_number = 1..n`, distinct, covers every id; deterministic under an injected shuffle. Unit-tested.
- [ ] C2 `validateWolf` emits every row with `team_number: null, flight_number: null`; no per-row `bad_team`; no contiguous `team_balance` check; publish-mode 3–5 count check retained (fires invite-only only). Open-signup (`effectiveMode==='draft'`) publish with <3 players returns `ok`. Covered in `gamePayload.test.ts`.
- [ ] C3 `validateRoundRobin` same: null slots, no per-row `bad_team`, publish-mode `===4` retained, open-signup publish with <4 returns `ok`. Covered.
- [ ] C4 `startScheduledGame` returns a new structured failure reason when the active (non-withdrawn) roster is Wolf `<3 || >5` or RR `!==4`; otherwise writes `team_number=flight_number=slot` (both set) to active players via `assignRotationSlots`, idempotent on retry. Withdrawn rows keep null. Covered in `startScheduledGame.test.ts`.
- [ ] C5 The new reason is surfaced to the admin (autoStartBlocked + "Start runden nå" action + page auto-start fallback) with NO + EN copy, format-aware («Wolf trenger 3–5 spillere …» / «Round Robin trenger nøyaktig 4 spillere …»).
- [ ] C6 Wizard: WolfSetup keeps the scoring toggle, drops rotation preview + shuffle; `RoundRobinSetup` deleted; `useGameFormState` Wolf/RR `orderedPayload` emit null slots; `wolfOrder`/`wolfShuffleSeed`/`shuffleWolfOrder`/`roundRobinOrder` removed; GameWizard/GameForm updated. Info notes: Wolf «Rotasjonen trekkes når runden starter.», RR «Lagene trekkes når runden starter.»
- [ ] C7 Open-signup Wolf & RR publish with only the admin succeeds (no `bad_team`) — proven by test, and verified on staging before merge.

## Gates (scoped to changed files)
- `npx tsc --noEmit` — clean
- `npx eslint <changed files>` — clean
- `npx vitest run` for changed + co-located tests — green
- Version bump (minor for the `feat` commit) + CHANGELOG entry; `[no-changelog]` only on internal-only commits
- Staging click-through of open-signup Wolf publish → join to 3 → start (per `docs/test-discipline.md`) before merge
