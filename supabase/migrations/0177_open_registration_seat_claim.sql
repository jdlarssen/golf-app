-- 0177 (#2062, #2060): open self-registration — the player cap and the team
-- number are decided in the database, atomically.
--
-- Two holes, one fix:
--
--   #2062  The "game_players self register open" policy (0043, perf-rewritten in
--          0092) let any signed-in user insert their own row into any open
--          draft/scheduled game straight through PostgREST. It checks neither
--          the player cap (#661/#2011) nor the team number, so a direct request
--          went past every server-action gate (AGENTS.md trap 3).
--
--   #2060  The server actions read the roster, decided, then wrote. Two
--          registrations arriving together read the same roster: both solo
--          players on the last seat got in, and two captains could take the
--          same team number.
--
-- (a) The self branch of the policy goes. No app path uses it: every
--     self-registration (registerForOpenGame, submitTeamRegistration,
--     acceptTeamInvite, attachToCaptainTeam, invitation accept at login) writes
--     with the service role. The admin branch IS used (global admin adding
--     players to other people's games with the user client) and stays, now as
--     its own policy. A non-admin can still insert through
--     "game_players creator insert" — their own games only, and the 0115
--     eligibility trigger applies there.
--
-- (b) claim_open_registration_seat is the one home for the seat count and the
--     team-number pick (trap 4). The cap itself stays a number computed in
--     TypeScript (registrationPlayerCap / teamModePlayerCap / MAX_TEAMS) and is
--     passed in — SQL never guesses a format's limits. The games row is locked
--     FOR UPDATE, so registrations for the same game run one at a time and see
--     each other's rows; other games are not touched.
--
--     Seats, not rows: a player outside a team holds one seat; a team holds
--     max(active rows, p_seat_team_size) — e-mail-invited teammates have no row
--     until they join, and an over-full team holds every row it has. Withdrawn
--     rows hold nothing, so a team whose members all withdrew frees its number.
--
--     registration_mode is NOT re-checked here: registerForOpenGame's direct
--     join also covers club members (#442) and friends of the owner (#369) in
--     games that are not 'open'. That eligibility stays in the action; the
--     function is service_role only, so nobody else can call it. Status and
--     signups_closed_at ARE re-checked under the lock — those can change
--     between the action's read and the write.
--
-- Order against prod: migration FIRST, then merge/deploy. The new code calls
-- this function; without it every capped open registration answers db_error.

-- ── (a) Policy: admin branch only ────────────────────────────────────────────
drop policy if exists "game_players self register open" on public.game_players;
drop policy if exists "game_players admin insert" on public.game_players;

create policy "game_players admin insert" on public.game_players for insert to public
  with check ((select public.is_admin()));

comment on policy "game_players admin insert" on public.game_players is
  '#2062 (0177): global admin may insert any game_players row with the user '
  'client. Self-registration no longer has a policy branch: it goes through '
  'the service role and claim_open_registration_seat, which enforces the cap.';

-- ── (b) Atomic seat claim ────────────────────────────────────────────────────
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
  p_signup_source text default null
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
       for update;

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
      (game_id, user_id, team_number, flight_number, course_handicap, accepted_at, signup_source)
    values
      (p_game_id, p_user_id, v_team, v_team, null, p_accepted_at, p_signup_source);

    return jsonb_build_object('outcome', 'ok', 'team_number', v_team);
  end;
$function$;

comment on function public.claim_open_registration_seat(uuid, uuid, integer, integer, timestamptz, integer, integer, text) is
  '#2062/#2060 (0177): open self-registration claims a seat atomically. Locks '
  'the games row, re-checks status and signups_closed_at, counts held seats '
  '(1 per player outside a team, max(rows, p_seat_team_size) per team, '
  'withdrawn rows excluded), refuses past p_cap, picks the lowest free team '
  'number in 1..p_max_teams for a new team, and inserts the row. Returns '
  'jsonb {outcome, team_number}; outcome is ok | already_on_roster | game_full '
  '| game_locked | signup_closed | game_not_found. The cap is computed in '
  'TypeScript and passed in. Kun service_role.';

revoke all on function public.claim_open_registration_seat(uuid, uuid, integer, integer, timestamptz, integer, integer, text) from public;
revoke execute on function public.claim_open_registration_seat(uuid, uuid, integer, integer, timestamptz, integer, integer, text) from anon, authenticated;
grant execute on function public.claim_open_registration_seat(uuid, uuid, integer, integer, timestamptz, integer, integer, text) to service_role;
