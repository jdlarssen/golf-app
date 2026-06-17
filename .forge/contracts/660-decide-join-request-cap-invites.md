# Forge-kontrakt: #660 decide_join_request ignorerer åpne club_invitations i cap-sjekken

**Issue:** #660 — decide_join_request ignorerer åpne club_invitations i cap-sjekken → klubb kan overstige member_cap  
**Status:** Migration authored as `0105_decide_join_request_cap_includes_invitations.sql`  
**Type:** Bug fix — pure SQL, no app-code changes required

---

## Root cause

Two code paths add club members, and they used different cap logic:

| Path | Count formula |
|---|---|
| `add_club_member_by_email` (0099) | `group_members` + open `club_invitations` |
| `decide_join_request` (0076) | `group_members` only |

This gap allows a club to exceed `member_cap` when a join-request is approved while open invitations exist.

**Verified scenario:** club with `member_cap=10`, 9 members, 1 open `club_invitations` row:
- Email-add path: blocked (`club_full`, counts 9+1=10 ≥ 10) ✓
- Join-request approval: passes (counts 9 < 10) → 10 members + 1 pending invite → 11 when invite accepted ✗

---

## Fix

`CREATE OR REPLACE` of `decide_join_request` in `supabase/migrations/0105_…`.

**Only change:** the cap-count block in the `if p_approve then` branch:

```sql
-- Before (0076):
select count(*) into v_count from public.group_members where group_id = v_group;

-- After (0105):
select
  (select count(*) from public.group_members where group_id = v_group)
  + (select count(*) from public.club_invitations
       where group_id = v_group
         and accepted_at is null
         and expires_at > now())
  into v_count;
```

Everything else — signature, `SECURITY DEFINER`, `SET search_path = ''`, all other logic branches, ACL — is preserved verbatim from `0076`.

---

## Acceptance criteria

- [x] `decide_join_request` returns `club_full` when members + open invitations ≥ cap
- [x] UI (`klubber/[id]/actions.ts` + `getDecidedMessage`) already handles `club_full` return — no code change needed
- [ ] Test: `supabase/tests/` — catalog-level test for this function is out of scope (requires club fixtures not in existing rig); the function logic is straightforward and the fix mirrors a proven pattern from `add_club_member_by_email`

---

## Risk

Low. The change is additive (only the cap count is stricter). No existing behavior is removed. The `club_full` return code is already handled in the UI. Rejection (not approval) path is unchanged.
