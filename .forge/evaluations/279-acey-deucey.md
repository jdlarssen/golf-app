# Evaluation: Acey Deucey (issue #279)

**Verdict: ACCEPT** — scoring is provably correct, all gates green (build + 1966 tests + 0 lint errors), migration applied to live DB exactly as specified, wizard field-name wiring verified end-to-end, leaderboard/podium routing sound. Only nits found (a stale test-count number in the contract and a slightly misleading dead-code copy string). No blockers, no should-fix.

Evaluated by a skeptical fresh-context agent on 2026-05-30. Commits `f91f28f..HEAD` (7 commits: `59b4ebb` scoring/validator/guide, `90730fd` tiebreak test, `6f3058b` leaderboard, `7dbeec1` wizard, `0db6ece` copy polish, `1643576` release 1.50.0, `7b93023` contract docs).

---

## Gate results (all run fresh by evaluator)

| Gate | Result | Evidence |
|------|--------|----------|
| `npx tsc --noEmit` | **PASS** | Exactly the 4 known pre-existing errors in unrelated test files (`signups/actions.test.ts`, `withdrawActions.test.ts`, `signup/[shortId]/actions.test.ts`, `signup/[shortId]/teamActions.test.ts` — all `TS2556`/`TS2493`/`TS2352` spread/tuple noise). **NO `aceyDeucey`/`acey_deucey` file appears in the error list.** |
| `npx vitest run lib/scoring/modes/aceyDeucey` | **PASS** | `Test Files 1 passed (1) · Tests 16 passed (16)` |
| `npx vitest run lib/games/gamePayload` | **PASS** | `Test Files 1 passed (1) · Tests 155 passed (155)` — note: contract claims 171, actual is 155 (see Nit 1) |
| `npx vitest run` (full) | **PASS** | `Test Files 169 passed (169) · Tests 1966 passed (1966)`. Matches contract's 1966 claim exactly. ("Not implemented: navigation" is a benign jsdom log, not a failure.) |
| `npm run lint` | **PASS** | `0 errors, 14 warnings`. All 14 are pre-existing `_gameId`/`_gameStatus` unused-var warnings across every leaderboard View (Nassau/Skins/Wolf/Solo/Texas/Team). AceyDeuceyView's `_gameId` warning is consistent with the established repo pattern — not a regression. |
| `npm run build` (**authoritative**) | **PASS (exit 0)** | Full route tree rendered, incl. `/games/[id]/leaderboard`, `/admin/games/new`, `/spillformer`. Build is the gate that catches exhaustive `Record<GameMode>`/`switch` gaps — its passing proves every exhaustive site is satisfied. |

---

## Criterion-by-criterion (contract Success Criteria)

1. **Migration `0054_acey_deucey.sql` seeds format-row + intent-mapping; applied to live DB** — **PASS.**
   Live DB query (`project_id glofubopddkjhymcbaph`): `f=1, m=1, so=95, sm=@/lib/scoring/modes/aceyDeucey, active=true, cup=false, intent=kompis, is_primary=false`. Migration registered in `supabase_migrations.schema_migrations` as version `20260529221800` name `acey_deucey`. Local file `supabase/migrations/0054_acey_deucey.sql` matches the applied state byte-for-byte (slug, display_name, icon_key, short_description, scoring_module, is_active=true, is_cup_eligible=false; mapping kompis/is_visible=true/is_primary=false/sort_order=95).
   **sort_order 95 verified in context:** the live `kompis` ladder is `…bingo_bango_bongo=90, acey_deucey=95, {foursomes,solo,fourball}=100`. 95 sits cleanly between BBB and the shared 100-bucket exactly as the deviation note claims. (An unrelated `nines=71` format also exists — confirmed NOT part of this PR: no nines files in `f91f28f..HEAD`.)

2. **`lib/scoring/modes/aceyDeucey.ts` exports `compute(ctx): AceyDeuceyResult`; respects `acey_deucey_scoring`** — **PASS.** `effectiveFor` (aceyDeucey.ts:34-42) returns `gross` when `'gross'`, `gross - strokesForHole(courseHandicap, strokeIndex)` when `'net'`. Defensive fallback to `'net'` on malformed config (lines 112-116). Toggle is read from `ctx.game.mode_config.acey_deucey_scoring`.

3. **`aceyDeucey.test.ts` covers all the listed cases, 16/16 green** — **PASS.** Verified each case is genuinely tested, not just claimed: unique ace+deuce (l.99), two-middles-zero (l.123), tied-lowest-voids-ace-only (l.151), tied-highest-voids-deuce-only (l.181), both-sides-tied (l.210), all-four-equal (l.230), three-way-tie-low (l.256), three-way-tie-high (l.279), incomplete-hole-no-freeze (l.307), net-vs-gross-flip (l.350), negative running total (l.406), aces-tiebreak (l.479), aces/deuces counters (l.523), discriminated shape (l.66).

4. **`lib/scoring/index.ts` case + re-export** — **PASS** (verified `acey_deucey` references present; build proves the router switch is wired).

5. **`types.ts` AceyDeucey types + extended unions + `MODE_LABELS`** — **PASS.** `GameMode` (l.18), `MODE_LABELS.acey_deucey='Acey Deucey'` (l.39), `GameModeConfig` variant `{kind:'acey_deucey'; team_size:1; acey_deucey_scoring:'gross'|'net'}` (l.183-185), `AceyDeuceyHoleRow`/`AceyDeuceyPlayerLine`/`AceyDeuceyResult` (l.1223-1259), `ModeResult` union member (l.1296).

6. **`gamePayload.ts` `validateAceyDeucey` (exactly 4) wired + tested** — **PASS.** `validateAceyDeucey` (l.1181) enforces `<4 → min_players_for_mode`, `>4 → too_many_players_for_mode` at publish (l.1199-1206); nulls team/flight (solo); wired into `parseGameMode` (l.244) + `modeValidators` map (l.1288). Tests (gamePayload.test.ts:2330-2439): 3 players rejected, 4 ok, 5 rejected, gross/net parse, default-net, duplicate rejected, draft-empty tolerated, team/flight null. **The exact-4 boundary (reject 3, accept 4, reject 5) is explicitly tested.**

7. **`modeGuide.ts` `acey_deucey` entry** — **PASS** (modeGuide.ts:133-141; summary + 3 points, idiomatic, no em-dash chains).

8. **Wizard renders gross/net toggle, field name verified end-to-end** — **PASS.** Field-name chain confirmed: `AceyDeuceySetup.tsx` radios `name="acey_deucey_scoring"` (l.54,72) → `GameWizard.tsx:697` hidden input `name="acey_deucey_scoring" value={aceyDeuceyScoring}` → `parseAceyDeuceyScoring` reads `formData.get('acey_deucey_scoring')` (gamePayload.ts:1224). **No mismatch.** Default `'net'` in both UI state (`useGameFormState.ts:271-272`) and parser fallback (l.1226). `TeamSizeSelector.tsx:83` locks acey_deucey to `Set([1])`.

9. **`AceyDeuceyView.tsx` (signed totals + per-hole table, "Delt"/"Venter") + `AceyDeuceyPodium.tsx`** — **PASS.** Type C render test `AceyDeuceyView.test.tsx` asserts signed totals (`+3`, `−3` U+2212), per-hole ace/deuce names, "Venter" on unscored hole, "Delt" on voided side, and reveal-mode hiding. `formatSigned` uses real minus glyph (U+2212) in both View (l.230) and Podium (l.37). Podium renders 1/2/3 with champagne-gold on winner only.

10. **`renderAceyDeucey` routing** — **PASS.** leaderboard/page.tsx:449-450 branch placed before best_ball fallback; `renderAceyDeucey` (l.2402) builds ScoringContext, calls `computeModeResult`, narrows `kind==='acey_deucey'` else `notFound()` (l.2459-2461); finished → `<AceyDeuceyPodium>` + chromeless `<AceyDeuceyView>` (l.2478-2500); active/scheduled → `<AceyDeuceyView>` alone (l.2502-2512).

11. **Norwegian copy humanizer-reviewed** — **PASS.** Grep for em-dash in new acey files: every hit is in code comments/JSDoc, none in user-facing strings. The modeGuide entry, View labels ("Venter"/"Delt"/"poeng"/"ace"/"deuce"), Setup copy, and CHANGELOG tagline all use commas/periods, not em-dash chains. No "X-spillet" redundancy, no "vennligst", no "Tap".

12. **CHANGELOG + minor bump 1.50.0 + 1.49.y wrapped in `<details>`** — **PASS.** `package.json` version `1.50.0`; CHANGELOG `## 1.50.y` heading + `[1.50.0] - 2026-05-30` with three-layer structure (tagline blockquote + Teknisk details); previous `1.49.y` series wrapped in `<details>` (l.54).

---

## Scoring correctness — independent analysis

I re-derived the rules from issue #279 directly: "Lavest score på hullet ('ace') får 1 poeng fra hver av de tre andre = +3. Høyest ('deuce') gir 1 poeng til hver av de tre andre = -3. De midterste = 0. Tied lavest/høyest = ingen utdeling." Exactly 4 players.

The implementation's core (aceyDeucey.ts:155-182): `allScored` gate → `minEff=Math.min`, `maxEff=Math.max` → `aceCandidates=filter(eff===minEff)`, `deuceCandidates=filter(eff===maxEff)` → award `+3` iff `aceCandidates.length===1`, `−3` iff `deuceCandidates.length===1`. The `length===1` strict-uniqueness gate is the correct reading of "unique lowest/highest"; the off-by-one trap (`<=1` or `>=2` inversions) is absent.

I wrote a **standalone oracle** (no import of the impl) and cross-checked:

- **Hand-worked #1 — `[3,4,5,6]` gross:** minEff=3 (1 candidate→u1 +3), maxEff=6 (1 candidate→u4 −3), middles 0. Oracle output: ace=u1, deuce=u4. Matches impl + test l.99. ✓
- **Hand-worked #2 — `[3,3,5,5]` gross (both tied):** minEff=3 (2 candidates→no ace), maxEff=5 (2 candidates→no deuce), all 0. Matches impl + test l.210. ✓
- **`[3,3,4,5]` (tied-lowest only):** ace=null, deuce=u4. Oracle ✓ (independent voiding of the two sides confirmed).
- **Net 3-way-tie-low:** u1/u2/u3 net=2 (CH strokes), u4 net=4 → ace=null (3 tied at min), deuce=u4. Oracle ✓ — net comparison and candidate-counting both correct.
- **Negative total:** u4 deuce ×3 → −9, u1 ace ×3 → +9. Oracle ✓ (matches counters test l.523 which asserts u4.total=−9, deuces=3).
- **All-equal `[4,4,4,4]`:** minEff===maxEff===4, both candidate sets length 4 → neither ace nor deuce, all 0. ✓ (falls out of `length===1` naturally; tested l.230).

**Incomplete-hole / no-freeze:** `allScored = effByPlayer.every(e => e.eff !== null)` (l.144). When false, `pointsByPlayer` stays all-0 and the loop continues to the next hole with no carry/freeze state — unlike Skins. Verified against test l.307 (hole 1 missing u4 → scored=false, all 0; hole 2 fully scored still awards). Faithful to the Modified-Stableford model the contract chose. ✓

**Gross vs net toggle:** net = `gross - strokesForHole(courseHandicap, strokeIndex)` via `effectiveFor`. Two distinct gross can collide on net → tied → no award that side. Verified by the net-flip test (l.350): gross `[4,4,4,4]` all-tied (no ace), but with CH=18 on SI=1 only u1 gets a stroke → net `[3,4,4,4]` → u1 unique ace, u2/u3/u4 tied-highest → no deuce. ✓

**Ranking + tiebreak:** sort is `total DESC → aces DESC → userId ASC` (deterministic). `rank = firstTiedIndex+1` where the tie key is `(total, aces)` — standard competition ranking. `tiedWith` uses the same `(total, aces)` key. Traced the asymmetric case: u1 `(total=3, aces=2)` vs u2 `(total=3, aces=1)` → u1 sorts first, rank 1, tiedWith empty; u2 rank 2, tiedWith empty (NOT listed as tied despite equal total). Matches test l.479-516. The 2-way equal-on-both case (l.437) correctly produces shared rank 1 + populated tiedWith. ✓

**On the "independent tie" decision:** The issue says "Tied lavest/høyest = ingen utdeling." The implementation treats the two sides independently — tied-lowest voids only the ace, tied-highest voids only the deuce (so `[3,3,4,5]` still gives the lone high-scorer a −3). I find this a **faithful and standard** reading: the issue lists "lavest" and "høyest" as two separate awards in two separate sentences, and real-world Acey Deucey resolves the low pot and high pot independently. A "both-void" reading (any tie anywhere voids the whole hole) would be a defensible alternative, but the contract explicitly chose independent with that rationale (Key Decisions), and it matches the canonical game. No objection.

---

## Issues found

**Blockers:** None.

**Should-fix:** None.

**Nits:**

1. **Stale test-count in contract.** The contract (Success Criteria + Gates) repeatedly states `gamePayload.test.ts` is **171/171**. Actual fresh run: **155 tests, all passing.** The `aceyDeucey.test.ts` "16/16" and full-suite "1966/1966" numbers are correct. The 171 is a documentation error in the contract only — zero functional impact (the 8 new acey cases are all present and green). Worth correcting if the contract is treated as a living record, but not blocking.

2. **Misleading dead-code copy string.** `lib/games/allowanceCopy.ts:53` returns `'Ingen handicap — per-hull-poeng bruker gross-score.'` for acey_deucey, but the format defaults to **net** and the user explicitly picks gross/net. The string is wrong-ish (implies gross-only). However, the surrounding comment (l.50-52) states this branch is **type-completeness only and never rendered** — Acey Deucey shows its own `AceyDeuceySetup` toggle instead of the generic allowance field, mirroring Wolf/Nassau/Skins (whose strings have the same "for type-completeness" disclaimer). Since it's unreachable UI, this is a cosmetic nit, not a user-facing bug. If touched later, reword to "…bruker valgt brutto/netto-scoring."

**Live UI verification:** Per the contract and project norms (Tørny tests in prod on iPhone Safari), a full Playwright run needs a seeded 4-player game + running Supabase and is disproportionate. UI is verified via (a) the passing Type C render tests (`AceyDeuceyView.test.tsx`, `AceyDeuceySetup.test.tsx`) and (b) code inspection of View/Podium/routing. Live iPhone-Safari check on the Vercel preview remains the user's step. Not a basis to withhold ACCEPT.

---

## Gold-plating / deviations

- **No gold-plating.** The implementation matches the contract's "Skins minus tabell/UI-input" scope: scoring module + types + index case + validator + wizard toggle + View/Podium + migration + mode-guide. No new table, no new scorecard section, no new server-action, no realtime sub — exactly as the issue's "LOW · standard strokeplay-input" demanded.
- **Justified deviations (all reasonable):**
  - `sort_order = 95` instead of contract's 100 — because live `kompis` 100 is already a 3-way bucket (foursomes/solo/fourball). 95 keeps Acey Deucey beside its point-game siblings (BBB=90). Verified against live DB. ✓
  - Extra exhaustive sites touched beyond the contract's "Files Likely Touched": `lib/games/allowanceCopy.ts` (`bruttoHelperFor`), `app/admin/games/new/sections/ReadyStep.tsx` (`MODE_SUMMARY_LABELS`), `app/admin/games/new/TeamSizeSelector.tsx` (`ENABLED_COMBOS`), `app/games/[id]/page.tsx` (local `GameMode` union). All four are exhaustive `Record<GameMode>`/union sites the build would have failed without. Necessary, not gratuitous. ✓
  - Second Type C test (`AceyDeuceySetup.test.tsx`) in addition to the required `AceyDeuceyView.test.tsx` — allowed under test-discipline (max one render-test *per component*; these are two different components). ✓
- `gameModeSupportsTeams` correctly returns false for acey_deucey (only best_ball + texas_scramble return true) — solo format confirmed. ✓
