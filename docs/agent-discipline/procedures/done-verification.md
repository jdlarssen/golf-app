# T7 — Claiming done

**TRIGGER:** about to send any message that reports task status to the user — an
end-of-turn summary, a PR description, an issue-closing comment — in any language
(done/ferdig, fixed/fikset, works/funker, passing/grønt, deployed/ute).

**SKIP IF:** the message reports only intermediate progress and makes no completion or
success claim. If the `superpowers:verification-before-completion` skill is available,
invoke it; this file is the fallback.

## Steps

1. **List the acceptance criteria** (notes file; TRIVIAL path → the task sentence is the
   one criterion). For each: name the command or observation that proves it — then RUN it
   now, in this session. A prediction of what the command would show is not evidence
   (I2). Exit condition: fresh output per criterion.

2. **Compile-green is not done.** A change touching DB, authz, wiring (route files,
   server actions, the module import graph, form↔action bindings), forms, caching or
   i18n is unverified until the affected flow has EXECUTED once end-to-end in the
   project's pre-merge verification environment (bindings §T7). The #641–#648 cluster
   shipped with green types and passing unit tests while two features were broken
   end-to-end in prod.

3. **Watch the console during the flow check.** Framework warnings, missing-translation
   markers and failed network calls count as failures even when the page looks right —
   #1019 rendered fine with a hydration fault (this repo's known signatures:
   bindings §T4). And a flow nobody exercised is where crashes hide: #897 crashed for
   every visitor of a route no check had opened.

4. **Wording rules for the reply:**
   - "Tests pass" must be immediately followed by the command and the pass count.
   - Anything not verified in-session → label it `VERIFICATION GAP:` with what remains
     and how the user can verify it.
   - Assumptions still standing → repeat the `ASSUMPTION:` lines in the final summary.
   - Test failures or skipped steps are reported plainly, with output — never rounded up
     to success.

5. **Re-read the original request once, top to bottom.** Anything asked but not delivered
   and not explicitly deferred → do it now, or list it as not-done. Silence about a
   dropped requirement is a lie of omission.

## Output

- A reply whose every success claim is paired with in-session evidence, and whose gaps
  are labeled `VERIFICATION GAP:` / `ASSUMPTION:`.
