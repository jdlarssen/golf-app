-- 0231 (#2751): the tee starter choice can be queued on a phone and sent later.
--
-- A team in Patsome (holes 13–18) or a side in foursomes matchplay picks who
-- tees off on the odd holes. It is a hint: the scoring never reads it, and no
-- surface offers to change it once it is taken. The app stores the pick on the
-- phone and sends it when it has a network, so the rule here is that the first
-- pick to reach the server stands. No stamps are needed, and a queued pick can
-- never overwrite anything.
--
--   set_tee_starter_if_unset checks, in this order:
--     1. the caller is signed in,
--     2. the game is active, the mode is patsome or foursomes_matchplay, and a
--        foursomes team is 1 or 2,
--     3. the caller is an active member of the team, or an admin,
--     4. the pick is an active member of the same team.
--   Passing all four, it writes the pick only when none exists, in one
--   statement, so two calls at the same moment cannot both win. Failing any of
--   them, it answers with one row of NULLs (nothing is raised), the shape a
--   refusal has in set_team_tee_shot_if_newer.
--
-- The reply is the pick that stands afterwards: (tee_starter, was_applied).
-- was_applied says the pick that stands is the one this call asked for, not
-- that this very call wrote it. A retry after a lost reply therefore gets the
-- same answer as the first call, and a pick that lost gets false and the winner.
--
-- SECURITY DEFINER because a player has no write access to games: only the
-- creator and an admin may update that row, and a policy for players would open
-- the whole row to a direct PATCH (AGENTS.md trap 3). The function writes one
-- column on one row. On patsome_tee_starters, which does have member write
-- policies, it adds the guards those policies lack: a finished game and a pick
-- outside the team. The web's server actions (setFoursomesTeeStarter,
-- setPatsomeTeeStarter) stay as they are.
--
-- Additive: one new function, no new table or column. Apply to staging first,
-- then prod before the app build that calls it. The website does not use it.

create or replace function public.set_tee_starter_if_unset(
  p_game_id uuid,
  p_team_number integer,
  p_tee_starter uuid
)
returns table (
  tee_starter uuid,
  was_applied boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_status public.game_status;
  v_mode text;
begin
  -- Every refusal below is `return next` with both OUT columns still NULL.
  if v_uid is null
     or p_game_id is null
     or p_team_number is null
     or p_tee_starter is null then
    return next;
    return;
  end if;

  select g.status, g.game_mode
    into v_status, v_mode
    from public.games g
   where g.id = p_game_id;

  if not found
     or v_status <> 'active'
     or v_mode not in ('patsome', 'foursomes_matchplay')
     or (v_mode = 'foursomes_matchplay' and p_team_number not in (1, 2)) then
    return next;
    return;
  end if;

  if not (
    public.is_admin()
    or exists (
      select 1
        from public.game_players gp
       where gp.game_id = p_game_id
         and gp.team_number = p_team_number
         and gp.user_id = v_uid
         and gp.withdrawn_at is null
    )
  ) then
    return next;
    return;
  end if;

  if not exists (
    select 1
      from public.game_players gp
     where gp.game_id = p_game_id
       and gp.team_number = p_team_number
       and gp.user_id = p_tee_starter
       and gp.withdrawn_at is null
  ) then
    return next;
    return;
  end if;

  if v_mode = 'patsome' then
    insert into public.patsome_tee_starters (game_id, team_number, tee_starter_user_id)
    values (p_game_id, p_team_number, p_tee_starter)
    on conflict on constraint patsome_tee_starters_pkey do nothing;

    select t.tee_starter_user_id
      into tee_starter
      from public.patsome_tee_starters t
     where t.game_id = p_game_id
       and t.team_number = p_team_number;
  elsif p_team_number = 1 then
    update public.games g
       set foursomes_side1_tee_starter_user_id = p_tee_starter
     where g.id = p_game_id
       and g.foursomes_side1_tee_starter_user_id is null;

    select g.foursomes_side1_tee_starter_user_id
      into tee_starter
      from public.games g
     where g.id = p_game_id;
  else
    update public.games g
       set foursomes_side2_tee_starter_user_id = p_tee_starter
     where g.id = p_game_id
       and g.foursomes_side2_tee_starter_user_id is null;

    select g.foursomes_side2_tee_starter_user_id
      into tee_starter
      from public.games g
     where g.id = p_game_id;
  end if;

  was_applied := tee_starter = p_tee_starter;
  return next;
end;
$$;

comment on function public.set_tee_starter_if_unset(uuid, integer, uuid) is
  '#2751: first pick to reach the server stands. Answers with the pick that stands, or one row of NULLs on a refusal.';

revoke all on function public.set_tee_starter_if_unset(uuid, integer, uuid) from public, anon;
grant execute on function public.set_tee_starter_if_unset(uuid, integer, uuid) to authenticated;
