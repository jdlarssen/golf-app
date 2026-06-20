-- 0107_harden_rls_column_immutability.sql
--
-- Security hardening from an adversarial hostile-PATCH RLS sweep (run against the
-- staging mirror, then confirmed present in prod). The common root cause: several
-- UPDATE RLS policies grant row access by ownership but cannot express column-level
-- immutability (RLS WITH CHECK has no OLD vs NEW), so a direct PostgREST PATCH —
-- which bypasses every server-action TS guard — can write privileged columns the
-- caller should never touch. Postgres RLS cannot pin OLD = NEW; BEFORE-UPDATE
-- triggers can. This mirrors the existing guard_game_players_self_update pattern.
--
-- Fixes (all bypass for service-role/internal writes where auth.uid() is null, and
-- for global admins via public.is_admin()):
--   1. users.is_admin           — block self-promotion to global admin   [CRITICAL]
--   2. game_players.team_number/flight_number — block player self-reassigning grouping
--   3. invitations identity cols — invitee may flip only accepted_at
--   4. group_join_requests audit cols — requester may not forge the decision record
--
-- NOT fixed (verified by-design, NOT a hole): standalone (group_id IS NULL) cups and
-- leagues are visible to all authenticated users — documented intentional behavior in
-- 0083 ("Frittstående ligaer ... synlige for alle innloggede") and 0089 ("Frittstående
-- synlig for alle innloggede"). Public /cup leaderboards depend on it (admin-client read).

-- ── 1. users.is_admin immutability (CRITICAL: vertical privilege escalation) ──────
-- "users update own" RLS WITH CHECK is (is_admin() OR id = auth.uid()): it validates
-- row ownership only, never which columns changed, and authenticated holds an UPDATE
-- grant on is_admin. There is no trigger on public.users. A non-admin could PATCH
-- their own row to is_admin = true and inherit the full admin cascade.
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

    return new;
  end;
$$;

drop trigger if exists guard_users_self_update on public.users;
create trigger guard_users_self_update
  before update on public.users
  for each row execute function public.guard_users_self_update();

-- ── 2. game_players.team_number / flight_number ──────────────────────────────────
-- The "game_players self submit" UPDATE policy opens the whole own row
-- (USING/CHECK = is_admin() OR user_id = auth.uid()). The existing trigger denylist
-- already blocks approved_* (always) and course_handicap (active/finished) on the
-- own-row path, but team_number/flight_number were ungated — letting a player split
-- into a phantom team or jump flights (flight drives can_score_for peer-approval and
-- same-flight visibility). Legit grouping writes happen via the admin client (team
-- signup) or the game creator/admin — none of which hit this own-row branch.
create or replace function public.guard_game_players_self_update()
  returns trigger
  language plpgsql
  security definer
  set search_path to ''
as $$
  declare
    v_uid uuid := auth.uid();
    v_status public.game_status;
    v_is_creator boolean;
  begin
    if v_uid is null or public.is_admin() then
      return new;
    end if;

    if new.user_id = v_uid then
      if new.approved_at is distinct from old.approved_at
         or new.approved_by_user_id is distinct from old.approved_by_user_id then
        raise exception
          'A player cannot approve their own scorecard (game_players.approved_at/approved_by_user_id)'
          using errcode = 'insufficient_privilege';
      end if;

      -- Grouping fields are admin/creator-controlled; a player may never self-set them.
      if new.team_number is distinct from old.team_number
         or new.flight_number is distinct from old.flight_number then
        raise exception
          'A player cannot change their own team_number/flight_number (game_players grouping is admin/creator-controlled)'
          using errcode = 'insufficient_privilege';
      end if;

      if new.course_handicap is distinct from old.course_handicap then
        select g.status into v_status
          from public.games g
         where g.id = new.game_id;

        if v_status in ('active', 'finished') then
          raise exception
            'A player cannot change their own course_handicap after the game has started (game_players.course_handicap)'
            using errcode = 'insufficient_privilege';
        end if;
      end if;
    else
      -- Another player's row. Admin already returned above. The game CREATOR
      -- keeps full access (mirrors the "game_players creator update" policy) so
      -- roster edits (handicap/team/flight via the cookie client) still work.
      select (g.created_by = v_uid) into v_is_creator
        from public.games g where g.id = new.game_id;
      if coalesce(v_is_creator, false) then
        return new;
      end if;

      -- A true peer may change ONLY the approval columns. Allowlist via jsonb diff
      -- so future columns are protected by default.
      if (to_jsonb(new) - 'approved_at' - 'approved_by_user_id'
                        - 'rejection_reason' - 'submitted_at')
         is distinct from
         (to_jsonb(old) - 'approved_at' - 'approved_by_user_id'
                        - 'rejection_reason' - 'submitted_at') then
        raise exception
          'A peer may only change approval columns (approved_at, approved_by_user_id, rejection_reason, submitted_at) on another player''s row'
          using errcode = 'insufficient_privilege';
      end if;
    end if;

    return new;
  end;
$$;

-- (trigger guard_game_players_self_update already exists from 0103; function replaced in place)

-- ── 3. invitations: invitee may flip only accepted_at ────────────────────────────
-- "invitations self mark accepted" WITH CHECK pins only email + accepted_at IS NOT
-- NULL, leaving invited_by/game_id/token/expires_at writable. Rewriting invited_by
-- lets the invitee forge befriend_inviter() (PR #489 auto-vennskap), forcing a
-- one-sided accepted friendship onto a stranger.
create or replace function public.guard_invitations_self_update()
  returns trigger
  language plpgsql
  security definer
  set search_path to ''
as $$
  declare
    v_uid uuid := auth.uid();
  begin
    if v_uid is null or public.is_admin() then
      return new;
    end if;

    -- The invitee (non-admin) may only flip accepted_at. Everything that identifies
    -- the invitation is immutable to them.
    if new.invited_by is distinct from old.invited_by
       or new.game_id is distinct from old.game_id
       or new.token is distinct from old.token
       or new.email is distinct from old.email
       or new.expires_at is distinct from old.expires_at then
      raise exception
        'Only accepted_at may be changed on your own invitation (public.invitations)'
        using errcode = 'insufficient_privilege';
    end if;

    return new;
  end;
$$;

drop trigger if exists guard_invitations_self_update on public.invitations;
create trigger guard_invitations_self_update
  before update on public.invitations
  for each row execute function public.guard_invitations_self_update();

-- ── 4. group_join_requests: requester may not forge the decision record ───────────
-- "group_join_requests admin update" self-branch WITH CHECK only forces
-- status='withdrawn', leaving decided_by_user_id/decided_at/message writable. The
-- requester could falsify the audit trail (attribute the decision to a group admin).
-- The legit decision path is decide_join_request() run by a group admin.
create or replace function public.guard_group_join_requests_self_update()
  returns trigger
  language plpgsql
  security definer
  set search_path to ''
as $$
  declare
    v_uid uuid := auth.uid();
  begin
    if v_uid is null or public.is_admin() or public.is_group_admin(old.group_id) then
      return new;
    end if;

    -- The requester (non-admin) may only change their request status (RLS pins it to
    -- 'withdrawn'); decision-audit columns belong to the admin decision path.
    if new.decided_by_user_id is distinct from old.decided_by_user_id
       or new.decided_at is distinct from old.decided_at
       or new.message is distinct from old.message then
      raise exception
        'Only your request status may change on self-withdraw (public.group_join_requests)'
        using errcode = 'insufficient_privilege';
    end if;

    return new;
  end;
$$;

drop trigger if exists guard_group_join_requests_self_update on public.group_join_requests;
create trigger guard_group_join_requests_self_update
  before update on public.group_join_requests
  for each row execute function public.guard_group_join_requests_self_update();
