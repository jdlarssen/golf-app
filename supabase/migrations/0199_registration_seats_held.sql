-- 0199 (#2258): the seat count open registration uses gets its own function.
--
-- The terminliste («Terminlista», /finn-turneringer) shows «5 av 12 plasser
-- ledige» on rounds with a cap, and the number has to be the one the signup
-- lets in. Until now the count lived only inside step 3 of
-- claim_open_registration_seat (0177, 0187). A second count in TypeScript
-- would give the rule two homes (trap 4), so the count moves out into
-- registration_seats_held and the claim calls it. Both read the same query.
--
-- registration_seats_held(game ids, seat team sizes) returns one row per game:
-- the seats held by the active roster. A player outside a team holds one seat,
-- a team holds max(rows, seat team size) — the full team size while teammates
-- are still to come, every row when it is over-full. Withdrawn rows hold
-- nothing. That is step 3 of 0187 word for word; only the game id and the
-- seat team size now come from the arrays instead of the claim's parameters.
-- The cap itself stays in TypeScript (registrationPlayerCap), as before.
--
-- claim_open_registration_seat is replaced with the same signature and the
-- same body, except that step 3 reads the new function. Its behaviour does not
-- change: supabase/tests/open_registration_seat_claim_test.sql is green
-- without edits.
--
-- Who may call it: service_role only, like the claim. The list is read by the
-- server through the admin client; a player or an anonymous visitor never
-- calls it over PostgREST. `revoke ... from public` has to be there: Postgres
-- grants execute to public by default, and anon/authenticated would keep it
-- through public.
--
-- Order against prod: migration FIRST, then merge/deploy. The migration is
-- backwards compatible — the code on main calls the claim with the same
-- signature and gets the same answers. The new code against the old database
-- loses only the capacity line: getRegistrationSeats logs the RPC error and
-- the rows render without «plasser ledige» and without «Fullt».

create function public.registration_seats_held(
  p_game_ids uuid[],
  p_seat_team_sizes integer[]
)
returns table (game_id uuid, seats integer)
language sql
stable
security invoker
set search_path = ''
as $function$
  with input as (
    -- A game id listed twice counts once (the first size wins).
    select distinct on (i.game_id) i.game_id, i.seat_team_size
      from unnest(p_game_ids, p_seat_team_sizes) with ordinality as i(game_id, seat_team_size, ord)
     where i.game_id is not null
     order by i.game_id, i.ord
  )
  -- GROUP BY team_number puts every row without a team in one group, one seat
  -- each (0177 step 3).
  select input.game_id,
         coalesce(sum(held.seats), 0)::integer as seats
    from input
    left join lateral (
      select case
               when gp.team_number is null then count(*)
               else greatest(count(*), coalesce(input.seat_team_size, 1))
             end as seats
        from public.game_players gp
       where gp.game_id = input.game_id
         and gp.withdrawn_at is null
       group by gp.team_number
    ) held on true
   group by input.game_id;
$function$;

comment on function public.registration_seats_held(uuid[], integer[]) is
  '#2258 (0199): seats held by the active roster of each game, the count open '
  'self-registration checks against the cap: 1 per player outside a team, '
  'max(rows, seat team size) per team, withdrawn rows excluded. One row per '
  'distinct game id; a game with no active rows gives 0. Read by '
  'claim_open_registration_seat (step 3) and by the terminliste capacity line '
  '(getRegistrationSeats). Kun service_role.';

revoke all on function public.registration_seats_held(uuid[], integer[]) from public;
revoke execute on function public.registration_seats_held(uuid[], integer[]) from anon, authenticated;
grant execute on function public.registration_seats_held(uuid[], integer[]) to service_role;

create or replace function public.claim_open_registration_seat(
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

    -- 3. Seats held by the active roster (registration_seats_held, 0199 — the
    --    same count the terminliste shows), plus the seats this claim needs.
    if p_cap is not null then
      select h.seats
        into v_seats
        from public.registration_seats_held(array[p_game_id], array[p_seat_team_size]) h;

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
  '#2062/#2060 (0177), #2209 (0187), #2258 (0199): open self-registration '
  'claims a seat atomically. Locks the games row, re-checks status and '
  'signups_closed_at, counts held seats through registration_seats_held (1 per '
  'player outside a team, max(rows, p_seat_team_size) per team, withdrawn rows '
  'excluded), refuses past p_cap, picks the lowest free team number in '
  '1..p_max_teams for a new team, and inserts the row with p_tee_gender '
  '(profileTeeGender, default mens). Returns jsonb {outcome, team_number}; '
  'outcome is ok | already_on_roster | game_full | game_locked | '
  'signup_closed | game_not_found. The cap and the tee category are computed in '
  'TypeScript and passed in. Kun service_role.';

revoke all on function public.claim_open_registration_seat(uuid, uuid, integer, integer, timestamptz, integer, integer, text, public.player_tee_gender) from public;
revoke execute on function public.claim_open_registration_seat(uuid, uuid, integer, integer, timestamptz, integer, integer, text, public.player_tee_gender) from anon, authenticated;
grant execute on function public.claim_open_registration_seat(uuid, uuid, integer, integer, timestamptz, integer, integer, text, public.player_tee_gender) to service_role;
