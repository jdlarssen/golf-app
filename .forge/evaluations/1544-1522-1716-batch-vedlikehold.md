# Evaluation: 1544-1522-1716-batch-vedlikehold

**Verdict: ACCEPT**

Independent, fresh-context verification of `7c85b73c` / `7ccfd12b` / `44f96ebb`
against base `a7a7f5a0`. Every gate was re-run here (not trusted from the
contract), and every number the contract claims reproduced exactly. I found no
MUST-FIX items: no behavior change, no contract violation, no scope leak, no
test tampering. Four NITs / observations are recorded below, none blocking.

Scope of this eval: S1–S5. S6 (PR CI) and S7 (issue closures) were out of scope
and are NOT assessed here. No staging was driven and no dev server was started.

---

## Gate outputs (verbatim summaries, exit codes captured, not piped away)

| Gate | Result | Exit |
|---|---|---|
| `npx vitest run lib/async lib/notifications lib/cup "app/[locale]/games/[id]/holes"` | `Test Files 57 passed (57)` / `Tests 866 passed (866)` | **0** |
| `npx tsc --noEmit` | no output | **0** |
| `npx eslint lib/cup/ lib/async "app/[locale]/games/[id]/holes/[holeNumber]/" lib/notifications/events.ts` | `✖ 1 problem (0 errors, 1 warning)` — only `createTournamentDraft` 30 | **0** |
| `npm run build` | 124 route leaves; `BUILD_EXIT=0` | **0** |
| `npx vitest run` (full) | `Test Files 510 passed (510)` / `Tests 6820 passed (6820)` | **0** |

False-green trap checked explicitly: exit codes captured via `$?` into a log
file (never through a pipe), and `grep -ic unhandled` over the full-suite log
returned **0**. The single build warning is the pre-existing Next.js
"inferred your workspace root" lockfile notice — unrelated to this work.

Sub-counts confirming the contract's arithmetic:

- `lib/async` → 13 tests (matches S1's "13/13")
- `lib/cup` → 36 files / 617 tests; the 5 new helper test files → 89 tests.
  617 − 89 = **528**, exactly the "528 pre-existing" figure in `7ccfd12b`'s body.
- `app/[locale]/games/[id]/holes` → 6 files / **93 tests** (matches S4)

Exact complexity numbers, obtained by re-running eslint with a lowered
threshold (`--rule '{"complexity":["warn",N]}'`) rather than inferring from the
absence of a warning:

```
21  getCupSnapshot        (lib/cup/getCupSnapshot.ts)     was 66
20  HolePage              (holes/[holeNumber]/page.tsx)   was 114
 6  HoleClient            (holes/[holeNumber]/HoleClient)  was 123
20  teamHandicapFor       (holePagePlayers.ts, NEW)       — dir max
 7  largest NEW lib/cup + lib/async helper
```

Everything else above 19 in the linted set is **pre-existing and in a file this
branch never touches**: `createTournamentDraft` 30 (`lib/cup/actions.ts`, the
contract's sanctioned exception) and `saveCupPlan` 25 (`lib/cup/planActions.ts`,
not in the diff at all). `finishTournament` sits at 21 in a touched file, but
the fan-out edit added and removed no branches (a `.map()` method call is not a
decision point; the `(r) => …` arrow survives in both versions), so its score is
unchanged from baseline.

---

## Per criterion

### S1 (#1544) — helper + edge-table tests — **CONFIRMED**

`lib/async/allSettledInBatches.ts` exists with the contracted signature
(`items`, `fn`, `batchSize = 20`). 13/13 tests green, exit 0.

Helper read line-by-line against the contract's edge table — all seven rows are
present as real tests, and the implementation matches:

- sequential batches: `for (let start = 0; …; start += size)` with `await` per
  batch. The tests prove it observably via an in-flight counter
  (`tracker.maxInFlight`), not by inspection.
- order preserved: `results.push(...settled)` across batches; locked by the
  "preserves result order even when later items settle first" test (delays
  30/20/10/0 with batchSize 4).
- index alignment: locked by the rejection test asserting the exact 4-element
  array with `{status:'rejected', reason: boom}` at index 1.
- rejection containment across batches: `seen` proves batch 2 ran.
- clamp: `Number.isFinite(batchSize) ? Math.max(1, Math.floor(batchSize)) : 1`,
  covered by an `it.each` over 0 / −1 / 0.5 / NaN plus a separate floor test.
- default 20: proven with 41 items → `maxInFlight === 20`.

### S2 (#1544) — four fan-outs converted, error handling unchanged — **CONFIRMED**

I diffed the repo-wide `Promise.allSettled` call-site set between `a7a7f5a0` and
`44f96ebb` rather than trusting a grep of two files. Exactly four sites
disappeared — `lib/cup/actions.ts:278`, `:447` and `lib/notifications/events.ts:216`,
`:256` — and nothing else changed except a +1 line shift from the new import.

Surviving sites are all correctly out of scope:

- `events.ts:50/133/181` — gameFinished / gameStarted / gameReopened, bodies untouched.
- `actions.ts:879` — `swapCupMatchPlayer`, a fixed 2-element literal array.

Error handling verified unchanged at both mail sites: the
`for (const r of results) { if (r.status === 'rejected') console.error(…) }`
loops and the enclosing `try/catch` are byte-identical.

Result-to-recipient index alignment holds, and is in fact doubly safe at the two
`events.ts` sites: those fulfilled values carry `{ userId, sendMail }`, so the
`sendMailByUserId` Map is built from the value, not the position.

One deliberate, strictly-safer behavior difference worth naming: the helper
wraps each call as `async (item) => fn(item)`, so a *synchronous* throw from
`fn` becomes one rejected result instead of aborting the whole `.map()`. This is
what the contract asks for ("aldri throw — dette er best-effort-stier").

### S3 (#1522) — decomposition, signature stable, no test edits — **CONFIRMED**

`npx eslint lib/cup/` clean apart from the sanctioned `createTournamentDraft`.
`getCupSnapshot` 66 → **21** (measured, not inferred). Largest new helper: 7.

Exported surface preserved: `CupRoster`, `CupRosterPlayer` and
`CupSideAwardSnapshot` moved to the new modules and are re-exported from
`getCupSnapshot.ts` (`export type { … }`), so every existing import path still
resolves. The `CupSnapshot` type body and the
`getCupSnapshot(tournamentId, unknownLabel): Promise<CupSnapshot | null>`
signature are byte-identical to baseline. All ~40 external consumers are
untouched; `tsc` exit 0 is the mechanical proof.

`git diff a7a7f5a0..44f96ebb --stat -- 'lib/cup/*.test.ts'` lists **only the five
new files** (all `A` in `--name-status`); zero pre-existing test files modified,
repo-wide, and no `.snap` file appears in the diff at all.

Four moved blocks checked line-by-line (two required, I did four):

1. **Reveal-gating** → `cupMatchDisplayResult.ts:64`. The predicate is
   character-for-character the baseline's
   `score_visibility === 'reveal' && status !== 'finished'` → `null`, and the
   `best_ball` vs. `computeCupMatchResult` dispatch above it passes the same
   arguments (including the `holes.map(h => ({number, strokeIndex}))` narrowing
   for best-ball). Both versions compute the result before discarding it, so
   even evaluation order is preserved.
2. **Side-award slot/gir unfolding** → `cupSideAwardSnapshot.ts`. Identical
   slot key `${kind}#${hole_number}#${points}`, identical gir skip in the
   counting pass, identical `?? 0` count loops, identical
   `gir_max_per_team ?? 1`, raw `team1Count`/`team2Count`, identical
   `row.kind === 'ld' ? 'ld' : 'ctp'` normalization, identical
   `no_winner ?? false`. Push order within and across both output arrays is
   unchanged.
3. **`matchGameMode` ternary chain** → `cupMatchGameMode.ts`. Same seven modes,
   same `'singles_matchplay'` fallback. The rewrite is *safer* than the
   original: a `Map` instead of an object literal, so a DB value of `'toString'`
   falls through to the fallback rather than returning `Object.prototype`'s
   method. A `satisfies Record<CupMatchGameMode, …>` binds the table to the
   union so a future mode fails compilation instead of silently mapping to
   singles.
4. **Roster construction** → `cupRoster.ts`. Baseline built `team1Map`/`team2Map`
   inside the game loop; HEAD builds it in a separate pass *before* the loop via
   `buildCupRoster(games.map(g => playersByGame.get(g.id) ?? []))`. Same iteration
   order (games in `created_at asc`, rows in Supabase order), same first-wins
   dedupe. The side-award team lookup switched from `team1Map.has(id)` to
   `new Set(roster.team1.map(p => p.userId))` — the same id set, since the map's
   keys are exactly those `userId`s. Roster completeness at the point of use is
   preserved in both.

I also checked `cupMatchEntry.ts`: the `#1508` performance-input filter keeps
both conditions (`source_game_id == null` **and** `PERSONALLY_SCORED_…includes`),
segment resolution is the same `holesForSegment(courseHoles, hole_segment ?? 'full')`,
and every `CupMatchInput` field is carried over unchanged.

### S4 (#1716) — decomposition, no behavior change — **CONFIRMED**

`npx eslint "app/[locale]/games/[id]/holes/[holeNumber]/"` is completely clean.
HoleClient 123 → **6**, HolePage 114 → **20**, directory max **20**
(`teamHandicapFor`, new, ≤ 25). 93/93 co-located tests green, all unmodified.

- **`data-testid` set:** I extracted the sorted multiset from every file in the
  directory at `a7a7f5a0` and at HEAD and diffed them — **identical, 11
  occurrences**. Same method for `<input>` / `<form>` / `<button>` / `name="…"`
  → identical.
- **`type="hidden"` inputs:** zero in both revisions (see NIT-3 — the guardrail
  is vacuous in this directory, which I verified rather than assumed).
- **`'use client'` boundaries:** enumerated every file's first line. All four new
  hook modules that touch Dexie (`holeLiveQueries`, `holeScreenState`,
  `useWolfHole`, `useBingoBangoBongoHoles`, `useHoleModeContextLine`) and all
  new subcomponents (`HoleBottomCta`, `HoleNotices`, `HoleScoreList`,
  `PuttsTogglePill`) carry `'use client'`. The new pure/server modules
  (`holePageData`, `holePagePlayers`, `holePageScoring`, `holeSegmentBridges`,
  `holeCards`, `holeClientProps`, `HoleTopBanners`) do not.
- **No client symbol imported as a value into server code.** I scanned every
  non-client module for imports of every client module. The only hits are
  (a) `holeCards.ts:9` `import type { HoleCard } from './holeLiveQueries'` —
  type-only, erased at compile; and (b) server components *rendering* client
  components (`page.tsx` → `HoleClient`, `HoleTopBanners` →
  `Foursomes/PatsomeTeeStarterBanner`), which is the correct RSC direction.
  `npm run build` exit 0 is the mechanical confirmation.
- **`page.tsx` is still a server component:** `export default async function
  HolePage`, no `'use client'`, and no route-segment export was added or removed
  (importantly, no `runtime` export — which `cacheComponents` forbids). The build
  route table still shows `◐ /[locale]/games/[id]/holes/[holeNumber]`, i.e. the
  hole route remains Partial Prerender, and the total is still 124 route leaves.

Two moved blocks checked line-by-line:

1. **Sibling-scores `useLiveQuery` union** (`holeLiveQueries.ts:114`
   `useSiblingScoredHoles`). The `siblingOwnerIds` memo, the `[gameId+userId]`
   `anyOf` compound-index query, the `strokes != null` filter and the
   `[siblingGameId, siblingOwnerKey]` dep array are byte-identical to baseline
   `HoleClient.tsx:537`. The union `new Set([...scoredHoles, ...scoredHoleNumbers(…)])`
   and the `null`-when-no-data rule are preserved; the ternary became an early
   return, but the `useLiveQuery` call sits **above** it, so the hook stays
   unconditional.
   Critically, `HoleClient.test.tsx` mocks `useLiveQuery` **positionally** ("called
   FOUR times per HoleClient render") and was not modified — so the fact that it
   still passes is a hard lock on call order. I confirmed the order independently:
   `useHoleCards`(236) → `useMyScoredHoles`(237) → `useSiblingScoredHoles`(244) →
   `usePendingSyncCount`(248), matching baseline 472 → 496 → 537 → 566, with no
   conditional or early return in between.
2. **The banner JSX branch** (`HoleTopBanners.tsx`). The foursomes slot was
   restructured from `if/else-if` to guard-clauses; I built the truth table over
   {partners.length === 2, teeStarterCol == null, holeNumber === 1} and all four
   reachable cases produce the identical node (StarterBanner only on hole 1 with
   no starter chosen; Hint on any hole once chosen; null otherwise). The patsome
   slot keeps the same `team_number != null && holeNumber >= 13 && team.length === 2`
   gate. Render order and the `px-3` wrappers are unchanged:
   `patsomeSegment → patsomeTee → foursomesTee → chapmanPhase`. Call-site props
   match baseline sources exactly (`patsomeTeeStarterRes.data?.tee_starter_user_id ?? null`,
   `tEntry('playerFallback')`).

I also verified the moved green-pin block (`resolveGreenPinState`): the
error / no-data / data branches produce the same `{greenCenter, freshPinCount}`
as baseline's `let`-mutation form, including the `PIN_GATE_MAX_PINS` default.

### S5 (all) — tsc, build, full vitest — **CONFIRMED**

All three re-run here with exit codes captured: `tsc` 0, `npm run build` 0
(124 routes, hole route still PPR), full `vitest` 0 with 510 files / 6820 tests
and zero unhandled errors.

---

## Findings

Ordered by severity. **No MUST-FIX items.**

### NIT-1 · `lib/async/allSettledInBatches.test.ts` + `.ts` · S1
The JSDoc and the `async (item) => fn(item)` wrapper both claim containment of a
*synchronous* throw from `fn`, but no test exercises it — all 13 tests pass
`async` functions, which reject rather than throw synchronously. The behavior is
correct as written; the claim is simply not test-locked. Not a contract
violation: the contract's edge table does not list a sync-throw row.
*Suggested (optional):* one test passing `((n) => { throw new Error('x') }) as unknown as (n: number) => Promise<never>`.

### NIT-2 · `lib/async/allSettledInBatches.ts` · S1
`results.push(...settled)` spreads a batch into the accumulator. Safe at the
default batch size of 20 and at both call sites, but a caller passing a very
large `batchSize` could hit the engine's argument-count limit. Purely
theoretical today. A `for (const r of settled) results.push(r)` would remove the
ceiling entirely.

### NIT-3 · `app/[locale]/games/[id]/holes/[holeNumber]/` · S4 (observation)
The contract's #1011 guardrail ("always-mounted hidden inputs MUST stay
always-mounted") is **vacuous in this directory**: it contains zero `<form>`,
zero `<input>` and zero `type="hidden"` occurrences at both `a7a7f5a0` and HEAD.
Score entry goes through Dexie `writeScore`, not FormData. Recording this so a
future reader does not mistake "verified" for "exercised" — there was no live
constraint to preserve here.

### NIT-4 · `app/[locale]/games/[id]/holes/[holeNumber]/holePageData.ts` · S4 (observation)
The diff **removes** an `// eslint-disable-next-line react-hooks/purity`. This is
the opposite of the failure mode the criterion guards against (no disable was
*added* to dodge complexity anywhere in the diff). The removal is legitimate:
`react-hooks/purity` only fires inside a component, and the `Date.now()` snapshot
now lives in the plain module function `resolveGreenPinState`. eslint is clean
without it and the computed `windowCutoffMs`/`freshPinCount` behavior is
unchanged. Flagged only because a silently-vanishing lint suppression is worth a
reviewer's eye.

---

## Scope check

`git diff a7a7f5a0..44f96ebb --name-status` → 34 files: **29 added, 5 modified.**
Every one traces to the contract's "Files Likely Touched", plus the contract file
itself (`.forge/contracts/1544-1522-1716-batch-vedlikehold.md`, added in
`617eadea`). The five modified files are exactly the five the contract names:
`HoleClient.tsx`, `page.tsx`, `lib/cup/actions.ts`, `lib/cup/getCupSnapshot.ts`,
`lib/notifications/events.ts`. All new files land in the directories the contract
sanctions (`lib/async/`, `lib/cup/`, the hole directory). **No scope leak.**

The contract's "no `.sql`, `supabase/`, RLS or mail-template change" guardrail is
mechanically confirmed — none appear in the diff. `lib/cup/planActions.ts` (home
of the pre-existing complexity-25 `saveCupPlan`) is likewise untouched.

Commit discipline holds: every commit carries `Refs #N` in its body, the one
`fix` carries `[no-changelog]`, and no `.changes/` note appears — correct, since
#1544 is explicitly not user-observable and #1522/#1716 are `refactor`.

## Test-quality check

The 89 new `lib/cup` tests and 13 new `lib/async` tests are genuine behavior
locks, not tautologies. Zero `toMatchSnapshot` / `toMatchInlineSnapshot` in the
new files (no snapshot-refresh abuse; no `.snap` file in the diff), and zero
bare `toBeDefined()` / `toBeTruthy()` / `not.toThrow()` assertions. Sampled
bodies assert concrete values — e.g. the reveal gate is an `it.each` over the
full {reveal,live} × {draft,active,finished} grid asserting `winnerSide` or
`toBeNull()`; the GIR unfolding asserts exact per-team entry counts for
null/null, 0/0, 2/1 and null/2; the gir snapshot uses a whole-object `toEqual`.
Edge cases target the real risks (derived-match double counting, prototype
pollution via `'toString'`, pre-0157 rows missing `no_winner`, segment
defaulting). The one structurally identity-shaped test
(`toCupMatchGameMode(mode) === mode`) earns its place through the fallback and
prototype-pollution rows beside it.
