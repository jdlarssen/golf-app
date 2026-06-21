# Evaluation: #737 Atomic creation — chaos-injection sweep

VERDICT: ACCEPT

Evaluated against `.forge/contracts/737-atomic-creation-chaos-sweep.md` on 2026-06-22.
Commits `8feecbc7`, `9fee980e`, `4039a5a9`, `e7d61f34` on top of `6679e43e`.

## Success-criteria table

| # | Criterion | Met? | Evidence |
|---|-----------|------|----------|
| 1 | `createCourse` = single atomic SECURITY DEFINER RPC; child-insert failure leaves 0 orphan courses | YES | `actions.ts:76-83` calls `supabase.rpc('create_course_with_layout', {p_name, p_holes, p_tees})`, no direct insert; `0113_create_course_with_layout.sql:25-84` runs courses+holes+tees in one plpgsql block (txn). Chaos test `actions.test.ts` "rolls back cleanly…" asserts RPC failure → `?error=db_course` + no insert leaked. |
| 2 | `createGameInternal` rolls back games row on game_players failure + redirects `db_players` | YES | `app/[locale]/admin/games/new/actions.ts:244` `await supabase.from('games').delete().eq('id', game!.id)` inside `if (gpError)`, then redirect `?error=db_players`. Targets the `.select('id').single()` insert id, same request client, cannot fire on success path. |
| 3 | Chaos tests for all 5 paths, each asserting (a) rollback/atomic-fail + (b) localized error | YES | game (`games/new/actions.test.ts` new describe), course (`courses/new/actions.test.ts` new "rolls back cleanly"), cup (`cup/[id]/generer/actions.test.ts:364` PRE-EXISTING from #675 `25a791e8`), liga-draft + liga-flight (`lib/league/actions.test.ts` 2 new describes). 43 tests pass across the 4 files. |
| 4 | No tested failure mode leaves an orphan parent | YES | Each compensating test asserts `delete` on parent table targeting the inserted id (game `['id','g-orphan']`, leagues `['id','L2']`, flight games `['id','g1']`, cup `games.delete` issued); course test asserts no insert path exists (atomic RPC). |
| 5 | Course RPC verified vs live schema; migration applied to staging | YES | Live prod schema (MCP) matches RPC column lists exactly: course_holes(course_id,hole_number,par_mens,par_ladies,par_juniors,stroke_index) all NOT NULL int, composite PK no surrogate id; tee_boxes course_rating_* numeric, id/archived_at omitted; courses.created_by forced to auth.uid(). Migration registered in prod history as `20260621223920 create_course_with_layout` — applied to BOTH staging and prod. |
| 6 | `docs/bug-prevention.md` trap #5 updated | YES | Diff adds DELETE-RLS-asymmetry rule, RPC-where-no-DELETE rule, chaos-test requirement; "Enforced" line updated with #737. |

## Gate results

- `npx tsc --noEmit` → **PASS** (`TSC_EXIT=0`).
- `npx vitest run` on the 4 files → **PASS** — `Test Files 4 passed (4) / Tests 43 passed (43)`.
- `npx eslint` on the 5 changed .ts files → **PASS** (`ESLINT_EXIT=0`, no output).
- Migration `0113` applied to staging + prod (registered in migration history).
- `lib/database.types.ts` regenerated — `create_course_with_layout: { Args: {p_holes,p_name,p_tees}; Returns: string }` present.

## RPC correctness (criterion b, deep dive)

- Column lists match live schema to the digit (verified via MCP `information_schema.columns`). ParsedHole/ParsedTeeBox map cleanly; ParsedTeeBox.id is correctly ignored (jsonb_to_recordset reads only named columns).
- `created_by` forced to `auth.uid()` inside body; raises `not_authenticated` when null. ✓
- `security definer`, `set search_path = public` pinned (verified live: `prosecdef=true`, `proconfig={search_path=public}`). ✓
- `create or replace function` → idempotent re-run safe. ✓
- Admin path NOT broken: `createCourse` has no admin/non-admin branch; the RPC's `created_by = auth.uid()` covers both admins and regular users identically.

## Findings

### LOW — `updateCourse` follow-up issue not filed (process gap, not code)
Contract Out-of-Scope says updateCourse partial-rewrite atomicity "files som oppfølgings-issue."
No such issue exists (`gh issue list` returns only #737 itself). The deferral is **technically
justified** — `app/[locale]/admin/courses/[id]/edit/actions.ts:91-103` is delete-and-reinsert on
an already-existing parent (partial-rewrite bug class: holes deleted then reinsert fails → course
with zero holes), genuinely distinct from orphan-creation. The classification is correct; only the
promised issue is missing. Recommend filing it post-merge. Non-blocking.

### INFO — `anon`/`service_role` retain EXECUTE on the RPC despite migration REVOKE
Live grants are `{authenticated, anon, service_role, postgres}`; the migration does
`revoke all from public; grant execute to authenticated`. The extra roles come from Supabase's
`ALTER DEFAULT PRIVILEGES`, not the migration. This is NOT a hole: the function body self-guards
(`if v_uid is null then raise exception 'not_authenticated'`), so an anon caller (auth.uid()=null)
inserts nothing — authz lives in the body per trap #3, not the grant. Acceptable; matches every
other SECURITY DEFINER RPC in the project.

### INFO — Three course error codes (db_course/db_holes/db_tees) collapsed to db_course
Acceptable: all three map to the **identical** user message in both no.json and en.json
(lines 2429-2431, 2436-2438, 3134-3136). No user-visible change. The page still has all three keys
defined, so nothing breaks.

## Adversarial checks that PASSED (no defect found)

- Chaos tests are NOT tautological: each would fail if the action stopped issuing the compensating
  delete or stopped bouncing to a localized error. The course test overrides `supabaseMock.rpc` to
  fail while still recording into `__rpcCalls`, so its "RPC was attempted" assertion is real.
- `game!.id` rollback targets the just-inserted row from `.select('id').single()`, uses the request
  client (creator has DELETE-RLS 0071), cannot fire on the success path.
- No other multi-step parent→child creation path was missed: signup/inviteToGame paths are
  single-row inserts (no parent→child orphan risk); their `.delete()` calls are race-guards /
  invitation rollbacks already in place.
- Migration is well-formed and idempotent; safe on a live prod app.

## Conclusion

All six success criteria met with concrete evidence. All gates green. RPC matches live schema,
is deployed to prod, self-enforces authz. Rollbacks are real and tested non-tautologically.
The single shortfall (unfiled updateCourse follow-up issue) is a process loose-end on
deliberately-out-of-scope work, not a defect in the delivered change.

VERDICT: ACCEPT
