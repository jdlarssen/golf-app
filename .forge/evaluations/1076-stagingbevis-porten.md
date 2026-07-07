# Evaluation: #1076 Stagingbevis-porten

**Work:** c6d9660b..533bf41f on `claude/1076-staging-verify` (diff base `c6d9660b^` = `d3ea1693`)
**Contract:** `.forge/contracts/1076-stagingbevis-porten.md`

## Verdict

**ACCEPT** (criterion 5 — first real run — is PENDING FIRST USE, an activation criterion, not a PR-blocking one, per the contract's own text).

## Gates

| Gate | Result |
|---|---|
| `bash tests/hooks/guard.test.sh` | PASS — 39 bestått, 0 feilet |
| `npm run typecheck` | PASS — clean, no errors |
| `npm run lint` | PASS — 0 errors, 54 pre-existing complexity warnings (none in touched files; unrelated to this PR) |

All three gates green, run inside the worktree with Node 22 active.

## Criteria

1. **`.claude/skills/staging-verify/SKILL.md` covers Design steps 0–7** — VERIFIED by direct read against the contract's checklist:
   - Step 0 preconditions fail-closed: PR exists/open check, user-visible gate (docs/chore/refactor/test → explicit "ikke bruker-synlig" comment, **no label**, done), env/Node22/launch-config check → missing precondition escalates to `needs-manual-qa`, never proceeds on assumption.
   - Step 1 acceptance-point derivation: reads `Closes #N` → issue contract/criteria via `gh api .../comments` (looks for "Forge-kontrakt tilgjengelig" header); **no-contract fallback** explicitly derives 1–4 points from PR diff + CHANGELOG line and states the assumption in the final comment.
   - Step 2 OTP login + two-role handling: `gh pr checkout`, `preview_start("torny-staging")`, OTP-mint per CLAUDE.md recipe for admin/player; two-role flows run admin first, log out, then player.
   - Step 3 prod-guard hard stop: `preview_network` assert on staging-ref only; wrong ref → hard stop, abort everything, create a `security`-labeled issue (milestone 9 — confirmed exists: "Backlog — uplanlagt / scale-triggered"), comment the PR.
   - Step 4 three oracles per point: structure oracle (`preview_snapshot` on `data-testid`/role, never Norwegian-copy text-matching), error-log oracle (`preview_console_logs` + `preview_network` failed-filter both empty), SQL oracle (staging-DB SELECT confirming the write landed) — **0-row trap wording present verbatim**: "tomt resultat der du forventet rader er FEIL, aldri suksess."
   - Step 5 fix-loop cap: "Maks 5 iterasjoner eller 45 minutter — det som inntreffer først," plus assertion-change justification rule ("Endring av test-assertions krever begrunnelse i commit-body").
   - Step 6 green path: comment built in a temp file, posted via `gh pr comment <N> --body-file`, `staging-verified` label added, cleanup scoped to "KUN rader denne kjøringen opprettet" (E2E-prefix + run's own naming), never a broad sweep.
   - Step 7 red path: `needs-manual-qa` label, Norwegian comment with failure state/failing oracle/log lines/what was tried, **exactly one** A/B hypothesis answerable without reading code. Never merges, never silently exits, never discards partial work.
   - All hard rules present up top: never prod (only staging-ref `snwmueecmfqqdurxedxv` named, no prod ref leaked into the skill text), never merge, never Norwegian-copy assertions, never silent exit.

2. **bash-guard merge case** — VERIFIED by direct execution against both fixture payloads (routed through files to avoid the live guard on my own session, which itself proved the deny is substring-triggered and works):
   - `gh pr merge 5 --squash --delete-branch` → `permissionDecision:"deny"`, rule id `squash-merge`, reason text unchanged (rebase-only, audit-trail).
   - `gh pr merge 5 --rebase --delete-branch` → `additionalContext` present, rule id `pr-merge-staging` (from `guard-events.jsonl` trace), text tells the agent exactly what to do: check whether the PR is user-visible, check the `staging-verified` label, run the staging-verify skill if missing (or set `needs-manual-qa` with a comment), and states docs/chore/refactor/test PRs pass freely.
   - Deny-over-remind precedence confirmed structurally: the squash branch is the first matched inner `case` arm; the REMIND is the `*` catch-all, so a squash command can never reach the REMIND arm — no possible double-fire.
   - `emit_ctx` logging confirmed: JSONL line `{"rule":"pr-merge-staging","decision":"remind",...}` written correctly alongside the squash `{"rule":"squash-merge","decision":"deny",...}` line.

3. **`bash tests/hooks/guard.test.sh` green** — 39/0, confirmed above. Note: the harness only asserts decision *type* (deny/ask/context/none) per fixture, not rule id or message text — rule-id/text correctness for this PR's change was verified manually (point 2 above), since the harness itself doesn't check it for any fixture.

4. **`npm run typecheck` / `npm run lint` unchanged green** — confirmed above.

5. **First real run on a feat/fix PR** — **PENDING FIRST USE**, per the contract's own framing ("aktiveringskriterium, ikke PR-kriterium"). Not scored as FAIL.

## Findings

- **No blocking findings.**
- **Fixture regression check:** no pre-existing fixture expected `none` for a plain `gh pr merge` (previously it fell through the case statement with no match → implicit `none`); the new REMIND arm changes that fall-through to `context`, and the new fixture correctly captures the new behavior. No other `gh pr` fixture is affected (squash-deny, pr-create-context ×2 all unchanged and still pass).
- **Diff hygiene:** exactly the 3 files the task named, plus the contract file itself (expected — contracts are committed as part of forge workflow). `+192/-1` total, both commits atomic, both carry `Refs #1076`, both correctly typed `chore` (no version bump / CHANGELOG line needed — internal tooling, not user-visible) and both signed off by the live `.githooks/commit-msg` hook (hooksPath correctly set to `.githooks` in this worktree).
- **Non-blocking, ops-only gap already flagged by the contract itself:** the `staging-verified` and `needs-manual-qa` labels do not exist in the repo yet (`security` does). The contract explicitly defers label creation to an "ops-step ved merge" — this is not a defect in the implementation, just a reminder that whoever merges this PR must run `gh label create staging-verified …` and `gh label create needs-manual-qa …` before the skill's first real invocation, or the `gh pr edit --add-label` calls in Steps 6/7 will fail.
- **No contradiction with CLAUDE.md conventions found:** the skill explicitly forbids Norwegian-copy assertions (matches the Type D e2e rule), never references the prod ref, never invokes merge itself, and correctly routes destructive-adjacent cleanup through an own-testdata-only scope rather than a broad sweep.
- **Milestone 9 sanity-checked:** confirmed via `gh api` to be "Backlog — uplanlagt / scale-triggered" — a sane default for a security issue discovered mid-verification, consistent with CLAUDE.md's milestone-default convention.
