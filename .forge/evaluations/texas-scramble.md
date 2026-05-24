# Evaluation: Texas Scramble (issue #44)

## Verdict
ACCEPT

The implementation honors every Success Criterion from the contract and every Key Decision. Gates pass cleanly (911/911 tests, `tsc --noEmit` clean). The DB migration is verified applied to prod with all 5 modes in the CHECK constraint. Two minor deviations from the contract noted (captain-selection mechanism + defensive-fallback behavior) — both are explicit "Claude's Discretion" calls and not in violation of any hard requirement.

## Success Criteria

- [PASS] **Migration 0033 widener `games_mode_check` to 5 verdier** — Confirmed via Supabase MCP. Constraint text: `CHECK ((game_mode = ANY (ARRAY['best_ball_netto'::text, 'stableford'::text, 'singles_matchplay'::text, 'solo_strokeplay_netto'::text, 'texas_scramble'::text])))`. Migration `20260524224348_texas_scramble` listed in applied migrations. File: `supabase/migrations/0033_texas_scramble.sql`.
- [PASS] **Admin kan opprette Texas-spill med team_size=2** — `ModeSelector` tile exists (`app/admin/games/new/ModeSelector.tsx:227-232`), `ENABLED_COMBOS.texas_scramble` permits `[2, 4]` (`TeamSizeSelector.tsx:58`), validator path: `gamePayload.ts:721-749` (test "publish med 2 lag á 2 spillere"). Mode-chip displays "Texas scramble" via `MODE_LABELS` (`types.ts:23`).
- [PASS] **Admin kan opprette Texas-spill med team_size=4** — Same as above, plus test "publish med 2 lag á 4 spillere" (`gamePayload.test.ts:751`).
- [PASS] **Lag-HCP-formel: 4-mannslag CH 10+15+20+25, 10% → teamHandicap=7** — Test `teamHandicap = round(combinedCH × pct / 100) — NGF 4-mannslag 10%` (`texasScramble.test.ts:174-194`). Also covers 2-mannslag 25% (`:196`), Math.round (`:216`), pct=0 (`:236`), pct=100 (`:255`). Implementation: `texasScramble.ts:108`.
- [PASS] **Tap writes to scores with user_id=captainUserId, entered_by=tapper** — `app/games/[id]/holes/[holeNumber]/page.tsx:189-225` builds `playersForClient` with `userId: captain.user_id` (where captain is lex-min). `HoleClient.tsx:311-319` calls `writeScore({ userId: playerId, enteredBy: myUserId })` — `playerId` always = captain.user_id for Texas (only one player object in array). Test `leser scores fra kaptein-raden` (`texasScramble.test.ts:127`) verifies captain semantics at scoring level.
- [PASS] **Leaderboard ranks teams by lowest totalNet with 5-tier tie-break** — Implementation: `texasScramble.ts:152-161` uses `rankTeams` from `lib/scoring/tiebreaker.ts`. Tests "lavest totalNet rangeres først" (`:395`) and "tie-break-cascade: back-9 vinner" (`:430`).
- [PASS] **Mail template sends correct "Laget endte på X. plass"-text** — Implementation: `gameFinishedNotification.ts:524-569` (HTML + text variants). Output format matches contract: «Laget endte på 2. plass av N lag med 72 slag netto (78 brutto)». 5 dedicated Texas tests in `gameFinishedNotification.test.ts:580-720` covering 1st/4th place, 2- and 4-mannslag, partner-list dropping, null first-name. Wired in dispatcher at `:181-184`.
- [PASS] **Version bump + CHANGELOG entry per user-visible commit** — `package.json`: 1.15.4 → 1.16.4 (5 bumps: 1.16.0, .1, .2, .3, .4). CHANGELOG has 1.16.y series header + 5 entries with both stakeholder-tagline blockquotes and `<details>Teknisk</details>` sections.

## Key Decisions

- [HONORED] **NGF aggregate formula (default 25/10, admin-configurable 0-100)** — Implementation: `texasScramble.ts:108` uses `Math.round((combinedCH * handicapPct) / 100)`. Defaults set in `GameForm.handleModeChange`/`handleTeamSizeChange` (`GameForm.tsx:333-348`) via `defaultTexasHandicapPct(nextSize)`. Validator accepts 0-100 (`gamePayload.ts:628-634`).
- [HONORED] **Delt lag-rad i scores-tabellen (captain owns rows)** — Captain selection: `pickCaptain(members)` returns lex-min userId (`texasScramble.ts:40-51`). Hull-page server constructs ONE ClientPlayer per team with `userId: captain.user_id` (`page.tsx:213-225`). All stepper-events route via `writeScore({ userId: captain.user_id, enteredBy: myUserId })` regardless of which member tapped.
- [HONORED] **Lag-størrelse 2 eller 4 only in v1** — `ENABLED_COMBOS.texas_scramble: new Set<TeamSize>([2, 4])` (`TeamSizeSelector.tsx:58`). Validator: `parseTexasTeamSize` returns null for "3" (`gamePayload.ts:614-619`); validator returns `unsupported_mode_size_combo` (`:553-555`). Tested: `publish med team_size=3 → unsupported_mode_size_combo` (`gamePayload.test.ts:799`).
- [HONORED] **Drive-distribusjon ikke håndhevet** — No DB column or UI for tracking drives. Spec-compliant.
- [HONORED] **DB-migration widener to all 5 modes** — `supabase/migrations/0033_texas_scramble.sql` widens to all 5 verdier; verified via MCP on prod DB.

## Edge Cases

- [COVERED] **Solo spiller på lag → team_balance ved publish** — Test "publish med ubalansert lag (3 av 4) → team_balance" (`gamePayload.test.ts:779`). Logic: `validateTexasScramble` checks `teamCounts.get(team) !== teamSize` (`:589-593`).
- [COVERED] **team_handicap_pct = 0 → gross-modus** — Test in both validator (`gamePayload.test.ts:840`) and engine (`texasScramble.test.ts:236`).
- [COVERED] **team_handicap_pct = 100 → full sum** — Test in both validator (`gamePayload.test.ts:860`) and engine (`texasScramble.test.ts:255`).
- [COVERED] **Empty teams not published / draft tolererer** — Tests: draft 0 spillere (`gamePayload.test.ts:949`), draft ufullstendige lag (`:934`), publish ingen spillere → `min_players_for_mode` (`:880`).
- [COVERED] **9-hole course works** — Test "9-hulls bane fungerer" (`texasScramble.test.ts:484`).
- [COVERED] **All-null gross** — Test "alle hull null gir totalNet 0 og missingHoles fylles" (`texasScramble.test.ts:509`). Also "teamNet er null når teamGross er null" (`:322`).
- [DEVIATION] **Lag uten kaptein returnerer tomt resultat istedenfor å kaste** — Contract said engine should return empty shell defensively. Implementation throws `Error('pickCaptain: empty team')` (`texasScramble.ts:41-43`). However, by construction the throw is unreachable: `teamPlayers` map only contains teams with ≥1 member (filtered at `:78-84`), so empty-team code path never executes in practice. Minor deviation, no observable defect.
- [COVERED IMPLICITLY] **Peer approval — same team** — `app/games/[id]/approve/page.tsx:69` gates on `me.flight_number === target.flight_number`. Texas validator sets `flight_number = team_number` so peer-on-same-team holds. No Texas-specific test added but logic is correct by inheritance.

## Out of Scope Verification

- [HONORED] **3-mannslag NOT implementable** — `ENABLED_COMBOS.texas_scramble = [2, 4]` excludes 3. `parseTexasTeamSize` returns null for "3". Validator returns `unsupported_mode_size_combo`. Tested.
- [HONORED] **Drive-distribution tracking NOT in code** — `git grep -r drive_count\|drives_per_player` returns nothing related to Texas.
- [HONORED] **WHS-tiered formula NOT in code** — Only NGF-aggregate is implemented. `mode_config.team_handicap_pct` is a single number, no `handicap_formula` field.
- [HONORED] **Multi-runde-turneringer NOT in code** — Each `games` row remains single-round.

## Gates

- [PASS] **tsc --noEmit** — Exit code 0, no output.
- [PASS] **all tests** — 78 test files, 911 tests passed (matches contract's expected 911).
- [PASS] **scoring tests** — `lib/scoring/modes/texasScramble.test.ts` — 22 tests passed.
- [PASS] **validator tests** — `lib/games/gamePayload.test.ts` — 64 tests passed (includes the 18 Texas tests starting at `:687`).
- [PASS] **mail tests** — `lib/mail/gameFinishedNotification.test.ts` — 27 tests passed (includes 5 Texas tests at `:580`). `gameFinishedRecipients.test.ts` also has 3 Texas tests, all passing.

## Files Likely Touched

Contract listed ~18 files; 26 actually touched. Differences:
- **Added beyond contract**: `app/admin/games/[id]/page.tsx` (added `isTexas`-narrowing for admin protocol-page; reasonable scope-completion), `app/admin/games/[id]/edit/page.tsx` (added `texas_team_handicap_pct` + `team_size` extraction from `mode_config` for edit prefill; required for the spec's mode-locked-after-publish flow). Both are necessary for end-to-end consistency.
- **Untouched (contract listed but unused)**: `lib/games/getGameWithPlayers.ts` and `lib/leaderboard.ts` — these were "possibly touched depending on captain-selection choice". Builder chose option (b) lex-min userId, so call-site changes were not needed.
- **Tests went to existing file**: Contract specified `lib/games/gamePayload.texas_scramble.test.ts` (new); builder added tests to existing `lib/games/gamePayload.test.ts`. Equivalent.
- **Added beyond contract**: `lib/mail/gameFinishedRecipients.test.ts` (3 new Texas tests for recipient-building — proper test coverage that the contract underspecified).

## Issues Found

1. **Captain-selection deviates from recommendation** — `texas-scramble.md:161-166` recommended option (a) extending `ScoringPlayer` with a stable sort-key (`addedOrder`). Builder chose option (b): lex-min userId. Contract explicitly permits this under "Claude's Discretion" (`:300`). Functional impact: deterministic across sessions but "alphabetic min" carries no user-meaning. UI rendering order for `members` is lex-sorted with captain first; works but isn't "addedOrder" semantically. **Severity: NONE — explicitly allowed by contract.**

2. **Defensive empty-team throws instead of returning empty shell** — `texasScramble.ts:41-43` throws on empty team; contract Edge Case (`:282`) said "scoring-motoren returnerer tomt resultat for det laget istedenfor å kaste". Unreachable in practice by construction (filter at `:78-84`). **Severity: LOW — deviation from contract intent, no observable defect since unreachable.**

3. **Empty-team path has no test** — `pickCaptain`'s throw path is dead code with no test. Not a functional defect but adds zero documentation value. **Severity: LOW — defensive code could be removed or replaced with a comment.**

4. **Peer approval — no Texas-specific test** — Logic is correct (`flight_number === flight_number` works because validator sets `flight = team`), but no test asserts that a non-team-member cannot approve a Texas team-mate's scorecard. **Severity: LOW — inherited behavior is correct, would be nice to lock in via regression test.**

## Notes

- All 5 modes are now in the prod CHECK constraint; the migration also fixes the latent matchplay + solo-strokeplay-netto bug (they were shipped in TS but rejected by prod DB CHECK, just nobody had created such a game yet).
- Norwegian copy follows project conventions: blockquote-tagline-first in CHANGELOG, Fraunces for tall, custom Texas SVG icon, proper humanizer-aware copy ("Lagene spiller én ball", «guillemets», etc.).
- `prefers-reduced-motion` is handled globally in `app/globals.css` via `.reveal-up` and `.confetti-piece` rules — TexasScramblePodium inherits this. Confirmed.
- Test count went 903 → 911 (+8), matching the CHANGELOG note for 1.16.3.
- Captain semantics are documented in JSDoc on `pickCaptain` and the engine module header.
- 4 commits are user-visible (`feat(...)`) and all 4 have version bumps + CHANGELOG entries — passes the project's pre-commit hook gate.
