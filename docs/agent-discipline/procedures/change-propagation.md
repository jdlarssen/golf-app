# T2 — Change propagation

**TRIGGER:** about to change the signature OR behavior of anything that can exist in more
than one place: exported functions/types, union/enum members, constants, limits/bounds,
user-visible strings, DB columns, i18n message keys — or you just fixed a bug pattern
(T4 step 7 routes here).

**SKIP IF (either):**
- The symbol is file-local — verified by a Grep that shows hits only inside the file you
  are editing. ("It looks private" does not qualify.) This skip NEVER applies to locale
  files (`messages/*.json` here): there the message KEY is the symbol, and every locale
  plus every call site is a home.
- The change is copy-only — same key/identifier, same placeholders, only the display text
  changes — and the T1 repo-wide grep of the exact string already ran.

## Steps

1. **Enumerate all homes.** Grep for: the symbol name · its string-literal forms
   (serialized names, message keys, test ids) · AND, for limits/bounds, the literal value
   itself — bounded to the layers where rules live (SQL/migrations, authz policies,
   validators, config, UI copy); a bare repo-wide grep for `4` is noise, not diligence.
   Search beyond application source files: SQL, policies, validators, copy, tests, docs.
   Exit condition: the searches ran across all those layers.

2. **Classify every hit** in the notes file: `UPDATE` or `UNAFFECTED (reason)`.
   Exit condition: zero unclassified hits.

3. **Sibling-pattern check** (after fixing a bug pattern). Recipe:
   a. Grep the exact fragment you fixed (function/call name, operator misuse, literal).
   b. List sibling candidates: `ls` the fixed file's directory and every directory
      step (a) hit; collect files sharing the fixed file's naming family (same
      suffix/prefix/role).
   c. For each candidate: does it contain the same pattern? Mark FIXED or
      `UNAFFECTED (reason)`.
   d. Grep each candidate's exported names to find its consumers — a "legacy" module
      with live consumers is exactly how the zero-padding fix missed the module that
      powered the real leaderboard (#666), and how a rollback missed the sibling update
      path (#907).
   Exit condition: candidate list with per-file verdicts in the notes file; the checked
   sites are later named in the PR description.

4. **Union/enum extension:** the compiler is your checklist ONLY if you run it on
   everything. Run the project's full build gate (bindings §T2) — not a type-check
   filtered to the files you touched. Fix every new error. Never label an error
   "pre-existing" without proof: `git stash` → rerun → compare → `git stash pop`.

5. **Multi-layer rules** (DB constraint + validator + authz policy + UI copy): change all
   layers in ONE commit and add or extend a layer-agreement test (project catalog and
   exemplar: bindings §T2). Missing the mirror constraint is how #669 shipped.

6. **Exit:** every site in the step-2 list is updated or justified; full build gate green.

## Output

- Site list with classifications in the notes file.
- Sibling sites checked, named in the eventual PR description.
