# Evaluation: Flight = én gruppe ved ≤4 spillere + flight-inndeling for store spill (#543)

**Date:** 2026-06-11
**Commit range:** `origin/main..HEAD` (5614fce → 6ad6431; 8 feat/test commits + 3 forge chore commits)
**Evaluator:** fresh-context skeptical pass — every checkbox re-verified independently.

## Verdict: ACCEPT

All 8 success criteria pass on independent verification. All 5 gates pass with real output. No ship-blocking findings. Two non-blocking NITs (one a genuine but low-impact gap on a secondary surface; one DRY).

---

## Gates

| Gate | Result | Detail |
|------|--------|--------|
| `npx tsc --noEmit` | **PASS** | exit 0, zero errors |
| `npx vitest run` (full) | **PASS** | 257 files / **3159 tests** passed, exit 0, 28.4s |
| `npm run lint` | **PASS (no new)** | 41 problems (20 errors / 21 warnings), **all in unchanged files** (AppVersionFooter.tsx ×~17, leaderboard `_gameId` warns, profile/statistikk). Grep over every #543-touched file: **zero** lint issues. |
| `npm run build` | **PASS** | exit 0, PPR route table generated; `/signup/[shortId]`, `/signup/[shortId]/team`, game/admin routes all present (◐ PPR). |
| Version + CHANGELOG | **PASS** | `package.json` = **1.110.6**; CHANGELOG theme `## 1.110.y — Flighter · én gruppe i små spill` with entries 1.110.1–1.110.6, all tagged #543. Prior 1.109.y series preserved below. Three-layer structure intact. |

---

## Criteria

### 1. Singles matchplay (2 players): both visible, opponent can write, live standing visible, submit notifies opponent who can approve — **PASS**
- Hole roster: `holes/[holeNumber]/page.tsx:105-117` — `singleFlight = isSingleFlightGame(...)` true at 2 active → roster = all active regardless of `flight_number` (sides 1/2 both shown).
- RLS write: `0094` `can_score_for` branch (b) `count(active) <= 4` → cross-side write allowed. pgTAP scenario A (`flight_scope_rls_test.sql:186-214`) asserts both directions write+read.
- RLS read: `0094` `same_flight_or_solo` branch (b) same condition → live standing visible both ways.
- Approve: `approve/actions.ts:67` uses `peersForApproval` → opponent included; test `approve/actions.test.ts:136` ("motstander kan attestere") asserts side2 approves side1 → `?status=approved`. **Green.**
- Submit notify: `submit/actions.ts:131-150` loops `peersForApproval`; test `submit/actions.test.ts:245` asserts `notifyMock` called once with `{userId:'side2', kind:'peer_approval_request'}`. **Green.**

### 2. Foursomes/texas with 4 players: ONE card PER TEAM (two cards), both teams can score both, per-team handicap correct — **PASS**
- `holes/[holeNumber]/page.tsx:464-470` derives `teamNumbers` from the (single-flight) roster → `[1,2]`; `playersForClient = teamNumbers.map(...)` (l.540) → two ClientPlayer cards, each keyed on that team's lex-min-userId captain (l.542).
- Per-team handicap (`teamHandicapFor`, l.487): foursomes/gruesome = sum-diff vs opponents (opponents pulled from `allPlayers` filtered `team !== teamNum && !withdrawn`, l.495); greensome/chapman = 60/40 (`isSixtyForty`, l.479); texas/ambrose/florida = `round(combinedCH * team_handicap_pct/100)` (l.530-536). `combinedCH` is summed over that team's members only — no cross-team contamination.
- **>4 byte-equivalence verified** (diff read line-by-line vs old code): old produced ONE card keyed on `me.team_number` with `oppPlayers = allPlayers.filter(team !== me.team_number)`. New path, when a flight maps to a single team (best-ball convention; matchplay >4 doesn't exist structurally — MEMORY confirms), yields `teamNumbers=[me.team_number]` → one card, `teamPlayers === flight`, identical handicap math. The only behavioral deltas are (a) new `withdrawn_at == null` filter on opponents and (b) new `chs.length===0` guards — both strict improvements, no regression for non-withdrawn games.
- `scoresByUser`/`playerIds` cover the expanded single-flight roster (l.117 `flight.map(user_id)` → scores query `.in('user_id', playerIds)`, l.167). Tee-starter/patsome banners re-scoped to `flight.filter(team === me.team_number)` so they stay my-side-only (l.623, 664).

### 3. Wolf with 5 players: one flight (write + read for all) — **PASS**
- `flightScope.isSingleFlightGame:51` `if (gameMode === 'wolf') return true`. Tests `flightScope.test.ts:71,77`.
- `0094` both helpers have `g.game_mode='wolf'` OR-branch (can_score_for l.101, same_flight_or_solo l.137). pgTAP scenario B (l.220-240) asserts 5-flightless-wolf cross write+read.
- Start: `startScheduledGame.test.ts:330` ("wolf with 5 flightless players → guard skips") green.

### 4. >4 flightless solo: Sekretariatet shows Flighter-section with «Foreslå inndeling» (groups of 4 in signup order) + per-player move; creator/admin only — **PASS**
- `FlighterSeksjon.tsx` — buckets, «Uten flight» warning, «Foreslå inndeling» button, per-player select (flights 1..N+1, the +1 enables 3+3). Tap-targets `min-h-[44px]`/`min-w-[44px]`, `tabular-nums` on counts.
- `flightActions.ts`: `suggestFlightAssignment` (l.65, fetches roster ordered `created_at ASC, user_id ASC` = signup order, l.43-44; `suggestFlightSplit` floor(i/4)+1), `setPlayerFlight` (l.109, capacity check excl. self+withdrawn, l.132-138). Both gated via `requireAdminOrCreator` (l.22).
- Admin page wiring `admin/games/[id]/page.tsx:762-784`: renders only when `eligibleForFlightAssignment` + status scheduled/active. `eligibleForFlightAssignment` returns false for wolf + ≤4 (`flightScope.ts:149`).
- Tests: `flightActions.test.ts` — uauth→login, non-admin/creator→`/`, happy paths, capacity. `flightScope.test.ts` suggestFlightSplit 8 cases incl. signup-order determinism (l.257).

### 5. Venterom (scheduled, >4 solo): player self-selects flight, full flight (4) rejected with Norwegian message, creator override wins — **PASS**
- `ScheduledWaitingRoom.tsx:130-201` flight picker; full flights disabled (l.142 `memberCount >= MAX_FLIGHT_SIZE`, button `disabled`), Norwegian errors via `FLIGHT_JOIN_ERRORS`.
- `flightJoinActions.joinFlight`: membership+active gate (l.43-55), scheduled-only (l.64), capacity-before-write excl. self+withdrawn (l.71-82), **race-guard** re-counts after write and reverts to `previousFlight` (restores null correctly, l.103-109).
- `(home)/page.tsx:419-461` builds `flightOptions` incl. **one extra empty flight** (`maxFlight + 1`, l.439). Creator override = admin `setPlayerFlight` = last write wins (no lock).
- Tests `flightJoinActions.test.ts:118` ("race-guard: after-count > 4 → angrer rad") + full+member+auth cases.

### 6. Start gate: unassigned >4 game blocked (`unassigned_flights`), banner shows who's missing; fully assigned starts — **PASS**
- `startScheduledGame.ts:126-137` `needsFlightAssignment` guard. **Ordering verified**: runs AFTER the matchplay `incomplete_sides` guard (l.114) and BEFORE pending/hcp/flip. `needsFlightAssignment` returns false for ≤4, wolf, and matchplay/team (single-flight or flights-set) → never falsely blocks them.
- Banner: `(home)/page.tsx:320,652-660` — `unassignedCount` from `unassignedActivePlayers`, warning Banner with count.
- `gameErrorMessages.ts:142` maps `unassigned_flights` → norsk.
- Tests `startScheduledGame.test.ts:258-377` — skins>4 blocked, all-assigned proceeds, ≤4 skips, wolf-5 skips, matchplay unaffected. All green.

### 7. «Steng påmelding»: button in Sekretariatet closes/reopens; signup page shows closed state without form — **PASS**
- Button: `admin/games/[id]/page.tsx:552-590` — «Administrer påmelding» card, gated `status==='scheduled' && (open||manual_approval)`, toggles `toggleSignupsClosed`. Status banners l.91-94.
- `toggleSignupsClosed` (`flightActions.ts:162`): scheduled-only (l.178), open/manual_approval-only (l.179-185), sets/clears `signups_closed_at`.
- Signup page closed state: `signup/[shortId]/page.tsx:131` `signupsClosed`, rendered in `renderBody:309-315` ("Påmeldingen er stengt…") with no form — **and it short-circuits before all form branches** (open/team/manual). Game-locked prioritised over closed (l.131).
- Action-level guards (defense-in-depth): `registerForOpenGame` (actions.ts:181), `requestApproval` (actions.ts:365), `submitTeamRegistration` (teamActions.ts:216). Tests `actions.test.ts:616,636,649` + migration column reflected in `database.types.ts` (Row/Insert/Update).
- *(Gap on secondary `/team` accept/attach surface — see NIT-1. Does not violate this criterion as literally specified: the button works and the signup page shows the closed state without a form.)*

### 8. No regression: ≤4 no-flight, best-ball (8), matchplay >4 (structurally absent), scramble teams — full suite green — **PASS**
- Full vitest 3159/3159 green; tsc 0; build OK; lint no new. >4 best-ball hole-card path verified byte-equivalent (criterion 2). `lib/scoring/` untouched (verified — only hole-page presentation handicap math, which mirrors prior logic). No flight filtering in `lib/sync/` (grep clean; only a "in flight" comment). Realtime client list is server-computed.

---

## Findings

### NIT-1 — `acceptTeamInvite` / `attachToCaptainTeam` skip the signups-closed guard (real but low-impact gap)
**What:** When an organizer closes signups on a **team** game (open/manual_approval mode), a co-player can still be added to `game_players` via two paths that lack the `signups_closed_at` guard:
- `teamActions.ts:548` `acceptTeamInvite` — inserts game_players at l.642, only checks `game.status` (game_locked), not closed-signups.
- `teamActions.ts:855` `attachToCaptainTeam` — inserts request + game_players at l.924/959, same gap.

The `/signup/[shortId]/team` page (`team/page.tsx`) that triggers these has **no** `signups_closed_at` gating either, so the UI path is fully reachable.

**Where:** `app/[locale]/signup/[shortId]/teamActions.ts:548-661, 855-998`; `app/[locale]/signup/[shortId]/team/page.tsx` (no closed-state branch).

**Why it matters (and why NIT not SF):** My scrutiny directive explicitly named "co-player accept, email-attach" as paths needing the guard, and Design B.4 says "signup-siden behandler stengt som låst" — the `/team` page is part of the signup surface and does not. So it is a genuine gap on a contract-described surface. **However**, the formal Success Criterion #7 as written (button toggles + signup page shows closed state without a form) PASSES — both hold. Impact is modest: (a) the primary captain entry `submitTeamRegistration` IS guarded at both page + action level; (b) team formats are explicitly OUT of flight-assignment scope (the feature's stated rationale, "ro til å justere flighter", doesn't apply to team games — `eligibleForFlightAssignment` returns false for them); (c) these two paths complete an invitation the captain already initiated before close, not a fresh signup; (d) roster growth is bounded by team_size. Because the literal criterion passes and "only contract criteria count," this is non-blocking — but the owner should decide whether to close it.

**Suggested fix:** Add `if (game.signups_closed_at != null) return { ok:false, error:'signup_closed' };` after the `game_locked` check in both `acceptTeamInvite` and `attachToCaptainTeam` (add `signup_closed` to `AcceptDeclineResult`'s error union), and gate the `/team` page on `signupsClosed` like the main signup page. Add one test per action mirroring `actions.test.ts:616`.

### NIT-2 — `MAX_FLIGHT_SIZE` re-declared as local literal in game-home flightOptions builder
**What:** `(home)/page.tsx:431` declares `const MAX_FLIGHT_SIZE_LOCAL = 4;` instead of importing the exported `MAX_FLIGHT_SIZE` from `lib/games/flightScope.ts` (which the same file already imports other helpers from). Pure DRY; if the constant ever changes (it won't — 4 players/flight is a golf rule) these would drift.

**Where:** `app/[locale]/games/[id]/(home)/page.tsx:431`.

**Why it matters:** Cosmetic. No behavioral risk. Both equal 4.

**Suggested fix:** Import `MAX_FLIGHT_SIZE` and drop the local.

---

## Notes (verified, not findings)
- **pgTAP RLS test** (`flight_scope_rls_test.sql`) could not be executed (no Docker/Supabase CLI). **Verified by reading**: plan(12) across 4 scenarios (singles cross-side write+read, wolf-5, 6-player flightless DENY, 6-player-with-flights same-ALLOW/cross-DENY). Logic correctly exercises the single-flight branch (count<=4 / wolf) AND the unchanged >4-with-flights branch; membership/`withdrawn_at` constraints preserved from 0088. `fs_try_read` probes the helper directly (bypasses the SELECT-policy reveal branch — acceptable, contract notes reveal is unaffected).
- **0094 RLS scoping** verified against the 0088 it replaces: both `can_score_for` and `same_flight_or_solo` keep the `me`/`them` membership joins + `withdrawn_at is null` (write) constraints; the new single-flight OR-branch cannot leak across games (count subquery is scoped to `p_game_id`/`g.id`; wolf branch likewise game-scoped). No classic "OR-branch forgets the join" bug.
- **Norwegian copy** on all new user-facing strings (banners, error maps, FlighterSeksjon, ScheduledWaitingRoom, admin toggle) reads idiomatic bokmål; no «vennligst», no AI-tells, no «X-spillet» redundancy. Compliant with `docs/copy-style.md`.
- **Version/CHANGELOG** discipline fully met (1.110.6, Flighter theme, #543 entries 1.110.1–.6).
- Migration 0094 is **not yet applied to prod** (per contract; SQL evaluated by reading) — column + RLS are backward-compatible with old code, safe to apply pre-merge.

---

## Post-verdict fixes (2026-06-11, commit b5dab9f)

- **NIT-1 FIXED:** `acceptTeamInvite` + `attachToCaptainTeam` har nå `signups_closed_at`-guard (→ `signup_closed`); `AcceptDeclineResult`-union + `mapError` utvidet; stengt-banner på `/signup/[shortId]/team`. 3 nye guard-tester i `teamActions.test.ts` (21/21 grønne).
- **NIT-2 FIXED:** `(home)/page.tsx` importerer `MAX_FLIGHT_SIZE` fra `flightScope` i stedet for lokal re-deklarasjon.
- Gates etter fiks: `tsc --noEmit` 0 feil; scoped vitest 889/889 grønn; v1.110.7 + CHANGELOG-oppføring.
