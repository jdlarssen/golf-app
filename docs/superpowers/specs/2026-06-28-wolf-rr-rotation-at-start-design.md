# Wolf & Round Robin: assign rotation at start, not at publish

**Date:** 2026-06-28
**Status:** Approved (design) — pending spec review → implementation plan
**Area:** game creation wizard, game start, scoring config

## Problem

You cannot publish a Wolf game with open signup. With "Forespørsel — jeg
godkjenner" (`manual_approval`) selected and only yourself in the roster,
publishing fails with the top-of-page error «Hver spiller må tilhøre et lag
(1–4)» (`bad_team`). The rotation UI that would let you assign slots only
renders at 3–5 players, so there is no way to satisfy the validator from the
UI — the game is unpublishable until you manually add everyone, which defeats
open signup.

### Root cause

The Wolf rotation slot is modelled as `game_players.team_number` (1..n) and is
assigned **at publish time**:

- The wizard's `orderedPayload` (in `useGameFormState.ts`) emits a row per
  selected player. With fewer than 3 selected it emits `team_number: null`.
- The hidden form input serializes `null` as the empty string
  (`value={row.team_number ?? ''}`).
- `validateWolf` (in `lib/games/gamePayload.ts`) reads every submitted row's
  team and runs `Number(formData.get('player_0_team'))` → `Number('')` → `0`,
  then rejects `team_number < 1` with `bad_team`. **This per-row check is not
  gated by draft/publish mode**, so it fires even though open-signup publishes
  run through the validator in effective-`draft` mode.

Round Robin (`round_robin`) uses the identical pattern (team_number as a
rotation slot, per-row `bad_team` check) and has the same latent bug for
open-signup games with fewer than 4 players.

The deeper issue: rotation assignment is a **start-time** concern (it depends
on the final roster), but it is currently forced at **publish time** (when the
roster may be empty for open signup).

## Goals

- Publish an open-signup Wolf or Round Robin game with 0–2 (Wolf) / 0–3 (RR)
  players; players join later via the link.
- Draw the rotation order automatically when the game starts, over the final
  active roster. No manual rotation/shuffle step in the wizard.
- Block start (with a clear Norwegian message) when the active roster is
  outside the format's range at start time — Wolf < 3 or > 5, RR ≠ 4.

## Non-goals

- No change to the rotation **scoring** logic (`lib/scoring/modes/wolf.ts`,
  `roundRobin`, their context builders). `n` is already derived from the live
  player count, not from stored config.
- No change to invite-only behaviour at publish: the wizard still guides the
  admin to pick a valid roster (Wolf 3–5, RR exactly 4) before publishing.
- No new betting/scoring options. The Wolf netto/brutto toggle and the RR
  handicap-% field stay exactly where they are.
- No DB migration (see Data model).

## Behaviour (UX)

### Wizard (creating the game)

- **Wolf:** the format-config area keeps the netto/brutto scoring toggle and
  drops the rotation preview + "Stokk om"/shuffle button entirely.
- **Round Robin:** the A/B/C/D slot-preview section (`RoundRobinSetup`) is
  removed. The RR handicap-% field is unaffected (it is rendered separately).
- A short, always-true info note replaces the removed UI:
  - Wolf: «Rotasjonen trekkes når runden starter.»
  - Round Robin: «Lagene trekkes når runden starter.»
  (No "spillerne melder seg på selv" line — it would be false for invite-only.)
- With open signup (`open` / `manual_approval`), the players step is optional
  (existing `playersStepOptional` behaviour) — you can publish with just
  yourself or nobody. No "Mangler: N spillere til" gate.
- With invite-only, the wizard still requires a valid roster to publish
  (unchanged): Wolf 3–5, RR exactly 4.

### Starting the game

- The rotation order is drawn automatically (crypto-random) over the active
  (non-withdrawn) roster at the moment the game transitions
  `scheduled → active`.
- If the active roster is outside range at start, the game does not start and
  the admin sees a clear reason, e.g. «Wolf trenger 3–5 spillere for å starte —
  2 er påmeldt.» / «Round Robin trenger nøyaktig 4 spillere — 3 er påmeldt.»
  This applies to all start paths (admin "Start runden nå", the page
  auto-start fallback, and the cron sweep).

## Architecture / code changes

### 1. Wizard (client)

- `app/[locale]/admin/games/new/sections/WolfSetup.tsx` — remove the rotation
  preview list, the trailing-wolf note, and the shuffle button; keep the
  scoring radio group. Drop the `wolfOrder` / `onShuffle` props and the
  `holesForSlot` helper.
- `app/[locale]/admin/games/new/sections/RoundRobinSetup.tsx` — delete (it is
  purely the rotation preview). Its test file is deleted too.
- `app/[locale]/admin/games/new/useGameFormState.ts`:
  - Wolf and Round Robin branches of `orderedPayload` emit
    `team_number: null, flight_number: null` for every selected player.
  - Remove `wolfOrder`, `wolfShuffleSeed`, `shuffleWolfOrder`, and
    `roundRobinOrder` (and their exports).
  - Keep `wolfPlayersValid` (3–5) and `roundRobinPlayersValid` (== 4) — they
    still gate invite-only publish via `playersValidForMode`; open signup skips
    them via `playersStepOptional` (unchanged).
- `GameWizard.tsx` / `GameForm.tsx` — remove the `WolfSetup` rotation wiring
  and the `RoundRobinSetup` mount; stop passing `wolfOrder`/`onShuffle`.

### 2. Server validators (`lib/games/gamePayload.ts`)

- `validateWolf`: emit each row with `team_number: null, flight_number: null`
  (solo-style). Remove the per-row `bad_team` check and the contiguous
  `team_balance` check. Keep the publish-mode count check (3–5) — it fires only
  for invite-only, since open-signup publishes pass `effectiveMode === 'draft'`
  and skip it. `mode_config` is unchanged in shape; `teams_count` reflects the
  rows present at publish (may be 0 for open signup — not read by scoring).
- `validateRoundRobin`: same treatment — null slots, drop per-row `bad_team`,
  keep publish-mode `=== 4` count check (invite-only only).

### 3. Start (`lib/games/startScheduledGame.ts` + new pure helper)

- New pure, exported function (own file, e.g.
  `lib/games/assignRotationSlots.ts`):
  `assignRotationSlots(activeUserIds: string[]): { user_id, team_number, flight_number }[]`
  — crypto-shuffles the ids and returns contiguous `team_number = flight_number
  = 1..n`. Pure and unit-testable (the shuffle source is injectable for
  deterministic tests).
- In `startScheduledGame`, after the existing guards and before / alongside the
  course-handicap loop:
  - Compute the active (non-withdrawn) roster.
  - For Wolf: if active count `< 3 || > 5` → return
    `{ ok: false, reason: 'rotation_player_count', ... }` carrying the format +
    active count + range for the message.
  - For Round Robin: if active count `!== 4` → same blocking reason.
  - Otherwise call `assignRotationSlots` and write `team_number` +
    `flight_number` per active player (both set together — satisfies the
    `game_players_team_flight_consistency` CHECK). Idempotent: each run
    reassigns all active players a fresh contiguous 1..n, so a retry after a
    mid-loop crash always lands on a valid contiguous set.
  - Withdrawn players keep `null` slots (excluded from the assignment).
- The `> 5` Wolf case is already prevented at signup (`soloPlayerCap` caps Wolf
  at 5), so the realistic user-facing failure is "too few". The `> 5` / `!= 4`
  guards remain as defense-in-depth.
- Optional cleanliness: refresh `mode_config.teams_count` to the active count
  at start. Not required for correctness (scoring uses `players.length`).

#### Why this is allowed to write the slots

All three start callers run as service-role or the game creator:
`getAdminClient()` in the page auto-start fallback and the cron route, and the
admin/creator action for "Start runden nå". The `guard_game_players_self_update`
trigger (migration 0107) only blocks a non-admin player editing rows; it
returns early for `auth.uid() IS NULL` (service role), `is_admin()`, and the
game creator. So start-time slot writes pass.

### 4. Reason surfacing + i18n

- Add `'rotation_player_count'` to the `StartScheduledGameResult` failure union
  (carry enough data — game_mode + active count — to build the message).
- Surface it in `lib/notifications/autoStartBlocked.ts`, the admin
  "Start runden nå" action, and the page auto-start fallback, with Norwegian +
  English copy.
- Remove now-dead Wolf/RR rotation i18n keys (`wizard.sections.wolf.rotation*`,
  `shuffleButton`, `hullLabel`, `trailingNote`, `rotationEmptyHint`,
  `selectPlayerPlaceholder`; the whole `wizard.sections.roundRobin` slot block).
  Keep the Wolf scoring keys.

## Data model

No migration. `game_players.team_number` and `flight_number` are already
nullable. The `game_players_team_flight_consistency` CHECK (both set or both
null) holds in every state: both null at publish, both set at start. The Wolf
scoring derives the rotation size from `players.length`, so a stale
`mode_config.teams_count` at publish does not affect results.

## Testing (per `docs/test-discipline.md`)

- **Type A (pure logic, TDD):**
  - `assignRotationSlots` — contiguous 1..n, distinct, all active players
    covered, deterministic under an injected shuffle.
  - `gamePayload.test.ts` — Wolf & RR: rows emit null slots; open-signup publish
    (effective-draft) passes with < min players; no `bad_team` for empty teams;
    invite-only publish still enforces count.
  - `startScheduledGame.test.ts` — Wolf (2 active → blocked; 3–5 → slots
    assigned contiguous) and RR (3 active → blocked; 4 → slots assigned);
    withdrawn players excluded.
- **UI:** trim `WolfSetup.test.tsx` (remove rotation assertions, keep scoring
  toggle); delete `RoundRobinSetup.test.tsx`; update `GameWizard.test.tsx`,
  `GameForm.test.tsx`, and `useGameFormState.test.ts` for null Wolf/RR slots and
  the removed rotation state.

## Risks

- Between publish and start, Wolf/RR rows carry null slots. Scoring only runs
  once the game is active, so this is safe; the implementer verifies no
  scheduled-state view reads the slot.
- Withdrawals dropping the active roster below range are now caught at start
  (previously a sub-range Wolf could in principle have started). This is a
  strict improvement, surfaced via the new blocking reason.

## Out of scope

- The open-signup player cap already works (`soloPlayerCap` + `registerForOpenGame`,
  shipped as #661): a 6th Wolf joiner is rejected with `game_full` («Spillet er
  fullt — alle plassene er tatt.»), counting only active (`withdrawn_at IS NULL`)
  players, so a withdrawal frees a slot. No change here — it is why the start-time
  guard only needs to handle "too few".
- Acey Deucey and Nines are solo formats (team_number already null); they have
  no rotation slot and are unaffected.
- Matchplay family keeps its own `incomplete_sides` start guard.
