# VERDICT: ACCEPT

Evaluation of #846 — `updateCourse` atomic edit + trusted-creator ownership scoping.
Commits `5665bd24`, `736d4cfe` on base `043b212f`. Verified independently against the
**live PROD schema** (`glofubopddkjhymcbaph`), not the types file.

---

## Success-criteria table

| # | Criterion | Met? | Evidence |
|---|-----------|------|----------|
| 1 | All writes (course rename + holes replace + tee ops) in ONE atomic txn; mid-failure leaves course unchanged | ✅ | `0114_update_course_with_layout.sql` is a single `begin…end` plpgsql block, no `EXCEPTION` clause → no subtransaction → any error rolls back the whole edit including the holes DELETE. PROD has UNIQUE `(course_id, stroke_index)` + PK `(course_id, hole_number)` whose violation aborts the holes INSERT and rolls back. Contract claims a staging smoke-test (inject mid-txn failure → holes/name unchanged) — code body supports it. |
| 2 | Calls RPC instead of sequential writes; `writeClient` split (admin=request, trusted=service-role) preserved | ✅ | `actions.ts:103` single `writeClient.rpc('update_course_with_layout', {...})`; all per-table UPDATE/DELETE/INSERT removed. `writeClient = role.isAdmin ? supabase : getAdminClient()` (`:90`). Test "trusted edit… atomic RPC routed via admin-client" asserts RPC lands on `adminClientMock`, none on request client (`actions.test.ts:629`). |
| 3 | Non-admin editing a course they don't own → `?error=not_owned`, no write; applies to BOTH `updateCourse` and `restoreTee`; admin unaffected | ✅ | `updateCourse` ownership guard `:28-37`; `restoreTee` guard `:148-157`. Both gated on `!role.isAdmin`. Tests: `actions.test.ts:641` (updateCourse not_owned, no RPC) + `:365` (restoreTee not_owned, no write on either client). Admin path skips the guard entirely. |
| 4 | Chaos-injection: RPC failure → localized error, no partial write leaks; existing tests updated to RPC path | ✅ | `actions.test.ts:320` forces RPC to return `{error}`; asserts 0 per-table writes + redirect `error=db_course`. Regression test `:264` rewritten to assert the parsed tee reaches `p_tee_inserts`. 18/18 tests green. |
| 5 | RPC verified vs live schema; applied staging + prod; `database.types.ts` regenerated | ✅ | PROD: function present, `is_definer=false`, `search_path=public`, all 8 jsonb args, owner postgres. Migration recorded `20260622053958 update_course_with_layout` (newest applied). Column shapes match live (composite PK no surrogate id; `course_rating_*` numeric; pars integer). `database.types.ts:1745` has `update_course_with_layout` Args + `Returns: undefined`. |

---

## Gate results (actual tails)

```
Node v22.23.0
$ npx tsc --noEmit
TSC_EXIT=0                      # clean, no output

$ npx vitest run "app/[locale]/admin/courses/[id]/edit/actions.test.ts"
 Test Files  1 passed (1)
      Tests  18 passed (18)

$ npx vitest run messages       # catalog parity
 Test Files  2 passed (2)
      Tests  4 passed (4)

$ npx eslint app/[locale]/admin/courses/[id]/edit/actions.ts actions.test.ts
ESLINT_EXIT=0                   # clean
```

All five contract gates pass.

---

## RPC correctness vs live schema (criterion b)

- **holes recordset** `(hole_number int, par_mens int, par_ladies int, par_juniors int, stroke_index int)` — matches PROD `course_holes` (all integer, composite PK, **no surrogate id** — RPC correctly inserts via the natural columns, not an id). ✅
- **tee_updates / tee_inserts recordsets** — `course_rating_mens/ladies/juniors numeric`, all slope/par/length `int`, `id uuid` — matches PROD `tee_boxes`. ✅
- **tee UPDATE…FROM** guards `where t.id = u.id and t.course_id = p_course_id` (`0114:89`) — cross-course id rejected. Hard-delete and archive both also guard `course_id = p_course_id` (`:119`, `:128`). ✅
- **hard-delete / archive as jsonb, not uuid[]** — `jsonb_array_elements_text(coalesce(p_tee_hard_delete, '[]'::jsonb))` (`:122`, `:131`). Coalesce means a null/absent param is the empty list (no-op), never a null-array error. The implementer chose jsonb over uuid[] (deviation from the contract sketch's `uuid[]`) to dodge supabase-js uuid[]-coercion ambiguity — a sound, documented choice; types-file matches (`p_tee_hard_delete: Json`). ✅
- **security invoker + pinned search_path** — confirmed on PROD (`is_definer=false`, `config=[search_path=public]`). ✅
- **function type present in `lib/database.types.ts`** — yes (`:1745`). ✅

---

## SECURITY section (the crux — highest stakes)

**Question: can a non-admin, non-trusted authenticated user call `update_course_with_layout`
directly via PostgREST (their own JWT) and mutate ANY course?** No.

Live PROD write-RLS on all three tables (verified via `pg_policies`):

| Table | UPDATE | DELETE | INSERT |
|-------|--------|--------|--------|
| courses | `is_admin()` ({public}) | `is_admin()` | admin OR `created_by = auth.uid()` (authenticated) |
| course_holes | `is_admin()` | `is_admin()` | admin OR `EXISTS(course where c.created_by = auth.uid())` |
| tee_boxes | `is_admin()` | `is_admin()` | admin OR `EXISTS(course where c.created_by = auth.uid())` |

Because the function is **SECURITY INVOKER** (confirmed `is_definer=false` on prod), every
statement executes under the caller's RLS:

1. **Non-admin, non-owner, direct RPC call:** the courses-rename UPDATE matches 0 rows
   (admin-only), the holes DELETE matches 0 rows (admin-only), the holes INSERT is rejected
   by the own-course WITH CHECK (not their `created_by`), every tee UPDATE/DELETE matches 0
   rows. Net effect: **zero writes anywhere.** No cross-course mutation is possible. (A 0-row
   no-op write is not "success that corrupts" here — there is no partial state because nothing
   lands.)
2. **Non-admin *owner*, direct RPC call (bypassing the TS gate):** the holes DELETE is still
   admin-only → 0 rows, but the holes INSERT *would* succeed under `authenticated insert own`.
   So a course owner could re-insert holes on **their own** course via raw RPC. This is not an
   escalation: they can already write their own course's holes through the legitimate create/
   edit flow, and they cannot touch any course they don't own. The course-rename UPDATE and all
   tee ops silently no-op for them (admin-only). Bounded to self-owned data → not a hole.
3. **Confirming DEFINER is NOT in play:** if the function were definer-as-postgres it would
   bypass RLS and any authenticated user could rewrite any course — the contract's whole
   rationale. PROD confirms `is_definer=false`, so this danger does not exist.
4. **Trusted-creator path:** writes go through `getAdminClient()` (service-role, server-only;
   key never reaches the client) and are gated by the TS ownership check
   (`owned.created_by !== role.userId → fail('not_owned')`). Defense-in-depth: even if the TS
   gate were skipped, a non-admin's own JWT can't reach the admin-only UPDATE/DELETE policies.
5. **No is_admin() self-grant:** the `guard_users_self_update` trigger (0107) is live on PROD,
   blocking a user from self-PATCHing `users.is_admin` — so the INVOKER model can't be defeated
   by escalating to admin first.

**Conclusion: the SECURITY INVOKER + app-layer ownership-check model has no exploitable hole.**
RLS is the real authz boundary for direct JWT calls (admin-only writes block non-admins), and
the trusted path is service-role + TS-gated + ownership-checked exactly as before this change.
This is strictly safer than #737's DEFINER approach would have been here, because "trusted
creator" has no DB representation to self-authz.

---

## Ownership-check correctness (criterion d)

- Fires only for `!role.isAdmin` in both `updateCourse` (`:28`) and `restoreTee` (`:148`) →
  admin unaffected. ✅
- Reads `courses.created_by` via the **request client** (RLS-scoped) and rejects on
  `!owned || owned.created_by !== role.userId` — missing-course is treated as not_owned
  (defense-in-depth). The SELECT policy on courses is world-readable (`true`), so the request
  client genuinely reads `created_by`; even if it returned null, the null branch fails safe. ✅
- In `updateCourse` the guard sits **before `parseCourseHolesAndTees`** (`:39`), so an
  unauthorized caller gets `not_owned` regardless of form validity. Test `:641` confirms
  not_owned with no RPC and no parse-dependent error. ✅
- In `restoreTee` the guard sits after the existing tee-belongs-to-course load (`:136-143`) and
  before the writes (`:163`) — consistent placement. ✅

---

## Behavior preservation (criterion f)

- The tee diff (existing-tees read → games-FK lookup → split into `toHardDelete` vs `toArchive`)
  **stays in TS** (`actions.ts:48-84`) unchanged; passed to RPC as `p_tee_hard_delete` /
  `p_tee_archive`, with `p_tee_updates = teeBoxes.filter(t => t.id)` and
  `p_tee_inserts = teeBoxes.filter(t => !t.id)` (`:111-114`). ✅
- `writeClient` split now also applies to the `.rpc()` call (`:103`). ✅
- Error-code collapse to `db_course` is acceptable: `db_course`/`db_holes`/`db_tees` are
  byte-identical user copy in no.json (`:3135-3137`) and en.json. ✅

---

## Gaps a skeptic would catch (criterion g)

- `restoreTee` ownership check is consistent with `updateCourse` (same pattern, same client,
  same missing-row=not_owned). ✅
- `not_owned` edit message is edit-appropriate ("Du kan bare redigere baner du har laget selv."
  / "You can only edit courses you created yourself.") and distinct from the two delete-namespace
  not_owned strings. Nested correctly under `admin.courses.edit.errors` (no.json:3134). ✅
- Catalog parity intact (messages test 4/4 green). ✅
- No other multi-step EDIT path left non-atomic in this file: `deleteCourse` uses a single
  cascade DELETE (out of scope, already atomic + already ownership-guarded). ✅

---

## Risks / observations (none blocking)

- **(INFO) restoreTee remains two sequential writes** (tee UPDATE then courses audit UPDATE),
  not wrapped in a transaction. This is acceptable and out of scope: a failure of the second
  write leaves only an audit-field un-bumped (the tee is still correctly restored) — no
  user-visible corruption, no 0-holes-class hazard. The contract scoped atomicity to
  `updateCourse`. Worth noting, not worth fixing here.
- **(INFO) Owner-self-RPC re-insert of own holes** (security point #2) is a theoretical raw-RPC
  path bounded to self-owned data; harmless. Documented for completeness.
- **(INFO) TOCTOU** between the TS diff reads and the RPC is unchanged from before and explicitly
  out of scope per the contract.

No NEEDS-WORK items. Migration verified applied to PROD; types regenerated; all gates green;
security model sound.
