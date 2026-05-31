# Evaluation: Chapman matchplay (#290)

# ACCEPT

Independent skeptical verification of the `chapman_matchplay` feature on branch
`claude/elated-gagarin-821f23` against `.forge/contracts/290-chapman-matchplay.md`.
All success criteria met; gates green; adversarial checks pass. No chapman-specific
defects found.

Diff scope: 31 files, +1073/−61 (`git diff --stat origin/main...HEAD`). 7 commits
(`35ce4d3` engine extraction → `0ebd5d7` contract close).

---

## Gate outputs (run by evaluator)

- **`npm run build`** → **PASS**. Exit 0, "✓ Compiled successfully in 2.5s". All
  exhaustive switches/Records (GameMode union, MODE_LABELS, GameModeConfig,
  modeValidators, scoring router, cup-leaderboard union, icons, modeGuide,
  allowanceCopy, TeamSizeSelector, ReadyStep) compile with `chapman_matchplay`.
- **`npx vitest run lib/scoring/modes/chapmanMatchplay lib/scoring/modes/foursomesMatchplay lib/games/gamePayload "app/games/[id]/holes/[holeNumber]/ChapmanPhaseReminder"`**
  → **PASS**. 4 files, **243/243** tests.
- **`npx vitest run`** (full suite) → **PASS**. 189 files, **2238/2238** tests.
  No regression.

---

## Per-criterion findings

### 1. compute() returns `kind: 'foursomes_matchplay'`, router routes it — PASS
- `lib/scoring/modes/chapmanMatchplay.ts:30-36` — `compute()` reads `allowance_pct`
  with defensive fallback to 100 (`mode_config.kind === 'chapman_matchplay' ? … : 100`),
  delegates to `computeFoursomesCore(ctx, allowancePct, chapmanSideHandicap)`. Core
  hardcodes `kind: 'foursomes_matchplay'` (`foursomesMatchplay.ts:252`).
- `lib/scoring/index.ts:67-68` — `case 'chapman_matchplay': return chapmanMatchplay.compute(ctx);`
  + import at line 31.
- Test `chapmanMatchplay.test.ts:75-83` "returnerer kind: foursomes_matchplay" — green.

### 2. Type A: 60/40 side-HCP, default 100% strokes, allowance 0 = brutto — PASS
- `foursomesMatchplay.ts:120-121` — `chapmanSideHandicap = round(0.6×min + 0.4×max)`.
- `chapmanMatchplay.test.ts:55-66` — `it.each` incl. USGA example `(10,20)→14`,
  order-independent `(20,10)→14`, `(8,14)→10`. Green.
- `:87-102` — `combinedCourseHandicap` holds the 60/40 value (14, not sum 30);
  `effectiveExtraHandicap = 9` (diff 14−5 at 100%).
- `:106-128` — allowance 0% → both sides 0 strokes (brutto). Green.
- `:132-144` — equal 60/40-HCP despite unequal sum (10+20=14, 12+17=14) → both 0
  strokes (deterministic tie path). Green.
- `:155-179` — wrong `mode_config.kind` falls back to 100% (not 0 from config). Green.

### 3. foursomes unchanged after computeFoursomesCore extraction — PASS
- `foursomesMatchplay.ts:123-125` — `compute()` still calls
  `computeFoursomesCore(ctx, readAllowancePct(ctx), combinedSideHandicap)`.
- `combinedSideHandicap = a + b` (sum) preserved (`:113`); `readAllowancePct`
  gates on `'foursomes_matchplay'` and defaults 100 in draft, range enforced by
  validator (`:87-92`) — behavior unchanged.
- `foursomesMatchplay.test.ts` 16/16 green (part of the 243 targeted pass).

### 4. validateChapmanMatchplay + parseChapmanAllowancePct + parseGameMode + modeValidators — PASS
- `gamePayload.ts:1278-1332` — produces
  `{kind:'chapman_matchplay', team_size:2, teams_count:2, allowance_pct}`;
  enforces team ∈ {1,2}, `flight_number = team_number`, publish requires exactly
  2+2 (`team_balance` / `min_/too_many_players_for_mode`), `duplicate_player` guard.
- `:1340-1349` — `parseChapmanAllowancePct`: integer 0..100, draft default 100,
  publish requires explicit valid value.
- `:243` — `parseGameMode` accepts `chapman_matchplay`.
- `:2058` — `modeValidators` Record entry `chapman_matchplay: validateChapmanMatchplay`.
- `gamePayload.test.ts` chapman block (part of 109 added test lines) green.

### 5. Migration 0064 — written, applied post-deploy — PASS (as designed)
- `supabase/migrations/0064_chapman_matchplay.sql` — seeds `formats` row (slug
  `chapman_matchplay`, display `Chapman`, `is_cup_eligible=true`, no intent-mapping),
  adds `tournaments.chapman_allowance_pct smallint not null default 100 check (0..100)`.
  Follows the 0063_greensome template; numbered sequentially after 0063.
- Verified against live Supabase (`list_migrations`): latest applied is
  `greensome_matchplay` (20260531055037). **0064 is NOT yet applied** — exactly
  consistent with the format-seed-post-deploy discipline. Not a defect.

### 6. Admin creates Chapman in cup; label "Chapman" + foursomes leaderboard — PASS
- `app/admin/cup/[id]/page.tsx:226-229` — "+ Chapman match" button linking
  `?intent=cup&tournament_id=…&game_mode=chapman_matchplay`. Team-name checks
  at `:264/:272` include `chapman_matchplay`.
- `app/cup/[id]/page.tsx:155/163` — result-text team-name checks include chapman.
- `app/admin/games/new/page.tsx` — `CupGameMode` union (`:44`), `parseCupGameMode`
  (`:50`), `loadCupContext` selects `chapman_allowance_pct` (`:191`), default 100
  fallback (`:227`), `buildCupInitialValues` chapman branch (`:345-350`).
- `GameForm.tsx` + `useGameFormState.ts` — `chapman_allowance_pct` initial value,
  state, hidden input (`GameForm.tsx:423-427`), and AllowanceField UI (`:532-541`).
- `lib/cup/getCupSnapshot.ts:373-416` — chapman compute branch building a
  `kind:'chapman_matchplay'` ScoringContext and calling `computeChapmanMatchplay`
  (imported `:6`); gameMode union extended (`:432-440`).
- `lib/cup/computeCupLeaderboard.ts:31-36` — `gameMode` union includes
  `chapman_matchplay`.
- Label: `MODE_LABELS.chapman_matchplay = 'Chapman'` (`types.ts:46`).
- **Note on "foursomes leaderboard":** the standalone `/games/[id]/leaderboard`
  page has NO early-return branch for `foursomes_matchplay`, `greensome_matchplay`,
  OR `chapman_matchplay` (verified: 0 matches). All three fall through to the
  best-ball State4View path; the head-to-head match result is rendered in the cup
  UI via getCupSnapshot. Chapman mirrors foursomes/greensome EXACTLY — this is
  pre-existing cup-only architecture, not a chapman defect. Visual smoke deferred
  (preview cannot create a chapman game until 0064 applies post-deploy — known
  limitation, not a fail per eval instructions).

### 7. Hull-page: phase-stripe shown, tee-starter banner NOT shown — PASS
- `app/games/[id]/holes/[holeNumber]/page.tsx:606` —
  `chapmanPhaseSlot = isChapman ? <ChapmanPhaseReminder /> : null`, rendered `:648`.
- `:109` — `isFoursomes = game.game_mode === 'foursomes_matchplay'` (exact, NOT
  family). Tee-starter slot gated `if (isFoursomes && …)` (`:573`) — chapman
  excluded. `foursomesActions.ts:76` guard stays `=== 'foursomes_matchplay'`.
- `ChapmanPhaseReminder.tsx` — static, no animation (reduced-motion-safe), asserts
  via `data-testid` not Norwegian copy (`ChapmanPhaseReminder.test.tsx:8-11`). Green.

### 8. npm run build green — exhaustive coverage — PASS
- Exit 0. No leftover `isFoursomesFamily` anywhere (grep: 0 matches);
  `isAlternateShotMatchplay(mode)` covers foursomes + greensome + chapman
  (`types.ts:102-108`) and is used by `scorecardLayout.ts:183`.

### 9. Version bump 1.57→1.58 + CHANGELOG — PASS
- `package.json` → `1.58.0`. `CHANGELOG.md:20-45` — three-layer entry
  ("1.58.y — Chapman matchplay" series heading + tagline blockquote + Teknisk
  details). Commit `6fa5afb` is `feat(formats): … release 1.58.0` (passed the
  commit-msg hook, which requires the bump+CHANGELOG on feat).

---

## Adversarial checks

1. **Scorecard/hole-page math vs engine — MATCH.** Hole page
   (`holes/[holeNumber]/page.tsx:451-478`) computes chapman side-HCP via
   `isSixtyForty` → `round(0.6×min(...chs) + 0.4×max(...chs))` for BOTH sides,
   reads `allowance_pct` from chapman config (`:473-474`), `diff = |mySide−opp|`,
   `highSideExtraHCP = round(diff×pct/100)`, high side gets it / low side 0,
   tie → 0. **Byte-for-byte identical** to engine
   (`foursomesMatchplay.ts:156-174`). No leaderboard/scorecard stroke divergence.

2. **Chapman excluded from tee-starter banner — CONFIRMED.** `isFoursomes` uses
   exact `=== 'foursomes_matchplay'`; chapman has its own `isChapman` flag driving
   only the phase-stripe. Double-tee semantics respected.

3. **getCupSnapshot scores chapman — CONFIRMED.** `computeChapmanMatchplay`
   imported (`:6`), compute branch present (`:373-416`) gated on
   `game_mode === 'chapman_matchplay'` + 2+2 sides, builds correct ctx, maps
   winnerSide/formatted.

4. **Missing exhaustive case would fail build — none found.** Build green; full
   suite green. Migration sequence clean (0063 → 0064).

## Verdict

**ACCEPT.** The implementation faithfully follows the Ambrose/foursomes reuse
pattern, the 60/40 Chapman handicap is correct and consistent across engine +
hole-page + scorecard + cup-snapshot, the phase-stripe/tee-starter gating is
exactly right, and all gates are green (build exit 0, 2238/2238 tests). The only
deferred item — live preview create-flow — is blocked solely by the post-deploy
migration discipline and is explicitly out of scope for this eval.
