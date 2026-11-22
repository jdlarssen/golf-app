-- 0255: a club join request's timestamps are the server's, not the
-- requester's.
--
-- Owner-ordered audit 20.11. The owner chose «Etter 7 dager»: after a
-- rejection, a withdrawal, a leave or a removal, a person may ask to join the
-- club again no earlier than 7 days later. The app counts the 7 days from
-- group_join_requests.decided_at (lib/clubs/joinRequestCooldown.ts).
--
-- Two holes let a signed-in requester skip the wait with a direct PostgREST
-- request:
--   1. created_at was writable on INSERT and on the self-withdraw UPDATE (the
--      RLS WITH CHECK only pins status; 0107's guard covers decided_at,
--      decided_by_user_id and message), so a backdated row looked old.
--   2. A self-withdraw could not set decided_at (0107 forbids it), so a
--      withdrawn row carried no close time at all.
--
-- For a signed-in requester who is neither a global admin nor a group admin:
--   - INSERT (new trigger): created_at = now(), and no decision columns (the
--     insert policy already pins status = 'pending').
--   - UPDATE (0107's trigger, its existing check unchanged and first): after
--     the check, created_at keeps its old value, and a pending → withdrawn
--     change is stamped decided_at = now(), decided_by_user_id = the requester
--     (the person who closed it, as the app's leave stamp records the actor).
-- Admins, group admins and the service role (the app's reopen and the
-- leave/removal stamp) are untouched, as before.
--
-- Rows withdrawn before this migration keep decided_at null; the app reads
-- that as «nothing to wait for».

create or replace function public.guard_group_join_requests_self_update()
  returns trigger
  language plpgsql
  security definer
  set search_path to ''
as $$
  declare v_uid uuid := auth.uid();
  begin
    if v_uid is null or public.is_admin() or public.is_group_admin(old.group_id) then return new; end if;
    if new.decided_by_user_id is distinct from old.decided_by_user_id
       or new.decided_at is distinct from old.decided_at
       or new.message is distinct from old.message then
      raise exception 'Only your request status may change on self-withdraw (public.group_join_requests)'
        using errcode = 'insufficient_privilege';
    end if;
    -- 0255: the requester's timestamps are the server's.
    new.created_at := old.created_at;
    if old.status = 'pending' and new.status = 'withdrawn' then
      new.decided_at := now();
      new.decided_by_user_id := v_uid;
    end if;
    return new;
  end;
$$;

create or replace function public.guard_group_join_requests_self_insert()
  returns trigger
  language plpgsql
  security definer
  set search_path to ''
as $$
  declare v_uid uuid := auth.uid();
  begin
    if v_uid is null or public.is_admin() or public.is_group_admin(new.group_id) then return new; end if;
    new.created_at := now();
    new.decided_at := null;
    new.decided_by_user_id := null;
    return new;
  end;
$$;

drop trigger if exists guard_group_join_requests_self_insert on public.group_join_requests;
create trigger guard_group_join_requests_self_insert
  before insert on public.group_join_requests
  for each row execute function public.guard_group_join_requests_self_insert();

-- Trigger functions are not callable as RPCs (0137's hardening).
revoke execute on function public.guard_group_join_requests_self_update() from public, anon, authenticated;
revoke execute on function public.guard_group_join_requests_self_insert() from public, anon, authenticated;
