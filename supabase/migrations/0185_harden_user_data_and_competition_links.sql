-- 0185 (#2207): tighter rules for user data and for a game's competition links.
--
--   1. guard_users_self_update: a non-admin cannot change their own
--      users.email. The address is an identity key for club invitations and
--      the existing-user lookup when someone is invited; only the service role
--      and global admins change it (the claim flow, the admin player page).
--   2. incomplete_profile_ids(uuid[]): the profile gate ("does everyone on this
--      roster have a finished profile?") answers with ids only.
--   3. incomplete_profiles_for_ids(uuid[]) keeps its signature and grants but
--      now always answers email = null. Store builds up to and including
--      1.1.0 (3) still call it at publish time and read only the row count.
--   4. can_manage_tournament(uuid): the USING clause of the policy
--      "tournaments admin or club-admin update" as a callable check. One home
--      for "who runs this cup": the create action asks it, the trigger below
--      enforces it. supabase/tests/games_competition_links_guard_test.sql
--      asserts the function and the policy agree.
--   5. guard_games_competition_links: tournament_id and source_game_id on a
--      game can only be set by someone who manages the cup, and group_id only
--      by a member of that club. Clearing a link (to NULL) is never checked,
--      so ON DELETE SET NULL from tournaments/groups and an organiser
--      unlinking their own game both pass.
--
-- Direction (what does OLD code do with this applied?): almost nothing. Old
-- code never changes its own e-post, never calls the two new functions, and
-- its legitimate links pass the trigger. Old store builds publish as before
-- (they read the row count). Only trace: the missing-profile banner in the
-- non-admin edit flow shows an empty list until the new code is deployed.
-- EARLY: staging during the build, production before merge. The new code
-- calls incomplete_profile_ids and can_manage_tournament.

-- ── 1. users.email is admin/service-role only ────────────────────────────────
-- Full body of the 0131 definition with one new block; the three existing
-- checks are unchanged. The trigger from 0107 stays as it is.
create or replace function public.guard_users_self_update()
  returns trigger
  language plpgsql
  security definer
  set search_path to ''
as $$
  declare
    v_uid uuid := auth.uid();
  begin
    -- Service-role / internal writes (no JWT) and global admins may change anything.
    if v_uid is null or public.is_admin() then
      return new;
    end if;

    -- A non-admin editing a users row (their own, per RLS) must never flip is_admin.
    if new.is_admin is distinct from old.is_admin then
      raise exception
        'is_admin can only be changed by an administrator (public.users.is_admin)'
        using errcode = 'insufficient_privilege';
    end if;

    -- #1009: is_guest gates stats/mail exclusions and the claim flow — only the
    -- service-role app paths (guest creation, first-login clearing) may flip it.
    if new.is_guest is distinct from old.is_guest then
      raise exception
        'is_guest can only be changed by an administrator (public.users.is_guest)'
        using errcode = 'insufficient_privilege';
    end if;

    -- #1012: deleted_at gates the deleted-account exclusions and the delete-flow
    -- retry shortcircuit — only anonymize_user() (service-role) may set it, and
    -- nothing un-deletes an account.
    if new.deleted_at is distinct from old.deleted_at then
      raise exception
        'deleted_at can only be changed by an administrator (public.users.deleted_at)'
        using errcode = 'insufficient_privilege';
    end if;

    -- #2207: email is an identity key (club invitations, invite lookups). The
    -- app never lets a player change it; only the service role and admins do.
    if new.email is distinct from old.email then
      raise exception
        'email can only be changed by an administrator (public.users.email)'
        using errcode = 'insufficient_privilege';
    end if;

    return new;
  end;
$$;

-- ── 2. Profile gate, ids only ────────────────────────────────────────────────
-- SECURITY DEFINER for the same reason as 0071: a creator cannot read other
-- users' rows under RLS, so a direct read would see nothing and the gate would
-- no-op (#366). Returns only incomplete rows, only for the ids passed in.
create or replace function public.incomplete_profile_ids(p_user_ids uuid[])
  returns table(id uuid)
  language sql
  security definer
  stable
  set search_path = ''
  as $$
    select u.id
    from public.users u
    where u.id = any(p_user_ids)
      and u.profile_completed_at is null;
  $$;

comment on function public.incomplete_profile_ids(uuid[]) is
  '#2207: which of the given user ids still have an unfinished profile (profile_completed_at is null). Ids only. Used by the publish gate and the round-start gate, web and app.';

-- service_role explicitly: the scheduled-start cron runs the shared start core
-- with the admin client.
revoke all on function public.incomplete_profile_ids(uuid[]) from public;
revoke execute on function public.incomplete_profile_ids(uuid[]) from anon;
grant execute on function public.incomplete_profile_ids(uuid[]) to authenticated, service_role;

-- ── 3. The old profile RPC answers without e-post ────────────────────────────
-- Same signature and return type, so create or replace keeps the EXECUTE
-- grants from 0071 (authenticated keeps it for the store builds that call it).
create or replace function public.incomplete_profiles_for_ids(p_user_ids uuid[])
  returns table(id uuid, email text)
  language sql
  security definer
  stable
  set search_path = ''
  as $$
    select u.id, null::text as email
    from public.users u
    where u.id = any(p_user_ids)
      and u.profile_completed_at is null;
  $$;

comment on function public.incomplete_profiles_for_ids(uuid[]) is
  'Kept for store builds up to and including 1.1.0 (3), which read only the row count. Since 0185 (#2207) email is always null; new code calls incomplete_profile_ids.';

-- ── 4. Who manages a cup ─────────────────────────────────────────────────────
-- Exact mirror of the USING clause of "tournaments admin or club-admin update"
-- (0092). Change both together.
create or replace function public.can_manage_tournament(p_tournament_id uuid)
  returns boolean
  language sql
  security definer
  stable
  set search_path = ''
  as $$
    select exists (
      select 1
      from public.tournaments t
      where t.id = p_tournament_id
        and (
          public.is_admin()
          or (t.group_id is not null and public.is_group_admin(t.group_id))
          or (t.group_id is null and t.created_by = auth.uid())
        )
    );
  $$;

comment on function public.can_manage_tournament(uuid) is
  '#2207: true when the caller may manage the cup (global admin, club owner/admin for a club cup, the creator of a personal cup). Mirrors the UPDATE policy on tournaments.';

revoke all on function public.can_manage_tournament(uuid) from public;
revoke execute on function public.can_manage_tournament(uuid) from anon;
grant execute on function public.can_manage_tournament(uuid) to authenticated;

-- ── 5. Competition links on games ────────────────────────────────────────────
-- The "games creator insert/update" policies only check created_by, and RLS
-- cannot say "this column needs more than row ownership"; a BEFORE trigger can
-- (0169 pattern). Service role and global admins pass, as in 0169.
create or replace function public.guard_games_competition_links()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
  as $$
  declare
    v_tournament_set boolean;
    v_source_set boolean;
    v_group_set boolean;
  begin
    if auth.uid() is null or public.is_admin() then
      return new;
    end if;

    -- A link counts when it is set to a non-null value: on INSERT, or when an
    -- UPDATE changes it. Changing a link to NULL is never checked.
    if tg_op = 'INSERT' then
      v_tournament_set := new.tournament_id is not null;
      v_source_set := new.source_game_id is not null;
      v_group_set := new.group_id is not null;
    else
      v_tournament_set := new.tournament_id is not null
        and new.tournament_id is distinct from old.tournament_id;
      v_source_set := new.source_game_id is not null
        and new.source_game_id is distinct from old.source_game_id;
      v_group_set := new.group_id is not null
        and new.group_id is distinct from old.group_id;
    end if;

    if v_tournament_set and not public.can_manage_tournament(new.tournament_id) then
      raise exception
        'tournament_id can only be set by someone who manages the cup (games.tournament_id)'
        using errcode = 'insufficient_privilege';  -- SQLSTATE 42501
    end if;

    -- A derived game belongs to the same cup as its source game.
    if v_source_set and (
      new.tournament_id is null
      or not public.can_manage_tournament(new.tournament_id)
      or not exists (
        select 1 from public.games s
        where s.id = new.source_game_id
          and s.tournament_id = new.tournament_id
      )
    ) then
      raise exception
        'source_game_id can only point to a game in a cup the caller manages (games.source_game_id)'
        using errcode = 'insufficient_privilege';  -- SQLSTATE 42501
    end if;

    -- #442: a game can only be put under a club by one of its members. An
    -- expired club is a business rule and stays in the app.
    if v_group_set and not public.is_group_member(new.group_id) then
      raise exception
        'group_id can only be set by a member of the club (games.group_id)'
        using errcode = 'insufficient_privilege';  -- SQLSTATE 42501
    end if;

    return new;
  end;
  $$;

comment on function public.guard_games_competition_links() is
  '#2207: tournament_id and source_game_id can only be set by someone who manages the cup (can_manage_tournament), group_id only by a club member (is_group_member). Changing a link to NULL is never checked. No-ops for the service role (auth.uid() IS NULL) and global admins.';

drop trigger if exists guard_games_competition_links on public.games;
create trigger guard_games_competition_links
  before insert or update of tournament_id, source_game_id, group_id on public.games
  for each row
  execute function public.guard_games_competition_links();

-- Trigger functions never need client-callable EXECUTE (0137/0150).
revoke execute on function public.guard_games_competition_links() from public, anon, authenticated;
