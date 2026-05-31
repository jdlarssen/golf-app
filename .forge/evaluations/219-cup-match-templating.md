# Forge-evaluering: #219 — Cup match-templating (Ryder Cup fase 4)

## VERDICT: NEEDS WORK

The feature is substantially well-built — the pairing engine, preset library, batch
action and wizard are all real, correct, and wired together. But the contract's
"Build-status (as-built)" section makes **three claims that are demonstrably false**,
and one of them is a genuine shipping defect: a committed test in the suite is RED.

- **Blocking defect:** `GenerateMatchesWizard.test.tsx` asserts `/steg 1 av 5/i`, but
  the wizard renders a different step-indicator string. The full vitest suite is
  **1 failed | 2364 passed → exit 1**. This is exactly the failure mode MEMORY.md
  flags ("Run co-located tests for changed files… #309 shipped a failing co-located
  test this way"). The contract claims "full `npx vitest run` → exit 0". It is not.
- **Version mismatch:** contract K7 + as-built say bump to `1.62.0`. Actual
  `package.json` is `1.61.0` (bump was `1.60.4 → 1.61.0`). CHANGELOG also says 1.61.0,
  so the code is internally consistent — but the contract's stated criterion (1.62.0)
  is not met as written, and the as-built section misreports the version.
- **tsc claim:** contract says `npx tsc --noEmit` → 0 errors. Actual: **13 errors,
  exit 1.** All 13 are pre-existing in unrelated signup/withdraw test files (untouched
  by #219), so this is NOT a regression introduced by the feature — but the contract's
  "0 feil" claim is false for the repo as it stands.

The fix is small (align the test to the real step count, or the indicator to 5 steps),
but per Tørny's hard rule the suite must be green before this can be accepted.

---

## Gate results (run by evaluator)

| Gate | Command | Exit | Result |
|------|---------|------|--------|
| tsc | `npx tsc --noEmit` | **1** | 13 errors, ALL pre-existing in `app/admin/games/[id]/signups/actions.test.ts`, `app/games/[id]/withdrawActions.test.ts`, `app/signup/[shortId]/actions.test.ts`, `app/signup/[shortId]/teamActions.test.ts`. None in any #219 file. Confirmed untouched: `git diff --name-only main HEAD` for those files returns empty. Contract claim "0 feil" is false (but not a #219 regression). |
| vitest (cup-scoped) | `npx vitest run lib/cup/ "app/admin/cup/[id]/generer/"` | **1** | 1 failed \| 58 passed (59). The one failure is the #219 wizard render test. |
| vitest (full) | `npx vitest run` | **1** | **1 failed \| 2364 passed (2365)**; Test Files 1 failed \| 200 passed (201). Sole failure: `GenerateMatchesWizard.test.tsx`. Contract claim "exit 0" is FALSE. |
| build | `npm run build` | **0** | `✓ Compiled successfully in 2.6s` · `✓ Generating static pages (29/29)`. Vercel parity passes. Exhaustive switch/Record maps are satisfied (matchplay modes added long ago; batch action reuses existing game_mode strings). |

---

## Per-criterion verdict

| Crit | Pass? | Evidence |
|------|-------|----------|
| **K1 — Preset library + scaling** | PASS | `lib/cup/cupTemplates.ts` exports `CUP_PRESETS` = `klassisk` (Klassisk cup: foursomes→fourball→singles, minPerTeam 2), `fourball-singler` (minPerTeam 2), `singler` (minPerTeam 1), all with norsk name+description. `buildSessions` + `sessionMatchCount` derive counts: 2v2 = `floor(teamSize/2)`, singles = `teamSize`, drops matchCount-0 sessions. `cupTemplates.test.ts` green (part of the 58 cup passes). |
| **K2 — Pairing engine correct/deterministic** | PASS | `lib/cup/cupPairing.ts` `generateCupPlan`: per session `feasible = min(matchCount, floor(team1/perSide), floor(team2/perSide))`, so no player repeats within a session (each match-index consumes distinct slots; excess = bye). Across sessions, both teams are re-ordered fresh per session → reuse. `strategy='handicap'` sorts ascending by `hcpIndex`; singles pairs rank-i vs rank-i (lowest-vs-lowest), 2v2 pairs rank-i + rank-(len-1-i) (strong+weak). `strategy='random'` uses Fisher-Yates with injectable `rng` (defaults `Math.random`). Pure, no I/O. Tests green. Algorithm spot-checked — logic is sound. |
| **K3 — Batch action inserts games + game_players** | PASS (with deviation) | `actions.ts createCupMatchesFromPlan`: per match inserts one `games` row with `status:'scheduled'`, `game_mode: match.format`, `mode_config` via `cupMatchModeConfig` (singles `{kind, team_size:1}`; 2v2 `{kind, team_size:2, teams_count:2, allowance_pct}` read from cup's `fourball_allowance_pct`/`foursomes_allowance_pct`), `tournament_id`, `tournament_match_label` (sliced 80). Then `game_players`: side1→team_number 1, side2→team_number 2, all `status:'active'`, `tee_gender` resolved from profile. **Deviation (documented & legit): `course_handicap` is NOT set — frozen at round start, matching the manual scheduled-match path.** `getCupSnapshot.ts` reads `team_number===1/2` buckets and recognizes `game_mode` for all 6 matchplay modes — batch-created matches WILL score correctly (verified: snapshot's `matchGameMode` + `computeCupMatchResult` recognize singles/fourball/foursomes). |
| **K4 — Authz + draft gate** | PASS | `actions.ts`: `requireAdmin(supabase)` first; loads cup, `if (cup.status !== 'draft') return {error:'not_draft'}`. `page.tsx`: `requireAdmin` + `if (tournament.status !== 'draft') redirect(/admin/cup/${id})`. Double-gated (server action + page). |
| **K5 — Wizard end-to-end wiring** | PARTIAL / FAIL | Wiring is correct: `ConfirmStep.handleConfirm` calls `createCupMatchesFromPlan({tournamentId, courseId, teeBoxId, matches})` — exact field names match `CupBatchInput`. Error codes mapped to norsk via `ERROR_MESSAGES` (missing_course, not_draft, not_found, no_matches, insert_failed). `generateCupPlan` is called in the wizard before confirm. **BUT the render test for this step is RED** (the only Type-C test for the feature fails), so the criterion's own evidence requirement ("render-test for forhåndsvis-steget") is not satisfied. Mismatch: test expects "steg 1 av 5"; component renders a different count. |
| **K6 — Manual path untouched + no regression** | FAIL | `git diff HEAD~3 HEAD` touches ONLY: cup/generer/* (new), `app/admin/cup/[id]/page.tsx` (+11, entry button + status msg), `lib/cup/cupTemplates.ts` (+1/-1 trivial), CHANGELOG, package*.json. `createGameInternal`/manual game-create path is genuinely untouched (the contract's documented self-contained-action deviation). `npm run build` green. **However "hele vitest-suiten grønn" is FALSE — 1 test fails.** So K6's regression-clause is not met. |
| **K7 — Version + CHANGELOG** | PARTIAL | Real CHANGELOG entry exists, well-formed (theme heading + tagline blockquote + Teknisk details, prior 1.60.y series wrapped in `<details>`), sensible norsk tagline, no obvious AI-tells. **BUT version is `1.61.0`, not the `1.62.0` the contract K7 + as-built claim.** Code is self-consistent (package.json 1.61.0 == CHANGELOG 1.61.0), so this is a contract/as-built misreport rather than a code bug — but K7 as literally written ("1.61.0 → 1.62.0") is not met. |

---

## Defects found

### D1 (BLOCKING) — Committed test is RED; full suite fails
- **File:** `app/admin/cup/[id]/generer/GenerateMatchesWizard.test.tsx:42` (assertion);
  root cause in `GenerateMatchesWizard.tsx:58-66` (`StepIndicator`).
- **What:** `expect(screen.getByText(/steg 1 av 5/i)).toBeInTheDocument()` throws
  "Unable to find an element with the text". The component IS a genuine 5-step wizard
  (`TOTAL_STEPS = 5`, steps 1–5 all wired, including `step === 5` Confirm). The bug is
  NOT a wrong step count — it's that `StepIndicator` renders the label split across four
  sibling spans: `<span>Steg </span><span>{current}</span><span> av </span><span>{total}</span>`.
  Testing Library's `getByText` matches per text node, so no single node holds the full
  "Steg 1 av 5" string and the regex never matches. (The CHANGELOG's "4-stegs"
  description is also inaccurate — it's 5 steps — but that's cosmetic.)
- **Repro:** `npx vitest run "app/admin/cup/[id]/generer/"` → 1 failed | 58 passed.
  `npx vitest run` → 1 failed | 2364 passed, exit 1.
- **Fix options:** render the indicator label as a single text node (e.g.
  `Steg {current} av {total}` in one element), OR use a function matcher /
  `normalizer` / `data-testid` in the test. Then `npx vitest run` must show 0 failed.
- **Severity:** HIGH. Violates Tørny's mandatory "suite green before merge" + the
  MEMORY.md co-located-test rule (#309 precedent). Must be fixed before ACCEPT.

### D2 (MEDIUM) — As-built section misreports version + gate status
- **File:** `.forge/contracts/219-cup-match-templating.md:79-81,98`
- **What:** As-built says "v1.62.0", "tsc → 0 feil", "full vitest run → exit 0". Actual:
  package.json `1.61.0`; tsc exit 1 (13 pre-existing); full vitest exit 1 (the D1
  failure). The version number in package.json/CHANGELOG (1.61.0) is internally
  consistent and a fine bump (1.60.4 → 1.61.0 minor for a new feature) — the problem
  is the contract's claims don't match reality.
- **Severity:** MEDIUM (no code bug, but the as-built misrepresentation is exactly what
  this skeptical evaluation exists to catch).

### Non-defects (verified clean)
- No off-by-one / wrong-side bug in pairing — partition logic is correct, byes handled.
- `mode_config` shape matches what `getCupSnapshot` → `computeCupMatchResult` expect
  (reads `allowance_pct` from mode_config, defaults per mode; team_number buckets).
- Empty roster / no matches → `{error:'no_matches'}`; uneven teams → `feasible` clamps
  to the smaller team, no crash.
- Entry button gated to draft (page redirects non-draft; button only in draft per
  CHANGELOG + page diff scope).
- Wizard passes correct field names to the action (no field-name mismatch).
- The 13 tsc errors are NOT introduced by #219 (pre-existing on main, unrelated files).

---

## Recommendation
Fix D1 (reconcile the wizard step-count between the render test, the component's
indicator, and the CHANGELOG's "4-stegs" wording — then `npx vitest run` must show
0 failed). Correct the as-built/K7 version claim to 1.61.0 (or actually bump to 1.62.0
if 1.62.0 is required — but 1.61.0 is a perfectly valid bump and the CHANGELOG already
uses it, so just fixing the contract text is cleaner). After the suite is green,
this is a clean ACCEPT — the engineering itself is solid.

---

## Fix-loop resolution (runde 1 → ACCEPT)

Begge defektene fra NEEDS WORK-verdikten er adressert og verifisert:

- **D1 (BLOCKING) — løst.** `StepIndicator` rendrer nå «Steg X av Y» som én tekst-node (commit `refactor(cup): render step label as one text node`). Full `npx vitest run` → **exit 0**, 0 FAIL-linjer (2365 grønne). Wizard render-testen passerer. Byte-identisk for brukeren (ingen visuell/oppførsels-endring).
- **D2 (MEDIUM) — løst.** As-built-seksjonen er korrigert: versjon `1.61.0` (ikke 1.62.0), `tsc --noEmit` har 13 **pre-eksisterende** feil i urelaterte test-filer (0 i #219-filer), full vitest grønn etter D1-fix.

Verifisert (reliable exit-code/grep-signaler): `npm run build` → «Compiled successfully»; full `vitest` → exit 0; `tsc` → 0 feil i #219-filer (13 pre-eksisterende på `main`).

**Revidert verdikt: ACCEPT.** Alle K1–K7 oppfylt.
