# Evaluation: Skins — Hull-for-hull + Head-to-head (PR 1 av epic #496)

**Contract:** `.forge/contracts/496-skins-hull-for-hull-h2h.md`
**Commits evaluated:** `0c12dd1`, `ab20726`, `0536fd6`, `42756d5` (base `7ad55b6`)
**Date:** 2026-06-08
**Evaluator:** forge:evaluate (skeptical, independent)

## Verdict: **ACCEPT**

All 7 success criteria are met with concrete evidence. All 4 gates pass (tsc 0 errors, targeted tests 4/4, full suite 2917/2917, lint 0 errors). No blocking bugs found. Two non-blocking observations noted below; neither warrants a fix in PR 1.

---

## Per-criterion verification

| # | Criterion | Verdict | Evidence |
|---|-----------|---------|----------|
| 1 | «Hull for hull» på ferdig Skins-spill viser per-hull-vinner, per-spiller-scorer, carryover-kjede + hengende pott — ikke lag-scorekortet | PASS | `holes/page.tsx:111` branches `if (game.game_mode === 'skins')` → renders `<SkinsHolesBody>`. `SkinsHolesView.tsx:92-99` maps `result.holes` to `<HoleCard>`; `:213-268` renders `hole.perPlayer` per-player scores with winner highlight (`isSkinWinner`, `:218`); `:271-287` outcome + `carriedIn` chain; `:102-115` hanging-pott box (`carriedPot > 0`). |
| 2 | 2-spiller → `HeadToHeadResult`; 3+ → `SkinsPodium`. Only when finished. | PASS | `page.tsx:2488` `if (game.status === 'finished')` then `:2489` `if (result.players.length === 2)` → `<HeadToHeadResult>` (`:2527`); else (`:2552`) → `<SkinsPodium>`. Active games fall through to bare `<SkinsView>` (`:2575`). Conditional is exactly as specified. |
| 3 | Momentum-strip uses TWO NEW color tokens (not forest), grey for halved/carried/unplayed | PASS | `globals.css`: `--player-a: #2f6d83` (petrol) + `--player-b: #c06542` (terracotta) in `:root`; dark variants in BOTH the `@media (prefers-color-scheme: dark)` block AND the `.dark` class block (`#6fa3bd`/`#db8a66`); registered in `@theme inline` as `--color-player-a`/`--color-player-b`. Neither reuses forest (`#1B4332`) nor champagne. Strip `cellClass` (`HeadToHeadResult.tsx:229-240`): `a`→`bg-player-a`, `b`→`bg-player-b`, `halved`→`bg-muted/40`, default(unplayed)→bordered transparent. |
| 4 | H2H winner follows rank (totalSkins→holesWon), not raw score | PASS | `page.tsx:2517-2518` `winnerUserId = a.rank === b.rank ? null : (a.rank < b.rank ? a.userId : b.userId)` — rank-driven (rank already encodes the totalSkins→holesWon tiebreak from `rankPlayers`). `HeadToHeadResult.tsx:89-100` prefers explicit `winnerUserId` over score-derived. Verdict (`:112-118`) says «{winner} vant.» (no score gap) when `sideA.score === sideB.score` but winner decided on tiebreak. |
| 5 | reduced-motion: strip animerer ikke | PASS | Strip cells use `.reveal-up` (`HeadToHeadResult.tsx:197`). `globals.css:536-541` suppresses `.reveal-up` under `prefers-reduced-motion` (`animation: none; opacity: 1`). `git diff` confirms NO new `@keyframes`/`animation`/`transition` declarations added. Confetti also hidden by existing rule. |
| 6 | Dark mode, tabular-nums, ≥44px on new surfaces | PASS | Dark: tokens have `.dark` variants; all surfaces use semantic `bg-surface`/`text-text`/`text-muted`. tabular-nums: present on every numeric span (e.g. `HeadToHeadResult.tsx:273,282,139`; `SkinsHolesView.tsx:83,195,198,252`). ≥44px: only interactive elements are back-`SmartLink`s, both `h-11 w-11` (44px) (`HeadToHeadResult.tsx:129`, `SkinsHolesView.tsx:145`). Strip/bar are non-interactive (`role="img"`/decorative). |
| 7 | CHANGELOG-oppføring + MINOR-bump i samme commit | PASS | `package.json` 1.93.0 → 1.94.0 (MINOR). `CHANGELOG.md` adds `## 1.94.0` three-layer entry (tema + tagline + Teknisk details), previous 1.93.y series re-wrapped in `<details>`. Both land in feature commit `ab20726` (confirmed via `git show --stat`). |

### Copy review (criterion: humanizer)
User-facing Norwegian is idiomatic and free of mechanical AI-tells: «vant duellen 5–3», «Delt → dratt videre», «Venter på score», «Godt spilt.», «{n} skins ikke vunnet. Siste spilte hull ble delt.», «Resultatene avsløres etter runden». No «X-spillet» redundancy, no «vennligst», no «tap», no em-dash chains in rendered strings (em-dashes appear only in JSDoc comments, which the pre-commit hook does not scan). Cannot verify the skill was *run*, but output quality is consistent with a humanizer pass.

---

## Gate results

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | **PASS** — exit 0, zero errors |
| `npx vitest run` (3 targeted Type C files) | **PASS** — 3 files, 4 tests passed |
| `npx vitest run` (full suite) | **PASS** — 238 files, 2917 tests passed, 0 failures (no regression) |
| `npm run lint` | **PASS** — 0 errors, 24 warnings (all pre-existing `_gameId`/`_gameStatus` unused-var in untouched sibling View files; grep confirms ZERO warnings in the four new/changed files) |

---

## Behaviour-identity of the buildSkinsContext refactor

The extracted helper produces byte-identical `ScoringContext` shape to the old inline block in `renderSkins`:
- players: `{ userId, teamNumber: null, flightNumber: null, courseHandicap: ?? 0, teeGender }` after `filter(p.users != null)` — identical.
- holes: `{ number, par: par_mens, parByGender{mens,ladies,juniors}, strokeIndex }` — identical.
- scores: `{ userId, holeNumber, gross: strokes }` — identical.

`renderSkins` output is unchanged. Both `renderSkins` and `SkinsHolesBody` now call the same helper (single source). tsc + full suite green confirms no contract drift.

---

## Bug hunt (edge cases)

| Case | Finding |
|------|---------|
| `[a,b]` sort via `gwp.players` `indexOf` returning -1 | **Safe.** `result.players` is a 1:1 subset of `ctx.players`, itself built by filtering `gwp.players` on `users != null`. Every `result.player.userId` is therefore present in `order = gwp.players.map(p=>p.user_id)` (which includes ALL rows). No -1. |
| 0 / 1 players | Falls to `SkinsPodium` branch (length !== 2) — existing behavior, no crash. |
| 0–0 / all-halved strip | `pctA = total === 0 ? 50 : ...` → 50/50 bar, no division-by-zero (`HeadToHeadResult.tsx:103`). Strip all `halved`/`unplayed` → grey cells. Verdict «Uavgjort 0–0.» |
| Course <18 holes / early finish | Strip length = `result.holes.length`; flex-wrap layout, no fixed 18 assumption that would break. Unplayed/pending → grey. |
| Pending hole on finished game | `outcome: 'pending'` → «Venter på score» (`SkinsHolesView.tsx:162`); strip `unplayed` grey. Handled. |
| null/unknown player name | `formatRevealName` fallback + explicit «(ukjent spiller)» (`SkinsHolesView.tsx:217`) / «(ukjent)» in `sideFor`. |
| RSC serialization | `HeadToHeadResult` ('use client') receives only plain serializable props (strings/numbers/string-literal arrays/null) — `playersById` Map is NOT passed to it (server resolves `sideA`/`sideB` first). `SkinsHolesView` (server component) receives the Map server→server, fine. No boundary violation. |
| data-testid collisions | None. H2H uses `head-to-head`/`h2h-*`; SkinsHolesView uses `skins-holes-*`; SkinsView (rendered below H2H) uses neither. |
| Non-skins regression | `holes/page.tsx` diff is purely additive (zero deletions); DrilldownBody path byte-for-byte unchanged. Lag/best-ball «Hull for hull» untouched. |

### Non-blocking observations (NOT bugs, no fix needed in PR 1)
1. **Verdict `high–low` is winner-agnostic.** `HeadToHeadResult.tsx:109-118` derives `high/low` as `max/min(scores)` independent of which side won. For Skins this is always consistent (rank follows totalSkins desc, so the rank-1 winner always has the higher score, or equal+tiebreak handled separately). If a *future* consumer feeds a metric where lower wins, the «vant duellen {high}–{low}» line could misorder. Out of scope for PR 1 (Skins-only); worth a comment when generalizing.
2. **Back-link targets differ slightly.** SkinsHolesView back → `/games/${gameId}` (game home); H2H back → `backHref` (game home default). Both land somewhere sensible; minor cosmetic inconsistency, not a defect.
3. **No front-9 clip on active Skins holes page.** Intentional and contract-documented (`holes/page.tsx:137`): Skins carryover is sequential over the whole round, so SkinsHolesView shows all played holes live — matching existing `SkinsView` behavior (which also has no front-9 clip, only reveal-mode hiding). Not a leak: a `reveal`-mode active game is gated by `skins-holes-reveal-hidden` placeholder (`SkinsHolesView.tsx:50-67`).

---

## Conclusion

The implementation matches the contract faithfully, including the explicit owner decisions (two new non-forest player colors, A+B combined H2H card, carriedPot field, Skins-only branching). Refactor is behavior-identical. Test discipline respected (one Type C per component, parametrized tie variant, e2e auth-gate only, no scoring Type A). All gates green. **ACCEPT.**
