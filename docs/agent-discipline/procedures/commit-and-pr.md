# T6 — Commit and PR

**TRIGGER:** about to commit, or to open or merge a pull request (this repo's commands:
bindings §T6).

**SKIP IF:** never.

## Steps — before every commit

1. `git status` + `git diff --stat`. Any file you don't recognize touching → investigate
   before staging. Exit condition: you can say why each file is in the diff.

2. **Read the full staged diff hunk by hunk.** Each hunk must trace to the task (I4).
   Unrelated hunk → unstage and revert it; file the finding per the project's issue
   conventions instead (bindings §T6). Never smuggle it into this PR.

3. **Sweep session debris.** Mechanical part: `git diff HEAD | grep DEBUG-T4` must return
   zero lines (the T4 sentinel; `HEAD` so staged changes are covered too). Then grep the
   diff for plain log/print leftovers, commented-out code and stray TODOs — remove each,
   or justify it in the commit message.
   Exit condition: sentinel grep returns nothing; every remaining hit justified.

4. **Run the gates for what changed** (definitions: bindings §T2 + §T6): the changed
   files' co-located tests plus the project's full build/type gate. New errors are yours
   until stash-proof says otherwise (T2 step 4).

5. **Commit metadata** (prefix, tracking reference, version bump, changelog) per
   bindings §T6. A metadata hook block means the metadata is wrong — fix the metadata,
   never the hook (I7); the block text names the remedy. One logical focus per commit;
   split mixed work.

## Steps — before PR and before merge

6. Re-read the acceptance criteria (notes file; TRIVIAL path → the task sentence). The PR
   body claims only what T7 verified; deferred or cut scope is stated, not hidden.

7. PR body conventions per bindings §T6 (auto-close forms, epic phrasing, body-file
   quirk).

8. **Before merge:** run the PR-checks command (bindings §T6). Exit condition: every
   required check reports pass — a red OR skipped check is a full stop even where merging
   is mechanically possible. User-visible change (definition: bindings §T7) → the
   pre-merge verification must already have happened, with evidence in the PR or closing
   comment.

9. **Reviewer findings** not fixed in this PR → filed as issues BEFORE merge
   (bindings §T6). A verbal report evaporates with the context window.

## Output

- Commit(s) with clean, single-focus diffs and correct metadata.
- PR body: what changed, what was verified (evidence), what was deferred.
