# Evaluation: #1747 — shared 44px back-link primitive for the leaderboard

**Builder:** Nattkjøreren (#1079), Opus build subagent (orchestrated by Fable)
**Contract:** issue comment on #1747 (kontrakt-smeden 2026-08-25), Alternative A
**Branch:** `claude/natt-1747-backlink` from `origin/main@e454de2`

## Runde 1 — implement → gates → fresh-context evaluate → ACCEPT

One round. Built to contract (Alternative A); fresh-context Opus evaluator found no
blocking defect. Independent Sonnet cross-model gate (Steg 4.5): CONFIRM.

### Changes

Single atomic commit `1cad688` (8 files, +108/−48):

| File | Change |
|------|--------|
| `components/ui/LeaderboardBackLink.tsx` | NEW — three exports (`LeaderboardBackLink`, `LeaderboardBackLinkSpacer`, `LeaderboardBackLinkPlaceholder`) sharing the module-private canonical 44px `BACK_LINK_BOX` class string. |
| `LeaderboardChrome.tsx`, `HeadToHeadResult.tsx`, `State4View.tsx` | Call sites switched (byte-identical class strings, aria-labels unchanged); `DECOR_CLIP_INSET` JSDoc now names the primitive; State4 `ReplayButton` branch untouched (only the else-spacer swapped). |
| `holes/formats/drilldown.tsx`, `holes/page.tsx` | 32px → 44px box + `w-8` → `w-11` spacers in the same commit — drilldown header and `DrilldownSkeleton` keep identical geometry. |
| `components/ui/BackLink.tsx` | JSDoc-only: the "mirrors State4's arrow" line would now lie (contract-permitted case). |
| `.changes/1747-tilbakepil-hull.md` | fix note, validated via `weekly-release.mjs --dry-run`. |

### Success criteria — verified

| # | Criterion | Evidence | Result |
|---|-----------|----------|--------|
| 1 | 0 hand-rolled arrows left in the leaderboard dir | `grep -rn -- "-ml-2 inline-flex h-" "app/[locale]/games/[id]/leaderboard/"` → 0 hits | PASS |
| 2 | Skeleton/drilldown identical header geometry | Byte-identical `<header>` wrappers, both 44px box + `w-11` spacer | PASS |
| 3 | Three 44px surfaces unchanged; ReplayButton intact | Class strings character-for-character equal; aria-label props/t-keys unchanged; `onReplay ?` polarity verified | PASS (structural; visual half = staging click round, `needs-manual-qa`) |
| 4 | tsc / lint / vitest green | tsc exit 0 · lint 0 errors, no new warnings vs main · full vitest 503/6701 (builder) + targeted State4View/HeadToHeadResult 5/5 (evaluator) | PASS |

### Gates

| Gate | Command | Result |
|------|---------|--------|
| Types | `npx tsc --noEmit` | exit 0 |
| Lint | `npm run lint` | 0 errors |
| Unit | `npx vitest run` | 503 files / 6701 tests green |
| Build | `npx next build --webpack` | exit 0 (Turbopack native bindings missing in VM — documented fallback) |
| e2e | `npm run e2e:gate` (fresh same-tree server) | 26/31 green; 5 red are the night's known staging-flaky login flows, all reproduced on unchanged `origin/main` earlier tonight; none touch leaderboard markup |

**Note:** the first e2e attempt for this branch ran against a stale, half-dead server
left on port 3000 by an earlier baseline run (EADDRINUSE on boot, silently reused) and
produced 28 bogus reds incl. public flows — discarded, re-run on a fresh server. This
branch predates the #1299 identity guard (PR #1760) that catches exactly this.

### Fresh-context evaluator findings (non-blocking)

1. `LeaderboardBackLink` types `href` as `string` (narrower than SmartLink's union) — fine for all current callers.
2. `LeaderboardBackLinkPlaceholder` renders the glyph without `aria-hidden` (faithful port of old skeleton markup) — possible separate a11y ticket.
3. Skeleton title (`Skeleton h-3 w-32`) vs loaded title (`flex-1` span) still differ — pre-existing, outside contract parity scope.

### Cross-model gate (Steg 4.5)

Sonnet, fresh context, adversarial: full diff read, criterion-1 grep + dodge-hunt,
prop-drop comparison at every call site, geometry byte-compare, .changes validation,
tsc + targeted tests. **CONFIRM.**
