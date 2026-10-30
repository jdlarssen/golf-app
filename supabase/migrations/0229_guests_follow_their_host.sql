-- 0229 (#2607): the guests a player brought leave when that player's seat goes,
-- before the start.
--
-- The owner's rule (#2570, #2607): a player may only bring guests while the
-- player is signed up, and when the player leaves, the guests leave too. A
-- guest (users.is_guest) has no login and cannot leave on its own, so nobody
-- else stands behind its place.
--
-- The rule used to live in TypeScript helpers, so every writer that went past
-- them escaped it: the app's organiser «Fjern» (a plain DELETE under RLS),
-- account deletion (anonymize_user deletes the pre-start roster rows in SQL),
-- and a retry in «Rediger» after a failed guest withdrawal. This trigger is
-- now the rule's one home (AGENTS.md trap 4). Every way a host's seat is
-- deleted runs through it, in the same transaction as the delete: if the
-- cascade fails, the host's seat stays too.
--
-- The link today is the team sign-up: a guest's request points at the
-- captain's (team_request_id). The captaincy hand-over (0194) moves the
-- pointer, so the guests follow the new captain; 0228 keeps a guest from
-- becoming captain.
--
-- What it does, after a statement deletes game_players rows:
--   for each deleted row whose player is a team captain in a draft or
--   scheduled game, every guest under that captain with a pending or approved
--   request is withdrawn: the request is marked withdrawn and the guest's
--   roster row is deleted.
-- What it leaves alone:
--   - a game that has started: a withdrawal then is a soft withdrawn_at, and
--     the guest plays on (the contract's non-goal);
--   - teammates with an account;
--   - a guest whose own row the same statement deleted: the caller removed it
--     on purpose. That keeps the approval's compensation working
--     (registrationDecisionCore deletes the inserted rows of a whole team in one
--     statement and then puts the requests back to pending), and an organiser
--     who removes both host and guest in «Rediger» gets exactly that.
-- decided_by_user_id is the caller (auth.uid()) when there is one, otherwise
-- the host: the service-role paths (withdrawSelf, anonymize_user) are the
-- host's own action.
--
-- A statement trigger with a transition table, so one delete of many rows
-- runs one cascade. The nested delete of the guests' rows fires it again; a
-- guest is never a captain, so that run finds nothing, and its own nested
-- delete removes no rows. A statement trigger fires on a 0-row statement too,
-- so the function returns at once when nothing was deleted: without that the
-- chain never ends (stack depth limit exceeded on every delete, caught on
-- staging 30.10).
--
-- Order against prod: migration first or together with the deploy. The new
-- code no longer withdraws the guests in TypeScript; without this trigger a
-- host who leaves would leave the guests on the roster.

create or replace function public.withdraw_guests_of_removed_hosts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
  begin
    -- A statement trigger fires even when the statement deleted nothing, and
    -- the delete below is such a statement once the guests are gone. Without
    -- this return the trigger would call itself forever.
    if not exists (select 1 from removed) then
      return null;
    end if;

    with hosts as (
      select distinct r.id as captain_request_id, r.game_id, r.user_id as host_id
        from removed d
        join public.games g
          on g.id = d.game_id
         and g.status in ('draft', 'scheduled')
        join public.game_registration_requests r
          on r.game_id = d.game_id
         and r.user_id = d.user_id
         and r.is_team_captain
    ), guests as (
      select c.id, c.game_id, c.user_id, h.host_id
        from hosts h
        join public.game_registration_requests c
          on c.team_request_id = h.captain_request_id
         and c.game_id = h.game_id
        join public.users u
          on u.id = c.user_id
         and u.is_guest
       where c.status in ('pending', 'approved')
         and not exists (
           select 1 from removed d2
            where d2.game_id = c.game_id
              and d2.user_id = c.user_id
         )
    ), marked as (
      update public.game_registration_requests r
         set status = 'withdrawn',
             decided_at = now(),
             decided_by_user_id = coalesce(auth.uid(), g.host_id)
        from guests g
       where r.id = g.id
      returning r.game_id, r.user_id
    )
    delete from public.game_players gp
     using marked m
     where gp.game_id = m.game_id
       and gp.user_id = m.user_id;

    return null;
  end;
$function$;

comment on function public.withdraw_guests_of_removed_hosts() is
  '#2607 (0229): statement trigger on game_players. When a team captain''s roster row is deleted '
  'before the start (draft/scheduled), the guests (users.is_guest) under that captain with a '
  'pending or approved request are withdrawn: request marked withdrawn, roster row deleted. '
  'Guests whose own row the same statement deleted are left alone. Teammates with an account '
  'are never touched. Trigger only.';

revoke all on function public.withdraw_guests_of_removed_hosts() from public;
revoke execute on function public.withdraw_guests_of_removed_hosts() from anon, authenticated;

drop trigger if exists game_players_withdraw_guests_of_removed_hosts on public.game_players;
create trigger game_players_withdraw_guests_of_removed_hosts
  after delete on public.game_players
  referencing old table as removed
  for each statement
  execute function public.withdraw_guests_of_removed_hosts();
