# Evaluation: Sideturnering (LD/CTP) på matchplay-duellkortet (#585)

**Verdict: ACCEPT**

Independently verified the two-commit change (refactor `dc93208b` + feature `284602a3`)
against the contract `.forge/contracts/585-matchplay-side-tournament-section.md`. All
success criteria and gates hold; no regressions, dead code, or i18n gaps found.

---

## 1. Gates (run, not trusted)

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | **exit 0**, no output |
| `npx vitest run "app/[locale]/games/[id]/leaderboard" "app/[locale]/admin/games/new" "lib/scoring" "messages"` | **88 files passed, 1184 tests passed**, 0 failed |
| `npx vitest run messages/catalogParity.test.ts` (isolated) | **3 passed**, exit 0 |

Constraint noted: this worktree has no `.env.local`, so `npm run build` and Playwright
cannot run meaningfully. UI verified via code structure (mirrors #576 evaluation). Not
treated as a failure.

---

## 2. Success Criteria — per-criterion findings

### SC1 — Wizard re-enables side-tournament toggle for matchplay
**PASS.** `useGameFormState.ts:510` `const sideTournamentSupported = true;` (was
`!isMatchplayFamily(gameMode)`). The `isMatchplayFamily` import was removed cleanly
(`useGameFormState.ts:9`) and grep confirms zero remaining uses in that file; the helper
itself still lives in `lib/scoring/index.ts` + `lib/scoring/modes/types.ts` (so removing
only the unused import is correct). Both `BasicsSection.tsx` and
`AdvancedSettingsSection.tsx` still gate the fieldset on `{sideTournamentSupported && ...}`,
now always-true. The returned `sideEnabled` was changed from `sideEnabled &&
sideTournamentSupported` to raw `sideEnabled` (`useGameFormState.ts:~1523`) — raw toggle
preserved across format switches. Updated test `useGameFormState.test.ts` describe
«sideturnering-gating (#585 — på for alle formater)» asserts `true` for all 6 matchplay
modes + preserved toggle on format-switch-and-back. In passing suite.

### SC2 — `computeSideTournament` is a behavior-preserving extraction
**PASS.** Read `renderSideTournamentTabs` before/after (commit `dc93208b`).
`computeSideTournament` (page.tsx:1380–1580) owns exactly the format-independent work
(fetch `game_side_winners`, build 18-element `coursePars`/`courseStrokeIndices` with the
par→4 / SI→hull-nr sparse fallback, per-player gross/netto filtering `users == null` and
`withdrawn_at != null`, team grouping, `calculateSideTournament`, build
`SideTournamentTeam[]`) and returns precisely the props `SideTournamentView` consumes.
`renderSideTournamentTabs` (page.tsx:1587+) is now a thin caller that still wraps
`<SideTournamentView {...data} />` in `LeaderboardTabs` under `AppShell` + `TopBar` with
the same `mainContent`/`backHref` — verified line-by-line. No score/podium behavior change.
1184 leaderboard+adjacent tests green confirm no regression.

### SC3 — Three matchplay render functions compute + pass the section, correctly gated
**PASS.** Shared helper `renderMatchplaySideSection` (page.tsx:1623–1641):
`if (game.status !== 'finished' || !game.side_tournament_enabled) return undefined;`
then `computeSideTournament({ ..., teamGrouping: 'byTeamNumber' })`, and
`if (data.teams.length === 0) return undefined;`. Called and result passed as
`sideTournamentSection` in `renderMatchplay` (page.tsx:1727), `renderFourballMatchplay`
(1855), and `renderFoursomesMatchplay` (1983). `gwp.players` passed to all three carries
`user_id` + `team_number` + `users` + `course_handicap` (page.tsx ~1655 opts type),
structurally compatible with `SideTournamentPlayer`. tsc exit 0.

### SC4 — `MatchplaySideTournamentSection` renders minimal LD/CTP + full view behind `<details>`
**PASS.** Component (`MatchplaySideTournamentSection.tsx`): builds `firstNameById` from the
two teams' members, emits one headline `<li>` per crowned LD slot (lines 49–61) and CTP
slot (62–74) via `t('longestDrive', {pos, name})` / `t('closestToPin', {pos, name})`;
slots with no crowned winner are silently skipped (line 53 `if (!w?.winnerUserId) continue`).
The full `<SideTournamentView {...props} />` sits inside a `<details>` (lines 91–107) with
summary `t('showBasis')` and a `min-h-[44px]` tap target. Test asserts
`data-testid="matchplay-side-tournament"`, `Lengste drive #1: Alice`,
`Nærmest pinnen #1: Bjørn`, the «Vis poenggrunnlaget» summary inside a `<details>`, and
expanded `SideTournamentView` content («Slik gis poengene» + both team rows). Green.

### SC5 — Duel views byte-identical when `sideTournamentSection` is undefined
**PASS.** Diffs on all three views (`MatchplayMatchView`, `FourballMatchplayView`,
`FoursomesMatchplayView`) are minimal and additive only: add `ReactNode` import, add
optional `sideTournamentSection?: ReactNode` prop, destructure it, render
`{sideTournamentSection}` after the duel card. React renders `undefined` as nothing →
identical output when the prop is absent. Existing co-located view tests pass with no
assertion changes (default `undefined`).

### SC6 — Version bump + CHANGELOG
**PASS.** `package.json` 1.126.1 → **1.127.0** (minor — new user-visible surface,
correct). `CHANGELOG.md` adds theme `## 1.127.y — Sideturnering på matchplay-duellen`
with tagline blockquote + `<details>Teknisk` section (Added/Changed), per
`docs/changelog-conventions.md` three-layer convention. New Norwegian copy reads idiomatic
(no AI tells: «Nå kan du ha sideturnering på matchplay også…», action-oriented).

---

## 3. Regression / gap hunt

- **Singles matchplay (two teams-of-1):** Traced. `teamGrouping: 'byTeamNumber'`
  (page.tsx:1477–1493) groups `eligiblePlayers` by `team_number`, skipping `null`/`0`,
  producing two teams of 1 for singles (validator enforces `team_number ∈ {1,2}`). The
  best-ball-per-hole for a team-of-1 is just the player's own netto (page.tsx:1509–1518),
  and team-aggregated `*_team` categories correctly drop out. **Not a bug.**
- **Empty / both-sides-withdrawn:** Both withdrawn → `eligiblePlayers` empty → `teamGroups`
  empty → `data.teams.length === 0` → `renderMatchplaySideSection` returns `undefined` →
  section not rendered. Guarded. **No throw.**
- **One side withdrawn (1 team):** Guard only catches 0 teams, so 1 team still renders.
  Verified `calculateSideTournament` (lib/scoring/sideTournament.ts:400) has **no `throw`
  statements** and **no fixed 2-team indexing** (`teams[0]`/`teams[1]` / `length === 2`
  grep empty) — it maps/reduces/sorts over arbitrary team counts. A one-team standing is
  graceful degradation, not a crash. **No throw-risk.**
- **Broken `renderSideTournamentTabs` callers:** Score-format callers still pass the same
  gwp/rawHolesRows/rawScoresRows/backHref/mainContent/teamGrouping shape; signature
  unchanged externally; tsc exit 0 + 1184 tests green. **None found.**
- **Dead code / unused imports:** `isMatchplayFamily` import removed from useGameFormState
  with zero remaining uses there; helper retained where still used. No other dead imports
  introduced (tsc clean). **None found.**
- **i18n:** `leaderboard.matchplaySide` present in BOTH `messages/en.json` and
  `messages/no.json` with identical key sets (`closestToPin, heading, longestDrive,
  showBasis`); structure-identical confirmed programmatically. catalogParity.test.ts
  green. No hardcoded user-facing Norwegian in the new component — all strings go through
  `t(...)`. **None found.**
- **RSC boundary:** New component uses `useTranslations` (next-intl isomorphic hook), same
  as the existing `SideTournamentView` (neither carries `'use client'`); section is built
  server-side and slotted as a node. Consistent with established pattern; tsc clean.

---

## 4. Out-of-scope / deferred (correctly untouched)

- `calculateSideTournament` logic and `game_side_winners` semantics unchanged.
- Live/scheduled rendering gated out (`status === 'finished'` only).
- No backfill/migration; no new `GameMode` member (avoids exhaustive-switch build trap).
- Hull-for-hull surfaces for matchplay not touched.

Live prod spot-check (matchplay game with side tournament on, verify section + expand on
tornygolf.no) is appropriately left to the owner per the no-`.env.local` constraint.
