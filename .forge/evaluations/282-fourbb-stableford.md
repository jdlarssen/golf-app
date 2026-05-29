# Evaluation: #282 — 4BBB Stableford (visible, named team variant under Stableford)

**Verdict: ACCEPT**

Independent skeptical re-verification of every contract claim by reading source + running gates. All success criteria met, all gates green, all adversarial checks clear except one minor cosmetic inconsistency that is outside the contract's literal commitments (documented below as a non-blocking finding).

---

## Core deviation claim — VERIFIED TRUE

The contract's central justification (no new scoring module / migration, because team-Stableford MAX aggregation already exists) is independently confirmed:

- `lib/scoring/modes/stableford.ts:169` — `if (teamSize === 2) return computeTeam(ctx, pointsFn, contributorPredicate);`
- `lib/scoring/modes/stableford.ts:269` — `players.length === 0 ? 0 : Math.max(...players.map((pc) => pc.points));`

This is exactly the 4BBB / better-ball rule (best Stableford points per hole). The claim is true; the deviation is legitimate and was approved by the user (brukerbeslutning #1–#2). Not penalized.

---

## Success Criteria — per-criterion evidence

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Wizard team-tile says "4BBB" (not "Par") with hint, for stableford family | ✅ | `TeamSizeSelector.tsx:92-101` `tilesForMode` → `{size:2, title:'4BBB', hint:'Lag à 2, beste poeng teller'}` for `isStablefordFamily(mode)`, else `'Par'`. `TeamSizeSelector.test.tsx:14,45` assert 4BBB present for stableford, absent for best_ball. |
| 2 | `formatDisplayLabel(mode, modeConfig)` in server-safe `lib/games/formatLabel.ts`, returns "4BBB Stableford" for team_size 2, "Stableford" for solo | ✅ | `formatLabel.ts:28-43` — pure module, NO `'use client'`, only imports from `lib/scoring/modes/types` (no Supabase). `formatLabel.test.ts:12` (4BBB Stableford), `:32` (solo→Stableford), `:52` (best_ball stays "Best ball"). |
| 3 | 4BBB player guide shown instead of solo text | ✅ | `STABLEFORD_4BBB_GUIDE` + `resolveModeGuide` in `modeGuide.ts:132-151`; `ModeGuideCard.tsx:35` uses resolver. `ModeGuideCard.test.tsx:31-48` asserts 4BBB summary present AND solo summary absent for team_size 2. |
| 4 | `/spillformer` has a dedicated 4BBB row | ✅ | `app/spillformer/page.tsx:29-33` — `stableford-4bbb` CATALOG entry with `modeConfig: {kind:'stableford', team_size:2, points_table:'standard'}`, rendered via ModeGuideCard. |
| 5 | Type C render tests, no scoring numbers re-asserted | ✅ | `ModeGuideCard.test.tsx` + `ModeChip.test.tsx` assert names/summaries via text, read from `MODE_GUIDE`/`MODE_LABELS`/`STABLEFORD_4BBB_GUIDE` single sources — zero hardcoded copy, zero scoring numbers. |
| 6 | No regression on solo Stableford | ✅ | `formatLabel.test.ts:26` + `ModeGuideCard.test.tsx:50-63` (team_size 1 → "Stableford" + solo guide). Full suite 1884/1884 green. |
| 7 | CHANGELOG + package.json MINOR bump | ✅ | `package.json` 1.48.0; commit c5a6cec `feat(formats): … release 1.48.0`. |

### Wiring (criterion 2's "applied where mode_config available")
- game-home `app/games/[id]/page.tsx:407,523` — `<ModeGuideCard mode modeConfig={game.mode_config} />` ✅
- admin list `app/admin/games/page.tsx:309` — `<ModeChip mode modeConfig={g.mode_config} />`; `mode_config` added to `.select` (line 167) and typed `GameModeConfig` (line 66) ✅
- admin detail `app/admin/games/[id]/page.tsx:248` — `<ModeChip mode modeConfig={game.mode_config} />` ✅

---

## Gate results (all run independently)

| Gate | Expected | Actual | Pass |
|------|----------|--------|------|
| `tsc --noEmit` error count | 13 baseline | **13** | ✅ |
| tsc errors in #282-touched files | 0 | **0** (all 13 in unrelated `signup/[shortId]/*.test.ts`, `signups/actions.test.ts`, `withdrawActions.test.ts`; per-file cross-check of every touched `.ts/.tsx` found none) | ✅ |
| `vitest run` scoped (formatLabel, modeGuide, ModeGuideCard, ModeChip, games/new) | green | **16 files / 147 tests passed** | ✅ |
| `vitest run` full suite | all pass | **161 files / 1884 tests passed** | ✅ |
| `eslint` on all touched files | exit 0 | **exit 0** (1 warning: unused `vi` import in `GameForm.test.tsx:1` — warning, not error) | ✅ |
| `npm run build` | exit 0, Compiled successfully | **exit 0, "✓ Compiled successfully"** | ✅ |

---

## Adversarial checks

1. **Does the "4BBB" tile label break form submission?** — NO. `TeamSizeSelector.tsx:143` `onClick` calls `onChange(tile.size)` where `tile.size` is still `2` for the 4BBB tile (only `title` changed). `handleTeamSizeChange` (`useGameFormState.ts:378`) → `setTeamSize(2)` → hidden inputs `team_size` and `stableford_team_size` both = 2 (`GameForm.tsx:256,286-287`). Locked by `GameForm.test.tsx:330-342` which asserts clicking 4BBB yields `stableford_team_size=2` AND `team_size=2` in FormData. Payload semantics fully preserved.

2. **Is "4BBB Stableford" ever shown for a SOLO game?** — NO. `formatDisplayLabel` narrows on `team_size === 2`; solo (team_size 1) returns `MODE_LABELS[mode]` = "Stableford". Explicitly tested.

3. **Admin-list query change risk?** — NONE. `mode_config` added to `.select` string and typed as `GameModeConfig` on the row type. `mode_config` is an existing JSONB column already read elsewhere. tsc clean, build clean.

4. **Old cryptic label still anywhere?** — best_ball correctly keeps "Par" tile + "Best ball" chip (distinction holds, tested at `TeamSizeSelector.test.tsx:45`, `formatLabel.test.ts:46`). ONE residual inconsistency found — see Finding below.

---

## Findings (non-blocking)

**F1 — admin game-detail Format-card "Spillform" row still shows "Par-stableford" for a 4BBB game.**
`app/admin/games/[id]/page.tsx:400` — `const modeLabel = isParStableford ? 'Par-stableford' : MODE_LABELS[game.game_mode];` rendered at line 506 `<Row label="Spillform" value={modeLabel} />`. For a team_size-2 stableford game this page now shows BOTH "4BBB Stableford" (the new ModeChip at line 248) and "Par-stableford" (this Format row) — same game, two different names.

Why non-blocking: the contract's flate-navn criterion scoped the admin-detalj usage specifically to the `ModeChip` ("admin-detalj (`ModeChip modeConfig=…`)"), which is done. This Format-card label is a pre-existing string the contract did not commit to changing, and "Par-stableford" is still accurate (not wrong, just less discoverable than "4BBB"). It is a cosmetic inconsistency worth a follow-up issue, not a contract miss. Recommend a small follow-up to route line 400 through `formatDisplayLabel` for full surface consistency.

**F2 — minor:** unused `vi` import warning in `GameForm.test.tsx:1` (eslint warning, exit 0). Trivial.

---

## Summary

The implementer correctly identified that the scoring already existed and built three thin presentation layers (variant-aware label helper, variant-aware guide, mode-aware wizard tile) plus discoverability surfaces. The deviation from issue #282's literal acceptance criteria is documented transparently in the contract's "Avvik" section and was user-approved. Every committed criterion is independently verified met, every gate is green (13 baseline tsc errors all pre-existing and unrelated, 1884/1884 tests, build compiled, eslint exit 0), and the highest-risk adversarial path (form payload integrity) is both correct and test-locked. The single cosmetic inconsistency (F1) is outside the contract's scope.
