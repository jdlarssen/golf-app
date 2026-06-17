# Skeptical evaluation — audit batch (7 issues), 2026-06-17

Branch `claude/crazy-wescoff-f9210a` (7 atomic commits on `origin/main`).
Evaluator method: read each contract + live GitHub issue, diff the actual code,
diff the two SQL migrations against their latest prior definitions
byte-for-byte, run `tsc --noEmit` and the targeted vitest suites.

**TOP-LEVEL VERDICT: ACCEPT** — all seven fixes are correct, complete, and
scoped. Gates green. Only cosmetic doc nits found (listed at end), none blocking.

---

## Gate results (actual)

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | **exit 0, zero output** (clean) |
| `npx vitest run lib/league lib/scoring/modes/nassau.test.ts "app/[locale]/games/[id]/leaderboard" "app/[locale]/admin/games/new"` | **62 files / 438 tests passed, exit 0** |
| `lib/league` (677+703) | 7 files / **67** passed |
| `lib/league/computeLeagueStandings.test.ts` (703) | 1 file / **34** passed |
| `lib/league/getLigaSnapshot.test.ts` (677) | 1 file / **2** passed |
| `lib/scoring/modes/nassau.test.ts` (684) | 1 file / **32** passed |
| `app/[locale]/games/[id]/leaderboard` (679) | 37 files / **186** passed |
| `app/[locale]/admin/games/new` (689) | 17 files / **153** passed |

Every count matches the figure each contract claimed. Working tree clean. SQL
tests (security_definer_hardening_test.sql) are pgTAP catalog assertions run via
`supabase test db` — not part of the vitest gate and only pass once the migration
is applied; verified structurally, not executed (no local PG).

---

## Per-issue verdicts

### #703 best_n never-played guard — ACCEPT
- `computeLeagueStandings.ts:138` swaps the weaker global `candidates.length === 0`
  for the per-player `roundsPlayed === 0`. Confirmed all four branches now use the
  same per-player guard: `average` (`played.length === 0`, :123 — same filter as
  roundsPlayed), `best_n` (:138), `points` (:159), `total` (:164). `roundsPlayed`
  (:114) = `counting.filter(rm => rm.byUser.has(userId)).length` — genuine "≥1
  counting round" measure. On guard hit, `value` stays `0` (init), not the
  penalty-fill sum — correct.
- The two edited pre-existing tests encoded the BUG: the old `penalty-fills up to N`
  asserted `ranked === true` for never-played C (`roundsPlayed === 0`), and the
  stableford `best_n: a no-show 0-fills and stays ranked last` asserted `ranked
  === true`. Both correctly flipped to `ranked === false`; the legal penalty-fill
  path (played ≥1) was split into its own renamed test. No "while I was here" creep.
- New tests at test.ts:189, :235, :369 prove the issue scenario in both directions.

### #677 stableford liga per-gender par — ACCEPT
- `getLigaSnapshot.ts:230-261` widens the `holesByCourse` map type to carry
  `parByGender` and builds `{ mens, ladies, juniors }` from the three columns;
  :320-325 spreads `parByGender: h.parByGender` into the holes array fed to
  `computeFlightRoundValues`. Exactly the issue's proposed fix.
- Verified the holes query (`:183`) already SELECTed `par_mens, par_ladies,
  par_juniors` — pure mapping, no new DB call. `ScoringHole.parByGender`
  (types.ts:616) shape matches. `parFor` (parResolver.ts:19-20) returns
  `parByGender[gender ?? 'mens']` when present, else `hole.par` (= par_mens
  fallback, retained). No change to roundScoring/stableford, as claimed.
- New Type-A test (getLigaSnapshot.test.ts:177) is a real discriminator: F
  (ladies, par_ladies=5) and M (mens, par_mens=4) both gross {5,4}; bug ties both
  at 3, fix gives F 4 → `net.rows[0] === 'F'`. Math sound.

### #684 Nassau tiebreaker padded rank — ACCEPT
- `NassauUnitLine` gains `total18SectionRank: number` (types.ts), keeps
  `total18EffectiveStrokes` as display-only — per contract.
- `nassau.ts:285` `total18SectionRank = total18Line?.rank ?? 999`. The sort
  comparator (:306-307) and both tie-detection comparisons (:319, :327) now use
  `total18SectionRank`, not the raw subtotal.
- Traced `total18Line.rank` to `computeSection`→`rankTeams` with 999-padding
  (nassau.ts:39, :130, :140) — genuinely the padded rank that handles partial
  rounds. So a completed round beats a partial one on a units tie.
- New TDD test (nassau.test.ts) is a real red→green: u1 plays only front 9 at
  bogey (raw 45), u2 plays all 18 at par (raw 72), both 0 units; bug ranks u1
  ahead (45<72), fix asserts `u2.rank < u1.rank`. The 3 UI fixtures (NassauPodium/
  View/HolesView) got the new field — no spurious assertions.

### #671 harden SECURITY DEFINER — ACCEPT (highest scrutiny)
- **Part 1:** `0104` does `revoke execute ... email_is_in_auth_users(text) from
  anon` only — subtractive, leaving the 0017 `authenticated` grant intact.
  Correct signature `(text)` (0017 param `email_to_check text`). Verified `0104`
  does NOT revoke/touch `email_is_invited` (mentioned only in comments) — the
  pre-login `sendCode`/`shouldCreateUser` gate is preserved. `email_is_invited`
  anon grant still lives in 0013.
- **Part 2:** Each of the 5 helpers recreated with `CREATE OR REPLACE` adding
  `SET search_path = public, pg_catalog`. Extracted each latest-prior definition
  (is_admin→0002, same_flight→0002, is_in_game→0003, can_score_for→0095,
  same_flight_or_solo→0095) and confirmed bodies are BYTE-IDENTICAL except the
  added search_path line — including the multi-branch can_score_for and
  same_flight_or_solo logic (flight-equality, wolf, ≤4-active count, withdrawn_at
  filters). `security definer stable` preserved; ACLs preserved by CREATE OR
  REPLACE. No behavior change.
- Test file: 8 pgTAP catalog assertions (anon-revoked, authenticated-retained,
  email_is_invited-anon-preserved, search_path on all 5). Solid for a migration.

### #660 decide_join_request cap incl. invitations — ACCEPT (highest scrutiny)
- Diffed `0105` `decide_join_request` against the latest prior (0076) line by
  line: the ONLY substantive change is the cap-count block — from
  `select count(*) ... group_members` to `(count group_members) + (count
  club_invitations WHERE group_id = v_group AND accepted_at IS NULL AND
  expires_at > now())`. Everything else identical: signature `(uuid, boolean)`,
  `security definer set search_path = ''`, `is_group_admin` authz, `already_decided`
  / `request_not_found` / `not_authorized` raises, `club_expired` branch, the
  insert + status update, return codes (`approved`/`rejected`/`club_full`/
  `club_expired`), rejection path. (One cosmetic comment-wording change on the
  `valid_until` line — harmless, actually more accurate.)
- The new cap formula is byte-identical to the proven `add_club_member_by_email`
  (0099) pattern. `club_invitations` table has exactly `group_id`, `accepted_at`,
  `expires_at`. Cap comparison `>=` preserved verbatim — no off-by-one. The
  pre-insert occupancy (existing members + open invites) is the correct count for
  the approval path (new member inserted after the check). ACL preserved via
  CREATE OR REPLACE (no re-grant — correct).
- Matches the issue's verified scenario (cap=10, 9 members + 1 open invite now
  blocks approval). UI already handles `club_full` (acceptance criterion noted as
  pre-satisfied). The shared-helper extraction the issue *suggested* was not done,
  but the contract explicitly scoped it out as optional — not a gap.

### #689 CupSetup dead format gate — ACCEPT
- `CupSetup.tsx` removes `atLeastOneFormat` derivation, the error `<p>`, and the
  `disabled` prop — exactly the 3 deletions in the contract/issue. `grep` confirms
  zero remaining `atLeastOneFormat` references in the dir. Checkboxes stay as
  intent UI.
- Verified `createTournamentDraft` (lib/cup/actions.ts:133-148) reads only
  group_id/name/team_1_name/team_2_name/points_to_win/fourball_allowance_pct/
  foursomes_allowance_pct — no format field. The gate was genuinely dead.
- Test updated to assert the button stays enabled with all formats unchecked;
  removed the old `toBeDisabled()` + "velg minst ett" assertions that encoded the
  dead gate.

### #679 live leaderboard auto-refresh — ACCEPT
- New `LeaderboardRealtime.tsx` reuses `subscribeRealtimeChannel` (no reinvented
  WebSocket). Verified the helper owns the setAuth quirk
  (`supabase.realtime.setAuth(access_token)` before subscribe), gives each call a
  unique topic suffix (`#${n}`) to prevent collision/double-subscribe, and does
  synchronous leak-resistant cleanup. Component debounces 300ms, returns
  `unsubscribe()` from the effect, deps `[active, gameId, router]`.
- gameId fallback: `gameId` prop when given, else `window.location.pathname`
  regex `/\/games\/([^/]+)/` — correct even with the `/no/games/<id>/...` locale
  prefix. Deliberately NOT `useParams` so it doesn't break the ~14 format-view
  tests that mock only `useRouter` — the co-located test mirrors that partial mock
  to prove it.
- Mounted ONCE in BOTH `LeaderboardShell` branches (chromeless + full) in
  LeaderboardChrome.tsx → all ~14 format/standings views inherit it. holes/page.tsx
  gets a `withRealtime(body)` wrapper around EVERY format branch incl. the generic
  `DrilldownBody` fallback, passing `gameId={id}` + `active={isActive}` (genuine
  `game.status === 'active'` gate, :155).
- Double-subscription check: the two existing `PreRoundLeaderboardRealtime`
  mounts (page.tsx:3741, :3851) are inside bare `<AppShell>` pre-round states, NOT
  inside `LeaderboardShell`; pre-round and format-view render paths are mutually
  exclusive returns, so no path mounts both. Even if it did, the `#n` topic suffix
  keeps them independent.
- Known deviation (finished podiums get an inert `active=true` subscription in the
  shell) is acceptable: a finished game emits no `scores` INSERT, so the channel is
  idle; the genuine gate exists where it matters (per-hull). A real shell gate would
  touch 19 call-sites — correctly out of scope.
- Co-located test: subscribes when active (`leaderboard-live:game-from-route`),
  registers INSERT handler with filter `game_id=eq.game-from-route`, debounced
  refresh fires, NO subscription when `active=false`. Full leaderboard suite
  (37/186) stays green.

---

## Scope-creep / discipline check

- Each of the 7 commits is atomic and touches only its contracted files + the
  contract doc + CHANGELOG.md + package.json/package-lock.json (version-bump
  discipline). No unrelated files, no gold-plating.
- Version bumps present on every commit (hook-enforced): feat(leaderboard) =
  minor `1.133.0`; the six fixes = patches `1.133.1`–`1.133.6`. The feat is the
  newest commit but carries `.0` while fixes carry `.1`–`.6`, so the numbers are
  not monotonic by commit order — cosmetic only, each commit still bumped +
  changelogged.

## Non-blocking nits (cosmetic, no code/behavior impact)

1. LeaderboardChrome.tsx JSDoc says LeaderboardRealtime "leser spill-ID fra
   rute-segmentet (`useParams`)" — but the component reads
   `window.location.pathname`, and its own JSDoc explains the deliberate choice
   NOT to use useParams. Stale comment.
2. security_definer_hardening_test.sql header comment item 3 says
   "email_is_registered STILL has NO EXECUTE grant to anon" but the actual SQL
   asserts `email_is_invited` retains anon. The test is correct; the header
   comment numbering is off.
3. 0105 keeps a one-line comment reword on the `valid_until` branch (cosmetic,
   more accurate than before).

None warrant a NEEDS WORK. Recommend filing the two stale-comment nits as a
trivial follow-up or fixing inline if another commit lands here.
