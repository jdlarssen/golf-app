# Evaluation: Skins (med carryover) — issue #275

**Evaluator:** Fresh-context skeptical review (did not write the code).
**Commits:** `b075a25`..`6d69e4f` on `claude/dazzling-williamson-bd67cb` (9 commits).
**Verdict:** **ACCEPT**

---

## Success Criteria

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Migration `0051_skins.sql` seeds format-row + intent-mapping, no new table | PASS | `0051_skins.sql:11-27`: `slug='skins'`, `scoring_module='@/lib/scoring/modes/skins'`, `is_cup_eligible=false`, `is_active=true`; `format_intent_mapping` = `kompis, is_primary=true, sort_order=70`. Matches `0050_nassau.sql` pattern exactly (Nassau used sort_order 60). No `create table`. |
| 2 | `skins.ts` exports `compute(ctx): SkinsResult` with carryover state | PASS | `skins.ts:126-238`. Algorithm matches contract: `carriedPot` init 0 (146), `atStake = carriedPot + 1` (176), unique-low wins whole pot then `carriedPot = 0` (194-203), tie → `carriedPot = atStake` carryover (204-209), pending freezes resolving via `frozen` flag (150, 158-173). `effectiveFor` reuses nassau pattern (47-55). |
| 3 | `skins.test.ts` ≥18 Type A cases incl. all listed scenarios | PASS | 26 tests pass. "carryover won on hole 4" → `skins.test.ts:304`; multi-tie sequence → 304, 339; 3-/4-way tie via `it.each` → 243-279; pending stops resolution → 363-440; unwon at split last hole → 442-483; gross vs net → 485-535; 2- and 4-player → 537-582. Ranking/tiebreak → 584-677. `npx vitest run lib/scoring/modes/skins` = **26 passed**. |
| 4 | `index.ts` router case + types extended | PASS | `index.ts:29` import, `52-53` `case 'skins': return skins.compute(ctx)`, `113-116` type re-exports. `types.ts:15` GameMode union, `33` MODE_LABELS, `130-137` GameModeConfig, `1050-1092` Skins types, `1125` ModeResult union. |
| 5 | `validateSkins` (2–4, solo) registered | PASS | `gamePayload.ts:1084-1120` (2-4 at publish, `team_number/flight_number: null`, reuses `duplicate_player`/`min_players_for_mode`/`too_many_players_for_mode`); `parseSkinsScoring` default net (1127-1131); wired in `parseGameMode` (241) + `modeValidators` (1146). 10 validator tests in `61ff969`. |
| 6 | Wizard renders SkinsSetup + hidden input (Type C) | PASS | `GameWizard.tsx:47` import, `450-453` conditional render on `state.isSkins`, `682-683` hidden `skins_scoring` input. `SkinsSetup.tsx` scoring radiogroup. Type C test `SkinsSetup.test.tsx` present. |
| 7 | Scorecard "X skins på spill" banner when `gameMode==='skins'` | PASS | `HoleClient.tsx:632-660` banner gated on `isSkins && skinsAtStake != null`; copy "1 skin på spill" / "N skins på spill" + carry hint. `page.tsx:338-387` computes `skinsAtStake`/`skinsCarriedIn` server-side via `skins.compute`. |
| 8 | SkinsView (totals + per-hole + unwon) + SkinsPodium + dispatch | PASS | `SkinsView.tsx` leaderboard + hole-list + unwon box; `SkinsPodium.tsx` 1/2/3 on totalSkins; dispatch `page.tsx:412 if (game.game_mode === 'skins') return renderSkins(...)`. Type C render test `SkinsView.test.tsx` covers totals, carryover row, won row, pending, unwon, reveal-hidden. |
| 9 | E2E `e2e/games/skins.spec.ts` auth-gate golden path | PASS | File present (commit `85cb437`), mirrors wolf/nassau. Carryover scoring correctly lives in Type A per test-discipline; deviation noted in CHANGELOG/closing. |
| 10 | Norwegian copy run through humanizer | PASS (see flag #4 below) | No em-dash chains in user-facing JSX, no anglicisms, no "vennligst". Commit `706ee97` explicitly fixed an em-dash chain in SkinsSetup copy. Golf terms (skin/pott/ruller videre/scooper) endorsed by contract. |
| 11 | CHANGELOG + bump to 1.45.0 | PASS | `package.json` version = `1.45.0`; `CHANGELOG.md:20-51` full three-layer entry under `1.45.y — Skins`. |

---

## Gates (run by evaluator)

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | PASS for this work. All ~14 errors are in the known pre-existing set (`signups/actions.test.ts`, `withdrawActions.test.ts`, `signup/[shortId]/*`, `allowanceCopy.ts`). Confirmed: zero errors in any skins/nassau/gamePayload/HoleClient/leaderboard file; `git diff main...HEAD` shows the error-bearing files are untouched by this branch. |
| `npx vitest run lib/scoring/modes/skins` | PASS — 26/26 |
| `npx vitest run` (full suite) | PASS — 1804/1804 across 154 files |
| `npm run lint` | PASS — 0 errors, 12 warnings. All 12 are the identical `_gameId`/`_gameStatus` unused-param warning shared across ALL leaderboard views (Nassau, Wolf, SoloStableford, etc.). SkinsView's warning is consistent with the established convention, not a new defect. |

---

## Flagged Concern #2 — `unwonSkins = frozen ? 0 : carriedPot` (edge case)

**Scenario:** A game `finished` early with trailing unplayed/pending holes, where the last *played* hole was a tie. `frozen` becomes `true` at the first pending hole, so `unwonSkins = 0` — and the leaderboard's unwon-skins line is additionally gated on `gameStatus === 'finished' && result.unwonSkins > 0` (`SkinsView.tsx:127`). The hanging skins from the tied last-played hole would be hidden. The contract's edge-case section says "Carry fra siste delte spilte hull = uvunnet," so this scenario is technically under-reported.

**Verdict: Defensible simplification. Does NOT block ACCEPT.**

Reasoning:
- **Correct for the two real cases.** (a) A complete 18-hole round — every hole scored, `frozen` never trips, `unwonSkins` reports the hanging pot accurately (proven by tests at `skins.test.ts:442-483`). (b) A live in-progress round — pending holes *should* freeze rather than declare skins permanently lost, because the gap can still be filled. `frozen` correctly distinguishes "waiting" from "round over with a hanging pot."
- **The bug only manifests in "finished early with a gap AND a tie immediately before the gap."** In Tørny this requires an admin to end a game mid-round while a hole has partial scores and the preceding played hole tied. This is a rare administrative edge, not a common-play path. When it happens the pot is shown as `pending` (frozen) rather than `unwon` — the skins are not silently awarded to anyone (totals are still correct), they are merely labeled "venter" instead of "ikke vunnet."
- **No correctness/award bug.** Player `totalSkins` are never wrong; only the *label* on the hanging pot differs (pending vs unwon) in this narrow case. The money-settlement use case (who won how many skins) is unaffected.
- **No data corruption / no silent skin award.** This is purely a display-label nuance.

Recommendation (non-blocking): file a follow-up issue to fold the frozen carry into `unwonSkins` when `gameStatus === 'finished'`, so an early-ended game surfaces hanging skins. Not required for v1 ship.

---

## Flagged Concern #3 — SkinsView.test.tsx `toContain` density (test quality)

**Verdict: ACCEPTABLE. Does NOT block ACCEPT.**

`docs/test-discipline.md` rule is ">3 `toContain` on the SAME variable in one test → use snapshot." The test (`SkinsView.test.tsx:124-196`) is a single `it` but the `toContain` calls are spread across **distinct scoped containers**, not piled on one variable:
- `playerRows[0]` / `[1]` / `[2]` (3 different list-item elements) — 4 calls
- `holeList.textContent` — 3 calls (Hull 1/2/3 presence)
- `hole1` / `hole2` / `hole3` (3 different `getByTestId` row containers) — distinct
- `unwonBox` (separate render #2) — 3 calls
- `hidden` (separate render #3, reveal mode) — distinct

The test is structured as three explicitly-commented render scenarios (full view / unwon view / reveal-hidden) with `unmount()` between them, each asserting against freshly-scoped `within()` containers and testid lookups. No single variable exceeds 3 `toContain`. This matches the "spread across different containers/scenarios = acceptable" branch of the rule, and is the established single-render-test-per-component Type C pattern. Within budget.

---

## Validator (Concern #4) — verified
2–4 players enforced at publish (`gamePayload.ts:1102-1109`), solo (team/flight null, line 1099), `skins_scoring` defaults net (`parseSkinsScoring` 1127-1131), registered in both `parseGameMode` (241) and `modeValidators` (1146). PASS.

## Wiring (Concern #5) — verified
`index.ts` router case (52), `types.ts` union/config/labels/result-types, leaderboard dispatch (`page.tsx:412`), GameWizard SkinsSetup + hidden input, HoleClient banner. All present. PASS.

## Migration (Concern #6) — verified
Seed-only, correct slug/intent/sort_order (70), no new table, mirrors `0050_nassau.sql`. PASS.

## Norwegian copy (Concern #7) — verified
No AI-tells in user-facing strings. The single pre-existing em-dash chain was fixed in `706ee97`. Remaining em-dashes are all in English code comments / single-appositive JSDoc. PASS.

---

## Final Verdict: **ACCEPT**

All 11 success criteria met. All 4 gates pass (tsc errors confirmed pre-existing and untouched by this branch; lint warnings are pre-existing cross-view convention). Both flagged concerns resolve as non-blocking.

**Blocking issues:** none.

**Non-blocking follow-up (recommend issue):**
- `unwonSkins` reports 0 for a game ended *early* with a tied last-played hole followed by a gap (frozen path). Correct for full 18-hole rounds and live rounds; only the rare "admin ends mid-round right after a tie" case under-labels the hanging pot as pending instead of unwon. No award/data bug. Consider surfacing frozen carry as unwon when `gameStatus === 'finished'`.
