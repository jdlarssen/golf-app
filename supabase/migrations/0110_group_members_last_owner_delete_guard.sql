-- 0110_group_members_last_owner_delete_guard.sql
--
-- Security hardening (#799): the "at least one owner" club invariant is enforced
-- only in app code (removeMember / leaveClub TS guards), not at the database level.
-- The RLS policy "group_members delete admin or self" lets the sole owner DELETE
-- their own membership row via a direct PostgREST request, bypassing all TS guards
-- and leaving the club with 0 owners (orphaned).
--
-- Without any owner, role changes become impossible (set_club_member_role requires
-- an owner-caller or global admin) and ownership transfer is locked to global-admin
-- intervention.
--
-- Fix: a BEFORE DELETE trigger on group_members that raises P0001 'last_owner' if
-- the row being deleted is the last role='owner' in that group_id. Mirrors the
-- existing last_owner guard in set_club_member_role (migration 0076).
--
-- Bypasses:
--   • auth.uid() IS NULL (service-role / internal admin client) → no-op
--   • public.is_admin() → no-op (global admin can forcibly dissolve a club)
--
-- Note: the trigger runs BEFORE DELETE so it can still raise and abort the
-- statement before the row is gone. The subquery counts the *remaining* owners
-- by using `old.group_id` and `old.user_id`, which are still accessible via OLD.
-- It counts all owners in the group INCLUDING the row being deleted, then checks
-- if that count equals 1 (meaning this row IS the last owner).

create or replace function public.guard_group_members_last_owner_delete()
  returns trigger
  language plpgsql
  security definer
  set search_path to ''
as $$
  declare
    v_owner_count int;
  begin
    -- Service-role and global admin may dissolve clubs (no constraint).
    if auth.uid() is null or public.is_admin() then
      return old;
    end if;

    -- Only relevant if the row being deleted is an owner row.
    if old.role = 'owner' then
      select count(*) into v_owner_count
        from public.group_members
       where group_id = old.group_id
         and role = 'owner';

      -- v_owner_count counts the row BEFORE deletion (trigger is BEFORE DELETE).
      -- If there is exactly one owner and it is the row being deleted, block it.
      if v_owner_count <= 1 then
        raise exception 'last_owner'
          using
            errcode = 'P0001',
            detail  = 'A club must have at least one owner. Transfer ownership before leaving or removing yourself.',
            hint    = 'Use set_club_member_role to promote another member to owner first.';
      end if;
    end if;

    return old;
  end;
$$;

drop trigger if exists guard_group_members_last_owner_delete on public.group_members;
create trigger guard_group_members_last_owner_delete
  before delete on public.group_members
  for each row execute function public.guard_group_members_last_owner_delete();
