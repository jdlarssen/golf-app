# Evaluation: #1159 Del A — Discord merge-kort for alle grønne PR-er

VERDICT: ACCEPT

Evaluator: fresh-context skeptical pass. Every gate re-run and every criterion
re-verified against the code/commands directly — not from the builder's claims.
Branch `claude/serene-lovelace-edd89e`, commits `a3f5b4d8..64e52fef`.

## Per-criterion (A1–A6)

| # | Criterion | Verdict | Evidence I observed |
|---|-----------|---------|---------------------|
| A1 | `lib/loops/prCard.ts` with `extractPrSummary`, `classifyChecks`, `buildCardPayload`, `CARD_LABEL` | **MET** | Read file: `CARD_LABEL` (L12), `extractPrSummary` (L36), `classifyChecks` (L61), `buildCardPayload` (L97). All 4 exported. |
| A2 | Type A tests cover tagline (tagline/only-Closes/null/Refs), `classifyChecks` (pending/red/green/empty), `buildCardPayload` (custom_id + button struct + draft badge) | **MET** | `npx vitest run lib/loops/prCard` → **17 passed**. Read test file: all claimed cases present (extractPrSummary L10–57, classifyChecks L59–84 incl. empty-list L63, buildCardPayload L86–133 incl. custom_id `merge_pr:1159` L104 + draft-badge L121). |
| A3 | Runner exists; `DRY_RUN=1 PR_NUMBER=1158` logs valid payload w/ `custom_id: merge_pr:1158`, draft badge, extracted tagline | **MET** | Ran it myself against real GitHub data: payload had `"custom_id": "merge_pr:1158"`, style-3 merge button, style-5 link button, `📝 Draft ·` badge, and the real tagline pulled from #1158's body. Also ran the **check_suite event path** with a synthetic `GITHUB_EVENT_PATH` (no `PR_NUMBER`) → correctly extracted #1158 and built the card. |
| A4 | `.github/workflows/discord-pr-card.yml`: check_suite+dispatch trigger, secret guard, concurrency-per-SHA, failure-alarm; YAML parses | **MET** | js-yaml parse OK → triggers `['check_suite','workflow_dispatch']`, concurrency group present (per `head_sha`), permissions `{contents:read, pull-requests:write, issues:write, checks:read}`. Read file: guard step L37–48, `if: failure()` alert L71–89. |
| A5 | Full gates green | **MET** | Re-ran ALL: `typecheck` → 0 errors · `vitest run` (full) → **378 files, 4720 passed** · `lint` → **0 errors** (54 pre-existing complexity warnings, none in new files) · `build` → "✓ Compiled successfully" (env present) · `bash tests/hooks/guard.test.sh` → **39 bestått, 0 feilet**. |
| A6 | `docs/loops/discord-pr-kort.md` + owner secrets recipe | **MET** | Read file: describes trigger/gate/dedup, and an explicit owner-setup recipe (GitHub → Settings → Secrets → Actions; `DISCORD_BOT_TOKEN` + `DISCORD_CHANNEL_ID`; verify via Run workflow). |

A7 is owner-activation (post-merge secrets + a real dispatch) — explicitly not
blocking for ACCEPT. Not evaluated.

## Skeptical probes

**check_suite payload shape** — CORRECT. The runner reads
`ev.check_suite.pull_requests[].number` (post-pr-card.ts L63–67). Verified against
GitHub's REST check-suite schema: the check-suite object contains a
`pull_requests` array whose elements each have a `number` field, and `head_sha`
at the top level — so both the runner's field and the workflow's
`github.event.check_suite.head_sha` (concurrency group) are right. Also proved it
functionally: ran the runner with a synthetic check_suite event file and it
extracted the PR number and built the card. (Benign limitation: GitHub only
populates `check_suite.pull_requests` for same-repo PRs, not forks — irrelevant
here since every PR is a same-repo `claude/*` branch.)

**tsx-in-CI without node_modules** — genuinely unnecessary. `prCard.ts` has ZERO
imports (pure string/Set/regex). `post-pr-card.ts` imports only `node:fs`
(builtin), the relative `../../lib/loops/prCard`, and uses global `fetch`
(Node 22). No `@/` alias → no tsconfig-path resolution. No external package in the
dependency graph, so `npx --yes tsx …` needs nothing installed beyond tsx itself.
Confirmed by inspection of both files.

**Dedup correctness** — post-then-label ordering (postCard L161 → add label L166),
label `discord:merge-kort`, concurrency per head_sha with `cancel-in-progress`.
No lost-card hole introduced: post-fail → no label → retries next green event.
Label-write-fail after a successful post → possible duplicate on the next event,
which is explicitly acknowledged ("post-så-label … dobbelt-kort-race akseptert")
and logged ("kan gi dobbelt kort"). `cancel-in-progress` stays within that same
acknowledged race. No hole beyond what the contract already accepts.

**classifyChecks vs merge endpoint consistency** — `BAD_CONCLUSIONS` in
prCard.ts:52 is byte-identical to the merge endpoint's set in
discordActions.ts:77 (`failure, cancelled, timed_out, action_required`). Empty
check list → `pending` (prCard.ts:62) → the card NEVER surfaces a PR with no CI.
Note: the receiver's merge endpoint would actually merge a PR with an empty check
list (its `pending`/`red` filters are both empty → falls through), so the CARD is
strictly SAFER than the button it exposes — the safe direction, and the receiver
behavior is pre-existing #1124, out of scope for Del A.

**Gate honesty** — build passes for a real reason: `.env.local` present with
`NEXT_PUBLIC_SUPABASE_URL`, and the build prints "✓ Compiled successfully" plus
the full route table. Typecheck covers the runner: tsconfig `include: ["**/*.ts"]`,
`exclude: ["node_modules"]` → `scripts/loops/post-pr-card.ts` is type-checked.

**Scope creep** — none. `git diff --name-status b14a1142..HEAD` = 6 files, all
`A` (added): the 4 code/workflow/doc files + contract + evaluation-adjacent docs.
Nothing unrelated touched.

**Test discipline** — 17 tests, all Type A pure-logic, assertion-rich, one
question per test. No UI re-assertion, no over-mocking, no drive-by tests. Covers
the edge cases the contract claims (empty check list, long-line truncation,
list-marker stripping, draft vs non-draft). Appropriate, not bloated.

## Notes (non-blocking, for the closing comment — not defects)

1. Card gate is intentionally stricter than the merge endpoint on the empty-check
   case (card → pending, endpoint → would merge). Safe direction; receiver is
   #1124, unchanged. Worth one line in the closing comment for future readers.
2. Label-write failure after a successful post can yield a duplicate card on the
   next green event — acknowledged and logged; the morgenbrief health line is the
   backstop.

None of these warrant rework. All A1–A6 met with independent evidence.
