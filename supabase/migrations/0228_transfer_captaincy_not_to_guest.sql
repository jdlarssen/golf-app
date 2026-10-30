-- 0228 (#2607): a guest can never take the team captaincy.
--
-- A guest is a shadow user without a login (users.is_guest). The captain
-- brings guests in the team sign-up, and the owner's rule (#2570, #2607) is
-- that a guest is only on the list because a player who signed up brought
-- them: when that player leaves, the guests leave too. Until now
-- transfer_team_captaincy (0194) let the armband go to any approved teammate
-- on the roster, a guest included. After such a hand-over the old captain
-- could withdraw as an ordinary member, and the team was left with guests and
-- a captain nobody can sign in as.
--
-- One new check, after the actor is authorised (so a third party still learns
-- nothing about the team) and before not_approved: when the new captain is a
-- guest, the function answers {"outcome":"new_captain_is_guest"} and writes
-- nothing. Everything else is the body as it stands in the live database
-- (read on staging and prod 2026-10-30, identical to 0194), unchanged:
-- signature, security definer, search_path, the locks, the grants.
--
-- Order against prod: either way round. Old code reads an outcome it does not
-- know as a failure (transfer_failed / db_error); new code without this
-- migration hides the button for guests, and the function still accepts a
-- guest from a direct call until the migration lands.

create or replace function public.transfer_team_captaincy(
  p_game_id uuid,
  p_actor_user_id uuid,
  p_new_captain_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
  declare
    v_status public.game_status;
    v_created_by uuid;
    v_new_user uuid;
    v_new_status public.registration_request_status;
    v_new_team_request uuid;
    v_new_is_captain boolean;
    v_captain_id uuid;
    v_captain_user uuid;
    v_captain_team_name text;
  begin
    -- 1. Lock the game. A transfer and a start for the same game run one at a
    --    time, and the roster cannot lock between the check and the write.
    --    NO KEY UPDATE for the same reason as 0177: it does not wait on the
    --    FOR KEY SHARE a concurrent game_players insert takes.
    select g.status, g.created_by
      into v_status, v_created_by
      from public.games g
     where g.id = p_game_id
       for no key update;

    if not found then
      return jsonb_build_object('outcome', 'game_not_found');
    end if;
    if v_status not in ('draft', 'scheduled') then
      return jsonb_build_object('outcome', 'game_locked');
    end if;

    -- 2. The recipient, and the captain of the team they are on. Both rows are
    --    locked, so two transfers on one team cannot interleave.
    select r.user_id, r.status, r.team_request_id, r.is_team_captain
      into v_new_user, v_new_status, v_new_team_request, v_new_is_captain
      from public.game_registration_requests r
     where r.id = p_new_captain_request_id
       and r.game_id = p_game_id
       for update;

    if not found or v_new_is_captain or v_new_team_request is null then
      return jsonb_build_object('outcome', 'not_a_teammate');
    end if;

    select c.id, c.user_id, c.team_name
      into v_captain_id, v_captain_user, v_captain_team_name
      from public.game_registration_requests c
     where c.id = v_new_team_request
       and c.game_id = p_game_id
       and c.is_team_captain
       for update;

    if not found then
      return jsonb_build_object('outcome', 'not_a_teammate');
    end if;

    -- 3. Who may move the armband: the team's own captain, the game's creator
    --    or a global admin (is_game_creator_or_admin, spelled out for an actor
    --    id instead of auth.uid()). Another team's captain is told the player
    --    is not on their team; anyone else is refused.
    if p_actor_user_id is distinct from v_captain_user
       and p_actor_user_id is distinct from v_created_by
       and not exists (
         select 1 from public.users u
          where u.id = p_actor_user_id and u.is_admin
       ) then
      if exists (
        select 1 from public.game_registration_requests o
         where o.game_id = p_game_id
           and o.user_id = p_actor_user_id
           and o.is_team_captain
      ) then
        return jsonb_build_object('outcome', 'not_a_teammate');
      end if;
      return jsonb_build_object('outcome', 'not_allowed');
    end if;

    -- 3b. #2607: a guest has no login and is on the team only because the
    --     captain brought them, so a guest can never be captain.
    if exists (
      select 1 from public.users u
       where u.id = v_new_user and u.is_guest
    ) then
      return jsonb_build_object('outcome', 'new_captain_is_guest');
    end if;

    -- 4. The new captain must be on the team and in the game: an approved
    --    request and a game_players row.
    if v_new_status <> 'approved' or not exists (
      select 1 from public.game_players gp
       where gp.game_id = p_game_id
         and gp.user_id = v_new_user
    ) then
      return jsonb_build_object('outcome', 'not_approved');
    end if;

    -- 5. The move. The new captain first, so every row below can point at it.
    update public.game_registration_requests
       set is_team_captain = true,
           team_request_id = null,
           team_name = v_captain_team_name
     where id = p_new_captain_request_id;

    update public.game_registration_requests
       set is_team_captain = false,
           team_request_id = p_new_captain_request_id
     where id = v_captain_id;

    update public.game_registration_requests
       set team_request_id = p_new_captain_request_id
     where team_request_id = v_captain_id
       and id <> p_new_captain_request_id;

    update public.game_players
       set accepted_at = coalesce(accepted_at, now())
     where game_id = p_game_id
       and user_id = v_captain_user;

    return jsonb_build_object('outcome', 'ok');
  end;
$function$;

comment on function public.transfer_team_captaincy(uuid, uuid, uuid) is
  '#2358 (0194), #2607 (0228): hands the team captaincy to an approved teammate who is on the '
  'roster and is not a guest. Locks the game (draft/scheduled only) and both request rows; the actor '
  'must be the team''s captain, the game''s creator or a global admin. The new '
  'captain takes the team name, the old captain and every other child (guests included) point at '
  'the new one; the old captain''s roster place is marked confirmed. Returns jsonb {outcome}: ok | '
  'game_not_found | game_locked | not_a_teammate | not_allowed | new_captain_is_guest | not_approved. '
  'Kun service_role.';

revoke all on function public.transfer_team_captaincy(uuid, uuid, uuid) from public;
revoke execute on function public.transfer_team_captaincy(uuid, uuid, uuid) from anon, authenticated;
grant execute on function public.transfer_team_captaincy(uuid, uuid, uuid) to service_role;
