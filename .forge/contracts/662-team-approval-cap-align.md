# Contract: #662 — Team-approval cap align (slot <= 50)

## Status
IMPLEMENTED — fix was already present in worktree. Test coverage added.

## Problem
`approveRequest` in `app/[locale]/admin/games/[id]/signups/actions.ts` capped
team-slot search at 4 (issue evidence). The self-reg path (`teamActions.ts`)
correctly searches slots 1–50.

## Finding
The worktree already has `slot <= 50` in `approveRequest` (line 169) with
comment "Match the public self-reg cap (teamActions.ts) and the widened
game_players_team_number_check (0101): clubs can run more than 4 teams."

## Action taken
Added a co-located test in `actions.test.ts` (approve path) verifying that
a team captain can be approved when slots 1–4 are taken → gets slot 5.

## Test
- `cascade approve: kaptein godkjent når slot 1–4 tatt → tildeles slot 5`
- Test was failing before the loop change (would have hit `no_team_slot` redirect).
  Since the code is already fixed, test is green immediately after adding.

## Error code reused
`no_team_slot` (redirect param) — existing path; no new user-facing strings needed.

## Cap source aligned to
`teamActions.ts` line 334: `for (let slot = 1; slot <= 50; slot += 1)`
