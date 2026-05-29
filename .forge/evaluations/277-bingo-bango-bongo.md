# Evaluation: Bingo Bango Bongo (#277)

**Date:** 2026-05-29
**Contract:** `.forge/contracts/277-bingo-bango-bongo.md`

## Verdict: **NEEDS WORK** (superseded — see Re-evaluation below)

One functional blocker: `validateBingoBangoBongo` is wired into `modeValidators` but **not** into `parseGameMode`, so publishing/creating a BBB game from the admin wizard returns `mode_required` and never reaches the validator. The scoring core, migration, helpers, UI, and leaderboard are otherwise solid and all gates pass.

> **Update 2026-05-29:** Both issues fixed and independently re-verified. Current verdict is **ACCEPT** — see "Re-evaluation" section at the bottom.

---

## Gate results

| Gate | Result | Key output |
|------|--------|-----------|
| `npx tsc --noEmit` | PASS (no new errors) | 13 errors, all in `app/admin/games/[id]/signups/actions.test.ts`, `app/games/[id]/withdrawActions.test.ts`, `app/signup/[shortId]/{actions,teamActions}.test.ts`. Verified pre-existing: `git diff main..HEAD --stat` shows none of these files are touched by the branch; errors are `TS2556`/`TS2493`/`TS2352` spread/tuple issues unrelated to BBB. |
| `npx vitest run lib/scoring/modes/bingoBangoBongo` | PASS | 1 file, 20 tests passed |
| `npx vitest run` (full suite) | PASS | 166 files, 1931 tests passed |
| `npm run lint` | PASS | 0 errors, 13 warnings (all pre-existing `'_gameId' is defined but never used` in SkinsView/SoloStableford/SoloStrokeplay/TeamStableford/TexasScramble/WolfView — not BBB) |
| `npm run build` | PASS | Compiled; full route map rendered including `/games/[id]/leaderboard`, `/opprett-spill`. Exhaustive `Record<GameMode,…>` maps + switch all satisfied (build is authoritative here). |

---

## Success-criteria verification

| # | Criterion | Met? | Evidence |
|---|-----------|------|----------|
| 1 | Migration `0053` creates table + RLS + trigger, seeds format + intent-mapping | PARTIAL | `supabase/migrations/0053_bingo_bango_bongo.sql:7-72`. Table/columns/nullability/PK/trigger/RLS all match contract. **sort_order=80 collides** with `modified_stableford` (kompis) = 80 from `0052:33`. No DB error (no unique constraint on sort_order; PK is `(format_slug,intent)`), so migration applies green — but the comment at line 3 ("Wolf=50, Nassau=60, Skins=70 … neste ledige") is factually wrong: it omits modified_stableford=80. Cosmetic wizard-ordering ambiguity, not a failure. Migration NOT applied to DB (intentional — see below). |
| 2 | `bingoBangoBongo.ts` exports `compute(ctx): BingoBangoBongoResult` | YES | `lib/scoring/modes/bingoBangoBongo.ts:49` |
| 3 | Type A tests: same-player-all-3, normal split, no-row, null-category, 2/3/4 players, ranking+tiebreak, stroke-independence | YES | `lib/scoring/modes/bingoBangoBongo.test.ts` — 20 real-assertion tests. Same-player-all-3 → 3 points (`:75-94`), tiebreak total→bingos→bongos with shared rank (`:251-337`), stroke-independence verified by running identical BBB input under inverted gross scores and asserting equal totals/ranks (`:344-396`). Not vacuous. |
| 4 | `index.ts` case + re-export; tsc green | YES | `lib/scoring/index.ts:58` `case 'bingo_bango_bongo'`; tsc green (no new errors) |
| 5 | `types.ts` has BBB types + union extensions + MODE_LABELS | YES | `types.ts:17` GameMode, `:37` MODE_LABELS, `:170` GameModeConfig `team_size:1`, `:1189` ModeResult, `:247` ScoringContext field |
| 6 | `gamePayload.ts` `validateBingoBangoBongo` (2–4) wired in parseGameMode + modeValidators | **NO** | `validateBingoBangoBongo` exists (`:1168`, 2–4 enforced `:1186-1193`) and is in `modeValidators` (`:1218`). **But `parseGameMode` (`:228-247`) lacks `raw === 'bingo_bango_bongo'`** → returns `null` → `parseGamePayload:1275` short-circuits with `errorPayload('mode_required')`. Validator is unreachable. See Issue 1. |
| 7 | `lib/bbb/` helpers + tests, lock-when-finished, mock admin client | YES | `getBingoBangoBongoHoles.ts` (unstable_cache, tag `game-${gameId}`, admin client, revalidate 900), `setBingoBangoBongoHole.ts:73` rejects `status==='finished'` with `game_finished`, `subscribeBingoBangoBongo.ts` via shared `subscribeRealtimeChannel` (centralizes setAuth). Tests present: `getBingoBangoBongoHoles.test.ts`, `setBingoBangoBongoHole.test.ts`. |
| 8 | `BingoBangoBongoEntry` rendered when mode matches, saves via action, realtime sync, Type C test | YES | `HoleClient.tsx:768` `{isBBB && <BingoBangoBongoEntry .../>}` — additive, placed after the ScoreCard `</div>` (stroke pad untouched), `disabled={gameInactive}`. Realtime via `subscribeBingoBangoBongo` (`:365`) with optimistic local merge (`:781-790`). Render test `BingoBangoBongoEntry.test.tsx` (18 assertions). |
| 9 | `BingoBangoBongoView` shows Bingo/Bango/Bongo/Sum; Podium shows 1/2/3 | YES | `BingoBangoBongoView.tsx:118` columns, sorted totalPoints DESC, `tabular-nums`; `BingoBangoBongoPodium.tsx` present. View render test (13 assertions). |
| 10 | `LeaderboardTabs` + `renderBingoBangoBongo` route correctly | YES | `leaderboard/page.tsx:431` dispatches to `renderBingoBangoBongo` (`:2250`); finished → Podium + View, active → View (`:2334-2368`); `LeaderboardTabs.tsx` present at `app/games/[id]/leaderboard/`. Reveal-mode: View hides totals when `scoreVisibility==='reveal' && gameStatus!=='finished'`, shows `bbb-reveal-hidden` waiting message (`BingoBangoBongoView.tsx:70,88,95`). |
| 11 | Norsk copy via humanizer | LIKELY | No mechanical AI-tells found in new BBB strings (no "vennligst", no em-dash chains, no "X-spillet" redundancy). "spillet"-matches are legitimate ("når spillet er avsluttet"). CHANGELOG tagline reads idiomatically. Cannot confirm the skill was literally invoked, but output is clean. |
| 12 | CHANGELOG + minor-bump 1.48.0 → 1.49.0 | YES | `package.json` version `1.49.0`; `CHANGELOG.md:24` `[1.49.0] - 2026-05-29` with three-layer entry + series-heading `## 1.49.y`. |

---

## Issues found (by severity)

### 1. BLOCKER — `parseGameMode` does not recognize `bingo_bango_bongo`
**File:** `lib/games/gamePayload.ts:230-245` (the `if (raw === ...)` chain in `parseGameMode`).

The chain whitelists 11 modes but omits `bingo_bango_bongo`. Flow: `parseGamePayload:1274` calls `parseGameMode`, gets `null` for a BBB payload, and line 1275 returns `errorPayload('mode_required')` — `validateBingoBangoBongo` (correctly wired into `modeValidators`) is never reached. Result: an admin cannot create or publish a Bingo Bango Bongo game; the wizard submit fails with "mode_required". This defeats the feature's entry path even though every downstream layer (scoring, UI, leaderboard) is correct.

The contract called this out explicitly (Design §4): "Wire i `parseGameMode` (`raw === 'bingo_bango_bongo'`) + `modeValidators`-mappen." Only the second half landed.

**Fix:** add `raw === 'bingo_bango_bongo' ||` to the whitelist in `parseGameMode`. Then add a `gamePayload.test.ts` case that drives a BBB payload through `parseGamePayload` at `publish` mode with 2 and with 5 players, asserting `ok` / `min`/`too_many` — this regression test is what would have caught the omission (there is currently zero `parseGamePayload` coverage for BBB).

### 2. MINOR — sort_order collision with modified_stableford
**File:** `supabase/migrations/0053_bingo_bango_bongo.sql:72` (and misleading comment at `:3`).

`bingo_bango_bongo` (kompis) and `modified_stableford` (kompis, `0052:33`) both have `sort_order=80`. No DB-level failure (no unique constraint), but their order in the wizard's kompis list becomes non-deterministic (falls back to secondary ordering, likely slug/created_at). The contract said "Bekreft neste ledige sort_order … Juster hvis kollisjon" — the builder's comment claims 80 is "neste ledige" but didn't account for 0052.

**Fix:** change to `sort_order = 90` (next genuinely free value under kompis) and correct the comment. Since the migration is not yet applied, edit the file in place rather than a follow-up migration.

### 3. NIT — `getGameWithPlayers` not extended; leaderboard fetches BBB-holes separately
The contract listed `getGameWithPlayers.ts` under "Files Likely Touched" to fill `bingoBangoBongoHoles`. The builder instead has `renderBingoBangoBongo` call `getBingoBangoBongoHoles(gameId)` directly (`page.tsx:2271`) and the hole-page wires it via HoleClient state. This is within the contract's stated discretion ("`getGameWithPlayers` eller leaderboard/hull-page fyller …") and is arguably cleaner (avoids fan-out on the shared cached helper). Not a defect — noted for completeness.

---

## What could not be verified in-environment

- **Migration apply / SQL-level criteria (Criterion 1 counts):** `0053` is intentionally NOT applied to the Supabase DB — applying it would seed the format row with `is_active=true` and expose a half-deployed format in the shared prod wizard before merge. Verified at the SQL level instead: table DDL, RLS predicates (read = flight membership; write = `is_admin() OR flight membership`, with matching `with check`), trigger reuse of `set_updated_at`, and seed shape all match the contract. The `select count(*) = 1` assertions will hold once applied. RLS is appropriately scoped (shared-scorecard model — any flight member reads+writes; not over-permissive since it gates on `game_players` membership, not over-strict since BBB is deliberately shared registration).
- **Live Playwright / iPhone-Safari UI check (hole-entry section, realtime sync, podium):** requires the deployed build + applied migration. Evaluated at code level: HoleClient integration is additive and correctly gated; realtime uses the proven shared channel helper; reveal-mode is handled in the View. Code-level confidence is high for rendering/routing; the create-game path is BLOCKED by Issue 1 and would fail a live golden-path test at the wizard-submit step.

---

## Summary

Scoring core is excellent — pure, stroke-independent, correct tiebreak cascade, 20 real tests. Migration, RLS, server helpers (with finished-lock), scorecard entry (additive), and leaderboard routing (with reveal-mode) are all correctly built and all five gates pass. The single blocker is the missing `parseGameMode` whitelist entry, which makes BBB games impossible to create from the wizard. Fix that one-liner + add a `parseGamePayload` regression test, fix the sort_order collision, and this is an ACCEPT.

---

## Re-evaluation (2026-05-29)

**Verdict: ACCEPT**

Independent, fresh-eyes re-verification of the builder's claimed fixes. Read the source directly and re-ran every gate — did not trust the claim.

### Issue 1 (BLOCKER) — `parseGameMode` whitelist: **RESOLVED**

- `lib/games/gamePayload.ts:243` now contains `raw === 'bingo_bango_bongo'` in the `parseGameMode` whitelist chain (lines 231–245). With the form field set to `'bingo_bango_bongo'`, `parseGameMode` returns the slug instead of `null`, so `buildGameInsertPayload` (`:1275–1276`) no longer short-circuits with `mode_required` and reaches `modeValidators['bingo_bango_bongo']` (`:1219`, `validateBingoBangoBongo`).
- **New regression test present:** `lib/games/gamePayload.test.ts:868–941` — a dedicated `describe('buildGameInsertPayload — bingo_bango_bongo (issue #277)')` block with 6 cases driving the real `buildGameInsertPayload`:
  - `:891` 3-player publish → asserts `errorCode` undefined, `game_mode === 'bingo_bango_bongo'` (`:894`), `mode_config === {kind:'bingo_bango_bongo', team_size:1}` (`:895–898`), and all players' team/flight null (`:899–903`).
  - `:906` 4-player publish → ok.
  - `:915` 1-player publish → `min_players_for_mode`.
  - `:920` 5-player publish → `too_many_players_for_mode`.
  - `:928` draft 0 players tolerated; `:934` duplicate rejected.
- **Would the test FAIL if the whitelist line were removed?** Yes. Reasoned through the real call path: removing `raw === 'bingo_bango_bongo'` makes `parseGameMode` return `null` → `buildGameInsertPayload:1276` returns `errorPayload('mode_required')`, which sets `game_mode:'best_ball'` and `errorCode:'mode_required'`. That breaks both `:893` (`errorCode toBeUndefined`) and `:894` (`game_mode toBe 'bingo_bango_bongo'`). The min/max bound tests (`:917`, `:925`) would also flip to `mode_required`. The test is a genuine guard, not vacuous.
- Gate: `npx vitest run lib/games/gamePayload` → 1 file, **147 passed**.

### Issue 2 (MINOR) — `sort_order` collision: **RESOLVED**

- `supabase/migrations/0053_bingo_bango_bongo.sql:74` seeds `format_intent_mapping` for `('bingo_bango_bongo', 'kompis', true, false, 90)` — `sort_order=90`, no longer 80.
- Comment corrected: header at `:3–5` now reads "Wolf=50, Nassau=60, Skins=70, Modifisert Stableford=80 … BBB … sort_order=90 — neste ledige verdi (80 er allerede tatt av modified_stableford i 0052)". The inline comment at `:71–72` matches.
- **No collision confirmed** against sibling kompis seeds (read directly): `0049_wolf.sql:97` = 50, `0050_nassau.sql` = 60, `0051_skins.sql` = 70, `0052_modified_stableford.sql:33` = 80. 90 is genuinely free.

### Gate results (full re-run)

| Gate | Result | Key output |
|------|--------|-----------|
| `npx tsc --noEmit` | PASS | Exactly 13 errors, all pre-existing & unrelated: `app/admin/games/[id]/signups/actions.test.ts`, `app/games/[id]/withdrawActions.test.ts`, `app/signup/[shortId]/{actions,teamActions}.test.ts` (TS2556/TS2493/TS2352 spread/tuple). Same set as the original eval; none touch BBB. |
| `npx vitest run` (full suite) | PASS | **166 files, 1937 tests passed** (was 1931 — +6 new BBB gamePayload tests). |
| `npm run build` | PASS | Exit 0, "Compiled successfully". Full route map rendered (`/opprett-spill`, `/games/[id]/leaderboard`, `/spillformer`). Exhaustive `Record<GameMode,…>` maps + switches satisfied — a missing BBB arm would fail the build, so this gate confirms BBB is registered everywhere it must be. |

### Regression sanity — no new problems, no missing sibling registration

Scanned the parse/normalize/dispatch paths parallel to `parseGameMode`:
- `lib/games/registration.ts:40` `gameModeSupportsTeams` — allowlist of `best_ball`/`texas_scramble` only; BBB (solo) correctly falls through to `false`. No change needed (and none made). This keeps the `team`/`both` registration-type guard (`gamePayload.ts:1290–1295`) correct for BBB.
- `lib/games/allowanceCopy.ts:45` — already has an explicit `case 'bingo_bango_bongo'`.
- `lib/scoring/index.ts:58` — `case 'bingo_bango_bongo'` present (from original build).
- The build's exhaustive `GameMode` maps/switches are the authoritative check for any other required registration site; build is green, so no exhaustive-map gap.

No new defect introduced by either fix.

### Conclusion

Both prior issues are genuinely fixed with the right shape: the whitelist one-liner is in place AND guarded by a real regression test that drives the actual payload builder (it would fail if the line regressed), and the `sort_order` is moved to a genuinely free value (90) with the comment corrected. All gates green. The NIT #3 (`getGameWithPlayers` not extended) remains within contract discretion — not a defect. **ACCEPT.**
