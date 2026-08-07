# Evaluation: #1458 + #1506 — Early-decided matchplay team formats («Xup» → «X&Y»)

Evaluator: fresh-context forge evaluator, 2026-08-07.
Work under review: commits `2e236ef4` (refactor: extract shared mat-em helper) and
`65200e9b` (fix + repro tests), branch `claude/reverent-dirac-5cdc17`.
All evidence below produced by this evaluator's own command runs in the worktree.

## Verdict

**ACCEPT** — C1–C5 and all gates verified with evidence. C6 (staging) is explicitly
the main chat's responsibility and remains open; it does not block this verdict per
the evaluation instructions.

## Per-criterion findings

### C1 — core repro test (foursomesMatchplay.test.ts) — PASS

Test at `lib/scoring/modes/foursomesMatchplay.test.ts:610-649`. Fixture verified by
reading: side 1 (captain a1) wins holes 1–5 gross 3 v 5, holes 6–14 tied gross 4 v 4
→ after hole 14: played=14, up=5, remaining=4, 5>4 → clinch at hole 14. Holes 15–18
entered and won by side 2 (gross 5 v 3) → final aggregate holesUp = 5−4 = 1.
Assertions: `formatted === '5&4'`, `winner === 'side1'`, `decidedAtHole === 14`,
`remainingAtDecision === 4`, `marginUp === 5`, AND `holesUp === 1` +
`holesPlayed === 18` — the final-aggregate values differ from the clinch margin,
which proves freezing rather than final-aggregate formatting. `allowancePct: 0`,
CH 0 → pure gross fixture. Type A style: direct assertions on a computed result,
no mocks, no snapshots.

### C2 — reported mode (greensomeMatchplay.test.ts) — PASS

Test at `lib/scoring/modes/greensomeMatchplay.test.ts:400-433`, same scenario.
Verified the test imports `compute` from `./greensomeMatchplay` (test file line 2-6),
and `greensomeMatchplay.ts:71` delegates to `computeFoursomesCore` — so the repro
exercises the delegation path end-to-end, as the contract requires. Same six
assertions incl. `holesUp === 1` freezing proof.

### C3 — sibling walk (fourballMatchplay.test.ts) — PASS

Test at `lib/scoring/modes/fourballMatchplay.test.ts:646-689`. Same scenario shape
through fourball's own best-ball walk (four players; side best nets 3 v 5 / tied /
5 v 3). Same assertions incl. `holesUp === 1`, `holesPlayed === 18`.

### Failing-first verification — PASS

Checked out the pre-fix walk files (`git checkout 65200e9b~1 -- foursomesMatchplay.ts
fourballMatchplay.ts`; 65200e9b~1 = 2e236ef4, so the helper existed but the walks
were unwired) and ran the three test files:

```
FAIL foursomesMatchplay.test.ts > … «5&4» selv om side 2 vinner hull 15-18 …
AssertionError: expected '1up' to be '5&4'   (foursomesMatchplay.test.ts:643)
FAIL greensomeMatchplay.test.ts > … AssertionError: expected '1up' to be '5&4'  (:427)
FAIL fourballMatchplay.test.ts  > … (third failure)
Test Files  3 failed (3) · Tests  3 failed | 65 passed (68)
```

Exactly the three new tests fail, with the exact bug symptom ('1up' where '5&4' is
correct); all 65 pre-existing tests in those files pass. Restored with
`git checkout HEAD -- …`; `git status --short` empty afterwards (verified).

### C4 — full suite, no regressions — PASS

```
npx vitest run lib/scoring
Test Files  45 passed (45)
Tests  1127 passed (1127)
```

1127 = 1124 on main + 3 repro tests, matching the contract's evidence note.
Named guard suites confirmed present (and green, since the whole suite passed):

- **#800 singles suite** — `singlesMatchplay.test.ts:423`
  `describe('compute — lukk-ute-form når alle 18 hull er spilt men matchen var avgjort tidligere (#800)')`
  with «10&8» (:424), «5&4» via compute() (:451), «3&1» (:485).
- **Last-hole «X&0»/«1up» guards** —
  `singlesMatchplay.test.ts:560` «2up» som sluttresultat etter 9 hull — avgjort på
  siste hull, ikke tidligere (regresjon: ikke «2&0»);
  `foursomesMatchplay.test.ts:483` and the fourball twin (~:495) «2up»/decided-on-
  last-hole; `fourballMatchplay.test.ts:133` 1up etter 18.

### C5 — one home for the mat-em snapshot — PASS

```
grep -n "detectMatEm" lib/scoring/modes/*.ts | grep -v test
singlesMatchplay.ts:152   → export function detectMatEm(   (the ONE definition)
singlesMatchplay.ts:366   → call site (singles walk)
foursomesMatchplay.ts:261 → call site (computeFoursomesCore walk)
fourballMatchplay.ts:213  → call site (fourball walk)
```

One exported definition, three call sites, all three walks finish with the identical
`matEm ?? computeMatchResult(holesUp, holesPlayed, holesRemaining, totalHoles)`
pattern (singles :401-402, foursomes :288-289, fourball :243-244). A repo-wide sweep
for the mat-em condition (`absUp > holesRemaining` variants) in `lib/scoring/`
found no per-hole snapshot logic anywhere outside the helper. Note:
`computeMatchResult` (singlesMatchplay.ts:98-107) retains its aggregate-level mat-em
branch — that is not an inline copy of the snapshot logic; it is the fallback the
contract's design step 2 explicitly prescribes (`matEm ?? computeMatchResult(...)`)
and it serves callers whose score entry stops at the clinch hole.

### Edge cases (verified by reading `detectMatEm`, singlesMatchplay.ts:152-169)

- **Last-hole clinch → null:** `if (holesPlayed >= totalHoles) return null;` — the
  last hole in scope can never register as mat-em, so «Nup»/«AS» stands and «N&0»
  is impossible. Existing F1 guard tests (named under C4) stay green.
- **Tie/AS unaffected:** at AS, `absUp === 0 <= remaining` → null on every hole;
  final result comes from `computeMatchResult`'s AS branch.
- **One-side-only gross:** `classifyMatchplayHole` returns `'unplayed'` for null
  nets in all three walks; unplayed holes increment neither wins nor `holesPlayed`,
  and `detectMatEm` is fed the same `holesPlayed` — consistent semantics.
- **9-hole segment scope:** scope-relative via the `totalHoles` parameter, passed
  from each walk's segment-aware value. Coverage found: 9-hole clinch «5&4» tests
  exist in all of singles (:590, plus back9 mat-em :641), foursomes (:505) and
  fourball (:514) — but in all of them score entry STOPS at the clinch hole, so
  they exercise the `computeMatchResult` aggregate path, not the freeze. No test
  combines 9-hole scope + holes entered after the clinch (the freeze path in a
  9-hole segment). The contract does not require one (its edge-case list only
  demands scope-relative math, which is parameterized and jointly covered), so
  this is an observation, not a finding that blocks acceptance.

### Gates — PASS

- `npx tsc --noEmit` → clean (exit 0, no output).
- `npm run lint` → 0 errors, 58 warnings; none of the warnings are in the changed
  files (all pre-existing, e.g. `lib/wizard/fitsPlayerCount.ts`, mail recipients).
- Version bump: `package.json` 1.227.1 → 1.227.2 (patch, correct for `fix`) +
  one Feilrettinger line in `CHANGELOG.md` under August 2026 referencing #1458.
- Scope: `git diff --name-only origin/main...HEAD` →
  `.forge/contracts/…`, `CHANGELOG.md`, `package.json`, `package-lock.json`,
  `fourballMatchplay.{ts,test.ts}`, `foursomesMatchplay.{ts,test.ts}`,
  `greensomeMatchplay.test.ts`, `singlesMatchplay.ts` — every file is on the
  contract's "Files Likely Touched" list plus the allowed contract/CHANGELOG/package
  files. No out-of-scope edits.

### C6 — staging verification — PENDING (not evaluated)

Explicitly the main chat's responsibility: seeded early-decided greensome cup match
on torny-staging showing «5&4 til <lag>» + `staging-verified` label before merge.
Open at evaluation time; does not affect this verdict per instructions.

## Issues found

None blocking. One observation (no action required by the contract):

- `lib/scoring/modes/foursomesMatchplay.test.ts` + criterion "edge cases/9-hole
  scope": no test combines a 9-hole segment with holes entered after the clinch
  (freeze path in segment scope). Covered indirectly by parameterization
  (`totalHoles`) + the 18-scope freeze tests + 9-scope clinch tests. Worth a
  follow-up test only if segment matchplay changes again; filing an issue is left
  to the main chat's discretion.
