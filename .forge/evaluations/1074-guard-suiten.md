# Evaluation: 1074-guard-suiten (Round 2)

**Commits evaluated:** e9ffd595..e624bb2a (diff base 83216a9d)
**Evaluator:** fresh-context skeptical review, round 2. All gates and criteria re-run independently; both round-1 findings re-reproduced from scratch against the live hook scripts before trusting the fix commit's message.

## Verdict

**ACCEPT**

## Round 1 findings — verification

### Finding 1 (Medium): `create_project` silently bypassed the firewall

**Status: FIXED, verified.**

Re-reproduced the original bug shape directly: fed the fixture's ref-less `create_project` payload (`{"name":"nytt-prosjekt","organization_id":"org-abc","region":"eu-north-1"}` — no `project_id`, no prod ref anywhere) through `.claude/hooks/mcp-guard.sh` via `jq -c ... | bash .claude/hooks/mcp-guard.sh`. Result: `deny`, with reason text explicitly naming `create_project` as unclassifiable-by-ref and therefore always denied. Confirmed the same with a hand-built payload that also had zero ref surface.

Read the fix in `mcp-guard.sh:73-78`: `create_project` now sits in the same `case "$short" in merge_branch|create_project)` always-deny block as `merge_branch`, evaluated *before* the `PROD_REF` grep gate — exactly the pre-filter treatment the contract's Design section says was missing. Confirmed adjacent tools weren't over- or under-scoped:
- `pause_project` / `restore_project` (prod ref in args) → still deny via the ref-gate, independently verified.
- `delete_branch`, `reset_branch`, `rebase_branch` on a dev-branch (no prod ref) → still pass through empty (sanctioned dev flow), independently verified — the always-deny class was not over-applied to branch-lifecycle tools.
- New fixtures exist for `create_project`, `pause_project`, `restore_project`, and `delete_branch` pass-through in `tests/hooks/fixtures/mcp.json` (previously absent, as round 1 noted) — all 4 pass in the harness run.

### Finding 2 (Medium): log prefix could leak secrets within the 80-char window

**Status: FIXED, verified, one narrow residual gap noted (non-blocking).**

Ran the actual fixture payloads end-to-end and inspected the resulting log line:
- `psql "postgresql://postgres:hemmeligpw123@db.glofubopddkjhymcbaph.supabase.co:5432/postgres"` → log line contains `"prefix":"psql \"postgresql://***@db.glofubopddkjhymcbaph.supabase.co:5432/postgres\" ..."` — password fully scrubbed.
- `curl -X POST -H "apikey: eyJhemmeligkey456" ...` → log line contains `"prefix":"curl -X POST -H \"apikey: ***\" ..."` — key fully scrubbed.

Reasoned through the sed chain in `bash-guard.sh:41-45` rather than mutating it (per the safety constraint): three `-e` expressions, applied to `$cmd` before the `%.80s` truncation — (1) strip URL userinfo `://user:pw@` → `://***@`, (2) strip values following `apikey|authorization|password|token` (all case variants) up to the next whitespace/quote, (3) strip `eyJ...`-shaped JWTs. Confirmed this is not vacuous: without the sed chain, `prefix` would just be `printf '%.80s' "$cmd"`, and both fixture secrets (`hemmeligpw123` at ~char 28, `eyJhemmeligkey456` at ~char 15) sit well inside the 80-char window — so the harness's `grep -q "hemmeligpw123\|hemmeligkey456"` failure-detection in `guard.test.sh:99-105` would genuinely catch a regression here, it isn't testing something that can't fail.

**Residual gap found (not a regression, narrower than round-1's finding):** the `authorization` rule redacts one token after the `:`/`=`, so `Authorization: Bearer <secret>` only scrubs the literal word "Bearer", leaving a bare opaque bearer token exposed if it doesn't happen to also match the `eyJ` pattern. Constructed and confirmed: `Authorization: Bearer ghp_1234567890abcdef` → logs as `Authorization: *** ghp_1234567890abcdef` (token intact). However, for this specific firewall's actual threat model — Supabase JWTs (anon/service-role keys), which are exactly what a prod curl/psql command would carry, and which all start with `eyJ` — the separate JWT rule independently scrubs the value regardless of the Bearer-word miss: confirmed `Authorization: Bearer eyJhbGciOiJIUzI1NiJ9....` redacts to `Authorization: *** ***`, fully clean. The gap only bites for a non-JWT opaque bearer token, which isn't a credential shape this rule's stated purpose (Supabase connstring/API secrets) needs to protect. No fixture exercises the `Authorization: Bearer` two-word shape either way. Judged too narrow and off-target for this contract's scope to block acceptance — flagged as a candidate for a tiny follow-up, not a defect in the delivered fix.

## Gates

| Gate | Result | Evidence |
|---|---|---|
| `bash tests/hooks/guard.test.sh` | PASS | 38 bestått, 0 feilet (17 bash fixtures + 18 mcp fixtures + log-exists + secret-redaction proof + non-blocking proof) |
| `npm run typecheck` (Node 22) | PASS | `tsc --noEmit` exit clean, no output |
| `npm run lint` | PASS | 0 errors, 52 warnings — all pre-existing complexity/max-depth warnings in unrelated app files (`lib/cup`, `lib/league`, `lib/scoring/sideTournament.ts`, etc.), none touching hook or test files |
| `npx vitest run tests/smoke.test.ts` | PASS | 1 passed (1), 718ms |

All four gates independently re-run in this round, not trusted from the prior report.

## Criteria

1. **`bash tests/hooks/guard.test.sh` green: 100% DENY on prod-write fixtures, 0 false DENY on legit fixtures** — **PASS**. 38/38, including the 4 new fixtures added in the fix commit (create_project, pause_project, restore_project, delete_branch pass-through).

2. **Regression fixtures for defect (a)/(b) pass** — **PASS**. Unchanged from round 1 (not touched by the fix commit); re-ran and confirmed still green — multi-line quoted commit body, `cd x && gh pr create`, real `--no-verify`, `gh pr merge --squash` all resolve correctly.

3. **Test run produces JSONL lines; read-only log dir doesn't change decision** — **PASS**. Harness reports 26 valid JSONL lines this run; independently replayed the `apply_migration mot prod` fixture against a `chmod 555` log dir and confirmed `deny` is unchanged.

4. **`.claude/settings.json` has MCP-matcher entry; `jq .` validates** — **PASS**. `jq . .claude/settings.json` succeeds; matcher regex unchanged from round 1 (already verified against UUID-style and named server segments).

5. **`.gitignore` covers `.claude/logs/` and `.claude/approve-prod`; `git status` clean after test run** — **PASS**. `git check-ignore -v` confirms both paths (`.gitignore:51`, `:52`). Working tree clean aside from this evaluation file (untracked, expected).

6. **CI step exists in ci.yml and is green on the PR** — **PENDING PUSH**. Step present in `.github/workflows/ci.yml`, correctly placed in `verify` job immediately after Lint, pure bash+jq with no network dependency. Branch still not pushed / no PR open as of this evaluation — cannot observe an actual CI run. Not counted as a failure since the equivalent local command is proven green and nothing in this round's diff touches CI wiring.

## Findings

1. **(Low, non-blocking, candidate follow-up)** `bash-guard.sh`'s redaction regex for `authorization`/`token`/`password`/`apikey` values only scrubs a single whitespace-delimited token after the `:`/`=`. For the two-word `Authorization: Bearer <token>` idiom, this leaves a bare opaque bearer token exposed if it isn't also JWT-shaped (Supabase anon/service-role keys are `eyJ...` JWTs and get caught by the separate rule regardless, so the realistic case for this specific firewall is unaffected). No fixture exercises this shape in either direction. Worth a one-line regex tweak (extend the value-consuming pattern to also skip a leading `Bearer `/`Bearer:` word) in a future small PR if this hook is ever extended to guard non-Supabase HTTP APIs, but it does not undercut this contract's actual threat model (prod Supabase secrets) and isn't a regression introduced by the fix commit.

2. **(Low, process)** CI greenness on the PR remains unverifiable pre-push, per Criterion 6. Not a code defect.

## Summary

Both round-1 findings are genuinely fixed, not just claimed-fixed: `create_project` now sits in the always-deny pre-filter class alongside `merge_branch` and denies unconditionally even with a payload carrying zero project references (reproduced directly against the hook script); the bash-guard log prefix now redacts URL userinfo, apikey/authorization/password/token values, and JWT-shaped strings before the 80-char truncation, and the harness's "secrets never reach the log" assertion is provably non-vacuous (the fixture secrets sit well inside the truncation window and would leak without the sed chain). The sed chain uses only portable POSIX ERE constructs (`-E`, character classes, alternation, backreferences) with no GNU-only extensions (`/I`, `-z`, `\+`/`\|` BRE escapes), confirmed to run correctly on this machine's BSD sed and expected to behave identically under CI's GNU sed. Swept the full diff for new gaps from the fixes: the always-deny class was not over-applied to `create_branch`/`reset_branch`/`rebase_branch`/`delete_branch` (all still correctly gated only on prod-ref presence, preserving the sanctioned dev-branch flow), and no fixture expectations were weakened. One narrow, non-blocking residual redaction gap was found (bare non-JWT bearer tokens) but it falls outside this firewall's actual threat model and both prior findings' concrete failure modes are closed. All four Gates and five of six Success Criteria pass with direct evidence; Criterion 6 is correctly PENDING PUSH, not failed.
