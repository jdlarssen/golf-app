# Evaluation: #1472 — Cup-oppsett i tre adskilte rom

**VERDICT: ACCEPT**

Evaluated 2026-08-07 on branch `claude/auto-1472-baeddb` (HEAD e8d90041), fresh-context skeptical review.
All four automated gates re-run by the evaluator (not trusted from prior runs), staging RLS evidence
gathered read-only via Supabase MCP, and the full cup e2e re-run independently against staging.

## Per-criterion summary

| Criterion | Result | Evidence |
|---|---|---|
| S1 — skjema | PASS | Staging `pg_class`/`pg_policies` query: both tables exist, `relrowsecurity=true`, exactly ONE policy each (`*_select_authenticated`, cmd=SELECT, roles={authenticated}, qual=true), zero write policies — 0154 pattern exact. `lib/database.types.ts:1686/:1719` has both tables. |
| S2 — Oppsett | PASS | `saveCupPlan` (lib/cup/planActions.ts:59-155) upserts on `onConflict: 'tournament_id'` (UNIQUE in 0155 ⇒ always one row), sets `updated_at` explicitly (:140), `.select()`+`expectAffected` (felle 2). Prefill via `buildInitialValues` (CupPlanSetup.tsx:53-71) from the saved row. E2e drove save→redirect against staging (passed). Reload-prefill additionally covered by orchestrator self-check screenshots; code path independently reviewed. |
| S3 — Spillere | PASS | Add/remove persist via `addCupParticipant`/`removeCupParticipant` — e2e added 4 participants via UI with server redirect per add (passed). Cap: `exceedsPersonalPlayerCap` on the distinct set after add (planActions.ts:198-210) — regelens ene hjem, unit-tested (`planActions.test.ts:207` rejects at cap). Klubb-cup = kun medlemmer: `getCupCandidatePlayers` groupId-branch (lib/cup/getCupCandidatePlayers.ts:56-68, pending filtered) + server-side `not_candidate` re-validation (planActions.ts:187-193) — client lists are not authz. |
| S4 — Fordel & generer | PASS | Wizard is 2 steps (`TOTAL_STEPS = 2`, GenerateMatchesWizard.tsx:878). E2e (independently re-run) asserted the generated `games` rows on staging carry `course_id`/`tee_box_id` from the STORED plan and `scheduled_tee_off_at` NULL when plan left it empty; `game_mode` from plan preset. Empty-states with links to Oppsett/Spillere: GenerateMatches.tsx:260-299 (stackable when both missing). `createCupMatchesFromPlan` input type carries only `tournamentId`+`matches`; plan read server-side with `missing_plan` guard + tee re-validation + stale-tee-off rejection (actions.ts:221-251). |
| S5 — dørene | PASS | Three `CupDoor` cards in draft with status subtitles (CupManagement.tsx diff: oppsett = course·tee / «ikke satt ennå», spillere = participant count, generer = match count); shared `roomHref` covers admin + club chrome; old «Generer matcher»-button removed. `CupSetup.tsx`: multiselect, `cupEligibleFormats`-prop and all icon/format imports removed; only navn + lagnavn + poengvekter remain. |
| S6 — ingen localStorage | PASS | `grep -r 'cup-wizard-draft' app/ lib/ e2e/` → 0 hits. No `CupWizardDraft`/loadDraft/saveDraft/clearDraft remnants in cup code. E2e wizard flow green without it. |
| S7 — regresjon | PASS | E2e seeds a bare draft cup (no plan/participants) and drives all three rooms via UI — green. Full vitest: 439 files / 5607 tests passed. `e2e/cup/` (the whole directory = 1 spec, 2 tests incl. @gate) re-run by evaluator: **2 passed (20.8s)**. |

## Gate results (all re-run by evaluator, Node v22.23.0)

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | 0 errors (58 pre-existing warnings, none in changed files) |
| `npx vitest run` (full suite) | 439 files / 5607 tests, all passed |
| `npm run build` | success (full route table emitted) |
| `npx playwright test e2e/cup/` vs staging | 2 passed (@gate + @lifecycle three-rooms walk) — independent re-run |
| `messages/catalogParity.test.ts` | 2 passed (no/en in parity) |

## Contract design decisions — verified honored

- **0154 RLS pattern:** migration 0155 + staging pg_policies match exactly (select-only, service-role writes gated by `requireAdminOrClubAdminOfCup`). Hostile-PATCH: no write policies exist ⇒ authenticated PostgREST write is denied by construction; migration documents the pattern reuse as the contract allowed.
- **Server-side plan read at generation:** `CupBatchInput` = `{tournamentId, matches}` only; course/tee/tee-off/best-ball come from `tournament_plans` at submit (actions.ts:144-147, 221-251). No stale `courseId`/`teeBoxId`/`bestBallAllowancePct`/`scheduledTeeOffAt` input fields anywhere (grep clean, tests updated).
- **No localStorage draft:** verified (S6).
- **Caps single home:** `lib/cup/limits.ts` untouched; both add-time and generation call the same helpers.
- **#1397 form pattern:** both new forms use `preventDefault` + `startTransition(dispatch)` with `useActionState` (CupPlanForm.tsx:127-132, CupParticipantsList.tsx:86-90).
- **Eierbeslutning 1:** separate `tournament_plans` table, `tournament_id` UNIQUE (droppable later), not columns on `tournaments`. `createTournamentDraft` still writes only name/team-names/allowances/points — no plan-owned columns.
- **Eierbeslutning 2:** `tournament_participants` is team-less (PK tournament_id+user_id, no team column).
- **updated_at on re-save:** set explicitly in the upsert payload (contract discretion exercised and documented in-code).
- **CupManagement door data only for draft:** `isDraft ? await fetchCupDoorData(...) : null`.
- **Club-chrome twin routes:** both gate via `requireAdminOrClubAdminOfCup(cupId)` — identical to the pre-existing club `generer`/detail route pattern (URL club-id is chrome-only there too; write authz is the action gate + RLS backstop). No new gap.

## Findings

**Major:** none.

**Minor:**

1. **minor / dead-code** — `lib/formats/getFormatsForIntent.ts:14,68`: `CupEligibleFormat` + `getCupEligibleFormats` (an `unstable_cache`d query) lost their last consumers in this PR and are now dead exports. Harmless, but per repo praxis this should become a small cleanup issue rather than linger.
2. **minor / rule-with-multiple-homes** — the runtime list of `CupSessionFormat` members now exists in four places: `planValidation.ts:65` (`SESSION_FORMAT_SET`, tsc-exhaustive — good), `GenerateMatches.tsx:89` and `CupPlanSetup.tsx:24` (two verbatim copies of `SESSION_FORMAT_IDS`+`normalizeCustomSessions`, NOT exhaustiveness-checked), and `CupPlanForm.tsx:31` (`SESSION_FORMATS` order list). A future union member would compile-fail only in planValidation; the two normalizers would silently filter the new format out of saved custom plans. Suggest one shared helper (AGENTS.md trap 4). Not blocking: tsc catches at least one site and failure mode is a dropped format in UI, not data corruption.
3. **minor / copy** — hyphenated compounds in new Norwegian copy: «Paring-strategi» (no.json `cup.plan.strategyHeading`) and «sesjon-liste» (`customPresetDescription`) — idiomatic bokmål would be «Paringsstrategi»/«sesjonsliste». Style-level; the surrounding copy is otherwise natural and action-oriented.
4. **minor / behavior nuance** — switching preset away from `splittet-cup-dag` and re-saving sets `best_ball_allowance_pct` back to NULL (field unrendered ⇒ empty ⇒ NULL), so a later switch back prefills 85 rather than the previously chosen value. Reasonable semantics; noting so it is a choice, not an accident.

## Out-of-scope observations

- **Prod migration pending (process, not a defect):** verified read-only that prod (`glofubopddkjhymcbaph`) does NOT yet have `tournament_plans`/`tournament_participants`. Per the contract and #1074 this is correct right now, but the migration MUST be applied to prod (after explicit owner approval) BEFORE merge/deploy — otherwise every draft-cup detail page and all three rooms break in prod on the missing tables. This PR falls under «aldri auto-merge: prod-DB-migrasjoner».
- The branch is 1 commit behind origin/main (docs/loops + .github diffs in `git diff origin/main..HEAD --stat` are main moving ahead, not branch edits — verified with `git log origin/main..HEAD -- docs/ .github/` = empty). Rebase before merge per repo praxis.
- `revalidateTag('tournament-${id}', 'max')` in planActions matches the pre-existing convention in generer/actions.ts; no cache currently reads that tag (`getCupSnapshot` deliberately uncached), so the `revalidatePath` calls do the real work. Consistent, harmless.

## Conclusion

All seven success criteria have concrete evidence, all five gates are green (four re-run by the evaluator, the staging e2e independently re-run), and the contract's binding design decisions are honored in the code as written. The four findings are minor polish/hygiene items that do not block ACCEPT; items 1–2 are good candidates for a small follow-up issue before or at PR time.
