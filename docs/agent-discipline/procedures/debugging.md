# T4 — Debugging

**TRIGGER:** bug report, failing test, or output that differs from your written `EXPECT:`
line (I8).

**SKIP IF:** the root cause is already proven in this session — you hold the failing line
plus evidence, not just a theory.

If the `superpowers:systematic-debugging` skill is available, invoke it; this file is the
fallback and the repo overlay on top of it.

## Steps

1. **Reproduce or capture first.** No fix before you either reproduce the failure or hold
   a captured artifact (log line, payload, screenshot) pinned as a fixture. Cannot
   reproduce → add diagnostics (log/print statements, inline debug output) and obtain the
   artifact. Every diagnostic line you add MUST contain the literal tag `DEBUG-T4` — the
   commit sweep (T6 step 3) runs `git diff HEAD | grep DEBUG-T4` to find them.
   Guess-fixing without this step is forbidden by project policy (bindings §T4).

2. **Write down, in the notes file:** SYMPTOM (verbatim) → ONE hypothesis → the
   observation that would falsify it. A hypothesis you cannot falsify is a guess;
   reformulate it.

3. **Probe before editing.** Test the hypothesis with the cheapest discriminating probe
   (targeted log, single test run, one query) BEFORE touching product code. Probes are
   not "attempts" in the I5 sense; product-code edits are.

4. **Walk the environment-cause table** (bindings §T4). Environmental causes mimic logic
   bugs and have each burned hours here. For EACH row, write MATCH / NO-MATCH with a
   one-line reason in the notes file. Exit condition: one line per table row.

5. **Confirmed root cause →** write the failing test that captures it (T5 defines the
   fixture rules), then fix, then green. In that order.

6. **Two hypotheses falsified → widen the frame:** re-read the full call path end to end
   and question one thing you marked "obvious" or UNAFFECTED. This IS re-diagnosis (T8
   step 3a). If the widened third hypothesis also dies — or any fix attempt fails twice
   (I5) — go to T8 and write the STATE block.

7. **After the fix is verified:** run the sibling-pattern check (T2 step 3). The same bug
   shape usually exists in modules the reporter didn't mention.

## Output

- SYMPTOM/HYPOTHESIS/FALSIFIER lines in the notes file (they become the PR narrative).
- The captured artifact checked in as a test fixture where the project's test doctrine
  calls for it.
