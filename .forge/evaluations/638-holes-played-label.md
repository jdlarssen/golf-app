# Forge-evaluering: #638 — «Etter X hull»-label reflekterer faktisk antall spilte hull

**Dato:** 2026-06-15  
**Branch:** `claude/practical-kepler-bd9c4a`  
**Evaluator:** Skeptical forge evaluator (independent re-check)

---

## VERDICT: ACCEPT

All seven contract criteria are met. One factual error in the contract's "orphan key" claim is noted below, but it does not affect correctness — the fix implements what the contract specifies.

> **Resolution (post-evaluation):** The evaluator's noted gap — best ball's `State4View` still showing «Etter 18 hull» via `leaderboard.state4.subtitle` (mis-flagged as orphan, but it has a real consumer) — was FIXED in commit `d1e0c2d5`: `state4.subtitle` parametrized with `{holes}` in both locales, `State4View` given a `holesPlayed` prop, both instantiations wired. Verified: tsc 0, leaderboard suite green, 0 subtitle keys hardcode 18.

---

## Per-criterion findings

### K1 — Delt nøkkel parametrisert

**PASS.**

```
grep -rln "after18Holes" app lib messages
(no output — zero hits)
```

`messages/no.json:1828` — `"afterNHoles": "Etter {holes} hull"`  
`messages/en.json:1828` — `"afterNHoles": "After {holes} holes"`

All 9 views + ShamblePodium confirmed to call `t('common.afterNHoles', { holes: holesPlayed })` (or `tc('afterNHoles', ...)` where they alias common via `tc`):

- `AceyDeuceyView.tsx:118` — ✓
- `BingoBangoBongoView.tsx:106` — ✓
- `NassauView.tsx:126` — ✓
- `NinesView.tsx:120` — ✓
- `PatsomeView.tsx:143` — ✓
- `RoundRobinView.tsx:129` — ✓
- `ShambleView.tsx:118` — ✓
- `SkinsView.tsx:132` — ✓
- `WolfView.tsx:125` — ✓
- `ShamblePodium.tsx:108` — ✓

### K2 — Bespoke subtitles parametrisert

**PASS.**

`messages/no.json` verified at lines 2007–2022:
- `soloStrokeplay.subtitle` → `"Etter {holes} hull · Slagspill · Sortert på laveste netto"` ✓
- `soloStrokeplay.podiumSubtitle` → `"Slagspill · Etter {holes} hull"` ✓
- `soloStableford.subtitle` → `"Etter {holes} hull · Stableford · Poeng"` ✓
- `soloStableford.podiumSubtitle` → `"Stableford · Etter {holes} hull"` ✓
- `teamStableford.subtitle` → `"Etter {holes} hull · Par-stableford · Poeng"` ✓
- `teamStableford.podiumSubtitle` → `"Par-stableford · Etter {holes} hull"` ✓
- `texasScramble.subtitle` → `"Etter {holes} hull · {format} · Sortert på laveste lag-netto"` ✓
- `texasScramble.podiumSubtitle` → `"{format} · Etter {holes} hull"` ✓

`messages/en.json` identical structure confirmed (lines 2007–2022) — catalog parity holds.

**Orphan key note (factual error in contract, not a defect):** The contract calls the remaining hardcoded-18 key `bestBall.subtitle`. There is **no** top-level `bestBall.subtitle` key in either locale file. The actual key with hardcoded 18 is `leaderboard.state4.subtitle` (`"Etter 18 hull · Best ball · {mode}"`), which IS consumed by `State4View.tsx:106`. However, `State4View` serves the `best_ball` game mode (the default path in `page.tsx` after all explicit mode checks). This mode is **intentionally out of contract scope** — the contract lists only `soloStrokeplay`, `soloStableford`, `teamStableford`, and `texasScramble` for K2. The CHANGELOG also acknowledges the omission, though it incorrectly describes the mode as having no consumer. The practical effect: best_ball games with early termination still show "Etter 18 hull". This is a pre-existing gap acknowledged by the contract, not introduced by this fix.

Consumer verification of the remaining hardcoded key:
```
grep -rn "bestBall.subtitle|bestBall'" app lib
→ only import statements for lib/scoring/modes/bestBall.ts (the scoring module, unrelated to i18n)
```
The contract's grep check returns zero i18n consumers — correct for the key name it specified.

### K3 — Spillvidt holesPlayed beregnet og trådet

**PASS.**

`lib/scoring/holesPlayed.ts` exists with `maxHolesPlayed` function. Correct algorithm: counts non-null `strokes` rows per `user_id`, returns `Math.max` across all users (0 for empty).

```
grep -c "maxHolesPlayed" "app/[locale]/games/[id]/leaderboard/page.tsx"
→ 13  (import line + 12 render-helper calls)
```

```
grep -c "holesPlayed={holesPlayed}" "app/[locale]/games/[id]/leaderboard/page.tsx"
→ 28  (live + finished prop passings across all render helpers)
```

Contract claimed 28 instantiations — confirmed exactly.

One render path uses a **different** holesPlayed computation at `page.tsx:732` (set-based, for `RevealBruttoView`). This is a separate reveal path not in scope and unrelated to the 12 maxHolesPlayed calls.

### K4 — Live OG ferdig korrekt

**PASS.**

Checked both paths for a sample format (nassau via `renderNassau`):
- **Finished (podium):** `page.tsx:1237` — `<NassauPodium holesPlayed={holesPlayed} ...>` ✓
- **Finished (view below podium):** `page.tsx:1268` — `<NassauView holesPlayed={holesPlayed} ...>` ✓
- **Live (active):** `page.tsx:1370` — `<NassauView holesPlayed={holesPlayed} ...>` ✓

Same pattern verified for stableford branch (TeamStablefordPodium at 1237, TeamStablefordView at 1263 and 1337).

**K4 partial-case render test:**

`SoloStrokeplayView.test.tsx` — test "viser faktisk antall spilte hull i undertittelen (ikke hardkodet 18)":
```typescript
render(<SoloStrokeplayView {...defaultProps({ holesPlayed: 2 })} />);
expect(screen.getByText(/Etter 2 hull/)).toBeInTheDocument();
```
All 14 tests green (confirmed via `npx vitest run "SoloStrokeplayView.test"`).

### K5 — Fullt 18-hulls spill uendret

**PASS.**

`SoloStrokeplayView.test.tsx` default fixtures use `holesPlayed: 18`. Full suite: **3530/3530 green** (verified). No existing 18-hull assertions broken.

### K6 — Katalog-paritet

**PASS.**

```
npx vitest run messages/catalogParity.test.ts
→ 3/3 passed
```

Full suite: **3530 tests, 280 files, all passed.**

### K7 — Norsk copy

**PASS.**

The only new Norwegian string is `"Etter {holes} hull"` — a straight placeholder substitution of the pre-existing `"Etter 18 hull"`. No new prose. CHANGELOG entry present at v1.130.7, uses parens rather than em-dash chain. Version bump confirmed (`package.json: "1.130.7"`).

---

## Gate results

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | ✅ Exit 0 — no type errors |
| `npx vitest run lib/scoring/holesPlayed.test.ts` | ✅ 9/9 passed |
| `npx vitest run "SoloStrokeplayView.test"` | ✅ 14/14 passed |
| `npx vitest run` (full suite) | ✅ 3530/3530, 280 files |
| `grep -rln "after18Holes" app lib messages` | ✅ Zero hits |

---

## Gaps noted (none blocking)

1. **`State4View` (best_ball) not updated** — `leaderboard.state4.subtitle` at `messages/{no,en}.json:1857` still contains hardcoded "18". `State4View.tsx:106` consumes this. The contract explicitly excludes best_ball mode from scope (K2 lists only soloStrokeplay/soloStableford/teamStableford/texasScramble). This is a remaining cosmetic defect for best_ball early-termination games, not a regression introduced here.

2. **Contract has a factual error about the key name** — calls the remaining key `bestBall.subtitle` (which does not exist as a standalone i18n key), when the actual key is `leaderboard.state4.subtitle`. The consumer check grep in the contract passes only because the grep pattern (`bestBall.subtitle|bestBall'`) doesn't match the actual key path. This did not cause incorrect implementation — the contract scope was clear about which components to fix — but the self-verification logic in K2 is misleading.

3. **Duplicate-row counting in `maxHolesPlayed`** — the function counts rows, not distinct hole numbers, so duplicate rows (same player, same hole) inflate the count. The test explicitly marks this as "by design" noting that `upsert_score_if_newer` prevents duplicates in production. Acceptable.

Neither gap is introduced by this fix; neither violates any contract criterion.
