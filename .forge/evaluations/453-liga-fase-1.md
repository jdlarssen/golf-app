# Evaluation: Liga Fase 1 (#453)

**Verdict: ACCEPT** — with one should-fix UX bug (start-button threshold mismatch) recommended before merge, and a few nits. No blockers. Gates all green, scoring core is correct under adversarial edge-cases, RLS for the participant flight path is sound, and scope discipline holds.

Evaluated branch `claude/intelligent-keller-080a2a` (9 commits `278cc30..44a1287`) against `.forge/contracts/453-liga-fase-1.md`. Read-only; no code modified.

---

## 1. Gates (run independently)

| Gate | Result | Evidence |
|------|--------|----------|
| `npx tsc --noEmit` | **PASS** | exit 0, zero output |
| `npx vitest run lib/league` | **PASS** | 2 files / 17 tests passed |
| `npm run lint` | **PASS** | exit 0; 24 pre-existing warnings, **zero in any liga/league file** (grep for `liga\|league` in output → none) |
| `npm run build` | **PASS** | exit 0; all 6 liga routes present + dynamic (`/admin/liga`, `/admin/liga/[id]`, `/admin/liga/[id]/slett`, `/admin/liga/new`, `/liga/[id]`, `/liga/[id]/runde/[roundId]/spill`) |

Self-eval's gate claims are accurate.

## 2. Scoring core — `lib/league/computeLeagueStandings.ts` — PASS

Read the impl + test (10 Type A tests) and ran **7 additional adversarial tests** (all green) against the cases the task flagged:

- **Penalty `worst_plus_one`**: `penaltyForRound` (l.148-155) = `max(netToPar of players who played the round) + 1`. Only called inside the `counting` loop (`byUser.size > 0`), so `Math.max` never sees an empty set / `-Infinity`. Verified the case where the only player who played a round is the worst → penalty derived from that single value. Correct.
- **`must_play_all`**: a player missing any counting round → `ranked=false`, sorted last (l.91, l.126-134). Verified a ghost player (in `playerIds`, zero results) is unranked-last under `must_play_all`, and that ranked players still get countback among themselves. Correct.
- **Countback tiebreak**: order is `value → countback newest→oldest → roundsPlayed → userId` (l.114-123), matching the contract. Missing cells count as `+Infinity` in countback (l.102-106), so a player who skipped the newest round loses it. Verified fall-through when the newest round is empty for everyone. Correct.
- **Dedup-to-best**: l.27-34 keeps lowest `netToPar` per (round, user). Verified.
- **Round with nobody played**: filtered out of `counting` (l.37) → no penalty, null cells. Verified all-empty-rounds → everyone value 0 / roundsPlayed 0 / ranked true (total), all unranked (average).
- **Player in `playerIds` with zero results**: gets penalty per round (penalty model) or unranked (must_play_all / average). Verified.

No off-by-one or edge-case bug found. The pure aggregator is solid.

## 3. Snapshot — `lib/league/getLigaSnapshot.ts` — PASS

- **net-to-par** (l.297) = `line.totalNetStrokes - par`, `par = teeParByGender[teeBoxId][gender]` = `tee_boxes.par_total_{mens|ladies|juniors}`. This is **exactly** `getRatingForGender(tee, gender).par` (teeRating.ts l.28-32 returns `par_total_{gender}`), so no divergence from the proven helper. Contract scout-verified this formula.
- **Guardrails enforced**:
  - finished only — `if (game.status !== 'finished') continue` (l.254);
  - marker rule — `eligible = non-withdrawn AND submitted`, `if (eligible.length < 2) continue` (l.262-264);
  - complete card — `if (line.holesPlayed !== holes.length) continue` (l.289) — uses the course's actual hole count, so 9-hole courses work;
  - withdrawn excluded — filtered in `eligible` (l.262); the withdrawn player is also absent from the scoring `players` list, so the marker count and the per-player loop both exclude them.
- **Gender mismatch / missing par**: `if (par === null || par === undefined) continue` (l.291-292) — a player whose tee lacks a rating for their gender is silently dropped rather than producing a wrong score. Safe.
- **9-hole par correctness**: net-to-par uses `par_total_{gender}` (the tee's stored par) against `totalNetStrokes` summed over the course's actual holes. This is consistent *given the standard Tørny data-model assumption* that `par_total_*` is the par for the course's holes. Not a bug introduced by this build; it inherits the app-wide convention.
- **Flagged/flight counts** computed over ALL games in the round (not just finished), so the admin "X flights utenfor vindu" badge counts in-progress flights too — intended (the flag is set at creation).

No partial-card slip-through, no par-wrong path found.

## 4. Actions — `lib/league/actions.ts` — PASS (server-side enforcement confirmed)

`startLeagueRoundFlight` (l.306-416), using the **user** client:
- **Marker rule (≥2 distinct)**: `flightIds = unique(caller + co-players minus self)`, `if (flightIds.length < 2) return 'need_marker'` (l.343-344). Server-enforced.
- **Play-window gate**: `if (now < opens_at || now > closes_at) return 'outside_window'` (l.332-335). Server-enforced.
- **Membership**: every flightId must be in `league_players` (l.346-352).
- **already_played block**: queries finished games for the round where the caller is a non-withdrawn `game_players` row (l.356-364). The `.eq('game_players.user_id', user.id)` on the inner join scopes the nested array to the caller, so `withdrawn_at === null` is checked for the caller specifically — a withdrawn-from-prior caller can replay. Correct.
- **`delivered_outside_window`**: `now > original_closes_at` (l.372), set at insert only. Matches contract (only reachable after admin override of `closes_at`).
- **course/tee resolution**: `round.x ?? league.x`, then `if (!courseId || !teeBoxId) return 'round_not_ready'` (l.338-340).
- **Rollback**: on `game_players` insert failure (l.402-405) and on `startScheduledGame` failure (l.408-413) the half-made flight is deleted. Good.

`createLeagueDraft`:
- **course_scope ↔ course/tee consistency** (l.68-71) mirrors the DB CHECK exactly: `single_course_single_tee` needs both, `single_course` needs course only, `multi_course` needs neither. Round rows then materialize `course_id`/`tee_box_id` correctly per scope (l.116-117).

`startLeague`: **≥1 round + ≥2 participants** guard present (l.261-266).

## 5. RLS soundness — PASS (no gap)

Participant flight path runs on the user client. Verified against live policies (migrations not mutated):
- **(a) insert own game** — `games creator insert` `with check (created_by = auth.uid())` (0071 l.24-27); action sets `created_by: user.id`. OK.
- **(b) insert game_players** — `game_players creator insert` gates on parent game's `created_by = auth.uid()` (0071 l.42-49). OK.
- **(c) `startScheduledGame`** updates `game_players.course_handicap` (→ `game_players creator update`, 0071 l.51-63) and `games.status` (→ `games creator update`, 0071 l.29-33) — both gate on the caller being the game's creator. OK.
- **Co-player reads inside `startScheduledGame`** (the subtle one): it reads co-players' `users.hcp_index` (l.82-94) and `users.profile_completed_at` (l.104-110) via the **user** client. The live `users` SELECT policy "users select own or shared games" (0002 l.35-44, never dropped — confirmed by grep) grants reading another user's row when they **share a game** via `game_players`. Crucially, the action inserts `game_players` for ALL flight members (l.393-401) **before** calling `startScheduledGame` (l.408), so by read-time the caller shares the just-created game with every co-player → reads succeed. Ordering is correct.
  - Note: 0071 created the `incomplete_profiles_for_ids` SECURITY DEFINER RPC precisely because the *createGame* path reads users *before* game_players exist; `startScheduledGame` reads *after*, so its direct read is safe. This is an ordering-dependent invariant that the action satisfies — flagging it so future refactors keep the insert-before-start order.

No RLS gap. Leaderboard reads use the admin client (`getLigaSnapshot`), correct for the public/cache-bypass path.

## 6. UI correctness — PASS (one should-fix)

- **Create form field names** (`CreateLigaForm.tsx`) exactly match `createLeagueDraft` reads: `name, season_start, season_end, scoring(hidden net), course_scope(hidden), course_id, tee_box_id, standings_model(hidden), missed_round_policy(hidden), penalty_kind(hidden), penalty_fixed_over_par, frequency, player_ids(hidden JSON)`. Radios use decoy `_*_radio` names so only the hidden inputs post — clean.
- **Scope conditional rendering → DB CHECK**: `course_id` select renders only when scope ≠ multi_course; `tee_box_id` select renders only for single_course_single_tee. Unmounted inputs post nothing → `str() || null` → null. So each scope produces exactly the course/tee presence the CHECK requires. Switching to multi_course clears `selectedCourseId`. Correct.
- **Standings table** (`LeagueStandingsTable.tsx`) reads the right fields (`rank`, `value`, `ranked`, `perRound[].netToPar/penalised/deliveredOutsideWindow`); `tabular-nums`; champagne-gold on rank 1; penalised cells italic; flagged cells get a gold dot; unranked sorted bottom with "–". Matches contract.
- **Public page "Spill" gate** (`app/liga/[id]/page.tsx` l.176): `canPlay = isParticipant && ws==='open' && roundReady` where `roundReady = courseId !== null && teeBoxId !== null`. Agrees with the server (which returns `round_not_ready` when the resolved tee is null). The round-starter page re-gates participant + window + course/tee (l.53-108). Defense in depth, correct.
- **Round-starter** only offers other league participants as co-players (not the broader friends∪co-players the contract mentioned). This is arguably *more* correct (flight members must be league members; the server rejects non-members), a sound simplification.

**SHOULD-FIX (UX): start-button threshold mismatch.** Admin detail (`app/admin/liga/[id]/page.tsx` l.74) sets `canStart = ... && participants.length >= 1` and the hint (l.76-79) says "minst 1 runde og 1 deltaker". But the server `startLeague` requires **≥2** participants (`actions.ts` l.266 → `too_few_players`). With exactly 1 participant the Start button is enabled (no hint shown), the admin clicks it, and gets a generic "Klarte ikke å starte ligaen." banner (`LigaStatusActions.tsx` l.38). No data-integrity issue (server is the source of truth), but the gate threshold and copy are wrong and the failure is opaque. Fix: change `>= 1` to `>= 2` and update the hint to "minst 1 runde og 2 deltakere".

## 7. Scope discipline — PASS

- No F2/F3/F4 functionality built. `LeagueScoring`/`StandingsModel` unions carry `gross`/`both`/`best_n`/`points` as forward-compat members, but `createLeagueDraft` rejects anything but `total`/`average` (l.60), the form only offers net + total/average, and `computeLeagueStandings` only implements those two. No brutto computation, no `group_id`/club coupling, no extra game modes. `gross` appears in `getLigaSnapshot` only as the scoring-context input field name (gross strokes), not as brutto standings.
- Admin "Ligaer" tile added (count via `leagues` draft+active), reuses `pokal` icon — no new icon kind needed.
- Migration `0080` additive (3 tables + 2 nullable games columns + SELECT/admin-write RLS); no existing column/policy changed. `database.types.ts` regenerated (3 league tables, 8 refs to the new games columns).
- MINOR bump 1.82.1 → 1.83.0; CHANGELOG three-layer entry + prior 1.82.y series re-wrapped in `<details>`; flow diagram `06-liga-fremtid.svg/.png` + README added.

Claimed-done items all verified present. The two self-disclosed deviations (force-dynamic instead of `revalidateTag` cache-wiring; E2E covers read-path not full UI scoring) are honest and reasonable — `getLigaSnapshot` is an uncached admin read, so there is genuinely no cache to invalidate, and the numeric scoring path is exhaustively unit-tested.

---

## Bugs / concerns (ranked)

### Blockers
None.

### Should-fix
1. **Start-button threshold mismatch (UX).** `app/admin/liga/[id]/page.tsx:74` enables Start with `participants.length >= 1`, hint at `:76-79` says "1 deltaker", but `lib/league/actions.ts:266` requires ≥2 → generic failure banner. Change to `>= 2` and fix the hint. (`LigaStatusActions.tsx:38` also collapses all start errors to one message — a `too_few_players`-specific string would help, but the threshold fix alone resolves the reachable case.)

### Nits
2. **`startScheduledGame` co-player reads depend on insert-before-start ordering.** `lib/league/actions.ts` inserts `game_players` (l.393) before `startScheduledGame` (l.408); the live "users select own or shared games" policy only lets the caller read co-players' `hcp_index`/`profile_completed_at` *because* the shared game already exists. Correct today, but fragile to a future refactor that reorders. Worth a code comment.
3. **`createLeagueDraft` doesn't validate `missed_round_policy` / `penalty_kind` / `scoring` values** (only casts them); relies on DB CHECK as backstop. Admin-only + form sends fixed values, so not exploitable — defense-in-depth nit.
4. **Admin detail surfaces a flagged-flight *count* badge, not a per-flight *list*** as the contract literally said ("liste over flights"). Covered by "Claude's Discretion" on admin-detalj layout; functionally the flag is visible. Acceptable.
