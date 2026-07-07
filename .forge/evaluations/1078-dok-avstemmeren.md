# Evaluation: #1078 Dok-avstemmeren

**Verdict: NEEDS WORK**

## Verdict

The docs-only deliverable is factually sound — every checkable number in the generated
schema snapshot was independently re-derived against live prod (and cross-checked against
staging) and matched exactly, digit for digit, table for table. The four CLAUDE.md/
forge-workflow.md claim fixes are true, evidenced, and don't smuggle in any normative
rule change. Both required issues exist, are open, and carry milestones. The two gates
(docs-only diff, vitest green) pass. However, one explicit success criterion is not met:
the contract requires round-history per #1077's convergence rules for this very
forge:auto run, and no `.forge/evaluations/1078-dok-avstemmeren-runder.md` (or equivalent)
exists anywhere in the worktree. The convergence-rules mechanism from #1077 is already
live in `docs/forge-workflow.md` on this branch, so the criterion was actionable — it
was simply skipped. This is a real, fixable gap, not a nitpick: it's one of six explicit
success criteria and the whole point of #1077 is that round-history should exist
mechanically, not optionally.

## Gates

- [x] `git diff --stat origin/main..HEAD` — only `.md` files touched (`.forge/contracts/1078-dok-avstemmeren.md`, `CLAUDE.md`, `docs/forge-workflow.md`, `docs/loops/dok-avstemmeren.md`, `docs/schema-ground-truth.md`). No code/config files.
- [x] `npx vitest run lib/scoring` (Node 22) → **42 test files, 1029 tests, all passed.** Matches the "1029 tester per 2026-07-07" figure the PR wrote into CLAUDE.md exactly — not an approximation.

## Criteria

1. **Protocol doc (`docs/loops/dok-avstemmeren.md`) vs contract criterion 1 — MET.**
   - Canonical query: present, single JSON-returning `pg_catalog` query, syntactically
     plausible (I ran it verbatim against prod — it executes and returns the exact shape
     described: `rls`, `checks_total`, `checks_by_tbl`, `triggers`, `secdef`).
   - Both project refs named: prod `glofubopddkjhymcbaph`, staging `snwmueecmfqqdurxedxv`.
   - Row-count assertions incl. empty-policies-is-failure rule: present ("Kjernetabellene
     … har … `policies > 0`"; "tomt resultat er FEIL" stated twice, once in the loop doc
     header and once in the hard-rules section).
   - Idempotency double-run requirement: present ("kjør spørringen to ganger mot prod —
     byte-identisk JSON").
   - Claims manifest C1–C6: present as a table with påstand/bevis-kommando/sist-verifisert
     columns, all six rows filled with 2026-07-07 dates.
   - Memory step: present (Steg 3, greps the correct memory directory path for drift
     keywords — verified that path exists and does contain "stale/utdatert/drift" hits
     in multiple files, so the step is well-formed and would find real signal).
   - Normative-rules-never-auto rule: present, stated explicitly and forcefully ("Normative
     skal/må-regler endres ALDRI automatisk").
   - Outcome rules + fail-closed: present (max one docs-PR, MCP-down → issue not silent
     green, stated in "Harde rammer" and Steg 4).

2. **Generated schema section — MET, and independently re-verified against live prod.**
   - Markers present: `GENERERT-SEKSJON-START` / `GENERERT-SEKSJON-SLUTT`, both with the
     "ikke rediger for hånd" warning.
   - I re-ran the canonical-style query against prod myself (fresh session, not trusting
     the PR's own numbers) and got: 34 tables, 83 CHECKs, 14 triggers, 43 SECURITY DEFINER
     functions — **exact match** to the doc's stated totals.
   - I hand-summed the doc's own two-column RLS table (34 rows) and its per-table CHECK
     list (23 tables) in a script: RLS table sums to 116 total policies across 34 tables;
     CHECK list sums to 83. I then pulled the live per-table policy counts and per-table
     CHECK counts from prod and diffed them programmatically against the doc's numbers —
     **zero discrepancies**, every single table's policy count and CHECK count in the doc
     matches prod precisely.
   - Live prod also confirms: 0 of the 34 tables have `relrowsecurity = false` (i.e., "alle
     34 har RLS på" is literally true, not just policy-count-implied).
   - SECURITY DEFINER function list: I pulled all 43 names from prod and diffed against
     the doc's list — identical set, including `rls_auto_enable` flagged "(kun prod)".
   - Staging deviation: I queried staging directly — 34/83/14 tables/checks/triggers match
     prod, but `secdef_total = 42` and `rls_auto_enable` is absent (`has_rls_auto_enable:
     null`). This exactly matches the doc's claimed single deviation. Issue #1105 exists
     for it, open, correct milestone.

3. **Claim fixes in CLAUDE.md/forge-workflow.md — MET, factual-only.**
   - Grepped CLAUDE.md: `8 tabeller` is gone (replaced with "34 tabeller … målt 2026-07-07").
     `40 unit-tester` is gone in both locations (Scoring-logikk section and Nøkkelfiler),
     replaced with number-free "assertion-rik unit-suite" language plus a live command
     pointer. `EKSEKVERER aldri SQL` is gone, replaced with a description matching the
     actual current workflow (MCP execution, staging-first, prod-gate via `#1074`/
     `.claude/approve-prod`) — I confirmed this description matches the real prod-firewall
     setup referenced elsewhere in memory (`project_1073_selvkjorende_loops_epic.md`).
   - forge-workflow.md: primary contract-search method is now per-issue comment iteration
     (`gh issue list` → per-N `gh api .../comments`), with the `gh search ... in:comments`
     limitation stated and dated. I independently ran the old `gh search` command — it
     returns `[]`, confirming the fix is justified, not invented.
   - Diffed every CLAUDE.md hunk by hand: all four are factual/descriptive statements
     (table count, test count, SQL-access description, migration-numbering description).
     No "skal"/"må" normative sentence was touched — the "How we work together" clauses,
     branch/PR flow, versioning discipline, test-discipline rules, etc. are all byte-
     identical to origin/main.

4. **Issues #1104 and #1105 — MET.**
   - #1104 "toContain-terskler: tre tall i tre hjem (3/5/10) — trenger eierbeslutning" —
     OPEN, milestone 9 (Backlog), labels `documentation` + `tests`. I independently
     grepped `docs/test-discipline.md` and `.githooks/pre-commit` and confirmed the
     three-numbers-three-homes claim is real (3 in test-discipline prose, 5 in the
     >5-toContain trigger rule, plus the pre-commit hook's own undocumented count logic).
   - #1105 "Staging mangler rls_auto_enable-funksjonen" — OPEN, milestone 9, labels
     `bug` + `security`. Matches my own staging query finding exactly.

5. **Gap hunt.**
   - **Missed criterion:** contract success criterion 6 — "Runde-historikk per
     #1077-konvergensreglene skrives for denne forge:auto-kjøringen (aktiverer #1077)" —
     is unmet. No `.forge/evaluations/1078-dok-avstemmeren-runder.md` file exists. The
     mechanism it refers to (`docs/forge-workflow.md` §Konvergensregler, `.forge/templates/
     eskalering.md`) is present and already merged/available on this branch from #1077's
     earlier work, so this was buildable and simply wasn't done.
   - **Numbers introduced without a maintaining mechanism:** the CLAUDE.md "1029 tester
     per 2026-07-07" and "34 tabeller (målt 2026-07-07 — vedlikeholdes av dok-avstemmeren
     #1078)" claims are dated and self-declare their own maintenance mechanism (the very
     loop this PR creates), which is the intended design — not a gap. This is consistent
     with the contract's stated key decision ("Tall-claims i CLAUDE.md omskrives til
     stabile formuleringer... mindre churn") — the design correctly avoids introducing
     fresh unmaintained precise numbers into CLAUDE.md itself (numbers there are either
     dated/self-referential or number-free), while the actual raw numeric ground truth
     lives in the generated section of schema-ground-truth.md, which explicitly is the
     thing the loop regenerates weekly.
   - No other contract Design items appear undelivered. Out-of-scope items (routine setup,
     rls_auto_enable fix, toContain harmonization, memory auto-update) were correctly
     left undone.

## Findings

- **Blocking:** Success criterion 6 (round-history artifact for this forge:auto run,
  activating #1077) is not satisfied. Fix: append/create
  `.forge/evaluations/1078-dok-avstemmeren-runder.md` with round number, verdict, and
  finding signatures per the format defined in `docs/forge-workflow.md` §Konvergensregler,
  and commit it with `Refs #1078`. This is a same-PR fix, not a new issue — the contract
  explicitly calls for it as part of this delivery.
- No other blocking findings. All numeric claims I re-derived from prod matched the PR's
  numbers exactly; I found zero factual errors in the generated section or the claim
  fixes.
