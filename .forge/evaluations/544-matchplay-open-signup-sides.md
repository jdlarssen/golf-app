# Evaluation: #544 — Matchplay open-signup side-picker + autostart guard

**Verdict: ACCEPT** (with 1 should-fix race-guard defect and minor nits — none reintroduce the original prod failure)

Evaluated independently against `.forge/contracts/544-matchplay-open-signup-sides.md` on branch
`claude/hungry-matsumoto-e7c8e1` (4 commits: 67df822, b397b58, 9692d24, 7bf7f70). Builder checkboxes
were re-verified from scratch, not trusted.

## Gates (run by evaluator)

| Gate | Result | Notes |
|---|---|---|
| `npx tsc --noEmit` | PASS (exit 0, no output) | |
| `npx vitest run` (full) | PASS — 254 files / 3084 tests green, 36s | |
| 4 × #544 test files isolated | PASS — 79 tests green | matchplaySides, startScheduledGame, actions, RegistrationForm |
| `npm run lint` | exit 1 but ZERO new findings | All 20 errors are pre-existing `AppVersionFooter.tsx` `<a>`→privacy. The one `(home)/page.tsx` warning (`Button` unused, line 17) pre-exists on origin/main and is untouched by #544. |
| `npm run build` | PASS (exit 0, no compile/type errors) | |
| Version + CHANGELOG | PASS | v1.109.2, `## 1.109.y — Matchplay · åpen påmelding med side-valg` theme present |

## Success criteria (independent verdict)

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | Open singles MP, creator on side 1 → picker shows side 2 preselected; insert `team_number=2,flight=2` | PASS (code) / WEAK (test) | `RegistrationForm.tsx:59-66` autoSelect only when exactly one side free; `actions.ts:225-226` sets both to rawSide. BUT actions.test.ts:326 ("INSERT med team_number=2") never asserts the insert payload — only checks redirect. See SF-2. |
| 2 | Full side disabled; server rejects `side_full`; both full → "Spillet er fullt" no form | PASS | `RegistrationForm.tsx:153` `disabled={isFull}`; `actions.ts:222-224` pre-insert + `:250-266` race re-count; bothFull banner `RegistrationForm.tsx:105-111`. Tests cover all three. |
| 3 | `startScheduledGame` returns `incomplete_sides`, no status flip, all 6 MP modes; complete starts | PASS | Guard `startScheduledGame.ts:111-117` via `isSideRosterComplete`; test has it.each over all 6 modes × {underbooked, null-team, withdrawn} + complete-path + non-MP bypass (20 cases). |
| 4 | Game-home post-tee-off with incomplete sides shows waiting banner with which side needs how many | PASS | `(home)/page.tsx:308-309` sets flag on `incomplete_sides`; `:401-405` computes shortfall; `:527-542` renders pluralized banner. `gwp.players` carries `team_number`+`withdrawn_at` (getGameWithPlayers.ts:118,125,159). |
| 5 | Non-MP open signup unchanged: `team_number:null, flight:null` | PASS | `actions.ts:200-201` init null, only set in `isMatchplayMode` branch; regression test actions.test.ts:356. |
| 6 | Admin can reassign sides via edit-flow, no code change | PASS (unverified-by-test, but unchanged) | edit/page.tsx still loads `game_players.team_number` into wizard; not touched by this PR. |

## Adversarial probes

### Call-sites of status→active (guard coverage)
`startScheduledGame` callers: admin `startScheduledGameAction` (D5, scheduled), E1 auto-start
(`(home)/page.tsx:306`), and league `startFlight` (`lib/league/actions.ts:647`). All three route
through the guard. League is SAFE — `LeagueFormat = 'stroke'|'stableford'|'modified_stableford'`
(types.ts:12), never matchplay, so `isMatchplayMode` is false and the guard is skipped → no regression.

Direct flips that BYPASS the guard: `admin/games/[id]/actions.ts:182` (`startGame`, draft→active),
`:585` (reopen), `lib/cup/actions.ts:285`, `lib/league/actions.ts:477/631`, `cup/generer/actions.ts:210`.
Of these, cup matches are admin-generated singles_matchplay with BOTH sides pre-staffed → not an
open-signup partial-roster scenario. See SF-1 for the `startGame` draft path.

### invite_only matchplay regression — SAFE
`gamePayload.ts:2268-2269`: `effectiveMode='draft'` only for `registrationMode !== 'invite_only'`.
So invite_only matchplay runs FULL balance validation at publish → wizard staffs both sides →
`isSideRosterComplete` passes → autostart guard is a no-op. No regression.

### Club-member / friend-skip-gate paths — get the picker
`page.tsx:160-164` builds `matchplaySideData` when
`isMatchplayMode && !gameLocked && !isAlreadyRegistered && (open || isClubMember || viewerIsFriend)`,
and both branches (`:302-314`, `:319-337`) pass `sideData={matchplaySideData}`. So a club-member or
friend joining an open MP game DOES get the side-picker and DOES pass a side. No `bad_side` strand:
on roster-fetch error `rosterRows ?? []` still yields a non-null sideData object, so the picker renders.

### `modeTeamSize` undefined risk at (home)/page.tsx:366 — NOT a real bug
`'team_size' in mode_config ? mode_config.team_size : 1` would yield `undefined` if the key existed
with an undefined value, feeding NaN into `computeSideShortfall`. But `ModeConfig` (types.ts:315-447)
makes `team_size` a required number in every matchplay variant, and the publish-validator enforces it.
In practice always a real number. Minor style inconsistency vs actions.ts's `?? 1` (NIT-2).

## Issues found (ranked)

### SHOULD-FIX

**SF-1 — `startGame` (draft→active) lacks the `incomplete_sides` guard.**
`app/[locale]/admin/games/[id]/actions.ts:101-188`. The draft-start path flips status to active
(`:182`) without the matchplay side check. An admin who publishes an open MP game AS DRAFT (wizard
balance validation is bypassed for non-invite_only — gamePayload.ts:2269), manually adds a partial
roster, saves draft, then clicks "Start spillet", would flip a partial-roster matchplay game to
active and reproduce the original stuck/empty-shell scoring bug. The published-open path (the actual
prod incident) is `scheduled` and IS guarded, so this is a narrower, self-inflicted variant — but it
is a real un-guarded flip. Mirror the `isMatchplayMode`/`isSideRosterComplete` check from
`startScheduledGame.ts:111-117` into `startGame`, and add `incomplete_sides` to
`ERROR_MESSAGES_NEW_GAME` (currently only in `ERROR_MESSAGES_EXISTING_GAME`,
gameErrorMessages.ts:139-141 — the draft page redirects to a `?error=` it can't render).

**SF-2 — Race guard can strand a side EMPTY on true concurrent last-slot grab.**
`app/[locale]/signup/[shortId]/actions.ts:250-267`. Two simultaneous registrations to the same
singles side (teamSize=1): both pass pre-insert count (0<1), both insert (side now=2), both re-count
(2>1), both delete their own row → side ends with ZERO players. The contract's edge-case allowed
"enklere løsning OK hvis den er deterministisk" but this isn't correct — the symmetric
"if count>size, I delete" over-deletes. Graceful degradation (autostart guard then blocks; admin
fixes via edit; no broken scoring), so not blocking — but it is a real defect in the headline
race-guard. Correct fix: keep only the overflow row(s) deletable, e.g. order by `created_at`/`id` and
delete only if you're beyond the first `teamSize` rows; or add a partial unique/exclusion mechanism.

**SF-3 — actions.ts:326 test does not verify the inserted side payload.**
`app/[locale]/signup/[shortId]/actions.test.ts:326-354`. Title claims "INSERT med team_number=2" but
asserts only `redirectMock` + `revalidateTag`. `buildSupabaseMock` exposes `__fromCalls`
(table/method/args), so the insert payload `{team_number:2, flight_number:2}` is assertable but isn't
asserted. The test would pass even if the action inserted `null/null`. This is the load-bearing
behavior of success criterion #1 and should be asserted directly.

### NITS

- **NIT-1** — `isSideRosterComplete` overbooked-side case (e.g. `[row(1),row(1),row(2)]` teamSize=1)
  correctly returns false (2!==1) but is untested in matchplaySides.test.ts and startScheduledGame.test.ts.
- **NIT-2** — `(home)/page.tsx:366-367` uses `'team_size' in …` while actions.ts uses `?? 1`. Same
  result for valid matchplay configs; inconsistent defensive style.
- **NIT-3** — CHANGELOG entries ordered 1.109.0, 1.109.2, 1.109.1 (`.2` listed before `.1`). Cosmetic.

## Conclusion

The core contract is met: open-signup matchplay now requires a side, the scheduled/auto-start path
that caused the prod incident is guarded across all 6 modes, non-matchplay and invite_only paths are
regression-free, and the waiting banner renders correctly. All gates pass (lint exit 1 is purely
pre-existing). The race-guard defect (SF-2) and the draft-start gap (SF-1) are real but degrade
gracefully and do not reintroduce the original unrecoverable-scoring failure. **ACCEPT**, with SF-1/SF-2
filed as follow-up issues and SF-3 ideally tightened before merge.
