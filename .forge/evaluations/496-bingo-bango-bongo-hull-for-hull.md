# Evaluation: Bingo Bango Bongo — format-bevisst «Hull for hull» + duell ved 2 (PR 6 av epic #496)

**Verdict: ACCEPT**

Date: 2026-06-08. Branch: `claude/jolly-faraday-a18871`. Baseline: `c7d7d00` (Acey-Deucey ACCEPT) → HEAD `437820a`.

All seven success criteria are met, all gates pass, and independent code reading confirms the contract's self-reported evidence. No bugs, gaps, or deviations found.

---

## Per-criterion findings

### 1. Shared context, no duplication ✓
- `lib/scoring/context/buildBingoBangoBongoContext.ts` exists (new, 98 LOC). Sets `game_mode: 'bingo_bango_bongo'`, `teamNumber: null` (solo), passes `scores` through for shape-consistency, injects `bingoBangoBongoHoles`. Solo narrowing via `teamNumber: null` per `buildBingoBangoBongoContext.ts:76`.
- Used by `renderBingoBangoBongo` (`leaderboard/page.tsx`) — the old ~40-line inline ctx-map is **deleted** and replaced by a single `buildBingoBangoBongoContext({...})` call (diff shows the inline `const ctx = {...}` block removed, `leaderboard/page.tsx:2603–2615`).
- Used by `BingoBangoBongoHolesBody` (`holes/page.tsx:585`) — same builder, same args shape.
- Injection is live, not dead: `bingoBangoBongo.ts:52` reads `ctx.bingoBangoBongoHoles ?? []`.

### 2. Achievement-first per-hole view ✓
- `BingoBangoBongoHolesView.tsx` renders one card per `result.holes` entry (all 18, keyed by `holeNumber`, `:96–102`).
- Three achievement rows in fixed order Bingo → Bango → Bongo via `CATEGORIES` (`:34–38`), each reading `winnerByKey` from `hole.bingoUserId/bangoUserId/bongoUserId` (`:144–148`).
- Winner → `formatRevealName(info.name, info.nickname)` (`:167–170`); null category → muted «ikke satt» (`:231–234`).
- **No golf score/par** anywhere in the view — confirmed by reading; header subtitle is "Bingo Bango Bongo" with no Netto/Brutto (`:87–89`).
- Pending hole (all three null) → «Venter» chip + «Ingen prestasjoner registrert ennå.» (`:150–153, 187–191, 194–197`).
- Sweep (one player takes all 3, `pointsByPlayer[uid] === 3`) → «★ Feiet!» accent chip in head + accent-highlighted name (`:157–165, 183–186, 216–229`).
- Reads `pointsByPlayer` correctly for sweep detection (`:159–164`).

### 3. Purely additive ✓
- `BingoBangoBongoView.tsx` has **no** per-hole section: grep for `hole`/`holeNumber`/`.holes`/`per hull` returns zero matches in that file. It exposes only the aggregated per-player table. The holes view is the sole place per-hole data appears (like Round Robin).

### 4. Stream B head-to-head ✓
- In `renderBingoBangoBongo` finished branch, BEFORE the podium branch: `if (result.players.length === 2)` → `HeadToHeadResult` (`leaderboard/page.tsx:2640`).
- `score = pl.totalPoints`, `unitLabel: 'poeng'`, `formatLabel: 'Bingo Bango Bongo'` (`:2652, 2678–2679`).
- Stable side ordering by `gwp.players.map(p => p.user_id)` then `order.indexOf` sort (`:2643–2646`) — colors follow player identity, not rank. Matches Skins precedent.
- Strip logic (`:2660–2667`) is **correct** and matches contract exactly: `both 0 → 'unplayed'` checked first, then `aPts > bPts → 'a'`, `bPts > aPts → 'b'`, else (equal & >0) → `'halved'`. The unplayed-first ordering correctly prevents `0===0` from falling into `'halved'`.
- `winnerUserId = a.rank === b.rank ? null : (a.rank < b.rank ? a.userId : b.userId)` (`:2669–2670`). Verified against compute: with 2 players, identical cascade (totalPoints → bingos → bongos) yields equal `rank` + non-empty `tiedWith` (`bingoBangoBongo.ts:123–151`), so a true tie → `winnerUserId = null`. Tie handling is sound.
- `HeadToHeadResult` prop contract matches the call site exactly (`HeadToHeadResult.tsx:16–50`: `StripCell`, `HeadToHeadSide` = userId/name/nickname/score/subLabel?, plus formatLabel/unitLabel/winnerUserId?/strip/backHref?).
- 3+ players → `BingoBangoBongoPodium` retained unchanged (`:2700–2706`). Active/scheduled → `BingoBangoBongoView` alone (`:2721`).

### 5. No collateral damage ✓
- `holes/page.tsx` diff has **zero deletions** (verified: no `-` content lines except diff headers). Only the `'bingo_bango_bongo'` branch (`:168–174`), the `BingoBangoBongoHolesBody` async component (`:557–633`), and 4 import lines were added. Skins/Wolf/Nines/RoundRobin/AceyDeucey branches and generic `DrilldownBody` untouched.
- Reveal-mode hidden block present: `data-testid="bbb-holes-reveal-hidden"`, gated on `scoreVisibility === 'reveal' && gameStatus !== 'finished'` (`BingoBangoBongoHolesView.tsx:56–77`).
- `tabular-nums` present (`:87, 180`). Back-link is `h-11 w-11` = 44px (`:127`).

### 6. Tests ✓
- `BingoBangoBongoHolesView.test.tsx`: ONE render-test (per Type C discipline) asserting the differentiators — hull 1 has 3 achievement rows + resolved winner name + no «Feiet»; hull 2 sweep → «Feiet»; hull 3 partial → «ikke satt» without «Venter»; hull 4 pending → «Venter» with no winner name. Passes (174/174 in the leaderboard suite).
- `e2e/games/bingo-bango-bongo.spec.ts`: faithful mirror of `acey-deucey.spec.ts` — 3 auth-gate tests (holes/1, leaderboard, leaderboard/holes) all asserting redirect to `/login`, no Norwegian-copy assertions.

### 7. CHANGELOG / version ✓
- `package.json` version = `1.100.0`.
- `CHANGELOG.md` top series `## 1.100.y — Bingo Bango Bongo · hull for hull` with `[1.100.0] - 2026-06-08`; the prior `1.99.y` series is folded under `## Tidligere versjoner` inside a `<details>` wrapper.
- Tagline is clean idiomatic Norwegian, no em-dash chains, no AI-tells. Technical section documents the additive holes view, the H2H duell, the shared context extraction, and the branch addition.

---

## Gate results (actual output)

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | **exit 0**, 0 errors |
| `npx vitest run "app/games/[id]/leaderboard"` | **30 files, 174 tests passed** (incl. new HolesView + BingoBangoBongoView + HeadToHeadResult) |
| `npx vitest run lib/scoring/modes/bingoBangoBongo lib/scoring/context` | **1 file, 21 tests passed** |
| `npm run lint` | **0 errors, 24 warnings** (all pre-existing `_gameId`/`Button`/`userId` unused-var warnings in unrelated files; none in new BBB files) |
| `npm run build` | Not re-run; tsc clean + no build-break indicators; implementer reported exit 0. Skipped per evaluation guidance. |

Full-suite run not re-executed (known-flaky GameForm/GameWizard under parallel load, #506); not a blocker per instructions. The targeted suites above cover all changed surfaces.

---

## Bugs / gaps / deviations

None found. The implementation matches the contract design point-for-point:
- Strip ordering correctly guards the `unplayed` case before `halved`.
- `winnerUserId` tie handling is correct against the compute's shared-rank semantics.
- The inline ctx-map deletion is genuine (not duplicated).
- The view shows no golf score, per the BBB-doesn't-count-strokes requirement.
- No collateral edits to sibling format branches.

Minor observations (NOT defects, no action needed):
- The render-test asserts «Feiet» appears on the sweep card but does not separately assert the sweeper's name is accent-highlighted. This is within the contract's stated criteria («asserter prestasjons-navn + pending + sweep») and the Type C single-render-test discipline — acceptable.
- `buildBingoBangoBongoContext` defines `BingoBangoBongoContextHoleRow`/`ContextScoreRow` interfaces that are only used for the `opts` param typing via `holesRows`/`scoresRows`; this mirrors the sibling builders and is intentional shape-consistency, not dead code.
