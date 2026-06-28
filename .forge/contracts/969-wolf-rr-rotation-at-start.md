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
- [x] C1 `assignRotationSlots` → contiguous `team_number = flight_number = 1..n`, distinct, covers every id; deterministic under injected shuffle. Evidence: `lib/games/assignRotationSlots.ts` + `.test.ts` (4 cases green).
- [x] C2 `validateWolf` emits null team/flight; no per-row `bad_team`/`team_balance`; publish-mode 3–5 gate retained (invite-only); open-signup (`manual_approval`/`open`) publish with <3 returns ok. Evidence: `gamePayload.ts:1453-1487` + new tests `#969: open-signup … 1 spiller → ok`, `… 0 spillere → ok`.
- [x] C3 `validateRoundRobin` same: null slots, no per-row `bad_team`, publish-mode `===4` retained, open-signup publish with <4 returns ok. Evidence: `gamePayload.ts` RR validator + test `#969: open-signup … 2 spillere → ok`.
- [x] C4 `startScheduledGame` (+ admin `startGame`) returns `rotation_player_count` when active (non-withdrawn) roster is Wolf `<3||>5` / RR `!==4`; else writes `team=flight=slot` via `assignRotationSlots`, idempotent. Withdrawn excluded. Evidence: `startScheduledGame.ts:155-210` + 5 new tests (too-few blocks w/ mode+count, valid assigns contiguous 1..n, withdrawn excluded).
- [x] C5 Reason surfaced: `autoStartBlocked` STRUCTURAL set, `startScheduledGameAction` + `startGame` redirect `?error=rotation_player_count&mode&count`, `admin/games/[id]/page.tsx` builds format-aware banner. NO+EN copy (`admin.game.errors.rotation_player_count_{wolf,round_robin}`, `blockReasons.rotation_player_count`).
- [x] C6 Wizard: WolfSetup keeps scoring toggle, drops rotation+shuffle; `RoundRobinSetup` deleted; orderedPayload Wolf/RR emit null; `wolfOrder`/`wolfShuffleSeed`/`shuffleWolfOrder`/`roundRobinOrder` removed; GameWizard/GameForm updated; info notes added. Evidence: commit `e889651d`, 138 wizard tests green.
- [x] C7 Open-signup Wolf & RR publish with only the admin succeeds (no `bad_team`) — proven by unit tests (C2/C3). ⏳ staging click-through pending before merge.

## Gate evidence
- `npx tsc --noEmit` — clean.
- `npx vitest run` — 323 files, 4160 tests, all green.
- `npx eslint` (changed files) — 0 errors (pre-existing complexity warnings only).
- Commits: `eae2a24f` (fix, v1.151.1 + CHANGELOG), `e889651d` (refactor, [no-changelog]).

## Gates (scoped to changed files)
- `npx tsc --noEmit` — clean
- `npx eslint <changed files>` — clean
- `npx vitest run` for changed + co-located tests — green
- Version bump (minor for the `feat` commit) + CHANGELOG entry; `[no-changelog]` only on internal-only commits
- Staging click-through of open-signup Wolf publish → join to 3 → start (per `docs/test-discipline.md`) before merge
