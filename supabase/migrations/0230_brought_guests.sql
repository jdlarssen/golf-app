-- 0230 (#2607, phase 2): a signed-up player brings one guest, and the guest
-- leaves with the player.
--
-- Phase 1 (0229) made the rule's one home a statement trigger: when a team
-- captain's seat is deleted before the start, the guests under the captain go
-- too. The link there is the team sign-up (team_request_id → the captain's
-- request). A player who signs up alone has no such link, and in an open game
-- has no request row at all.
--
-- «Ta med en gjest» (phase 2) gives that player one button. The guest always
-- gets a request row, also in an open game (approved at once), with the host
-- in the new column brought_by_user_id. The trigger, broughtGuests.ts,
-- «Påmeldinger» and «Styr spillere» then read the same row.
--
-- 1. brought_by_user_id: the player who brought the guest. Nullable and
--    additive; set null if the host's users row is ever deleted.
-- 2. A row is a team row or a brought guest, never both.
-- 3. guard_brought_guest, for every role (service role too): the row must be
--    a guest's (users.is_guest), the host a player with an account on the
--    roster of the same game, and the host may have one live guest
--    (pending/approved). The limit lives here and as BROUGHT_GUESTS_MAX in
--    lib/games/broughtGuests.ts; a test reads this function from the live DB
--    and checks that the two agree (AGENTS.md trap 4).
-- 4. withdraw_guests_of_removed_hosts (0229) also takes the guests a removed
--    player brought. Everything else in it is unchanged.
--
-- Order against prod: additive, so before the deploy of phase 2. Without it
-- the new page's insert fails on the missing column and the player gets an
-- error; nothing else changes.

alter table public.game_registration_requests
  add column if not exists brought_by_user_id uuid
    references public.users(id) on delete set null;

comment on column public.game_registration_requests.brought_by_user_id is
  '#2607 (0230): the player who brought this guest («Ta med en gjest»). Set only on a guest''s '
  'request; the guest leaves when the host''s seat is deleted before the start '
  '(withdraw_guests_of_removed_hosts). Null for every other row.';

create index if not exists game_registration_requests_brought_by_idx
  on public.game_registration_requests (game_id, brought_by_user_id)
  where brought_by_user_id is not null;

alter table public.game_registration_requests
  drop constraint if exists brought_guest_not_in_team;
alter table public.game_registration_requests
  add constraint brought_guest_not_in_team
  check (brought_by_user_id is null or (team_request_id is null and is_team_captain = false));

-- ─── The guard ───────────────────────────────────────────────────────────────
-- Fires when a row gets a host, changes user or game, or changes status, and
-- only when the row has a host. The structural checks (a) run every time; the
-- roster and limit checks (b, c) only while the request is live, so the
-- cascade below can still mark a guest withdrawn after the host's seat is gone.
-- security definer: the checks read rows the caller cannot see under RLS.
create or replace function public.guard_brought_guest()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
  declare
    v_live int;
  begin
    -- (a) a guest, brought by a player with an account, not by itself.
    if new.user_id = new.brought_by_user_id
       or not exists (select 1 from public.users u where u.id = new.user_id and u.is_guest)
       or exists (select 1 from public.users u where u.id = new.brought_by_user_id and u.is_guest)
    then
      raise exception 'not_a_guest' using errcode = 'check_violation';
    end if;

    if new.status not in ('pending', 'approved') then
      return new;
    end if;

    -- (b) the host is signed up in the same game (the owner's rule, 18.10).
    if not exists (
      select 1 from public.game_players gp
       where gp.game_id = new.game_id
         and gp.user_id = new.brought_by_user_id
         and gp.withdrawn_at is null
    ) then
      raise exception 'host_not_on_roster' using errcode = 'check_violation';
    end if;

    -- (c) one live guest per host and game (the owner's answer, 30.10). Two
    -- requests from the same host wait for each other here, so both cannot
    -- pass the count.
    perform pg_advisory_xact_lock(
      hashtextextended(new.game_id::text || ':' || new.brought_by_user_id::text, 2607)
    );
    select count(*) into v_live
      from public.game_registration_requests r
     where r.game_id = new.game_id
       and r.brought_by_user_id = new.brought_by_user_id
       and r.status in ('pending', 'approved')
       and r.id <> new.id;
    if v_live >= 1 then
      raise exception 'brought_guest_limit' using errcode = 'check_violation';
    end if;

    return new;
  end;
$function$;

comment on function public.guard_brought_guest() is
  '#2607 (0230): before insert/update on game_registration_requests when brought_by_user_id is set. '
  'not_a_guest: the row is not a guest''s, or the host is a guest or the guest itself. '
  'host_not_on_roster: the host has no live seat in the game. brought_guest_limit: the host '
  'already has 1 live guest in the game. All roles. Trigger only.';

revoke all on function public.guard_brought_guest() from public;
revoke execute on function public.guard_brought_guest() from anon, authenticated;

drop trigger if exists guard_brought_guest on public.game_registration_requests;
create trigger guard_brought_guest
  before insert or update of brought_by_user_id, user_id, game_id, status
  on public.game_registration_requests
  for each row
  when (new.brought_by_user_id is not null)
  execute function public.guard_brought_guest();

-- ─── The cascade (0229), with the second link ────────────────────────────────
-- Copied from the live function (31.10, same on staging and prod), with one
-- change: the guests are the ones under a removed captain (as before) and the
-- ones a removed player brought (brought_by_user_id).
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

    with removed_seats as (
      select distinct d.game_id, d.user_id as host_id
        from removed d
        join public.games g
          on g.id = d.game_id
         and g.status in ('draft', 'scheduled')
    ), hosts as (
      select distinct r.id as captain_request_id, r.game_id, r.user_id as host_id
        from removed_seats s
        join public.game_registration_requests r
          on r.game_id = s.game_id
         and r.user_id = s.host_id
         and r.is_team_captain
    ), linked as (
      -- under a captain (0229)
      select c.id, c.game_id, c.user_id, c.status, h.host_id
        from hosts h
        join public.game_registration_requests c
          on c.team_request_id = h.captain_request_id
         and c.game_id = h.game_id
      union
      -- brought by a player (0230)
      select c.id, c.game_id, c.user_id, c.status, s.host_id
        from removed_seats s
        join public.game_registration_requests c
          on c.brought_by_user_id = s.host_id
         and c.game_id = s.game_id
    ), guests as (
      select c.id, c.game_id, c.user_id, c.host_id
        from linked c
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
  '#2607 (0229, 0230): statement trigger on game_players. When a player''s roster row is deleted '
  'before the start (draft/scheduled), the guests (users.is_guest) that player brought — under '
  'the player''s team captaincy or by brought_by_user_id — with a pending or approved request are '
  'withdrawn: request marked withdrawn, roster row deleted. Guests whose own row the same '
  'statement deleted are left alone. Teammates with an account are never touched. Trigger only.';

revoke all on function public.withdraw_guests_of_removed_hosts() from public;
revoke execute on function public.withdraw_guests_of_removed_hosts() from anon, authenticated;
