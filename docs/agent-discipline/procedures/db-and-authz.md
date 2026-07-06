# T3 — Database and authorization

**TRIGGER:** touching DB schema, writing or altering a migration, DB-enforced authz
policies, or writing ANY INSERT/UPDATE/DELETE/upsert — including "just adding a column to
a query".

**SKIP IF:** read-only SELECT over columns you already verified this session.

This procedure is the execution checklist over the project's DB-trap catalog (named in
bindings §T3). Open the catalog when a pattern below is unfamiliar — it holds the
incidents and the full how-to-apply.

## Steps

1. **Schema truth.**
   - EXISTING identifiers: before writing any column name, enum literal or constraint
     assumption, introspect the live DB or regenerate types (how: bindings §T3). Never
     from recall (I1); never from a snapshot doc alone — snapshots date. Phantom columns
     that compiled green broke two features end-to-end in prod (#641/#642/#647).
     Exit condition: every existing identifier in your diff appeared in this session's
     introspection output or generated types.
   - NEW identifiers (a column/table you are adding): the migration file you wrote this
     session is the ground truth. After applying it to the pre-production DB, introspect
     THERE to confirm the shape before writing app code against it (how to get types for
     a not-yet-in-prod schema: bindings §T3).

2. **Every mutation:** positively assert the affected row count — a mutation that matches
   nothing must fail loudly, not return success (mechanism: bindings §T3). A 0-row update
   with no error made a game unfinishable (#704). **Every read:** check the error channel
   before applying a default — a defaulted error silently becomes "no data" (#877).

3. **Authz at the enforcement layer.** For each new or changed write path, name the
   enforcement point at the layer a direct client request cannot bypass (which layer that
   is here, and how to express column-level rules: bindings §T3). App-layer checks alone
   let players self-approve scorecards (#670). Then attack it: run the hostile
   direct-request test (rig and its skip-trap: bindings §T3).
   Exit condition: enforcement point named per write path; hostile test run — or written,
   with a `VERIFICATION GAP:` note explaining why it could not run.

4. **Multi-step create/edit** (2+ dependent writes): a single transaction, or a
   compensating delete whose delete-permission you VERIFIED the actor actually holds — a
   compensating delete the actor cannot execute leaves the orphan. Add a chaos test:
   force a middle step to fail, assert atomic outcome + localized error. The route gets
   the project's error-boundary artifact so users never see a raw 500 (what that is:
   bindings §T3).

5. **Migrations:** check numbering/ordering against the main branch, not just yours.
   Apply to the pre-production environment first, verify behavior there, THEN production
   via the approved path (bindings §T3 — prod firewall). The firewall is I7 territory:
   never work around it.

6. **Caching:** if mutated data is read through a cached helper, every mutation path must
   invalidate the cache tag. A new cached read needs a tag plus an enumeration of its
   mutation paths — a tagless "quasi-static" cache hid new data for a week (#1045).

## Output

- Introspection evidence (what you checked, where) in the notes file.
- Enforcement point per write path; chaos-test location for multi-step flows.
