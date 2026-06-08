# Forge-evaluering: Nassau format-bevisst «Hull for hull» + H2H (epic #496, PR 7)

**Verdict: ACCEPT**

Re-derived all eight criteria independently from the code and command output. Every one passes. No blocking gaps. One cosmetic note (sub-label wording deviates from the contract's *illustrative* example, but matches the sibling-PR convention — not a defect).

---

## Gate-resultater (kjørt av evaluator)

### 1. `npm run build` — GREEN
Full Next-build completed; route table printed, no tsc/exhaustive-switch errors. The new `holes` field on `NassauResult` did not break any exhaustive switch/Record over `ModeResult`.

### 2. `npx vitest run` (contract test set) — GREEN
```
Test Files  5 passed (5)
Tests  40 passed (40)
```
(nassau.test.ts, NassauHolesView.test.tsx, HeadToHeadResult.test.tsx, NassauView.test.tsx, NassauPodium.test.tsx)

Standalone nassau.test.ts:
```
Test Files  1 passed (1)
Tests  31 passed (31)
```
26 pre-existing unchanged + 5 new `#496` cases — matches contract evidence.

### 3. `npx tsc --noEmit` — GREEN
```
TSC_EXIT=0
```

---

## Per-kriterium

### A1 — Scoring: PASS
- `NassauHolePlayerCell` / `NassauHoleRow` defined additively in `lib/scoring/modes/types.ts:1455-1488`; `holes: NassauHoleRow[]` added to `NassauResult` at `:1488`.
- `computeHoleRows` in `nassau.ts:173-208`: unplayed holes give `effective: null` / `gross: null` (`:182-186`), **not** the 999 padding (the 999 path lives only in the separate `computeSectionStrokes`, `:76`, untouched).
- `bestUserIds`: empty when no one played (`:193` stays `[]`); tie via `filter(c => c.effective === min)` gives length>1 (`:196`); single winner gives length 1. Correct.
- Additive: `holes` built at `:326-331` and appended to the return; `sections`/`players`/existing fields and the whole `computeSection` cascade are unchanged. `effectiveFor` reused.
- TDD evidence: 5 new cases in `nassau.test.ts:694-789` directly assert the null-not-999 contract (`:784-785`), tie (`:769`), empty (`:770`), gross/net (`:735-751`).

### A2 — Branch: PASS
- `holes/page.tsx:180-185` branches on `game.game_mode === 'nassau'` → `<Suspense><NassauHolesBody/></Suspense>`, placed **before** the generic `DrilldownBody` fallback at `:189-197` (all format branches precede it).
- `NassauHolesBody` (`:652-717`) fetches only scores+holes (solo, no extra fetch), builds context via `buildNassauContext` (`:682`), narrows on `result.kind !== 'nassau'` (`:691`), renders `NassauHolesView`. Mirrors `SkinsHolesBody`.

### B1 — H2H ved 2 spillere: PASS
- `renderNassau` (`leaderboard/page.tsx:2339-2414`): 2-player path gated on `game.status === 'finished'` (`:2339`) **&&** `result.players.length === 2` (`:2340`).
- `score = pl.units` (`:2360`); strip derived from `holes[].bestUserIds` mapping to `'a'/'b'/'halved'/'unplayed'` (`:2364-2372`) — matches `StripCell` union in HeadToHeadResult.tsx:16.
- `winnerUserId` from rank with tie when ranks equal (`:2375-2376`). Verified correctness: in `compute()` rank is assigned by `(units desc, total18EffectiveStrokes asc)`, so a units-tie broken by the cascade yields *different* ranks → correct winner; only a genuine full tie yields equal ranks → `null`.
- `unitLabel="seksjoner"`, `formatLabel="Nassau · Netto/Brutto"`, `subLabel`=section breakdown, `hangingNote`=push note all passed (`:2393-2400`).
- `sideA`/`sideB` ordered by `gwp.players` order, not rank (`:2343-2346`) — colors follow identity.
- 3+ players still render `NassauPodium` (`:2415-2434`).

### C1 — Delt kontekst: PASS
- `lib/scoring/context/buildNassauContext.ts` (new, mirrors `buildSkinsContext`, `teamNumber: null`).
- Commit b50e7b4 removed the inline `ScoringContext` map from `renderNassau` (-38 lines from page.tsx) and replaced it with `buildNassauContext(...)` (`leaderboard/page.tsx:2308-2314`). The same helper is imported and used by `NassauHolesBody` (`holes/page.tsx:48, :682`). No duplicated map.

### C2 — Designkrav: PASS
`NassauHolesView.tsx`:
- Reveal-hidden branch present (`:51-72`), gated `scoreVisibility === 'reveal' && gameStatus !== 'finished'`.
- `tabular-nums` on every numeric span (`:85, :193, :211, :255, :330, :371, :374, :412, :450`).
- Back link `h-11 w-11` = 44px (`:137`).
- Champagne only via `accent` tokens; dark mode via theme tokens; reuses Card/Kicker/AppShell/LeaderboardBackdrop/formatRevealName/SmartLink.
- **Halved-hole avoids misleading champagne:** `uniqueWinnerId` is null when `bestUserIds.length !== 1` (`:355-356`), so a tied hole gets no champagne highlight (`:387`); section-level push shows neutral "Delt 1.-plass" (`:268-270`). Directly satisfies the contract's stated concern.

### C3 — Tester: PASS
- Exactly ONE `it` in `NassauHolesView.test.tsx` (`:141`). Asserts the differentiator: three section-true blocks, per-hole cards present in Front/Back but absent in Total (`:168-169`), champagne winner on a clean-win hole (`:160-161`) and absent on a halved hole (`:165`). Does not re-assert Type A scoring numbers (asserts structure/highlight, not "u1's net is X").
- `HeadToHeadResult` has its own test (separate); Nassau just feeds it.
- e2e 3rd test added: `nassau.spec.ts:22-29` covers `/leaderboard/holes` redirect to login, mirrors wolf.spec.ts. Asserts on URL, not Norwegian copy (Type D compliant).

### C4 — Ingen regresjon: PASS
- `git diff` of `holes/page.tsx` is exactly 3 hunks: an import (`:48`), the routing dispatch (added nassau branch), and a new `NassauHolesBody` function inserted before `DrilldownBody`. The `async function DrilldownBody({` line and its body are byte-for-byte unchanged. Only a new branch added.
- Build green confirms all exhaustive ModeResult switches/Records absorb the additive `holes` field.

### D1 — Versjon: PASS
- `package.json` version = `1.101.0`.
- CHANGELOG has open `## 1.101.y — Nassau · hull for hull` theme with the 1.101.0 entry; the previously-open 1.100 series was wrapped under `## Tidligere versjoner` in a `<details>` (diff: heading replaced, new entry added, 1.100 wrapped).
- `<details>` nesting balanced in the new region: 1.101.0 Teknisk details (28→43), 1.100 wrapper (47) → inner Teknisk (56→70) → wrapper close (72), then the pre-existing 1.99 wrapper continues (74). No stray/unbalanced tags.

---

## Norsk copy-sjekk (H2H + HolesView)

All user-facing strings are clean idiomatic bokmål. No anglicisms, no særskriving, no «vennligst», no formal «De», no AI-vocabulary, no em-dash chains (the `·` is a middle-dot label separator, consistent with the six prior PRs and the BBB/team-roster sub-labels at `page.tsx:2704, :3393`). "Hull for hull", "Godt spilt", "Lykke til", "Venter", "Delt 1.-plass", "Resultatene avsløres etter runden", "Hull for hull åpnes når admin avslutter spillet" all read naturally.

---

## Issues funnet (rangert)

1. **(Cosmetic / non-blocking)** The H2H `subLabel` renders won sections joined with `·` ("For 9 · Bak 9 · Totalt") whereas the contract's illustrative example wrote «Vant For 9 + Total». The contract said "f.eks." (e.g.), and the `·` style matches the established separator convention in the sibling H2H/roster renders. No change required; noted for transparency only.

No correctness, design, test-discipline, or regression gaps found.
