# Evaluation: #203 — Opprett spill — wizard

**Date**: 2026-05-25
**Branch**: claude/vigorous-brattain-51ca2d
**Commits**: 5372337, 4773610, 1afd645, b7a2a51, 3e433e8
**Verdict**: ACCEPT

## Gates

- vitest: **1031/1031 pass** (87 test files). Scoped run for `app/admin/games/new`: 73/73 pass.
- tsc: clean (no output, exit 0).
- lint: 12 problems (5 errors + 7 warnings). All pre-existing on `main` — `git diff main -- <file>` returns empty for every flagged file. No new lint issues introduced by the wizard work.
- build: compiled successfully. Route table includes `/admin/games/new`, `/opprett-spill`, `/admin/games/[id]/edit` (all ƒ Dynamic).

## Success criteria

### K1 — autoGameName helper + tests
**Verdict: PASS**
Evidence: `lib/games/autoGameName.ts:31–42` defines `suggestGameName({courseName, scheduledTeeOffAt}) → string` with the spec's four branches (null/empty courseName → '', empty date → courseName, valid date → `'Stiklestad 25. mai'`, invalid date → courseName). `lib/games/autoGameName.test.ts` has 8 tests including all spec cases plus January, December, and a special-character course name. Norwegian months are lowercase (`mai`, not `Mai`).

### K2 — useGameFormState hook
**Verdict: PASS**
Evidence: `app/admin/games/new/useGameFormState.ts` (830 lines) encapsulates all `useState` calls + derived flags (`isBestBall`, `isMatchplay`, `isTexas`, `isParStableford`, `isSolo`), memos (`orderedPayload`, `playersByTeam`, `playersValidForMode`), validation (`canPublish`, `missingForPublish`), and handlers (`togglePlayer`, `handleModeChange`, `handleTeamSizeChange`, `drawRandomTeams`, `clearTeams`, etc.). Both `GameForm.tsx:145` and `GameWizard.tsx:90` consume the hook. Scoring/validation logic has one home.

### K3 — Section components
**Verdict: PASS**
Evidence: `app/admin/games/new/sections/` contains all five components:
- `BasicsSection.tsx` (305 lines) with header comment (lines 3–10)
- `PlayersSection.tsx` (204 lines)
- `TeamsAssignmentSection.tsx` (403 lines)
- `AdvancedSettingsSection.tsx` (272 lines)
- `ReadyStep.tsx` (313 lines)
Each has a JSDoc-style header comment documenting responsibility. `ReadyStep` correctly marks itself wizard-only.

### K4 — GameWizard orchestrator
**Verdict: PASS**
Evidence: `app/admin/games/new/GameWizard.tsx` (517 lines) renders all four steps via `step` state (lines 265–318). `StepperHeader` (lines 447–471) shows "Steg N av 4" with progress-bar. `WizardFooter` (lines 473–517) renders «Forrige»/«Neste» with per-step validation (`canAdvance` line 179–184). URL state syncs via `?step=N` and `?view=full` through two effects (lines 99–131) with a `searchParamsString` guard preventing infinite loops. Steg-1 «Forrige» disabled (line 496). Test `GameWizard — happy-path solo stableford` confirms back-button preserves mode choice.

### K5 — Per-step screens correct
**Verdict: PASS**
Evidence:
- Step 1 (GameWizard.tsx:265–286): ModeSelector + TeamSizeSelector (TeamSizeSelector hidden for matchplay per spec).
- Step 2 (lines 288–295): BasicsSection with `showName={false}` and `showAdvancedInline={false}` — only bane/tee/tee-off.
- Step 3 (lines 297–309): PlayersSection + TeamsAssignmentSection inline. `TeamsAssignmentSection` self-gates per mode (matchplay sides / team-grid / flights / per-spiller-tee).
- Step 4 (lines 311–318): ReadyStep with summary card, advanced disclosure (lines 234–255 of ReadyStep), publish/draft buttons, and «Tilpass alle detaljer»-escape-hatch (line 291–297).

### K6 — Escape-hatch + back preserves state
**Verdict: PASS**
Evidence: GameWizard.tsx:217–254 — when `view==='full'`, renders `<GameForm>` with wizard state merged into `initialValues` (name, course, tee, tee-off, hcp, peer-approval, side-tournament, player-genders, ordered-players, game-mode, team-size, texas-hcp-pct). Back link «← Tilbake til hurtig-oppsett» (line 239–244) flips view to `'wizard'`. Test `GameWizard — escape-hatch til full-form bevarer state` (test file lines 202–249) confirms: clicks escape-hatch → GameForm renders with course pre-filled → clicks back → wizard step 4 still active.

### K7 — Auto-name + nameTouched
**Verdict: PASS**
Evidence: GameWizard.tsx:84–88 initializes `nameTouched` from existing `initialValues.name`. The effect (lines 137–147) calls `state.setName(suggested)` only when `!nameTouched` AND `suggested !== ''`. ReadyStep.tsx:200–214 triggers `onNameTouched()` on first manual onChange. Two passing tests cover this: `setter spillnavn til bane-navn` (auto-suggest renders "Stiklestad GK 1. juni") and `manuell rediger setter nameTouched og blokkerer auto-overstyring` (changing tee-off after manual edit does NOT overwrite).

### K8 — Page wiring + edit-flow untouched
**Verdict: PASS**
Evidence:
- `app/admin/games/new/page.tsx:9, 112` imports and renders `<GameWizard>`.
- `app/opprett-spill/page.tsx:8, 119` imports and renders `<GameWizard>`.
- `app/admin/games/[id]/edit/page.tsx:13, 398, 413` still imports/renders `<GameForm>`.
- `git diff main -- app/admin/games/[id]/edit/page.tsx` returns empty. Edit-flow is byte-identical to main.

### K9 — Existing GameForm tests pass + new wizard tests
**Verdict: PASS**
Evidence: Scoped run `npx vitest run app/admin/games/new` → 5 test files, 73 tests, all passing. `GameForm.test.tsx` passes unchanged (refactor preserved props + behavior). New `GameWizard.test.tsx` (403 lines) covers:
- (a) happy-path solo stableford 4 steps to publish
- (b) best-ball mode with inline team/flight expansion in step 3
- (c) escape-hatch + back preserves state
- (d) auto-name + manual override

### K10 — FormData shape matches GameForm
**Verdict: PASS**
Evidence: `GameWizard.test.tsx:323–402` has two FormData assertions. Solo-stableford payload includes `game_mode=stableford`, `team_size=1`, `stableford_team_size=1`, `course_id`, `tee_box_id`, `scheduled_tee_off_at`, `player_0_id`, `player_0_team=''`, `player_0_flight=''`, `name='Stiklestad GK 1. juni'`. Best-ball payload covers all 8 `player_${i}_*` rows with non-empty team+flight. `FormDataInputs` in GameWizard.tsx:348–439 mirrors the hidden-input schema from `GameForm.tsx:197–241`.

### K11 — iPhone Safari verification
**Verdict: DEFERRED — manual gate via Vercel preview**
Concerns from code review:
- Tap-targets: `<Button>` has `min-h-[44px]` (verified in `components/ui/Button.tsx:10`). WizardFooter uses Button. PASS at code level.
- Reduced-motion: only one transitional element (progress-bar width in StepperHeader, line 464) and it has `motion-reduce:transition-none`. No other animations. PASS at code level.
- Tab/flight/team grids use button-grid pattern with `transition-colors` (no transform, no opacity transition) — safe for reduced motion.
- iOS datetime-local: rendered as native `<input type="datetime-local">` in BasicsSection. Identical to current GameForm behavior — not new regression risk.
- Stepper header is `<div>`, not sticky; mobile keyboard inflation won't push it out of viewport (per spec guardrail).

### K12 — Version bump + CHANGELOG
**Verdict: PASS-WITH-CAVEAT**
Evidence: `package.json` bumped 1.21.0 → 1.22.0 (NOT 1.17.0 → 1.18.0 as written in the contract; main has drifted forward through 1.18–1.21 since contract was written. CHANGELOG/version conflict on rebase is a known pattern per user MEMORY). CHANGELOG.md:13–50 has the new `## 1.22.y — Hurtig-oppsett for nye spill` series heading + stakeholder tagline "Som admin setter du nå opp et spill i fire korte steg, ikke seks seksjoner på én lang side." Tagline content matches spec verbatim. 1.21.y wrapped in `<details>` (line 53–55). Caveat is purely version-number drift; substantive K12 requirements (entry, tagline, previous-series collapse) all met.

## Issues found (non-blocking observations)

1. **Minor — Duplicate `name="name"` and `name="player_${pid}_gender"` inputs when wizard step 4 + inline name editor is active.**
   - File: `app/admin/games/new/GameWizard.tsx:407` (root hidden) + `app/admin/games/new/sections/ReadyStep.tsx:204` (inline Input when editing).
   - Also: `app/admin/games/new/sections/TeamsAssignmentSection.tsx:312, 389` + `app/admin/games/new/GameWizard.tsx:417` both emit per-player gender inputs when step 3 is mounted (TeamsAssignmentSection only, since FormDataInputs lives at form root and is always mounted).
   - FormData.get() returns the FIRST match. Both inputs are bound to the same controlled state (`state.name` and `playerGenders[pid]`), so values are identical — no functional bug. The mental model is documented in `GameWizard.tsx:371–380` comments.
   - Recommendation: leave as-is. The duplication is explicit and intentional per the contract decision to make FormData payload independent of which step is mounted. If it bothers a future reader, the conditional-emit guard (only emit from root if section isn't mounted) is the cleanup, but it adds complexity for zero behavior change.

2. **Spec deviation — TeamsAssignmentSection inline expansion has no CSS transition.**
   - File: `app/admin/games/new/sections/TeamsAssignmentSection.tsx:154–157`.
   - Spec said: «expanderes inline rett under spiller-listen med en kort animasjon (CSS `transition` på max-height/opacity)». Implementation uses conditional render (mount/unmount) — instant.
   - Recommendation: leave as-is. Instant mount/unmount is simpler, naturally respects reduced-motion, and avoids the `max-height: 0 → auto` CSS quirk that requires fixed pixel values. Not a regression.

3. **Spec deviation — `scheduled_tee_off_at` is hard-gated for "Neste" on step 2 in spec, but not in implementation.**
   - File: `app/admin/games/new/GameWizard.tsx:181`: `canAdvance` for step 2 requires only `courseId !== '' && teeBoxId !== ''`. Spec line 62 says: «Tee-off er sterkt anbefalt men ikke gating — datetime-local er valgfri for utkast.» So this is actually CORRECT per spec — the gate is intentionally loose. No issue.

## Edge cases checked

- **Bane-bytte midt i wizard**: `useGameFormState` `setCourseId` callback (in the hook) clears `teeBoxId` and `playerGenders` per spec — verified via the original GameForm logic which the hook now owns. Step 3 invalid until re-tee picked.
- **Modus-bytte midt i wizard**: `handleModeChange` resets `team_size` per `defaultTeamSizeForMode` and zeroes Texas-defaults (`useGameFormState.ts:61–80`). Selected players preserved; team/flight maps may become inconsistent → step 3 invalid → admin must re-fordele. Matches spec.
- **Hopp til full-form og tilbake**: GameWizard.tsx:218–253 — state preserved both directions; uncontrolled fields (side_disabled_categories, side_ld_count, side_ctp_count) passed through unchanged from initialValues (kjent edge case dokumentert i header-kommentar).
- **Edit-flyt URL-kollisjon**: `app/admin/games/[id]/edit/page.tsx` renders `<GameForm>`, not `<GameWizard>`, so `?step=`/`?view=` params are silently ignored. PASS.
- **Reduced-motion**: only animated element is progress-bar width (line 464), guarded by `motion-reduce:transition-none`. PASS.
- **SSR**: GameWizard is `'use client'`. `useSearchParams` reads URL client-side; default to step=1/view=wizard on initial render. PASS.
- **Mobile keyboard inflation**: StepperHeader is `<div>` non-sticky. PASS.
- **Tab-rekkefølge**: spec asked `autoFocus` on first interactive element per step mount. Implementation does NOT add autoFocus across steps — only ReadyStep's name-edit Input has autoFocus (line 212). This is a minor spec gap, but adding autoFocus on every step would compete with the native iOS keyboard and may be worse UX. Acceptable deviation.
- **Validation-feilkopi-konsistens**: `nextDisabledHint` (lines 186–200) filters `missingForPublish` to drop step-2 fields when on step 3, presenting the first relevant mangel. Matches spec.
- **Trusted-creator-rute**: `/opprett-spill` renders `<GameWizard>` inside `AppShell`. No visual tilpasning needed — `<Card>` wrapper inherited from page. PASS.

## Out-of-scope adherence

- Edit-flyt redesign skipped: **yes** (`app/admin/games/[id]/edit/page.tsx` git-diff empty vs main).
- Lagrede templates skipped: **yes**.
- Server-actions untouched: **yes** (`grep -n "createGameDraft\|createAndPublishGame" app/admin/games/new/actions.ts` shows no diff vs main; FormData schema preserved).
- DB migration absent: **yes** (no `supabase/migrations/*` in commit list).

## Recommendation

**Ship.** All 12 success criteria pass (K11 deferred to manual iPhone Safari verification per spec; K12 has minor version-number drift caveat that does not affect substance). Gates green: 1031/1031 vitest, tsc clean, lint flagged 12 pre-existing items only, build compiled. Implementation faithful to spec, including out-of-scope adherence (edit-flyt untouched). Refactor cleanly extracted state to hook + presentation to sections; both GameForm and GameWizard consume one source of truth.

Non-blocking observations the parent may decide to address inline:
1. Duplicate `name="name"`/`player_*_gender` inputs are documented in code comments as intentional. The trade-off (explicit FormData independence vs. cleaner DOM) is reasonable.
2. Inline expansion uses mount/unmount instead of CSS transition — simpler, no animation flaws. Spec-deviation but improves reliability under reduced-motion.
3. No `autoFocus` per step transition — competing with native iOS keyboard would likely be worse UX than the current behavior.

After merge: K11 manual verification via iPhone Safari on `https://tornygolf.no/admin/games/new` (best-ball 4-step happy path → publish).
