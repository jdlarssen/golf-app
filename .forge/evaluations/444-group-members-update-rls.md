# Evaluation: #444 — Stram inn group_members UPDATE-RLS (eier-only rolle-endring)

**Verdict: ACCEPT**

Skeptical, independent verification of contract `.forge/contracts/444-group-members-update-rls.md` (K1–K6).
Migration 0078 drops the `group_members` UPDATE RLS policy, forcing all role mutation through the
`set_club_member_role` security-definer RPC and closing the admin→owner privilege-escalation via direct
PostgREST PATCH. All six criteria verified against prod (`glofubopddkjhymcbaph`) with evidence I re-derived
myself — pg_policy introspection, a BEGIN…ROLLBACK attack simulation, RPC/table RLS-flag checks, an
exhaustive grep of every `group_members` access in app/lib, and a DB-wide scan for functions that UPDATE
the table. All three gates re-run green. No defects found after a genuine adversarial hunt.

---

## Gate results

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | **PASS** — exit 0, zero output. |
| `npx vitest run` | **PASS** — **221 files / 2687 tests passed** (matches contract claim exactly). |
| `npm run build` | **PASS** — exit 0, "Compiled successfully", route list rendered (incl. `/klubber/[id]/rolle/[userId]`, `/klubber/[id]/fjern/[userId]`, `/klubber/[id]/forlat`). |

---

## Per-criterion

| # | Status | Evidence (gathered by this evaluator) |
| --- | --- | --- |
| **K1** Migration on disk: `drop policy if exists` + header + `comment on table` | **PASS** | `supabase/migrations/0078_group_members_tighten_update_rls.sql` read in full: L30 `drop policy if exists "group_members update group admin" on public.group_members;`, explanatory header L1-28, `comment on table` L33-37. `git log -- <file>` → commit `9561f53` `chore(db): #444 …` (matches contract). `git diff --stat origin/main...HEAD -- supabase/migrations/` → **only** this file (37 insertions); nothing else snuck in. |
| **K2** Applied to prod; NO `polcmd='w'` row | **PASS** | `list_migrations` last row = `20260606051731 group_members_tighten_update_rls`. `pg_policy` on `public.group_members` returns exactly 3 rows: `a` (insert), `d` (delete), `r` (select). **No `w` (UPDATE) row.** |
| **K3** INSERT/DELETE/SELECT policies unchanged vs 0074 | **PASS** | `pg_get_expr` from prod: insert(a) `with check (is_admin() OR is_group_admin(group_id))` — matches 0074 L107-109. delete(d) `using (is_admin() OR is_group_admin(group_id) OR (user_id = auth.uid()))` — matches 0074 L116-122. select(r) `using (is_admin() OR is_group_member(group_id))` — matches 0074 L103-105. All `to authenticated`. Byte-for-byte identical to the pre-state. |
| **K4** Club-admin (not owner) direct `UPDATE … role='owner'` → DENIED | **PASS** | BEGIN…ROLLBACK txn: member `1f016c6a` temporarily set to `'admin'`, then `set local role authenticated` + jwt.sub = that member. Control checks (isolated txn): `attacker_is_group_admin=true`, `attacker_is_global_admin=false`, `attacker_uid=1f016c6a` → he WOULD have passed the old `is_admin() OR is_group_admin()` policy. The attack `UPDATE … role='owner'` returned `rows_updated_by_attack=0`; post-attack `role_after_attack='admin'` (unchanged). The DROP — not some other condition — is what blocks him. |
| **K5** Owner can STILL change roles via RPC | **PASS** | BEGIN…ROLLBACK, jwt.sub = owner `069cda6e`: `set_club_member_role('32806a13…','1f016c6a…','admin')` → `rpc_result='admin'`. Rolled back (not persisted). |
| **K6** No app regression (all 3 gates) | **PASS** | tsc exit 0; vitest 221/2687 green; build exit 0, compiled successfully. See gate table. |

### RPC bypass / table-RLS sanity (prod introspection)

- `set_club_member_role`: `prosecdef=true`, owner=`postgres`, `rolbypassrls=true` → bypasses RLS unconditionally.
- `group_members`: `rls_enabled=true`, **`force_rls=false`**, owner=`postgres` (bypasses RLS). FORCE RLS is OFF and the secdef RPC runs as the bypassing owner → the RPC keeps working after the policy drop. ✓
- Table comment now reads (verified via `obj_description`): *"Klubb-medlemskap (#49). Rolle-endring (role-kolonnen) kun via set_club_member_role-RPC (#50 …). Bevisst INGEN UPDATE-RLS-policy (#444) …"* — the invariant is pinned in the schema.

---

## Bugs / gaps / risks (genuine adversarial hunt)

I hunted each numbered hole in the brief and found **no blocking defect**. What I checked and confirmed:

1. **Direct `.update()` on `group_members` anywhere in app/lib — none.** Grepped every `group_members` ref
   in `app/` + `lib/` (16 source files). No file contains both `group_members` and `.update(`. Inspecting
   the operation after each `.from('group_members')`: all are `.select()` (reads in
   `getMyClubs`/`getClubDetail`/`getAllClubsForAdmin`/`getClubForAdmin`/`getDiscoverableGames`/`newGameFormData`/
   `admin/games/new`/`signup`/`bli-med`) or `.delete()` (the two below). Zero request-scoped role-UPDATE.
   The builder's claim holds.
2. **RPC truly bypasses RLS after the drop.** Confirmed secdef + postgres-owner + `rolbypassrls=true` +
   `force_rls=false` (above). If FORCE RLS were on this would break — it is not.
3. **Legit DELETE/INSERT flows untouched.** `app/klubber/[id]/forlat/actions.ts:55` and
   `app/klubber/[id]/fjern/[userId]/actions.ts:72` both call `.delete()` → rely on the DELETE policy, which
   is unchanged (K3). INSERT flows (add-member, join-request approval) run through secdef RPCs
   (`add_club_member_by_email`, `decide_join_request`) that bypass RLS, not the INSERT policy — also unaffected.
   Both leave/remove flows still do their own owner-count guard in app code before deleting.
4. **Other DB functions that UPDATE `group_members`.** DB-wide scan of `pg_proc.prosrc ilike '%update%group_members%'`
   / `'%group_members%set %role%'` → **only** `set_club_member_role`. No other secdef/invoker function mutates
   the role column. (`admin_create_club` / `add_club_member_by_email` / `decide_join_request` INSERT, do not
   UPDATE role — correctly absent from the result.)
5. **Global-admin regression.** Admin governs roles via the `set_club_member_role` RPC (caller
   `owner OR is_admin()`, K5-verified path works) and the `/admin/klubber` pages (admin-client). No admin
   app path needs a direct table UPDATE on `group_members`. No ability lost.
6. **Migration safety / idempotency.** `drop policy if exists` is idempotent (re-run safe). The
   `comment on table` overwrite is benign: 0074 set **no** prior table comment on `group_members`
   (grep count 0 in 0074) — only column-level intent existed — so nothing meaningful was overwritten; the
   new comment is purely informative and pins the invariant.

**Conclusion of the hunt:** the change does exactly one thing — removes the over-broad UPDATE policy — and
that one thing is correct, minimal, non-breaking, and faithfully mirrors the 0077 friendships precedent
(SELECT-only RLS + secdef-RPC mutation). The escalation vector is closed (K4) and every legitimate path
(K3 policies, K5 RPC, K6 gates, the DELETE/INSERT app flows) is preserved.

---

## Needs live authed verification (human, optional)

The whole change is Postgres-enforced and proven via SQL above; there is no user-visible behavior change to
click through. Optional residual confirmation in prod (not required for ACCEPT):

- Owner promotes/demotes a member via `/klubber/[id]/rolle/[userId]` and the affected member gets the
  `club_role_changed` notification — unchanged by #444, already verified under #50.
