# T8 — Stuck, blocked, or conflicting instructions

**TRIGGER:** 2 failed attempts at the same goal (attempt: defined in I5) · a hook or
permission denial whose remedy the active procedure or the denial text does NOT already
give · missing access, credentials or information · two instructions that conflict · or
you are about to re-run a command/search with arguments identical to a previous run and
no file, environment or data change in between.

**SKIP IF:** never (when the trigger fires).

## Steps

1. **Freeze.** No further edits until this procedure completes.

2. **Write a STATE block** in the notes file:
   - GOAL — one sentence.
   - TRIED — each attempt and its observed result.
   - EVIDENCE — outputs/artifacts collected.
   - ELIMINATED — hypotheses ruled out, with the proof.
   - OPEN — what you still don't know.

3. **Pick exactly one** of:
   a. **Re-diagnose:** back to T4 with a widened frame — read the full call path,
      re-check one thing you marked "obvious" or UNAFFECTED.
   b. **Small experiment:** the cheapest probe that discriminates between the remaining
      OPEN hypotheses; run it; return to this step with the result.
   c. **Ask / assume:** interactive session → present the STATE block and one specific
      question. Autonomous → take the most reasonable interpretation (I6), preferring
      reversible paths — reversible = no DB write, no push, no merge, no deletion —
      and record `ASSUMPTION:`. No reversible path exists → stop; the STATE block is the
      handoff.

4. **Hook or guard denial specifically:** read the denial text — it names the rule and
   the legitimate remedy. Satisfy the rule. Forbidden responses: skip-verify flags,
   force-push, bypass environment variables, rewording a command to dodge the rule,
   deleting or weakening the check (I7). Documented workarounds for known false
   positives (bindings §Enforcement) are legitimate — they satisfy the rule's intent.
   If the hook itself is provably wrong, that is a finding for a separate issue; the
   current task still complies with it.

5. **Instruction conflicts — precedence:**
   1. Hook/guard-enforced rules — not overridable in-session even by user request; the
      owner must act themselves (run it manually, or use the documented approval).
   2. The user's explicit message in this session.
   3. The user's instruction files — global user level and project level (CLAUDE.md /
      AGENTS.md or the host equivalent); where both state the same rule, the file the
      project names as canonical wins on drift.
   4. This package — everything under docs/agent-discipline/, regardless of how it was
      loaded into context.
   5. Platform defaults.
   State which instruction won and why in your reply; never silently pick one.

6. **Never:** attempt #3 unchanged · rewrite-from-scratch on hope · disable or skip a
   failing test to green the suite · widen scope to "fix everything around it" · claim
   partial success as done (T7 governs the wording).

## Output

- The STATE block (it doubles as the handoff if the session ends here).
- Either a new discriminating result, a question to the user, or a recorded assumption.
