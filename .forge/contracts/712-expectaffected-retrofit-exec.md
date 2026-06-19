# Contract: #712 — Retrofit expectAffected/expectOne into high-risk mutation call sites

## Branch
`issue-712-expectaffected-retrofit`

## Background
`lib/supabase/affectedRows.ts` provides `expectAffected` / `expectOne` to make
silent 0-row writes explicit failures. The motivating bugs are #667 (swallowed
insert) and #704 (approveScorecard matched 0 rows → false success). New code must
use the helper; pre-existing call sites are retrofitted incrementally by risk.

## Already-protected paths (no retrofit needed)

These already have either `.select().single()` (throws on 0/multiple rows) or
explicit manual row-count checks:

| Path | Why already protected |
|------|-----------------------|
| `submitScorecard` (games/[id]/submit/actions.ts) | `.select('user_id')` + manual `updated.length === 0` check; intentionally idempotent |
| `approveScorecard` (games/[id]/approve/actions.ts) | `.select('user_id')` + explicit idempotent/blocked distinction (PR #704) |
| `rejectScorecard` (games/[id]/approve/actions.ts) | `.select('user_id')` + manual 0-row check |
| `createTournamentDraft` (lib/cup/actions.ts) | `.select('id').single()` — throws on failure |
| `startLeagueRoundFlight` game insert (lib/league/actions.ts) | `.select('id').single()` — throws |
| `attachToCaptainTeam` registration insert (signup/teamActions.ts) | `.select('id').single()` — throws |
| `submitTeamRegistration` captain insert | `.select('id').single()` — throws |

## Call sites to retrofit (4 areas, 1 atomic commit each)

### Area 1 — Admin scorecard override (`adminApproveScorecard`)
**File:** `app/[locale]/admin/games/[id]/actions.ts`
**Risk:** UPDATE `game_players` with `.not('submitted_at', 'is', null).is('approved_at', null)` guard.
0-row = already approved → notifications + audit log fired falsely.
**Action:** Add `.select()` → `expectAffected(result, 'adminApproveScorecard')`.
Skip notifications if 0 rows (idempotent path, same logic as peer flow).
**Context label:** `'adminApproveScorecard'`

### Area 2 — join-request decisions (`approveRequest` / `rejectRequest`)
**File:** `app/[locale]/admin/games/[id]/signups/actions.ts`
**Risk (approveRequest):** UPDATE `game_registration_requests` `.in('id', ids).eq('status','pending')`.
0-row = all already processed → game_players upsert fires anyway, duplicate notification/mail risk.
**Risk (rejectRequest):** Same pattern — UPDATE status → notifications fire even if 0 rows matched.
**Action:** Add `.select()` to both UPDATEs → `expectAffected` → redirect to `?error=db_update` on 0-row.
Existing `if (updateError)` block remains; wrap it with the helper.
**Context labels:** `'approveRequest'`, `'rejectRequest'`

### Area 3 — team invite decisions (`declineTeamInvite`)
**File:** `app/[locale]/signup/[shortId]/teamActions.ts`
**Risk:** UPDATE `game_registration_requests` `.eq('id', req.id)` — no row-count check.
0-row = request already gone → notify captain fires falsely.
**Action:** Add `.select()` → `expectAffected(result, 'declineTeamInvite')`.
On throw: return `{ ok: false, error: 'db_error' }` (same as existing `updateError` path).
**Context label:** `'declineTeamInvite'`

### Area 4 — self-withdraw mutations (`withdrawFromGame` / `undoWithdraw`)
**File:** `app/[locale]/games/[id]/withdrawActions.ts`
**Risk (active-path):** UPDATE `game_players` SET withdrawn_at — if RLS blocks (user already withdrawn or row missing), error==null, returns `{ ok: true, kept: true }` falsely.
**Risk (undoWithdraw):** Same — UPDATE clears withdrawn_at; if row missing/not withdrawn, silent 0-row success.
Both paths already read the row before the UPDATE, so a 0-row outcome means the row vanished between read and write (race). Still worth catching.
**Action:** Add `.select()` → `expectAffected` → return `{ ok: false, error: 'db_error' }` in catch.
**Context labels:** `'withdrawFromGame/active'`, `'undoWithdraw'`

## Deferred (out of scope for this PR)

| Path | Reason deferred |
|------|-----------------|
| `lib/cup/actions.ts` `updateTournament`, `startTournament`, `finishTournament` | UPDATE by `.eq('id')` after pre-flight `.maybeSingle()` check — 0-row implies id went missing between calls, extremely unlikely, cosmetic miss (not stuck-state) |
| `lib/league/actions.ts` `updateLeagueRound`, `overrideRoundWindow`, `updateLeagueSettings`, `startLeague` | Same pattern — id-gated update after fetch, cosmetic miss not stuck-state |
| `lib/league/confirmLeagueParticipation.ts` | UPDATE `league_players.accepted_at` — 0-row means player not found; already returns void, not a stuck-state |
| `removeTeamMember` delete (teamActions.ts) | DELETE by id — 0-row = already deleted = idempotent, not stuck-state |
| `acceptTeamInvite` upsert (teamActions.ts) | upsert with `ignoreDuplicates:true` — design intent is idempotent, 0-row = duplicate = not stuck |
| ~180 other mutation sites | Out of scope per issue spec (do high-risk batch only) |

## Acceptance criteria

- [ ] Area 1–4 committed atomically (one `refactor(...)` commit per area)
- [ ] `npx tsc --noEmit` clean after each commit
- [ ] Co-located vitest pass for any file with a `.test.ts` neighbor
- [ ] A minimal Type-A test for the 0-row failure path in Area 2 (approveRequest) since it has existing test infra
- [ ] No version bump (all `refactor(...)` commits)
- [ ] No behavior change in the happy path
