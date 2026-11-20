-- 0248_club_roles_and_terms_guard.sql
-- Club roles and agreement terms get one home: the database.
--
-- The rules (owner decision, audit 2026-11-20):
--   1. Only a club owner (or a global admin) gives or removes the owner role.
--   2. A club's agreement terms (member_cap, valid_until) are set by a global
--      admin only. The club's identity columns are fixed.
--   3. A league or a cup keeps its club: a club that still has leagues or cups
--      cannot be deleted, and only a global admin moves one out of its club.
--
-- Members are written by the SECURITY DEFINER RPCs only (admin_create_club,
-- add_club_member_by_email, decide_join_request, accept_club_invitations,
-- set_club_member_role). They hold the member cap, the end date and the role
-- rules, and they run as the table owner, so they do not need a client policy.
-- Same move as 0078, which dropped the client UPDATE policy.
--
-- Read from staging 2026-11-20: no app code inserts into group_members or
-- groups with a signed-in client, none updates or deletes a groups row, and
-- none changes group_id on a league or a cup after it is created.
-- The service role (admin pages) and global admins keep full access.
--
-- Backward compatible with the deployed code. Safe before or after the code
-- deploy.

-- ── Helper: is the caller an owner of this club? ─────────────────────────────
create or replace function public.is_group_owner(p_group_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists(
    select 1 from public.group_members
    where group_id = p_group_id
      and user_id = auth.uid()
      and role = 'owner'
  );
$$;

revoke all on function public.is_group_owner(uuid) from public;
revoke execute on function public.is_group_owner(uuid) from anon;
grant execute on function public.is_group_owner(uuid) to authenticated, service_role;

-- ── group_members: rows are written by the RPCs ──────────────────────────────
drop policy if exists "group_members insert group admin" on public.group_members;

-- An owner row is removed by an owner or a global admin. A club admin still
-- removes admins and members; everyone still removes their own row (the
-- last-owner guard from 0110 keeps applying).
drop policy if exists "group_members delete admin or self" on public.group_members;
create policy "group_members delete admin or self"
  on public.group_members
  for delete
  to authenticated
  using (
    public.is_admin()
    or user_id = (select auth.uid())
    or (
      public.is_group_admin(group_id)
      and (role <> 'owner' or public.is_group_owner(group_id))
    )
  );

-- ── groups: created by a global admin, terms set by a global admin ───────────
drop policy if exists "groups insert admin or self" on public.groups;
create policy "groups insert admin"
  on public.groups
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "groups delete group admin" on public.groups;
create policy "groups delete owner or admin"
  on public.groups
  for delete
  to authenticated
  using (public.is_admin() or public.is_group_owner(id));

create or replace function public.guard_groups_locked_fields()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
  begin
    -- Service role (no JWT) and global admins set the terms.
    if auth.uid() is null or public.is_admin() then
      return new;
    end if;

    if new.member_cap is distinct from old.member_cap
       or new.valid_until is distinct from old.valid_until
       or new.short_id is distinct from old.short_id
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at
       or new.id is distinct from old.id then
      raise exception
        'groups.member_cap, valid_until, short_id, created_by, created_at and id are set by an administrator'
        using errcode = 'insufficient_privilege';
    end if;

    return new;
  end;
$$;

revoke all on function public.guard_groups_locked_fields() from public;
revoke execute on function public.guard_groups_locked_fields() from anon, authenticated;
grant execute on function public.guard_groups_locked_fields() to service_role;

drop trigger if exists guard_groups_locked_fields on public.groups;
create trigger guard_groups_locked_fields
  before update on public.groups
  for each row execute function public.guard_groups_locked_fields();

-- ── leagues / tournaments keep their club ────────────────────────────────────
-- Was ON DELETE SET NULL. A league or cup without a club is a standalone one,
-- which has a wider audience, so the club row must outlive them. Delete or
-- move the leagues and cups first, then the club.
alter table public.leagues
  drop constraint leagues_group_id_fkey,
  add constraint leagues_group_id_fkey
    foreign key (group_id) references public.groups(id) on delete restrict;

alter table public.tournaments
  drop constraint tournaments_group_id_fkey,
  add constraint tournaments_group_id_fkey
    foreign key (group_id) references public.groups(id) on delete restrict;

-- The club of a league or a cup is fixed once set. The UPDATE policies decide
-- who may edit the row; this trigger keeps group_id itself out of reach of a
-- signed-in client. A standalone league or cup (group_id NULL) is not affected.
create or replace function public.guard_club_scope_locked()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
  begin
    -- Service role (no JWT) and global admins may move a league or a cup.
    if auth.uid() is null or public.is_admin() then
      return new;
    end if;

    if old.group_id is not null and new.group_id is distinct from old.group_id then
      raise exception
        'group_id of a club league or a club cup is changed by an administrator'
        using errcode = 'insufficient_privilege';
    end if;

    return new;
  end;
$$;

revoke all on function public.guard_club_scope_locked() from public;
revoke execute on function public.guard_club_scope_locked() from anon, authenticated;
grant execute on function public.guard_club_scope_locked() to service_role;

drop trigger if exists guard_leagues_group_id on public.leagues;
create trigger guard_leagues_group_id
  before update on public.leagues
  for each row execute function public.guard_club_scope_locked();

drop trigger if exists guard_tournaments_group_id on public.tournaments;
create trigger guard_tournaments_group_id
  before update on public.tournaments
  for each row execute function public.guard_club_scope_locked();
