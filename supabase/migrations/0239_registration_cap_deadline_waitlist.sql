-- 0239 (#2482): the organiser's own cap, a signup deadline and a waiting list.
--
-- Three columns on games, set on «Klar?» and in «Rediger»:
--   registration_cap  the organiser's cap on self-registration. The cap the
--                     signup enforces is the lower of this and the format's
--                     (effectiveRegistrationCap in TypeScript, the rule's one
--                     home). null = only the format's cap.
--   signup_deadline   after it nobody new signs up or asks for a seat. Checked
--                     when someone tries, so no scheduled job. null = none.
--   waitlist_enabled  on a full open round the requests (#2837) are a waiting
--                     list: when a seat frees before the start, the first one
--                     gets it and a varsel. Off = as before, the organiser
--                     answers each request by hand. false for every old game;
--                     the wizard sets true.
--
-- The cap itself stays in TypeScript, as 0199 decided: both functions below get
-- it as p_cap. The bounds 2..200 are REGISTRATION_CAP_MIN/MAX in
-- lib/wizard/fitsPlayerCount.ts; registrationCapDbCheck.test.ts reads this
-- file and fails when the two disagree (trap 4).
--
-- claim_open_registration_seat: same signature and body as 0199, plus the
-- deadline under the lock (step 1). A claim that waited for the lock past the
-- deadline gets signup_closed, like a game closed by hand.
--
-- promote_waitlist_seat (new): gives one seat to one waiting request, in one
-- transaction. It locks the games row the same way the claim does, so a claim
-- and a promotion never hand out the same seat. It checks everything again
-- under the lock and answers with {outcome, user_id}. The loop over the queue,
-- the tee category (profileTeeGender) and the varsel are TypeScript's
-- (lib/games/promoteWaitlist.ts): a trigger cannot send a push, and a seat
-- given without a varsel is worse than one not given — the request then still
-- waits in the organiser's inbox.
--
-- registration_waitlist (new): the queue, the rule's one home. Pending
-- requests of the player's own (not a captain, not a teammate's row, not a
-- brought guest) whose player has no roster row, oldest created_at first, id
-- on a tie, with each one's place. promote_waitlist_seat checks place 1 with
-- it, and the server counts «N på venteliste» and picks the head with it. A
-- requester the organiser already added never blocks the queue. A player
-- cannot move up: the self-update policy (0042) only lets a pending request
-- become withdrawn.
--
-- After the deadline the list still moves up until the start; after «Steng
-- påmeldingen» (signups_closed_at) it does not (the owner's answer, 16.11).
--
-- RLS: the columns are on games, under the existing update policies (creator
-- or admin). No new policy. registration_waitlist and promote_waitlist_seat
-- are service_role only, like the claim.
--
-- Order against prod: migration FIRST, then merge. Backwards compatible: the
-- code on main never sets the columns, and the claim answers as before while
-- signup_deadline is null.

alter table public.games
  add column registration_cap integer,
  add column signup_deadline timestamptz,
  add column waitlist_enabled boolean not null default false;

alter table public.games
  add constraint games_registration_cap_check
  check (registration_cap between 2 and 200);

comment on column public.games.registration_cap is
  '#2482: the organiser''s cap on self-registration (2..200). The signup enforces '
  'the lower of this and the format''s cap (effectiveRegistrationCap). null = only '
  'the format''s cap. The organiser''s own additions are not limited by it.';
comment on column public.games.signup_deadline is
  '#2482: nobody new signs up or asks for a seat from this instant. Checked when '
  'someone tries (and under the seat claim''s lock); no scheduled job. null = none.';
comment on column public.games.waitlist_enabled is
  '#2482: on a full open round the pending solo requests are a waiting list, and '
  'promote_waitlist_seat gives a freed seat to the first one. false = the '
  'organiser answers each request by hand (#2837).';

create or replace function public.claim_open_registration_seat(
  p_game_id uuid,
  p_user_id uuid,
  p_seat_team_size integer,
  p_max_teams integer,
  p_accepted_at timestamptz,
  -- null = no cap on this axis (effectiveRegistrationCap null)
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
    v_signup_deadline timestamptz;
    v_existing_team integer;
    v_seats integer;
    v_team integer;
  begin
    -- 1. Lock the game. Every claim for this game waits here for the one before.
    select g.status, g.signups_closed_at, g.signup_deadline
      into v_status, v_signups_closed_at, v_signup_deadline
      from public.games g
     where g.id = p_game_id
       for no key update;

    if not found then
      return jsonb_build_object('outcome', 'game_not_found', 'team_number', null);
    end if;
    if v_status not in ('draft', 'scheduled') then
      return jsonb_build_object('outcome', 'game_locked', 'team_number', null);
    end if;
    -- #2482: the deadline closes the signup as «Steng påmeldingen» does.
    if v_signups_closed_at is not null
       or (v_signup_deadline is not null and now() >= v_signup_deadline) then
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
  '#2062/#2060 (0177), #2209 (0187), #2258 (0199), #2482 (0239): open '
  'self-registration claims a seat atomically. Locks the games row, re-checks '
  'status, signups_closed_at and signup_deadline, counts held seats through '
  'registration_seats_held (1 per player outside a team, max(rows, '
  'p_seat_team_size) per team, withdrawn rows excluded), refuses past p_cap, '
  'picks the lowest free team number in 1..p_max_teams for a new team, and '
  'inserts the row with p_tee_gender (profileTeeGender, default mens). Returns '
  'jsonb {outcome, team_number}; outcome is ok | already_on_roster | game_full | '
  'game_locked | signup_closed | game_not_found. The cap and the tee category '
  'are computed in TypeScript and passed in. Kun service_role.';

revoke all on function public.claim_open_registration_seat(uuid, uuid, integer, integer, timestamptz, integer, integer, text, public.player_tee_gender) from public;
revoke execute on function public.claim_open_registration_seat(uuid, uuid, integer, integer, timestamptz, integer, integer, text, public.player_tee_gender) from anon, authenticated;
grant execute on function public.claim_open_registration_seat(uuid, uuid, integer, integer, timestamptz, integer, integer, text, public.player_tee_gender) to service_role;

create function public.registration_waitlist(p_game_ids uuid[])
returns table (game_id uuid, request_id uuid, user_id uuid, place integer)
language sql
stable
security invoker
set search_path = ''
as $function$
  select r.game_id,
         r.id,
         r.user_id,
         (row_number() over (partition by r.game_id order by r.created_at, r.id))::integer
    from public.game_registration_requests r
   where r.game_id = any (p_game_ids)
     and r.status = 'pending'
     and not r.is_team_captain
     and r.team_request_id is null
     and r.brought_by_user_id is null
     and not exists (
       select 1 from public.game_players gp
        where gp.game_id = r.game_id
          and gp.user_id = r.user_id
     )
   order by r.game_id, r.created_at, r.id;
$function$;

comment on function public.registration_waitlist(uuid[]) is
  '#2482 (0239): the waiting list of each game, in order: pending solo requests '
  'of the player''s own (no captain, no teammate row, no brought guest) whose '
  'player has no roster row, created_at then id, with place 1, 2, …. Read by '
  'promote_waitlist_seat (place 1) and by the server for «N på venteliste» and '
  'the head of the queue. Whether the list moves up is waitlist_enabled''s. '
  'Kun service_role.';

revoke all on function public.registration_waitlist(uuid[]) from public;
revoke execute on function public.registration_waitlist(uuid[]) from anon, authenticated;
grant execute on function public.registration_waitlist(uuid[]) to service_role;

create function public.promote_waitlist_seat(
  p_game_id uuid,
  p_request_id uuid,
  -- null = no cap: every waiting request fits (only after the cap was removed)
  p_cap integer,
  p_seat_team_size integer,
  -- the player's category, from profileTeeGender, as the claim gets it
  p_tee_gender public.player_tee_gender default 'mens'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
  declare
    v_status public.game_status;
    v_mode public.registration_mode;
    v_waitlist boolean;
    v_signups_closed_at timestamptz;
    v_request public.game_registration_requests%rowtype;
    v_seats integer;
  begin
    -- 1. Lock the game, as claim_open_registration_seat does: a claim and a
    --    promotion wait for each other, so the last seat goes once.
    select g.status, g.registration_mode, g.waitlist_enabled, g.signups_closed_at
      into v_status, v_mode, v_waitlist, v_signups_closed_at
      from public.games g
     where g.id = p_game_id
       for no key update;

    if not found then
      return jsonb_build_object('outcome', 'game_not_found', 'user_id', null);
    end if;
    if v_status not in ('draft', 'scheduled') then
      return jsonb_build_object('outcome', 'game_locked', 'user_id', null);
    end if;
    if v_mode <> 'open' then
      return jsonb_build_object('outcome', 'wrong_mode', 'user_id', null);
    end if;
    if not v_waitlist then
      return jsonb_build_object('outcome', 'waitlist_off', 'user_id', null);
    end if;
    -- Closed by hand: the organiser sets the flights now. The deadline is not
    -- checked: the list moves up until the start (the owner's answer, 16.11).
    if v_signups_closed_at is not null then
      return jsonb_build_object('outcome', 'signup_closed', 'user_id', null);
    end if;

    -- 2. The request: still the player's own waiting one in this game.
    select r.*
      into v_request
      from public.game_registration_requests r
     where r.id = p_request_id
       and r.game_id = p_game_id
       for update;

    if not found
       or v_request.status <> 'pending'
       or v_request.is_team_captain
       or v_request.team_request_id is not null
       or v_request.brought_by_user_id is not null then
      return jsonb_build_object('outcome', 'not_pending', 'user_id', null);
    end if;

    if exists (
      select 1 from public.game_players gp
       where gp.game_id = p_game_id
         and gp.user_id = v_request.user_id
    ) then
      return jsonb_build_object('outcome', 'already_on_roster', 'user_id', v_request.user_id);
    end if;

    -- 3. First in the queue (registration_waitlist, the queue's one home).
    if (select w.request_id
          from public.registration_waitlist(array[p_game_id]) w
         where w.place = 1) is distinct from v_request.id then
      return jsonb_build_object('outcome', 'not_first', 'user_id', null);
    end if;

    -- 4. A free seat, by the count the claim uses.
    if p_cap is not null then
      select h.seats
        into v_seats
        from public.registration_seats_held(array[p_game_id], array[p_seat_team_size]) h;

      if v_seats + 1 > p_cap then
        return jsonb_build_object('outcome', 'game_full', 'user_id', null);
      end if;
    end if;

    -- 5. The request is answered and the player is on the roster, in the same
    --    transaction. No decider: the list did it. Confirmed at once: the
    --    player asked for the seat (#463).
    update public.game_registration_requests
       set status = 'approved',
           decided_at = now(),
           decided_by_user_id = null
     where id = v_request.id;

    insert into public.game_players
      (game_id, user_id, team_number, flight_number, course_handicap, accepted_at, signup_source, tee_gender)
    values
      (p_game_id, v_request.user_id, null, null, null, now(), null, p_tee_gender);

    return jsonb_build_object('outcome', 'ok', 'user_id', v_request.user_id);
  end;
$function$;

comment on function public.promote_waitlist_seat(uuid, uuid, integer, integer, public.player_tee_gender) is
  '#2482 (0239): gives one freed seat to the first request on the waiting list. '
  'Locks the games row like claim_open_registration_seat, re-checks status, '
  'registration_mode = open, waitlist_enabled and signups_closed_at (the deadline '
  'is not checked: the list moves up until the start), that the request is a '
  'pending solo request of the player''s own and place 1 in registration_waitlist, '
  'and that registration_seats_held '
  '+ 1 <= p_cap. Then approves the request and inserts the roster row with '
  'p_tee_gender. Returns jsonb {outcome, user_id}; outcome is ok | not_first | '
  'not_pending | already_on_roster | game_full | waitlist_off | wrong_mode | '
  'signup_closed | game_locked | game_not_found. Kun service_role.';

revoke all on function public.promote_waitlist_seat(uuid, uuid, integer, integer, public.player_tee_gender) from public;
revoke execute on function public.promote_waitlist_seat(uuid, uuid, integer, integer, public.player_tee_gender) from anon, authenticated;
grant execute on function public.promote_waitlist_seat(uuid, uuid, integer, integer, public.player_tee_gender) to service_role;
