-- 0208 (#2567): two narrow ways past the invite-eligibility guard on
-- game_players, one for cups and one for league flights, and a guard that keeps
-- a league_players row in its league.
--
-- guard_game_players_invite_eligibility (0115, BEFORE INSERT on game_players)
-- lets a signed-in non-admin add another user only when that user is a
-- friend, a former co-player or (in a club game) a club member. Two flows
-- write game_players with the caller's own client and broke on that rule:
--
--   1. Cup. «Generer kamper» inserts every match as the organiser. Players who
--      joined through the cup link (#1490) are on the participant list but are
--      usually neither friends nor co-players of the organiser, and a personal
--      cup has no club. The first such row raised 42501 and the whole batch was
--      rolled back. New rule: the game belongs to a cup (games.tournament_id),
--      the caller manages that cup (can_manage_tournament: global admin, club
--      admin of a club cup, creator of a personal cup) and the user is in
--      tournament_participants for the same cup. Who is on that list is server
--      controlled: tournament_participants has no client INSERT policy, and the
--      cup link writes it with the service role.
--
--   2. League. startLeagueRoundFlight inserts the flight's players as the
--      member who starts it. Two league members who have never played together
--      raised 42501. New rule: the game is a league flight
--      (games.league_round_id), the round's league is active and both the
--      caller and the user are in league_players for that league. It cannot be
--      "the caller manages the league": the one who starts a flight is an
--      ordinary member, so that rule would leave the bug for everyone but
--      admins. It mirrors the not_member check in startLeagueRoundFlight
--      instead. Only the server and admins can set games.league_round_id
--      (guard_games_league_round_id). Rows in league_players are inserted by
--      admins, club admins and join_club_league; a player may only mark their
--      own pending row accepted (policy «league_players self mark accepted»).
--
--   3. league_players.league_id and user_id are now fixed. The policy above
--      lets a player with a pending row update it as long as the result is
--      their own accepted row, and it never pinned league_id. So anyone with
--      a pending league invite could move that row into any other league and
--      accept it in one PATCH. That hole is older than #2567, but branch 2
--      would widen it: once inside a league, that person could start a flight
--      with any of its members, and sharing that game makes them co-players
--      for is_invite_eligible everywhere. New trigger
--      guard_league_players_self_update: changing league_id or user_id raises
--      42501 unless the caller is the service role (auth.uid() is null) or a
--      global admin. No app code moves a row (a move is a delete and an
--      insert), so club admins get no exception.
--
-- Why the trigger and not is_invite_eligible: is_invite_eligible also feeds the
-- roster_candidates RPC and is mirrored by lib/games/inviteEligibility.ts. A
-- change there would widen player pickers and invitations for every game. The
-- trigger knows the game (new.game_id), so it can scope each branch to one cup
-- or one league.
--
-- Unchanged: is_invite_eligible, roster_candidates, the game_players trigger
-- itself, RLS policies and the other guards. Every row the two branches do not
-- let through goes to is_invite_eligible exactly as before. The body below is
-- the live definition (0115 as it stands after 0202) with the two branches
-- added.
--
-- Direction (what does OLD code do with this applied?): the same, but the two
-- flows above stop failing. No code change is needed for either fix, and no
-- code changes league_id or user_id on an existing league_players row.
-- supabase/tests/game_players_cup_league_eligibility_test.sql covers both
-- branches and the cases they must not let through;
-- supabase/tests/league_players_self_update_guard_test.sql covers part 3.

create or replace function public.guard_game_players_invite_eligibility()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
  declare
    v_uid uuid := auth.uid();
    v_group_id uuid;
    v_tournament_id uuid;
    v_league_round_id uuid;
  begin
    if v_uid is null or public.is_admin() or new.user_id = v_uid then
      return new;
    end if;

    select g.group_id, g.tournament_id, g.league_round_id
      into v_group_id, v_tournament_id, v_league_round_id
      from public.games g
     where g.id = new.game_id;

    -- #2567: whoever manages a cup may put the cup's own participants in the
    -- cup's games.
    if v_tournament_id is not null
       and public.can_manage_tournament(v_tournament_id)
       and exists (
         select 1 from public.tournament_participants tp
          where tp.tournament_id = v_tournament_id
            and tp.user_id = new.user_id
       ) then
      return new;
    end if;

    -- #2567: a member of an active league may put another member of the same
    -- league in a flight of that league.
    if v_league_round_id is not null
       and exists (
         select 1
           from public.league_rounds lr
           join public.leagues l on l.id = lr.league_id
          where lr.id = v_league_round_id
            and l.status = 'active'
            and exists (
              select 1 from public.league_players me
               where me.league_id = lr.league_id and me.user_id = v_uid
            )
            and exists (
              select 1 from public.league_players them
               where them.league_id = lr.league_id and them.user_id = new.user_id
            )
       ) then
      return new;
    end if;

    if not public.is_invite_eligible(v_uid, new.user_id, v_group_id) then
      raise exception
        'Recipient % is not invite-eligible for creator % (friends/co-players/club members only)',
        new.user_id, v_uid
        using errcode = 'insufficient_privilege';
    end if;

    return new;
  end;
  $$;

comment on function public.guard_game_players_invite_eligibility() is
  '#921: BEFORE INSERT on game_players. Rejects a signed-in non-admin who inserts a '
  'user_id that is not invite-eligible (friend/co-player/club member) via raw '
  'PostgREST. No-op for the service role (auth.uid() IS NULL), admins and self. '
  '#2567: also lets through the cup''s own participants for whoever manages the cup, '
  'and members of an active league in a flight of that league when the caller is a '
  'member too.';

-- create or replace keeps the grants; repeated so a fresh database matches 0137
-- and supabase/tests/prod_vakt_hardening_1121_test.sql.
revoke execute on function public.guard_game_players_invite_eligibility() from public, anon, authenticated;

-- ── 3. league_players.league_id and user_id are fixed ────────────────────────
create or replace function public.guard_league_players_self_update()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
  begin
    if auth.uid() is null or public.is_admin() then
      return new;
    end if;

    if new.league_id is distinct from old.league_id
       or new.user_id is distinct from old.user_id then
      raise exception
        'league_players.league_id and user_id cannot be changed (remove the row and add a new one)'
        using errcode = 'insufficient_privilege';
    end if;

    return new;
  end;
  $$;

comment on function public.guard_league_players_self_update() is
  '#2567: BEFORE UPDATE OF league_id, user_id on league_players. Only the service role '
  '(auth.uid() IS NULL) and global admins may change either column. Closes the move of a '
  'pending row into another league through «league_players self mark accepted».';

revoke execute on function public.guard_league_players_self_update() from public, anon, authenticated;

drop trigger if exists guard_league_players_self_update on public.league_players;
create trigger guard_league_players_self_update
  before update of league_id, user_id on public.league_players
  for each row
  execute function public.guard_league_players_self_update();
