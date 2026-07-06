# T1 — Task intake

**TRIGGER:** a new task: user request, issue picked up, or a subtask you defined yourself.

**SKIP IF:** pure question (no file will change) — just answer it. Or: the task already went
through intake earlier in this session and neither scope nor approach changed.

## Steps

1. **Classify.** The task is TRIVIAL only if ALL hold: ≤ 2 files touched · no
   exported-symbol change · no DB/authz/migration work · no logic in a protected domain
   area (the areas: bindings §Domain triggers) · copy/config/comment-level edit.
   Anything else is FULL. When unsure, it is FULL.
   **Reclassification trigger:** the moment the edit set reaches a 3rd file, or any single
   FULL condition becomes true, STOP, declare the task FULL, and run step 3 before the
   next edit.

2. **TRIVIAL path:** Read the target section · Grep the exact string/symbol you are
   changing repo-wide · check bindings §Domain triggers · settle the tracking reference
   commits will need (bindings §T6) · then edit. No notes file is required: the task
   sentence itself is your acceptance criterion — T6/T7 verify that one outcome.
   T2–T7 still fire on their own triggers.

3. **FULL path:**
   a. Write acceptance criteria: 1–3 observable outcomes ("player sees X after Y", "the
      command Z exits 0"). Cannot state them → the task is unclear → I6 (ask, or most
      reasonable interpretation + `ASSUMPTION:`).
   b. Anchoring: check the task against the project's priority anchor (recipe:
      bindings §T1). A direct request from the owner in this session is itself the
      mandate — anchoring applies to backlog items you picked up. Exit condition: the
      task is anchored, or the owner-question / `ASSUMPTION:` line is written.
   c. **Bug report? Branch out:** do 3a and 3e, then go straight to T4 (debugging) — the
      edit list is unknowable before diagnosis. Return to 3d once the root cause is
      proven.
   d. Ground-truth pass: list every file you plan to edit; Read each one, plus one level
      of callers (Grep) for every symbol you will change. Exit condition: no file on the
      edit list is unread.
   e. Write a notes file (location: bindings §T1) containing: acceptance criteria, files
      to change, tests to run, assumptions, tracking reference (bindings §T6).
      Exit condition: the file exists — T6/T7 read it back.
   f. Routing: check bindings §T1 — the project may route work of this size to a
      contract/plan/subagent workflow instead of direct edits. If your own prompt says
      you are a subagent executing a task from a plan or contract, routing is already
      decided: treat the prompt's spec as the acceptance criteria and skip 3b.

4. **Logic-bearing code** (branching, math, dates, sorting, aggregation): before
   implementing, add an edge-case table to the notes file. One line per input class —
   empty / one / many / boundary / duplicate-tie / invalid / concurrent / timezone —
   either `input → expected outcome` or `N/A: <reason>`. Each non-N/A row becomes a test
   (T5). Exit condition: eight lines exist.

5. **Recompute-vs-reuse check** (about to compute a derived result): Grep (a) the
   result's noun in the schema/migrations and generated types — is it already persisted?
   (b) the noun plus `calc|compute|derive|total` in the source tree — does a helper
   exist? Recomputing what was already stored, with the wrong mode, caused #887.
   Exit condition: both greps and their hit counts are in the notes file.

## Output

- Notes file exists (FULL path) with criteria, plan, assumptions, tracking reference.
- Any `ASSUMPTION:` lines repeated in your reply to the user.
