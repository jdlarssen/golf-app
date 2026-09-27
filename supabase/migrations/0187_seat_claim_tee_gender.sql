-- 0187 (#2209): the open-registration seat claim writes the player's tee
-- category.
--
-- claim_open_registration_seat (0177) inserts the game_players row for every
-- capped open registration, and it had no tee_gender column in its insert, so
-- the row always got the column default 'mens'. A lady or a junior who signed
-- up through the link was frozen on the men's slope, course rating and par when
-- the round started — or blocked from auto-start with tee_missing_rating when
-- the tee had no men's rating at all.
--
-- The category is decided in TypeScript (profileTeeGender in
-- lib/games/teeChoice.ts: the profile default, clamped to what the game's tee
-- rates) and passed in, the same way the cap is: SQL never guesses a rule that
-- has its one home elsewhere (trap 4). Everything else in the body is 0177's,
-- unchanged.
--
-- The old 8-argument signature is dropped, not overloaded: with both in place a
-- call with 8 named arguments is ambiguous for PostgREST.
--
-- Order against prod: migration FIRST, then merge/deploy. The migration is
-- backwards compatible — the code on main does not send p_tee_gender and gets
-- 'mens', as today. The new code against the old function fails instead: every
-- capped open registration would answer db_error.

drop function if exists public.claim_open_registration_seat(uuid, uuid, integer, integer, timestamptz, integer, integer, text);

create function public.claim_open_registration_seat(
  p_game_id uuid,
  p_user_id uuid,
  p_seat_team_size integer,
  p_max_teams integer,
  p_accepted_at timestamptz,
  -- null = no cap on this axis (teamModePlayerCap / registrationPlayerCap null)
  p_cap integer default null,
  -- null = a solo claim: one seat, no team number
  p_new_team_size integer default null,
  p_signup_source text default null,
  -- #2209: the player's category, from profileTeeGender. The default keeps a
  -- caller that does not send it where it was before 0187.
  p_tee_gender public.player_tee_gender default 'mens'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
  declare
    v_status public.game_status;
    v_signups_closed_at timestamptz;
    v_existing_team integer;
    v_seats integer;
    v_team integer;
  begin
    -- 1. Lock the game. Every claim for this game waits here for the one before.
    select g.status, g.signups_closed_at
      into v_status, v_signups_closed_at
      from public.games g
     where g.id = p_game_id
       for no key update;

    if not found then
      return jsonb_build_object('outcome', 'game_not_found', 'team_number', null);
    end if;
    if v_status not in ('draft', 'scheduled') then
      return jsonb_build_object('outcome', 'game_locked', 'team_number', null);
    end if;
    if v_signups_closed_at is not null then
      return jsonb_build_object('outcome', 'signup_closed', 'team_number', null);
    end if;

    -- 2. Already on the roster (withdrawn or not — the primary key would refuse
    --    a second row anyway). Nothing is written.
    select gp.team_number
      into v_existing_team
      from public.game_players gp
     where gp.game_id = p_game_id
       and gp.user_id = p_user_id;

    if found then
      return jsonb_build_object('outcome', 'already_on_roster', 'team_number', v_existing_team);
    end if;

    -- 3. Seats held by the active roster, plus the seats this claim needs.
    --    GROUP BY puts every row without a team in one group, one seat each.
    if p_cap is not null then
      select coalesce(sum(held), 0)
        into v_seats
        from (
          select case
                   when gp.team_number is null then count(*)
                   else greatest(count(*), coalesce(p_seat_team_size, 1))
                 end as held
            from public.game_players gp
           where gp.game_id = p_game_id
             and gp.withdrawn_at is null
           group by gp.team_number
        ) seats;

      if v_seats + coalesce(p_new_team_size, 1) > p_cap then
        return jsonb_build_object('outcome', 'game_full', 'team_number', null);
      end if;
    end if;

    -- 4. A new team takes the lowest number in 1..p_max_teams no active row has.
    if p_new_team_size is not null then
      select min(n)
        into v_team
        from generate_series(1, p_max_teams) as n
       where not exists (
         select 1
           from public.game_players gp
          where gp.game_id = p_game_id
            and gp.withdrawn_at is null
            and gp.team_number = n
       );

      if v_team is null then
        return jsonb_build_object('outcome', 'game_full', 'team_number', null);
      end if;
    end if;

    -- 5. The row. team_number = flight_number for a team, null/null for solo.
    insert into public.game_players
      (game_id, user_id, team_number, flight_number, course_handicap, accepted_at, signup_source, tee_gender)
    values
      (p_game_id, p_user_id, v_team, v_team, null, p_accepted_at, p_signup_source, p_tee_gender);

    return jsonb_build_object('outcome', 'ok', 'team_number', v_team);
  end;
$function$;

comment on function public.claim_open_registration_seat(uuid, uuid, integer, integer, timestamptz, integer, integer, text, public.player_tee_gender) is
  '#2062/#2060 (0177), #2209 (0187): open self-registration claims a seat '
  'atomically. Locks the games row, re-checks status and signups_closed_at, '
  'counts held seats (1 per player outside a team, max(rows, p_seat_team_size) '
  'per team, withdrawn rows excluded), refuses past p_cap, picks the lowest free '
  'team number in 1..p_max_teams for a new team, and inserts the row with '
  'p_tee_gender (profileTeeGender, default mens). Returns jsonb {outcome, '
  'team_number}; outcome is ok | already_on_roster | game_full | game_locked | '
  'signup_closed | game_not_found. The cap and the tee category are computed in '
  'TypeScript and passed in. Kun service_role.';

revoke all on function public.claim_open_registration_seat(uuid, uuid, integer, integer, timestamptz, integer, integer, text, public.player_tee_gender) from public;
revoke execute on function public.claim_open_registration_seat(uuid, uuid, integer, integer, timestamptz, integer, integer, text, public.player_tee_gender) from anon, authenticated;
grant execute on function public.claim_open_registration_seat(uuid, uuid, integer, integer, timestamptz, integer, integer, text, public.player_tee_gender) to service_role;
