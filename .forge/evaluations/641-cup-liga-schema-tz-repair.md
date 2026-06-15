# Evaluation: Cup + Liga skjema-/tidssone-reparasjon (#641 #642 #647 #648)

**VERDICT: ACCEPT**

Evaluator: skeptical independent re-derivation. Date: 2026-06-15.
Branch: `claude/bold-wilson-8b330f` vs `origin/main`.
Commits under review: `40988df` (#642), `002e75a` (#641), `ea78d8e` (#647), `b9223b1` (#648), `49fbfbc` (docs).

---

## Gate results (re-run fresh by evaluator)

| Gate | Command | Result |
|------|---------|--------|
| TypeScript | `npx tsc --noEmit` | **exit 0** |
| Vitest (6 affected files) | `npx vitest run lib/cup/getCupSnapshot.test.ts "app/[locale]/admin/cup/[id]/generer/actions.test.ts" lib/league/actions.test.ts lib/league/getLigaSnapshot.test.ts lib/games/gamePayload.test.ts lib/i18n/format.test.ts` | **6 files passed, 380/380 tests passed** |
| ESLint (7 changed source files) | `npx eslint <7 files>` | **exit 0, zero output** |

The 7 changed source files: `app/[locale]/admin/cup/[id]/generer/actions.ts`, `lib/cup/getCupSnapshot.ts`, `lib/league/getLigaSnapshot.ts`, `lib/league/actions.ts`, `lib/games/gamePayload.ts`, `lib/i18n/format.ts`, `app/[locale]/admin/liga/[id]/LigaRoundRow.tsx`.

---

## Schema truth (Supabase MCP, project `glofubopddkjhymcbaph`, read-only)

- `public.course_holes` columns: `course_id, hole_number, stroke_index, par_mens, par_ladies, par_juniors` — **NO `par`** ✓ (matches contract claim).
- `public.game_players` columns include `team_number, flight_number, accepted_at`; **NO `status`** ✓.
- Constraint `game_players_team_flight_consistency` def: `CHECK (((team_number IS NULL) OR (flight_number IS NOT NULL)))` ✓ (exactly as contract states).
- Insert-shape validation against the predicate: `cup_shape_ok=true` (team=1, flight=1 → second disjunct true), `liga_shape_ok=true` (team=null → first disjunct true). Both pass.
- The exact corrected select `course_id, hole_number, par_mens, par_ladies, par_juniors, stroke_index` ran against a real `course_id` (`f585ce0e-…`) and returned rows with no 42703.

---

## Per-criterion table

| # | Verdict | Evidence gathered by evaluator |
|---|---------|--------------------------------|
| **K1** (#641 cup insert shape) | **PASS** | `generer/actions.ts:203-220`: `acceptedAt = new Date().toISOString()`; rows have `team_number` 1/2, `flight_number: 1`, `accepted_at`, NO `status`. Test `actions.test.ts:281-299` asserts `every(r => !('status' in r))`, `flight_number===1`, `accepted_at` is string, length 4. Real regression guard (fails if `status` reintroduced). |
| **K2** (#641 constraint) | **PASS** | MCP: constraint def confirmed; `(team=1,flight=1)` → `cup_shape_ok=true`. |
| **K3** (#642 cup par-select) | **PASS** | `getCupSnapshot.ts:170` selects per-gender cols; `:192` maps `par: row.par_mens`. Test `getCupSnapshot.test.ts:86-90` asserts cols contain `par_mens/ladies/juniors` AND `not.toMatch(/(^|[\s,])par($|[\s,])/)` — catches a standalone `par` token. MCP: corrected select resolves. |
| **K4** (#647 Bug1+2 liga insert) | **PASS** | `lib/league/actions.ts:633-647`: `team_number: null`, NO `status`, `accepted_at: acceptedAtForActor(...)`. Test `actions.test.ts:84-91` asserts no-`status`, `team_number===null`, actor confirmed / co-player null. Real guard. |
| **K5** (#647 Bug3 liga par-select) | **PASS** | `getLigaSnapshot.ts:183` per-gender select; `:243` maps `par: h.par_mens`. Test `getLigaSnapshot.test.ts:104-108` same positive+negative assertions as K3. |
| **K6** (#648 storage conversion) | **PASS** | All three writers convert via `parseOsloDateTimeLocal`: `updateLeagueRound:236-238`, `addLeagueRound:268-269`, `overrideRoundWindow:316,320`. Empty/omitted values are guarded (`if (opensAt)` / `if (opensAtRaw)`). `gamePayload.test.ts:14-62` proves summer (+02:00) and winter (+01:00) conversion + round-trip + ambiguous fall-back hour. |
| **K7** (#648 display Oslo) | **PASS** | `LigaRoundRow.tsx:27-36`: `toDatetimeLocal` → `formatOsloDateTimeLocal`; `formatWindowDate` → `formatShortOsloDayMonthLocale` + `formatTeeOffTimeLocale`. No `getUTCHours`/`getUTC*` leak remains in the file. `format.test.ts:412-424` proves Oslo rollover (`22:30Z May 12 → '13. mai'`) — would fail under UTC getters. |
| **K8** (gating consequence) | **PASS (by reasoning)** | `startLeagueRoundFlight:572` compares `now` to `new Date(round.opens_at).getTime()`; unchanged. Once storage is a real UTC instant, the gate flips at the correct local time. Sound. |
| **K9** (regression coverage) | **PASS** | 6 affected test files = 380 tests green (re-run). |
| **K10** (gates) | **PASS** | tsc exit 0; vitest 380/380; eslint exit 0 (all re-run by evaluator). |
| **K11** (discipline) | **PASS (code/changelog part)** | `package.json` 1.129.7 → 1.129.11 (verified via `git diff`). CHANGELOG has entries referencing #641, #642, #647, #648. No new `##` version heading — consistent with the "patch nests under open theme" convention. Closing comments at merge are out of evaluator scope. |

---

## Landmine / scope sweep (independent grep, whole repo)

**`status` into game_players** — Inspected every production `from('game_players').insert(`/`.upsert(` body. Only the two formerly-buggy sites touched `status`, both now clean. All other `status: 'active'` occurrences in prod code are `.update(...)` on the **`games`** table (which legitimately has a `status` column): `admin/games/[id]/actions.ts:254,691`, `lib/cup/actions.ts:285`, `lib/league/actions.ts:485`, `lib/games/startScheduledGame.ts:192`. The rest are test fixtures / CHANGELOG / docs. **No unfixed landmine.**

**`course_holes.par` selects** — Inspected the `.select(...)` column list of every production `from('course_holes')` query (23 sites across `app/` + `lib/`, incl. `leaderboard/holes/page.tsx` ×11, `gameFinishedRecipients.ts` ×4, `buildModeResultForGame.ts`, scorecard/submit/approve/statistikk). **Every one** requests `par_mens, par_ladies, par_juniors` — none select a bare `par`. The two fixed sites now match. **No unfixed landmine.**

**Par-mapping defensibility** — Confirmed the working scoring path `lib/scoring/buildModeResultForGame.ts:88` selects per-gender cols and `:285` maps `par: h.par_mens`. The cup/liga snapshots now mirror this exactly. Decision 3 holds.

**`generateRounds` seeding path (contract's flagged risk)** — Read `lib/league/generateRounds.ts`. It derives timestamps from date-only season inputs parsed at `T00:00:00.000Z` / `T23:59:59.999Z` and emits `.toISOString()`. These are genuine UTC instants, NOT `YYYY-MM-DDTHH:mm` Oslo wall-clock strings — running them through `parseOsloDateTimeLocal` would be a type/semantic error. They are day-level open/close *window boundaries*, not admin-picked tee-off times shown back to the user. Leaving `createLeague`'s seed insert (`actions.ts:175-177`) unconverted is **correct**, and the manual writers (which DO receive datetime-local input) are the only ones that need conversion. Contract reasoning verified.

---

## Gaps / risks the owner should know

1. **No live end-to-end prod verification.** All four bugs were originally caught only by live QA against prod (match-gen creating 0 players, 500s on detail pages, 2h offset). This evaluation proves the schema/constraint/select/timezone fixes are correct at the unit + schema level, but the actual prod round-trip (generate cup matches → players appear → leaderboard renders; start liga flight → play → season table renders; pick a window at 06:00 → it opens at 06:00 local) is **unverified locally** and requires prod auth + data. Recommend a focused live re-run of the same QA-sweep paths after deploy. This is acknowledged as out-of-scope in the contract ("Full Playwright e2e … Dekkes av … live prod-verifikasjon").

2. **Cup match-gen format coverage unchanged.** The cup generator still only offers Singel/Four-ball/Foursomes (noted on #634). This repair fixes the *insert*, not the format menu — downstream cup lifecycle (scoring → standings → avgjort) past the player-insert remains unverified per the QA notes. Out of scope here but worth a follow-up live check.

3. **No backfill** for any liga rounds already stored with the old naive-UTC offset (contract decision: QA data is disposable). If any real liga rounds were created before this fix, their windows are still 1-2h off; they would need manual edit (which now stores correctly). Acceptable given liga never worked end-to-end.

4. **Ambiguous DST fall-back hour** (autumn 02:00-03:00) resolves to post-transition +01:00 by design (tested). Vanishingly rare for round windows; documented, not a defect.

No correctness gaps found in the code under review. All gates green, schema verified, both bug-pattern landmines confirmed swept repo-wide, tests are genuine regression guards (positive + negative assertions, DST-correct instants), and the one flagged seeding edge case is correctly left unconverted.
