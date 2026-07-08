# VERDICT: ACCEPT

Skeptical evaluation of #1159 **Del B** (skjermbilder på PR-kortet) on branch
`claude/1159-del-b-skjermbilder`, diff `365e5428..HEAD`. Every criterion B1–B7
independently verified by reading the code and running the commands. B8 is
post-merge CI-activation, explicitly out of scope for ACCEPT.

## Criteria B1–B7

| # | Criterion | Observed evidence | Verdict |
|---|---|---|---|
| B1 | `lib/loops/prScreenshots.ts` + 17 Type A-tester | File is pure logic (zero imports). `prScreenshots.test.ts` = 17 `it()` cases covering isVisualChange, statisk/dynamisk page-derivasjon, [id]-kontekst (cup/liga/klubber), [holeNumber]→1, admin-auth, dropp-uten-fikstur, komponent-map (leaderboard/podium/scorecard/hull), dedupe, cap 3, forsiden-fallback. `npx vitest run lib/loops/prScreenshots lib/loops/prCard` → **34 passed** (17+17). | ✅ |
| B2 | `decide-pr-card.ts` mot ekte PR #1160 | Ran `CARD_PLAN_PATH=… PR_NUMBER=1160 npx --yes tsx decide-pr-card.ts`. Log: `PR #1160: shouldCard=true, isGui=false (7 filer)`. plan.json has `shouldCard/isGui/pr{number,title,htmlUrl,draft,summary}/changedFiles[7]`. Matches claim exactly. | ✅ |
| B3 | `screenshot-routes.ts` → 2 ekte PNG-er mot staging | Read both artifact PNGs. `01-app-locale-page-tsx.png` = front page unauthenticated (390px mobile, brand + login form + v1.183.0). `02-…-leaderboard-page-tsx.png` = seeded game leaderboard `TEST-GOLDENPATH-1783538167880-SHOTS` (Test Admin + Test Spiller, Stableford, player logged in — bottom nav visible). Filenames match `sanitize(label)` output; suffix `-SHOTS` confirms `seedActiveStablefordGame('shots')`. Genuine renders. | ✅ |
| B4 | `post-pr-card.ts` multipart + JSON dry-run | DRY_RUN with 2 PNGs in SHOTS_DIR → `2 skjermbilde(r)` → `shots.length>0` → multipart branch; payload carries merge + link buttons. DRY_RUN with empty dir → `0 skjermbilde(r)` → JSON branch, identical payload. Multipart shape (`payload_json` + `files[i]` + `attachments[i].id=i`) is correct Discord API v10 for message attachments — images render next to the button. | ✅ |
| B5 | Workflow extended (decide→betinget screenshot→post) | js-yaml parse OK, 7 steps, triggers `check_suite`+`workflow_dispatch`. Checkout ref `${{ github.event.check_suite.head_sha \|\| format('refs/pull/{0}/head', inputs.pr) }}` — correct PR-head for both triggers. Screenshot step gated `should_card && is_gui`, `continue-on-error: true`. Post step gated `should_card` only. Failure-alarm `if: failure()` retained. | ✅ |
| B6 | Fulle gates grønne | Independently re-ran on Node 22.23: **typecheck 0 errors** · **npm test 4737 passed (379 files)** · **lint 0 errors** (54 pre-existing complexity warnings, none in new files) · **npm build ok** · **guard.test.sh 39 bestått, 0 feilet**. All match claimed numbers. | ✅ |
| B7 | Docs oppdatert | `docs/loops/discord-pr-kort.md` has a "Del B — skjermbilder" section: rute-oppslag, fiksturer (groups/leagues/tournaments), mobil-viewport, best-effort, fix-protokoll for manglende skjermbilder. Accurate to the code. | ✅ |

## Skeptical probes

- **Workflow gating.** Heavy screenshot step runs ONLY on `should_card && is_gui`.
  Post step runs whenever `should_card` — and because the screenshot step is
  `continue-on-error: true`, a screenshot failure keeps the job in `success()`
  state, so the implicit `success()` on the post step's `if` still holds → merge
  card is always posted. Failure-alarm (`if: failure()`) only fires on a genuine
  non-continue-on-error failure (decide crash / post crash), not on dropped
  screenshots. Correct.
- **Discord multipart.** `attachments = shots.map((s,i)=>({id:i,filename}))` +
  `files[i]` blobs + `payload_json` spread with `attachments`, Content-Type left
  to fetch (boundary auto-set). This is the documented v10 attachment-upload
  shape; `id` (integer index) matches `files[i]`. Buttons + images on one message.
- **PR-head checkout.** `head_sha` (check_suite) and `refs/pull/{n}/head`
  (dispatch) both resolve to the PR's head, not main. Screenshotted code = code
  under review. Workflow definition itself is pinned to default branch by
  check_suite (documented, fine for solo repo).
- **No-npm-ci for decide/post.** `prCard.ts` and `prScreenshots.ts` have zero
  imports; `ghClient.ts`/`cardPlan.ts` import only `node:fs`; decide/post use only
  those + `node:fs`/`node:path` + global `fetch`/`FormData`/`Blob` (Node 22). All
  relative imports → no node_modules needed; `npx --yes tsx` fetches only tsx.
  Verified by running decide + post dry-runs. `screenshot-routes.ts` DOES import
  `@playwright/test` + `e2e/_helpers/games` (→ `@supabase/supabase-js`); the
  workflow runs `npm ci` in that step (line 88). Correct split.
- **Route derivation holes.** `substituteSegment` maps known params to fixtures;
  unknown `[id]` contexts (`admin/courses/[id]`, `admin/lanseringer/[id]`,
  `[roundId]`, `[shortId]`, `token`) return null → route dropped → `/` fallback.
  Verified all `cup`/`liga`/`klubber`/`baner`/`games` derivation keys match real
  app-route folders. `buildRoute([])` → `/` (front page). Cap-3 + dedup + priority
  (page > component > fallback) confirmed by tests. No crash path. Destructive
  routes (`/slett`, `/avslutt`, `/trekk-*`) are only `page.goto`+`screenshot` (GET,
  no click) → no mutation; the one navigated game is status `active` so no
  auto-start side effect. Safe.
- **Best-effort integrity.** `envReady` guard skips cleanly when staging env
  missing; per-route `try/catch` drops a single route; `browser.close()` +
  seeded-game `cleanup()` in `finally`; top-level `main().catch` logs and exits 0
  (never fells the job). Seed uses `TEST-` prefix. A screenshot failure never
  blocks the card and never writes prod.
- **Consistency.** `classifyChecks`, `CARD_LABEL` (`discord:merge-kort`), and
  `merge_pr:<N>` custom_id are reused unchanged from Del A `lib/loops/prCard.ts`
  (which is NOT modified in this diff) → consistent with the #1124 merge endpoint.
- **Scope.** `git diff --stat 365e5428..HEAD` = 10 files: the contract, workflow,
  docs, `prScreenshots.ts`/`.test.ts`, and `scripts/loops/{cardPlan,decide-pr-card,ghClient,post-pr-card,screenshot-routes}.ts`.
  `post-pr-card.ts` is a refactor (net −). No drive-by edits to app/lib/components.

## Minor observations (non-blocking)

1. **No runtime staging-ref assertion** in `screenshot-routes.ts` — "aldri prod"
   relies on the GitHub Actions secrets being staging, exactly the same trust
   model as the existing `e2e:gate` job. Consistent with repo convention; not a
   Del-B-introduced risk. (The #1074 prod-firewall covers MCP/connstrings, not
   Actions secrets.)
2. **Nested dynamic routes** (e.g. `klubber/[id]/cup/[cupId]`) derive a path from
   two independently-resolved fixtures (a top-level tournament id + a top-level
   club id) that need not belong together → the URL may 404 and the route is
   dropped on nav failure. Soft coverage miss, not a defect; acceptable for a
   best-effort v1.

Neither warrants blocking. Recommend filing #-issues only if the owner wants a
staging-ref guard hardening or nested-route fixture pairing later.
