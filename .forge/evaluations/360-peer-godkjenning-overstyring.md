# Forge Evaluation: #360 Peer-godkjenning — synliggjør admin-overstyring

**Overall verdict: ACCEPT**

Evaluated: `cbb8c04` (fix commit) on branch `claude/laughing-dhawan-4bb519`, 2 commits above `93dc289`.

---

## Per-Criterion Table

| AC | Verdict | Evidence |
|----|---------|----------|
| AC1 — Aldri permanent låst | MET | `adminApproveScorecard` unchanged; `ApprovePlayerButton` renders for every `needsApproval` player (line 873–878). 14/14 `actions.test.ts` tests pass, including `adminApproveScorecard` branch. |
| AC2 — Oppdagbar vei fra spill-detaljsiden | MET | `else`-grenen (lines 985–1014) renders signpost with `href="#leverte-scorekort"` when `pendingApprovalCount > 0`. No passive-only warning remains for that case. Verified by code-reading (see Control-flow analysis below). |
| AC3 — Anker virker | MET | `SectionCard ribbon="Leverte scorekort"` got `id="leverte-scorekort"` (line 829). `SectionCard` now forwards `id` to the `<section>` element (lines 1084–1098). `<a href="#leverte-scorekort">` in the signpost branch (line 1007). Target is always present in DOM when signpost shows (see Anchor-in-DOM analysis below). |
| AC4 — Ingen regresjon i kombinert blokker | MET | Combined case (`notSubmittedCount > 0 && pendingApprovalCount > 0`) falls to `else` branch — both paragraphs render. When approval is resolved (`pendingApprovalCount` drops to 0, `notSubmittedCount` still > 0), `onlyMissingBlocks` becomes `true` and "Avslutt likevel" appears. Verified by tracing booleans (see Control-flow analysis). |
| AC5 — Bump + CHANGELOG | MET | `package.json` bumped `1.65.0` → `1.65.1`. CHANGELOG entry under `[1.65.1] - 2026-06-01` with tagline + `<details>` block in same commit `cbb8c04`. |

---

## Control-flow Analysis

The three-branch structure in the "Avslutt spillet" card (lines 950–1014):

```
everyPlayerReady?         → EndGameButton (all ready)
  rankablePlayers.length > 0 && notSubmitted===0 && pendingApproval===0

onlyMissingBlocks?        → "Avslutt likevel" escape
  rankablePlayers.length > 0 && notSubmitted > 0 && pendingApproval===0

else                      → NEW signpost branch
  covers all remaining active cases
```

**Cases that reach `else`:**

1. **Pure approval blocker** (`notSubmitted===0, pendingApproval>0`): `everyPlayerReady` is `false` (pendingApproval≠0); `onlyMissingBlocks` is `false` (notSubmitted===0, not >0). Falls to `else`. ✓ Signpost renders.

2. **Combined blocker** (`notSubmitted>0, pendingApproval>0`): `everyPlayerReady` is `false`; `onlyMissingBlocks` is `false` (pendingApproval≠0). Falls to `else`. ✓ Both paragraphs render; anchor link renders.

3. **All-withdrawn edge** (`rankablePlayers.length===0`): `everyPlayerReady` is `false` (length===0 guard); `onlyMissingBlocks` is `false` (length===0 guard); `pendingApprovalCount===0` (computed from rankablePlayers, filtered to empty). Falls to `else`, but both `notSubmittedCount` and `pendingApprovalCount` are 0, so the warning div renders empty and the anchor link is suppressed. This is an existing pre-#360 condition — no regression introduced.

**`pendingApprovalCount` is never > 0 for withdrawn players:** computed at line 472–475 from `rankablePlayers` (withdrawn filtered out), so a withdrawn player with a submitted-but-unapproved scorecard never contributes to the count.

---

## Anchor-in-DOM Analysis

The "Leverte scorekort" `SectionCard` renders when `game.status === 'active' && submitted.length > 0` (line 825–827). For `pendingApprovalCount > 0` to be positive, at least one player must have `submitted_at != null && approved_at == null`. That player also satisfies the `submitted.length > 0` guard, so the `SectionCard` with `id="leverte-scorekort"` is guaranteed in DOM whenever the signpost anchor link is rendered. The edge-case noted in the contract ("Anker uten match: umulig når pendingApprovalCount > 0") is confirmed correct.

---

## Gate Results

| Gate | Result | Detail |
|------|--------|--------|
| `npx tsc --noEmit` | PASS | No output (zero errors). New `id?: string` prop on `SectionCard` types cleanly. |
| `npx vitest run "app/admin/games/[id]/actions.test.ts"` | PASS | 14/14 tests, 1 file. |
| `npm run build` | PASS | Full production build completes. Route `/admin/games/[id]` renders without error. |

Gate 4 (commit-msg hook): commit `cbb8c04` staged `package.json` (bumped version) and `CHANGELOG.md` alongside `page.tsx`. Hook would have passed.

Gate 5 (browser preview): NOT exercised in browser — OTP auth + prod DB not stageable locally. Verified instead by code-reading: the signpost JSX branch (lines 985–1014) renders the correct text + anchor when `pendingApprovalCount > 0`. The `id="leverte-scorekort"` attribute on the target section is confirmed at line 829.

---

## Scope Check (Out-of-scope respected)

| "Ikke i scope" item | Status |
|--------------------|--------|
| Tids-basert auto-eskalering / cron / push-varsel | Not present. |
| Bulk «godkjenn alle»-knapp | Not present. |
| Dedikert bekreftelsesside for overstyring | Not present. |
| Nye tester | Not present. `actions.test.ts` unchanged. |
| Endre `adminApproveScorecard` / `reopenScorecard` | Both actions unchanged. |

No gold-plating detected. Only files touched: `page.tsx`, `package.json`, `package-lock.json`, `CHANGELOG.md`, and the contract file itself.

---

## Regression / Gap Findings

**No genuine regressions found.** Minor observations:

1. **All-withdrawn + else branch renders empty warning div:** When `rankablePlayers.length===0` and `game.status==='active'`, the `else` branch renders a `<div className="space-y-3">` containing an empty warning div (both inner conditionals are false) and no anchor link. This is pre-existing behavior (the old `else` had the same empty-render potential), and this edge is practically unreachable for a normal active game (you'd have to withdraw all players). Not a new regression.

2. **Copy quality:** Norwegian copy is idiomatic and clean. No em-dash chains, no «vennligst», no «tap»-anglism, no «-spillet»-redundans. The contract's copy-skisse was refined: «Da kan spillet avsluttes» became «Da kan du avslutte spillet» — active voice is an improvement. No AI-tells detected.

3. **Flyt 5 diagram not updated:** The contract says to update only if the diagram showed the approval lock as a blindvei/⚠. The SVG contains no such node — no update needed. This is correctly handled (noted under Notes in CHANGELOG entry).

4. **`<a>` tag instead of `<SmartLink>` for in-page anchor:** The signpost uses a bare `<a href="#leverte-scorekort">`. The existing codebase uses `SmartLink` for route navigation, but `SmartLink` is a wrapper for Next.js `<Link>` which is for cross-page navigation. An in-page anchor (`#`) is correctly a bare `<a>`. Not an issue.

---

## Rationale

All five acceptance criteria are met with concrete code evidence. The three gates pass cleanly. The control-flow trace confirms the signpost is reachable exactly when the contract requires it, the anchor target is guaranteed in DOM when the link is rendered, and the combined-blocker sequential-unlock flow (fix approval → onlyMissingBlocks triggers → "Avslutt likevel" appears) is preserved. Scope discipline is tight — no new actions, no new tests, no dedicated pages, no bulk approve, no cron.
