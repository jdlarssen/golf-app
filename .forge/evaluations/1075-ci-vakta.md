# Evaluation: #1075 CI-vakta — main re-gate + alert + fix protocol

Commits evaluated: a6d66f6b..3e3b8306 (diff base a6d66f6b^)
Contract: `.forge/contracts/1075-ci-vakta.md`

## Verdict

**ACCEPT**

## Gates

| Gate | Result |
|---|---|
| YAML parse (`main-verify.yml`, `schema-drift.yml` via js-yaml) | PASS — both parse cleanly, top-level keys `[name, on, permissions, (concurrency), jobs]` |
| `bash tests/hooks/guard.test.sh` | PASS — 38/38 |
| `npm run typecheck` | PASS — clean, no output |
| `npm run lint` | PASS — 0 errors, 54 pre-existing complexity warnings (unrelated files, warnings don't block per repo convention) |

## Criteria

- **`main-verify.yml` mirrors ci.yml's verify job exactly** — PASS. Side-by-side diff of steps: identical `actions/checkout@v4`, identical `actions/setup-node@v4` (`.nvmrc` + npm cache), identical four steps in identical order (typecheck → test → lint → guard-hooks) with identical step names and `run:` commands. No drift.
- **Trigger config matches spec** (`push: branches: [main]` + `workflow_dispatch`) — PASS.
- **`concurrency` group sane** — PASS. `main-verify-${{ github.ref }}` with `cancel-in-progress: true`, parallel to ci.yml's `ci-${{ github.ref }}` pattern. Since this workflow only fires on push-to-main, `github.ref` is always `refs/heads/main`, so rapid successive merges correctly cancel the superseded run (matches stated intent).
- **`permissions` block present and sufficient** — PASS. `contents: read, issues: write` at workflow level. Verified live against the real repo: `issues: write` is exactly what `gh api repos/.../issues` needs to create an issue with a label and milestone; nothing more (no `contents: write` needed — no pushes/commits happen in either workflow).
- **Dedupe search (`gh issue list --search "in:title \"...\""`) actually matches** — PASS, verified empirically against the live repo (read-only, no writes): tested `in:title "Morgenbriefen: verifisert handlingsliste"` and `in:title "Nattkjøreren: kø-drevet"` against real issue titles containing colons and multi-word phrases — GitHub's search correctly phrase-matches quoted multi-word titles including the colon. The literal query `in:title "CI-vakt: main-verify rød"` returns `[]` today (no such issue exists yet, as expected pre-merge).
- **`milestone=9` via `-F` (number, not string)** — PASS. Confirmed `-F` is `gh api`'s "typed field" flag (per `gh api --help`), sends `9` as a JSON number as the GitHub REST API expects for the `milestone` field. Milestone 9 confirmed live: `"Backlog — uplanlagt / scale-triggered"`, open. Label `bug` confirmed to exist in the repo.
- **`continue-on-error` scoped to the alert step only** — PASS. Appears exactly once per file (main-verify.yml:52, schema-drift.yml:68), attached only to "Open alert issue on failure"; none of the four gate steps carry it.
- **schema-drift.yml alert gated correctly** — PASS. `if: failure() && github.event_name != 'pull_request'`.
- **schema-drift.yml original drift logic untouched** — PASS. `git diff` on the file shows zero deleted lines — purely additive (`permissions` block + new alert step).
- **schema-drift.yml permissions block doesn't under/over-scope** — PASS. The `drift` job only checks out the repo (`contents: read`, unchanged from implicit default) and now needs `issues: write` for the new alert step. No other job in the file to accidentally under-scope.
- **Shell correctness in run blocks** — PASS, empirically tested. Simulated the exact `run:` block locally with a malicious `$SHA` payload (`a1b2c3d4e5f6$(rm -rf /)\`whoami\``) substituted via env var: because `BODY=$(printf '...%s...' "$SHA" "$RUN_URL")` uses a single-quoted format string with `%s`, the value is inserted literally — no command substitution or word-splitting occurs. `$SHA`/`$RUN_URL` are supplied via `env:`, not interpolated into the format string itself. Dedupe branch (`EXISTING -gt 0`) also verified to exit 0 cleanly without creating a duplicate issue when a stub `gh` reports an existing match.
- **docs/loops/ci-vakta.md covers all required protocol points** — PASS. Verified each is present: discover (`## 1. Oppdag`), reproduce-first (`## 2. Reproduser FØR fiks (obligatorisk)`), 3-iteration cap (explicit "Maks 3 iterasjoner"), assertion-change guard (explicit rule requiring commit-body justification), flake-candidate path (explicit, separate issue, not counted as resolved), claude-branch delivery (`## 4. Lever` — distinguishes red main-verify vs red PR-check on claude/-branch vs other branches), never-merge (stated in "Harde rammer" and again in delivery section), escalation with exactly one A/B-answerable hypothesis (`## 5. Eskalér` — "ÉN konkret hypotese formulert slik at eieren kan svare A/B"), schema-drift v1 alert-only + green-skip trap documented (`## 6.` explicitly documents the SUPABASE_ACCESS_TOKEN-absent green-skip trap), never-prod guardrail (explicit, references #1074 firewall applies to cloud clones too).
- **Green run on main after merge (run-URL as evidence)** — PENDING MERGE (cannot be verified pre-merge; file-level checks all hold).
- **`gh workflow view` after merge** — PENDING MERGE.

## Findings

1. **`failure()` vs `cancelled()` gap (as anticipated by the brief).** Neither workflow's alert step fires on a cancelled run — GitHub Actions' `failure()` function returns false for cancelled steps/jobs. Since `main-verify.yml` uses `cancel-in-progress: true`, a run that gets superseded by a newer push is silently cancelled with no alert. This is arguably correct (a cancelled run isn't "red," it was superseded by a fresher check on the same ref), but it's a real, undocumented edge: if the *newer* push's run then also fails, the cancelled *older* run leaves no trace either way — acceptable, not a defect, but worth the owner's awareness. Not blocking.

2. **Dedupe race between two concurrent failing runs is unaddressed** (contract explicitly asked to "note it" — not fix it). If `main-verify` and a hypothetical second red run raced past the `gh issue list --search` check before either created its issue, two duplicate "CI-vakt: main-verify rød" issues could land. Given `main-verify.yml`'s own `cancel-in-progress` concurrency group, this is narrow (only cross-workflow, e.g., a schema-drift red run racing a main-verify red run — different titles, so no collision — or two manual `workflow_dispatch` runs of the same workflow racing, which concurrency also prevents). Practically near-impossible to trigger given the concurrency groups already in place. Not blocking; consistent with contract's "acceptable, note it" framing.

3. **Milestone 9 deleted scenario is unaddressed** (contract asked to "note it," not fix it). If milestone 9 is ever deleted/renumbered, `-F milestone=9` would make the `gh api` call fail outright (422), and since this happens inside the `continue-on-error: true` step, the alert issue silently fails to be created — no fallback to "create without milestone." This matches the contract's fail-open design tradeoff for the alert step in general (an alert failure must never mask the real gate failure) but is worth flagging: a stale milestone number means a silently-swallowed alert, not just a silently-swallowed milestone assignment. Low risk (milestone 9 is a stable, long-lived backlog milestone per project conventions), not blocking.

4. **Everything in the contract's Design section is implemented**; no gaps found in main-verify.yml, schema-drift.yml, or the docs file relative to the spec. Out-of-scope items (auto-types-PR, flake hunter, schema-drift skip-behavior change, routine creation itself) are correctly left undone and are explicitly called out as such in both the contract and docs/loops/ci-vakta.md.

5. Minor stylistic note, not a defect: `docs/loops/ci-vakta.md` correctly leaves routine creation as an ops step ("Routine-oppsett (ops, post-merge)") — consistent with the contract's "Out of Scope" list.
