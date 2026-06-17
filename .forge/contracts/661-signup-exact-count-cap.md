# Contract: #661 — Self-signup player cap for exact-count formats

## Problem
`registerForOpenGame` in `app/[locale]/signup/[shortId]/actions.ts` has no
player-count check for exact-count solo formats (Wolf 3–5, Nines exact 3,
RoundRobin exact 4, AceyDeucey exact 4). Skins/Nassau/BBB also have an upper
cap of 16. The matchplay path already enforces per-side caps; non-matchplay
solo formats had no equivalent check.

## Scope
Solo solo-path only (`registerForOpenGame`). Team path
(`submitTeamRegistration`) already validates slot count against team_size at
submission time. Matchplay side-cap is unchanged.

## Cap source
`fitsPlayerCount.ts` defines per-format player-count rules.
We extract `soloPlayerCap(gameMode): number | null` as a new export from
`lib/wizard/fitsPlayerCount.ts` that returns:
- wolf → 5
- nines → 3
- round_robin → 4
- acey_deucey → 4
- nassau / skins / bingo_bango_bongo → 16
- all other solo formats → null (no cap)
- matchplay family → null (side-cap handles it separately)

## Error code reused
`game_full` — already in `ActionError` union (`actions.ts:60`). Already has
i18n key `signup.errors.game_full` with `{max}` interpolation. This is the
dead code referenced in the issue. Connecting it here activates it.

## Race guard
Pre-insert count uses `{ count: 'exact', head: true }` on `game_players`
filtered by `game_id` and `withdrawn_at IS NULL`. This mirrors the matchplay
side-count pattern. Race condition between two simultaneous last-slot signups:
we do NOT add a post-insert race guard for solo non-matchplay formats because
these formats use `team_number = null` (no slot competition). A brief
over-count window is acceptable; the publish validator in `gamePayload.ts`
remains the authoritative hard gate.

## Files changed
- `lib/wizard/fitsPlayerCount.ts` — add `soloPlayerCap(gameMode)` export
- `lib/wizard/fitsPlayerCount.test.ts` — add tests for new export
- `app/[locale]/signup/[shortId]/actions.ts` — add cap check before INSERT
- `app/[locale]/signup/[shortId]/actions.test.ts` — add failing test first

## No new catalog strings
`game_full` with `{max}` already exists in both `no.json` and `en.json`.
