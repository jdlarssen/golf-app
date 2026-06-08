# Evaluation: Wolf — format-bevisst «Hull for hull» (PR 2 av epic #496)

**Verdict: ACCEPT**

Branch `issue-496-wolf-hull-for-hull`, range `e9c836e..HEAD` (5 commits). Verified independently against `.forge/contracts/496-wolf-hull-for-hull.md`. All success criteria met, all gates green, no blocking bugs found.

## Success criteria

| # | Criterion | Verdict | Evidence |
|---|-----------|---------|----------|
| 1 | Holes page branches on `game_mode === 'wolf'` → WolfHolesView with per-player score + side + points + stake; non-wolf/non-skins still hit generic DrilldownBody | PASS | `holes/page.tsx:123-129` adds the wolf branch after skins; only two `game.game_mode ===` branches exist (skins:115, wolf:123); everything else falls through to `DrilldownBody` (page.tsx:131). WolfHolesView renders Wolf-linje (choice/outcome), stake badge `{stake}x` when >1 (WolfHolesView.tsx:177-181), per-player rows with side label, score, points (lines 204-263). |
| 2 | `lib/wolf/holeLabels.ts` shared by BOTH WolfView + WolfHolesView; WolfView strings byte-identical; WolfView.test passes | PASS | Both import `wolfChoiceLabel/wolfOutcomeLabel/wolfOutcomeClass` (WolfView.tsx:9-13, WolfHolesView.tsx:9-13). Strings in holeLabels.ts are identical to the deleted WolfView locals ('Lone Wolf','Blind Wolf','Partner: {name}','Venter…','Wolf vant','Andre vant','Lik','Venter'). Partner-resolution preserved byte-for-byte across all 3 cases (null userId → 'Partner: ?'; userId-not-in-map → 'Partner: ?'; resolved → 'Partner: {name}') — verified by tracing WolfView.tsx:307-315 + `${partnerName ?? '?'}`. WolfView.test green. |
| 3 | `buildWolfContext` used by BOTH renderWolf + WolfHolesBody, no duplicated ctx mapping; injects `wolfChoices` via getWolfChoices | PASS | `renderWolf` now calls `buildWolfContext(...)` (page.tsx:2200-ish; ~44-line inline ctx deleted in diff). `WolfHolesBody` calls the same helper (holes/page.tsx) and fetches choices via `getWolfChoices(gameId)` in the Promise.all, passing `wolfChoices` into `buildWolfContext`. Map logic lives in exactly one place (buildWolfContext.ts:58-89). |
| 4 | Reveal gating, dark mode, tabular-nums, ≥44px | PASS | `isRevealHidden = scoreVisibility==='reveal' && gameStatus!=='finished'` (WolfHolesView.tsx:50-51) — matches contract + SkinsHolesView. Back-link `h-11 w-11` = 44px (line 122) → `/games/${gameId}`. `tabular-nums` on hole no., par/SI, stake badge, score row (lines 81,170,173,178,245). Dark mode via semantic tokens (text-text/muted, bg-surface, border-border, accent) carrying dark variants. |
| 5 | Refactor (label extraction + buildWolfContext) behaviour-identical | PASS | WolfView diff is pure extraction + identical partner-name resolution; only non-label change is local var plumbing. renderWolf diff swaps inline object for helper call with same field mapping (teamNumber `?? 0`, etc.). Both backed green by existing tests + full suite (2941 pass). |

### Other contract checkboxes
- Type C render-test for WolfHolesView (1 partner-hull + 1 lone + pending default): PASS — WolfHolesView.test.tsx, single test focused on the differentiator (side/score/points/stake), explicitly does NOT re-assert shared labels. Good Type C discipline.
- Norsk copy: PASS — novel strings ('Wolf-side','Andre','brutto N','(ukjent spiller)') are short labels, no AI-tells; reveal/pull-quote strings byte-identical to already-approved SkinsHolesView.
- CHANGELOG + MINOR bump 1.96.0: PASS — package.json 1.95.0→1.96.0; CHANGELOG opens 1.96.y theme, re-wraps 1.95.y in `<details>` correctly.
- E2E auth-gate: PASS — `e2e/games/wolf.spec.ts` adds holes-route redirect-to-login test mirroring existing pattern.

## Gate results

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | PASS (exit 0, 0 errors) |
| `npx vitest run WolfHolesView.test + WolfView.test` | PASS (2 files, 2 tests) |
| `npx vitest run "app/games/[id]/leaderboard"` | PASS (26 files, 170 tests) |
| `npx vitest run` (full suite, regression) | PASS (241 files, 2941 tests) |
| `npm run lint` | PASS (0 errors, 24 warnings — all pre-existing `_gameId`/`_gameStatus`/`_userId`/`Button` in untouched files incl. WolfView.tsx:75; new files lint-clean) |
| `npm run build` | PASS (exit 0, full route tree compiled) |

## Bug hunt (all clear)

- **RSC serialization:** WolfHolesView is a server component (no `'use client'`), receives a `Map` from async `WolfHolesBody` server comp — never crosses an RSC boundary. Fine.
- **Side sort:** `sideRank` wolf=0/opp=1/null=2 (WolfHolesView.tsx:132-134); Array.sort stable in V8. Wolf-side rendered first, then Andre, then pending. Correct.
- **Pending hole:** Real scoring populates `players` cells with `side:null`, `effectiveScore:null` (wolf.ts:434-438 + 208-211). View guards: side label only `cell.side != null`; score `effectiveScore ?? '–'`; points `?? 0` → no chip; showGross requires `gross != null`. No crash. Empty `players:[]` (test default only) renders empty `<ul>`. Correct.
- **Lone/Blind wolf:** wolf.ts:189-195 puts only Wolf in `wolfSideIds`, all 3 others in `oppSideIds`. View highlights the lone Wolf-side cell + labels others 'Andre'. Correct.
- **Partner resolution parity:** verified byte-identical to original (see criterion 2).
- **data-testid:** `wolf-holes-reveal-hidden`, `wolf-holes-list`, `wolf-holes-card-{n}` — namespaced, distinct from WolfView's `wolf-hole-row-{n}`. No collision, no dead testid.
- **Copy AI-tells:** none in code strings. CHANGELOG tagline uses one em-dash (established 3-layer CHANGELOG style; markdown not hook-scanned).
- **Dead code:** none — `JSX` import used as return type; all imports referenced.

## Concerns
None blocking. Nice-to-have (out of scope for this PR, do not act):
- The pre-existing `_gameId` unused-var warning in WolfView.tsx:75 (and 10 sibling views) is a repo-wide pattern, not introduced here.
