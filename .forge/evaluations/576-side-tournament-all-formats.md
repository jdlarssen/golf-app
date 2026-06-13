# Evaluation: #576 — Sideturnering på leaderboarden for alle poeng-/podium-formater

**Verdict: ACCEPT**

Independently verified by reading the finished-branch of all 11 render functions, the generic
helper, all 10 modified podiums, the matchplay payload-gate on all three submit paths, and by
running tsc + the targeted vitest suites. Every criterion holds up under scrutiny. No leak, no
missed format, no broken existing behavior found.

Limitation acknowledged (per contract): fresh worktree has no `.env.local`, so `npm run build` /
Playwright cannot run. UI wiring verified by code structure, which is sufficient — the criteria are
code-verifiable. tsc + 1180 targeted tests green.

---

## Success Criteria

| # | Criterion | Verdict | Evidence (gathered by evaluator) |
|---|-----------|---------|----------------------------------|
| 1 | All 11 score/podium render fns wrap finished-view in `renderSideTournamentTabs` when `finished && side_tournament_enabled` | **PASS** | `rg -c renderSideTournamentTabs page.tsx` = 14 (1 def + 13 calls). Read each finished-branch: SoloStrokeplay 2067, Texas 2217, Wolf 2346, Nassau 2543, Skins 2725, BBB 2913, Nines 3029, RoundRobin 3148, AceyDeucey 3264, Shamble 3414, Patsome 3539 — all guard on `showSide`/`game.side_tournament_enabled` inside the `status==='finished'` block. 11 distinct format branches + 2 stableford callers = 13. |
| 2 | Stableford → generic helper; callers delegate without duplicated input-building | **PASS** | Diff confirms `renderStablefordWithSideTournament` renamed to `renderSideTournamentTabs`; `isTeamVariant` logic replaced by `teamGrouping` param. `calculateSideTournament` called only at page.tsx:883 (untouched best-ball inline branch) + 1537 (helper). Stableford team caller → `byTeamNumber` (1213), solo caller → `solo` (1309). No duplicate function body. |
| 3 | 10 missing podiums have `chromeless?: boolean`, render without own AppShell when true | **PASS** | All 10 podiums (SoloStrokeplay/Texas/Wolf/Nassau/Skins/BBB/Nines/RoundRobin/AceyDeucey/Shamble) declare `chromeless?: boolean`, default `chromeless = false`, and BOTH return branches wrap `<Shell chromeless={chromeless}>` + gate `{!chromeless && <Header/>}` — exact `SoloStablefordPodium` pattern. PatsomePodium already had it (confirmed `chromeless`-hits=9). |
| 4 | `isMatchplayFamily` in lib/scoring; fieldset NOT rendered in wizard for matchplay | **PASS** | `lib/scoring/modes/types.ts:125` (`singles_matchplay \|\| fourball_matchplay \|\| isAlternateShotMatchplay`), re-exported `index.ts:99`. Both sections gate fieldset on `sideTournamentSupported &&`: AdvancedSettingsSection.tsx:137, BasicsSection.tsx:228. `sideTournamentSupported = !isMatchplayFamily(gameMode)` (useGameFormState.ts:510). |
| 5 | Payload never sets `side_tournament_enabled=true` for matchplay | **PASS** | Three paths closed: (a) wizard FormData — checkbox `name=side_tournament_enabled` lives only inside the hidden fieldset; hidden → not in DOM → FormData omits it → action parses false (actions.ts:98 `parseSideTournamentFromFormData`). (b) wizard `view==='full'` passthrough reads `state.sideEnabled` = gated return `sideEnabled && sideTournamentSupported` (useGameFormState.ts:1527; GameWizard.tsx:391). (c) direct GameForm uses same gated sections (GameForm.tsx:504/788). FormDataInputs does NOT render a raw hidden `side_tournament_enabled`. |
| 6 | Follow-up issue created with milestone | **PASS** | `gh issue view 585`: OPEN, "Sideturnering (LD/CTP) på matchplay-duellkortet", labels `enhancement` + `area:leaderboard`, milestone "Backlog — uplanlagt / scale-triggered". |
| 7 | Version bumped + CHANGELOG | **PASS** | package.json 1.120.0 → 1.121.1 (diff confirmed). CHANGELOG.md:20 `## 1.121.y — Sideturnering på alle poengformater`. |

## Gates

| Gate | Verdict | Evidence |
|------|---------|----------|
| `npx tsc --noEmit` | **PASS** | Exit 0, no output. |
| `npx vitest run …leaderboard …games/new lib/scoring` | **PASS** | 86 files, 1180 tests passed. |
| Co-located podium tests | **PASS** | Included in the 1180 green (Nassau/RoundRobin/Wolf/SoloStrokeplay Podium tests). |
| New matchplay-toggle-hide test green | **PASS** | `useGameFormState.test.ts` describe "sideturnering-gating for matchplay (#576)" — 6 `it.each` modes assert `sideTournamentSupported=false` + 1 round-trip test asserts effective `sideEnabled=false` on switch to matchplay AND raw choice restored on switch back. 32/32 passed. |
| Frontend live check | **DEFERRED (acknowledged)** | No `.env.local` in fresh worktree; left to owner via Vercel PR-preview. Not a fail. |

## Specific skeptical checks (all clear)

- **teamGrouping correctness:** solo for solo_strokeplay/Wolf/Nassau/Skins/BBB/Nines/RoundRobin/AceyDeucey ✓; byTeamNumber for Texas/Shamble/Patsome + stableford-team ✓. Wolf correctly `solo` despite team_number being a rotation slot.
- **H2H guard (2-player formats):** solo_strokeplay (2009), Nassau (2445), Skins (2641), BBB (2833) all use `result.players.length === 2 && !showSide` → H2H card only when side OFF; podium used (in tabs) when side ON. No format shows the duel card while side is enabled.
- **chromeless ONLY in side path:** every format passes `podium(true)`/`finishedView(true)` to the tabs and `podium(false)`/`finishedView(false)` to the default return. Default (non-side) rendering byte-unchanged.
- **Existing stableford/best-ball untouched:** best-ball inline branch (page.tsx:718–883, `calculateSideTournament` at 883) is outside all diff hunks (first hunk starts at 1202). Stableford callers still pass correct teamGrouping.
- **Matchplay render fns:** renderMatchplay / renderFourballMatchplay / renderFoursomesMatchplay (1593–1938) contain NO `renderSideTournamentTabs` / `showSide` reference — they return their duel view before the side branch is reachable. Correct.

## Minor notes / non-blocking observations

- **Structural variance in WD-bearing formats:** solo_strokeplay/Nassau/Skins/BBB append `{wdSection}`
  *outside* the returned tabs fragment in the side path (`<>{await tabs(...)}{wdSection}</>`). Behaviorally
  fine — the withdrawn-section renders after the tabs, consistent with the non-side path which also appends
  it after the podium. Not a defect.
- **`side_tournament_enabled` checkbox semantics rely on HTML checkbox-omission-when-unchecked.** This is the
  same battle-tested pattern already used for the field pre-#576; the matchplay fix only removes the fieldset
  from the DOM. The defense is sound, but it is implicit (no explicit `false` hidden input) — worth knowing if
  anyone later refactors FormDataInputs to emit side fields as hidden inputs, they must read the GATED
  `state.sideEnabled`, not the raw useState value.
- **Live prod verification still owed** (owner): confirm the side tab actually renders on a finished BBB game
  with `side_tournament_enabled=true` (the original "Byneset North 12. juni" repro). Code path is correct;
  this is belt-and-suspenders.
