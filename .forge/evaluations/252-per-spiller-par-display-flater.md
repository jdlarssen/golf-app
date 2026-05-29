# Evaluation: #252 — Per-spiller-par på de tre gjenstående display-flatene

VERDICT: ACCEPT

Evaluated commit `d7c5f27` against contract `.forge/contracts/252-per-spiller-par-display-flater.md`.
Method: independent code-reading + gate execution. Playwright/visual verification was NOT
performed — see note at bottom.

## Success Criteria

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | Submit: row par uses `parForPlayer(parByGender, me.tee_gender)`, not `h.par_mens` | PASS | `submit/page.tsx:240` `par: parForPlayer(parByGender, meTeeGender)`; `parByGender` built at :241-243 from `par_mens/ladies/juniors`. `meTeeGender` threaded as prop at :166 from `me.tee_gender` (`me` found :104) into `ReviewBody` (:179). SQL select extended to fetch ladies/juniors at :193. |
| 2 | Submit: deviation asterisk (`data-testid="par-aside-marker"`) rendered in par column | PASS | `submit/page.tsx:299-302` renders `<ParAsideInline parByGender={r.parByGender} playerGender={meTeeGender}/>`; component at :366-382 returns `null` unless `hasParDifference`, emits `<sup data-testid="par-aside-marker">`. |
| 3 | Approve: par + scoreShape/scoreTone use OWNER's (`p.tee_gender`) par, not `h.par_mens` | PASS | `approve/page.tsx:284` `ownerPar = parForPlayer(parByGender, p.tee_gender)`; rendered at :296; `ScoreShape shape={scoreShape(s, ownerPar)} tone={scoreTone(s, ownerPar)}` at :305-306. Computed inside `holes.map(...)` which sits inside `pending.map(...)` per-card render (`return <Card key={p.user_id}>` :237-238), so `p` is the pending owner — NOT the viewer. Each card gets its own `p.tee_gender`. |
| 4 | Approve: asterisk rendered with `playerGender = p.tee_gender` | PASS | `approve/page.tsx:297-300` `<ParAsideInline parByGender={parByGender} playerGender={p.tee_gender}/>`; local `ParAsideInline` at :341-364, owner's gender excluded from tooltip via `formatOtherGendersPar`. |
| 5 | Leaderboard: BOTH scoreShape/scoreTone (~607) AND netto-vs-par badge (~586) use `pc.par`, not `row.par` | PASS | `leaderboard/holes/page.tsx:589` `nettoVsPar = pc.net - pc.par`; :610-611 `scoreShape(pc.gross, pc.par)` / `scoreTone(pc.gross, pc.par)`. Team summary line correctly UNCHANGED: `teamVsPar = row.teamNet - row.par` (:550) and the `P{row.par}` hole-header label (:564) still use team par — exactly as the contract requires (that's the team's line, not per-player). |
| 6 | No regression on courses without deviation (equal/absent parByGender → no asterisk, mens par) | PASS | `parDisplay.ts:65` `parForPlayer` returns `par[playerGender ?? 'mens']` — equal genders all return the same value (= mens par historically). `hasParDifference` (:25-31) returns `false` when all three equal → all three `ParAsideInline` early-return `null`. Behavior identical to prior `h.par_mens`/`row.par` on non-deviation holes. |

Per-criterion: 6 PASS / 0 FAIL.

## Correctness subtleties checked

- **Type safety:** `TeeGender = 'mens'|'ladies'|'juniors'` (`teeRating.ts:1`) is structurally identical to `ScoringGender` (`types.ts:133`), so passing `me.tee_gender`/`p.tee_gender` into the `ScoringGender`-typed `ParAsideInline` props and into `parForPlayer` is sound.
- **Approve per-card isolation:** verified the par mapping lives inside the inner `holes.map` nested within the outer `pending.map`; no shared `playerGender` across cards. Confirmed `p.tee_gender` (owner) is used, never the approver/viewer.
- **No leftover wrong-par usages:** grep across all three files — every remaining `par_mens` is a type field or the SQL select; every remaining `row.par` in leaderboard is the team line (`teamVsPar` + `P{row.par}` header), which is intentionally per-spec.
- **Helpers untouched:** `lib/games/parDisplay.ts`, `lib/scoring/`, `lib/leaderboard.ts` not modified — consistent with Out of Scope.

## Gates

| Gate | Result | Evidence |
|------|--------|----------|
| `tsc --noEmit` | PASS (for scope) | 13 errors total, ALL in pre-existing `*.test.ts` files (`signups/actions.test.ts`, `withdrawActions.test.ts`, `signup/.../actions.test.ts`, `teamActions.test.ts`) — TS2556/TS2352/TS2493 spread/tuple baseline noise. `grep` for the three touched `page.tsx` files returns ZERO errors. |
| `vitest run` | PASS | `Test Files 151 passed (151)` · `Tests 1765 passed (1765)`. Fully green. |
| `eslint` (3 touched files) | PASS | Exit code 0, no output. |

tsc snippet (representative pre-existing errors, none in touched files):
```
app/admin/games/[id]/signups/actions.test.ts(32,46): error TS2556: ...
app/games/[id]/withdrawActions.test.ts(33,46): error TS2556: ...
```

## Playwright / visual

NOT run. These are server components that fetch from Supabase and would require a live game
with a deviation-par course plus a female/junior player to exercise the deviation path. No such
fixture is readily available, and the contract (Gate 4) explicitly states Playwright is not
required for a pure par-reference fix; primary verification is code-reading + typecheck + suite.
Asterisk logic itself is already unit-tested via `HoleClient.test.tsx` (#240). UI logic was
verified by code-reading instead.

## Issues

None blocking. No out-of-scope nitpicks worth filing — the implementation mirrors the canonical
`scorecard/page.tsx` ParAsideInline pattern exactly, with per-file local components as the
contract permitted (Claude's Discretion). The two local `ParAsideInline` copies (submit + approve)
plus the inline asterisk in leaderboard are minor duplication, but lifting to a shared component
was explicitly left optional and would expand scope.
