-- 0249: the write rules for Wolf choices, Bingo Bango Bongo holes and Patsome
-- tee starters move into the database, and Bingo Bango Bongo is one flight.
--
-- Owner-ordered audit 20.11. Until now the three per-hole tables trusted the
-- screens for most of their rules. The rules below are the ones the web's
-- server actions and the app already follow; this file makes Postgres hold
-- them too (AGENTS.md trap 3).
--
--   wolf_hole_choices
--     - the round is in progress and the format is Wolf
--     - the wolf plays in the game and holds a rotation slot
--     - on a hole in the fixed part of the rotation, the wolf is the player
--       whose slot the hole belongs to (wolf_rotation_slot, the SQL twin of
--       lib/scoring/modes/wolfTurn.ts; wolfRotationDbCheck.test.ts and the
--       pgTAP suite hold the two to the same table)
--     - on a hole the standings decide (the closing holes), the database
--       cannot know who trails, so there it asks only for a player with a slot,
--       and the first choice saved stands (a later one from another player is
--       refused with its own reason; an admin can correct the row)
--     - a partner plays in the game and is not the wolf
--     - entered_by is the caller
--     - a player writes only their own row; an admin may write any wolf, in any
--       status, as before (the override the hole page reads back)
--
--   bingo_bango_bongo_holes
--     - the round is in progress and the format is Bingo Bango Bongo
--     - the caller is an active (not withdrawn) player, or an admin
--     - a point goes to a player in the game
--     - entered_by is the caller
--     - no player deletes a row (no screen does; clearing a category is an
--       update to NULL)
--
--   patsome_tee_starters
--     - the round is in progress and the format is Patsome
--     - the caller is an active member of the team, or an admin
--     - the starter is an active member of the same team
--     - no player deletes a row
--     These are the rules set_tee_starter_if_unset (0231) already checks for
--     the app's queue; the direct write the website uses now gets them too.
--
--   Bingo Bango Bongo is one flight
--     The points are one row per hole and game, so two flights would write
--     over each other. A round that is in progress holds at most
--     bbb_max_players() active players: checked when the round starts and when
--     a player joins or returns to a round in progress. The number has one
--     home in TypeScript, START_COUNT_RANGES.bingo_bango_bongo.max;
--     bbbMaxPlayersDbCheck.test.ts fails when the two differ. Reopening a
--     finished round is not a start, so an old round with more players can
--     still be reopened and corrected.
--
-- The guards are BEFORE triggers because they run before the policy's WITH
-- CHECK, so a refusal carries its own reason (the message is a stable code the
-- clients map to copy, lib/wolf/wolfChoiceRefusal.ts). The policies repeat the
-- "who" part as the backstop. A caller without auth.uid() is the service role
-- (seeding, e2e helpers, the finish pipeline): RLS never lets anon reach these
-- tables, and the service role is trusted as it is everywhere else.
--
-- Additive for the clients: every write the web and the app make today passes.
-- Apply to staging first, then prod before or with the deploy.

-- ─────────────────────────────────────────────────────────────────────────────
-- Pure helpers
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.bbb_max_players()
returns integer
language sql
immutable
set search_path = ''
as $$ select 4 $$;

comment on function public.bbb_max_players() is
  'Active players a Bingo Bango Bongo round in progress can hold (one flight). Twin of START_COUNT_RANGES.bingo_bango_bongo.max.';

-- The slot that is wolf on a hole in the fixed part of the rotation, or NULL
-- when the standings decide the hole (or the input is out of range).
--   trailing: holes 1 .. floor(18/n)*n rotate; the rest go to the trailer.
--   catch_up: the standings can decide from hole 16 (3 or 5 players) or 17 (4).
create or replace function public.wolf_rotation_slot(
  p_hole integer,
  p_players integer,
  p_rule text
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_hole is null or p_players is null then null
    when p_players < 1 or p_hole < 1 or p_hole > 18 then null
    when p_hole >= case
           when p_rule = 'catch_up' and p_players in (3, 5) then 16
           when p_rule = 'catch_up' and p_players = 4 then 17
           else (18 / p_players) * p_players + 1
         end then null
    else ((p_hole - 1) % p_players) + 1
  end
$$;

comment on function public.wolf_rotation_slot(integer, integer, text) is
  'Rotation slot that is wolf on a hole, NULL when the standings decide. Twin of wolfTurn.ts (wolfFixedHolesForSlot).';

-- ─────────────────────────────────────────────────────────────────────────────
-- wolf_hole_choices
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.guard_wolf_hole_choices_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_admin boolean;
  v_status public.game_status;
  v_mode text;
  v_rule text;
  v_slot integer;
  v_players integer;
  v_expected integer;
begin
  if v_uid is null then
    return new;
  end if;

  v_admin := public.is_admin();

  if new.entered_by is distinct from v_uid then
    raise exception 'wolf_choice_entered_by' using errcode = '42501';
  end if;

  if not v_admin and new.wolf_user_id is distinct from v_uid then
    raise exception 'wolf_choice_not_your_hole' using errcode = '42501';
  end if;

  select g.status, g.game_mode, g.mode_config ->> 'wolf_rotation'
    into v_status, v_mode, v_rule
    from public.games g
   where g.id = new.game_id;

  if not found or v_mode is distinct from 'wolf' then
    raise exception 'wolf_choice_wrong_game' using errcode = '42501';
  end if;

  if not v_admin and v_status <> 'active' then
    raise exception 'wolf_choice_game_not_active' using errcode = '42501';
  end if;

  select gp.team_number
    into v_slot
    from public.game_players gp
   where gp.game_id = new.game_id
     and gp.user_id = new.wolf_user_id;

  if not found or v_slot is null then
    raise exception 'wolf_choice_not_in_game' using errcode = '42501';
  end if;

  if new.partner_user_id is not null then
    if new.partner_user_id = new.wolf_user_id
       or not exists (
         select 1
           from public.game_players gp
          where gp.game_id = new.game_id
            and gp.user_id = new.partner_user_id
       ) then
      raise exception 'wolf_choice_partner_not_in_game' using errcode = '42501';
    end if;
  end if;

  if not v_admin then
    -- The rotation counts every player with a slot, as the engine and both
    -- hole pages do.
    select count(*)
      into v_players
      from public.game_players gp
     where gp.game_id = new.game_id
       and gp.team_number is not null;

    v_expected := public.wolf_rotation_slot(
      new.hole_number,
      v_players,
      case when v_rule = 'catch_up' then 'catch_up' else 'trailing' end
    );

    if v_expected is not null and v_slot <> v_expected then
      raise exception 'wolf_choice_not_your_hole' using errcode = '42501';
    end if;

    -- The hole already has a choice for another wolf: a closing hole someone
    -- else saved first, or an admin's override. The update policy would refuse
    -- the upsert without a reason, so the guard says it here.
    if tg_op = 'INSERT'
       and exists (
         select 1
           from public.wolf_hole_choices c
          where c.game_id = new.game_id
            and c.hole_number = new.hole_number
            and c.wolf_user_id <> new.wolf_user_id
       ) then
      raise exception 'wolf_choice_hole_taken' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_wolf_hole_choices_write() from public, anon, authenticated;

drop trigger if exists guard_wolf_hole_choices_write on public.wolf_hole_choices;
create trigger guard_wolf_hole_choices_write
  before insert or update on public.wolf_hole_choices
  for each row execute function public.guard_wolf_hole_choices_write();

drop policy if exists wolf_choices_insert on public.wolf_hole_choices;
create policy wolf_choices_insert on public.wolf_hole_choices
  for insert
  with check (
    public.is_admin()
    or (
      wolf_user_id = (select auth.uid())
      and exists (
        select 1
          from public.games g
         where g.id = wolf_hole_choices.game_id
           and g.status = 'active'
           and g.game_mode = 'wolf'
      )
    )
  );

drop policy if exists wolf_choices_update on public.wolf_hole_choices;
create policy wolf_choices_update on public.wolf_hole_choices
  for update
  using (
    public.is_admin()
    or (
      wolf_user_id = (select auth.uid())
      and exists (
        select 1
          from public.games g
         where g.id = wolf_hole_choices.game_id
           and g.status = 'active'
           and g.game_mode = 'wolf'
      )
    )
  )
  with check (
    public.is_admin()
    or (
      wolf_user_id = (select auth.uid())
      and exists (
        select 1
          from public.games g
         where g.id = wolf_hole_choices.game_id
           and g.status = 'active'
           and g.game_mode = 'wolf'
      )
    )
  );

drop policy if exists wolf_choices_delete on public.wolf_hole_choices;
create policy wolf_choices_delete on public.wolf_hole_choices
  for delete
  using (
    public.is_admin()
    or (
      wolf_user_id = (select auth.uid())
      and exists (
        select 1
          from public.games g
         where g.id = wolf_hole_choices.game_id
           and g.status = 'active'
           and g.game_mode = 'wolf'
      )
    )
  );

-- An admin outside the game can read the choices. Without it the admin's
-- override fails on the upsert both clients send, which must be able to read
-- the row it writes. patsome_tee_starters_read already has the same branch.
drop policy if exists wolf_choices_read on public.wolf_hole_choices;
create policy wolf_choices_read on public.wolf_hole_choices
  for select
  using (
    public.is_admin()
    or exists (
      select 1
        from public.game_players gp
       where gp.game_id = wolf_hole_choices.game_id
         and gp.user_id = (select auth.uid())
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- bingo_bango_bongo_holes
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.guard_bbb_holes_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_admin boolean;
  v_status public.game_status;
  v_mode text;
  v_recipient uuid;
begin
  if v_uid is null then
    return new;
  end if;

  v_admin := public.is_admin();

  if new.entered_by is distinct from v_uid then
    raise exception 'bbb_hole_entered_by' using errcode = '42501';
  end if;

  select g.status, g.game_mode
    into v_status, v_mode
    from public.games g
   where g.id = new.game_id;

  if not found or v_mode is distinct from 'bingo_bango_bongo' then
    raise exception 'bbb_hole_wrong_game' using errcode = '42501';
  end if;

  if not v_admin then
    if v_status <> 'active' then
      raise exception 'bbb_hole_game_not_active' using errcode = '42501';
    end if;

    if not exists (
      select 1
        from public.game_players gp
       where gp.game_id = new.game_id
         and gp.user_id = v_uid
         and gp.withdrawn_at is null
    ) then
      raise exception 'bbb_hole_not_in_game' using errcode = '42501';
    end if;
  end if;

  -- A point goes to a player in the game. Only the categories this write
  -- changes are checked, so one stale name never blocks the other two.
  foreach v_recipient in array array[
    case when tg_op = 'INSERT' or new.bingo_user_id is distinct from old.bingo_user_id then new.bingo_user_id end,
    case when tg_op = 'INSERT' or new.bango_user_id is distinct from old.bango_user_id then new.bango_user_id end,
    case when tg_op = 'INSERT' or new.bongo_user_id is distinct from old.bongo_user_id then new.bongo_user_id end
  ]
  loop
    if v_recipient is not null
       and not exists (
         select 1
           from public.game_players gp
          where gp.game_id = new.game_id
            and gp.user_id = v_recipient
       ) then
      raise exception 'bbb_hole_recipient_not_in_game' using errcode = '42501';
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function public.guard_bbb_holes_write() from public, anon, authenticated;

drop trigger if exists guard_bbb_holes_write on public.bingo_bango_bongo_holes;
create trigger guard_bbb_holes_write
  before insert or update on public.bingo_bango_bongo_holes
  for each row execute function public.guard_bbb_holes_write();

-- The old policy was FOR ALL, which also let any player delete a row.
drop policy if exists bbb_holes_write on public.bingo_bango_bongo_holes;
drop policy if exists bbb_holes_insert on public.bingo_bango_bongo_holes;
drop policy if exists bbb_holes_update on public.bingo_bango_bongo_holes;
drop policy if exists bbb_holes_delete on public.bingo_bango_bongo_holes;

create policy bbb_holes_insert on public.bingo_bango_bongo_holes
  for insert
  with check (
    public.is_admin()
    or exists (
      select 1
        from public.game_players gp
        join public.games g on g.id = gp.game_id
       where gp.game_id = bingo_bango_bongo_holes.game_id
         and gp.user_id = (select auth.uid())
         and gp.withdrawn_at is null
         and g.status = 'active'
         and g.game_mode = 'bingo_bango_bongo'
    )
  );

create policy bbb_holes_update on public.bingo_bango_bongo_holes
  for update
  using (
    public.is_admin()
    or exists (
      select 1
        from public.game_players gp
        join public.games g on g.id = gp.game_id
       where gp.game_id = bingo_bango_bongo_holes.game_id
         and gp.user_id = (select auth.uid())
         and gp.withdrawn_at is null
         and g.status = 'active'
         and g.game_mode = 'bingo_bango_bongo'
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1
        from public.game_players gp
        join public.games g on g.id = gp.game_id
       where gp.game_id = bingo_bango_bongo_holes.game_id
         and gp.user_id = (select auth.uid())
         and gp.withdrawn_at is null
         and g.status = 'active'
         and g.game_mode = 'bingo_bango_bongo'
    )
  );

create policy bbb_holes_delete on public.bingo_bango_bongo_holes
  for delete
  using (public.is_admin());

-- The old FOR ALL policy also gave an admin outside the game read access. The
-- read policy now carries it, because an upsert must be able to read the row
-- it writes.
drop policy if exists bbb_holes_read on public.bingo_bango_bongo_holes;
create policy bbb_holes_read on public.bingo_bango_bongo_holes
  for select
  using (
    public.is_admin()
    or exists (
      select 1
        from public.game_players gp
       where gp.game_id = bingo_bango_bongo_holes.game_id
         and gp.user_id = (select auth.uid())
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- patsome_tee_starters
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.guard_patsome_tee_starters_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_admin boolean;
  v_status public.game_status;
  v_mode text;
begin
  if v_uid is null then
    return new;
  end if;

  v_admin := public.is_admin();

  select g.status, g.game_mode
    into v_status, v_mode
    from public.games g
   where g.id = new.game_id;

  if not found or v_mode is distinct from 'patsome' then
    raise exception 'patsome_starter_wrong_game' using errcode = '42501';
  end if;

  if not v_admin then
    if v_status <> 'active' then
      raise exception 'patsome_starter_game_not_active' using errcode = '42501';
    end if;

    if not exists (
      select 1
        from public.game_players gp
       where gp.game_id = new.game_id
         and gp.team_number = new.team_number
         and gp.user_id = v_uid
         and gp.withdrawn_at is null
    ) then
      raise exception 'patsome_starter_not_on_team' using errcode = '42501';
    end if;
  end if;

  if not exists (
    select 1
      from public.game_players gp
     where gp.game_id = new.game_id
       and gp.team_number = new.team_number
       and gp.user_id = new.tee_starter_user_id
       and gp.withdrawn_at is null
  ) then
    raise exception 'patsome_starter_pick_not_on_team' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_patsome_tee_starters_write() from public, anon, authenticated;

drop trigger if exists guard_patsome_tee_starters_write on public.patsome_tee_starters;
create trigger guard_patsome_tee_starters_write
  before insert or update on public.patsome_tee_starters
  for each row execute function public.guard_patsome_tee_starters_write();

drop policy if exists patsome_tee_starters_insert on public.patsome_tee_starters;
create policy patsome_tee_starters_insert on public.patsome_tee_starters
  for insert
  with check (
    public.is_admin()
    or exists (
      select 1
        from public.game_players gp
        join public.games g on g.id = gp.game_id
       where gp.game_id = patsome_tee_starters.game_id
         and gp.team_number = patsome_tee_starters.team_number
         and gp.user_id = (select auth.uid())
         and gp.withdrawn_at is null
         and g.status = 'active'
         and g.game_mode = 'patsome'
    )
  );

drop policy if exists patsome_tee_starters_update on public.patsome_tee_starters;
create policy patsome_tee_starters_update on public.patsome_tee_starters
  for update
  using (
    public.is_admin()
    or exists (
      select 1
        from public.game_players gp
        join public.games g on g.id = gp.game_id
       where gp.game_id = patsome_tee_starters.game_id
         and gp.team_number = patsome_tee_starters.team_number
         and gp.user_id = (select auth.uid())
         and gp.withdrawn_at is null
         and g.status = 'active'
         and g.game_mode = 'patsome'
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1
        from public.game_players gp
        join public.games g on g.id = gp.game_id
       where gp.game_id = patsome_tee_starters.game_id
         and gp.team_number = patsome_tee_starters.team_number
         and gp.user_id = (select auth.uid())
         and gp.withdrawn_at is null
         and g.status = 'active'
         and g.game_mode = 'patsome'
    )
  );

drop policy if exists patsome_tee_starters_delete on public.patsome_tee_starters;
create policy patsome_tee_starters_delete on public.patsome_tee_starters
  for delete
  using (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- Bingo Bango Bongo is one flight
-- ─────────────────────────────────────────────────────────────────────────────

-- A player joins, or returns to, a round in progress.
create or replace function public.guard_bbb_roster_size()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active integer;
begin
  if new.withdrawn_at is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.withdrawn_at is null then
    return new;
  end if;

  if not exists (
    select 1
      from public.games g
     where g.id = new.game_id
       and g.status = 'active'
       and g.game_mode = 'bingo_bango_bongo'
  ) then
    return new;
  end if;

  select count(*)
    into v_active
    from public.game_players gp
   where gp.game_id = new.game_id
     and gp.user_id <> new.user_id
     and gp.withdrawn_at is null;

  if v_active + 1 > public.bbb_max_players() then
    raise exception 'bbb_too_many_players'
      using errcode = '23514',
            hint = 'A Bingo Bango Bongo round in progress is one flight: bbb_max_players() active players.';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_bbb_roster_size() from public, anon, authenticated;

drop trigger if exists guard_bbb_roster_size on public.game_players;
create trigger guard_bbb_roster_size
  before insert or update of withdrawn_at on public.game_players
  for each row execute function public.guard_bbb_roster_size();

-- The round starts (or an active round changes format to Bingo Bango Bongo).
-- Reopening a finished round is not a start.
create or replace function public.guard_bbb_start_size()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active integer;
begin
  if new.status <> 'active' or new.game_mode is distinct from 'bingo_bango_bongo' then
    return new;
  end if;
  if old.game_mode is not distinct from new.game_mode
     and old.status in ('active', 'finished') then
    return new;
  end if;

  select count(*)
    into v_active
    from public.game_players gp
   where gp.game_id = new.id
     and gp.withdrawn_at is null;

  if v_active > public.bbb_max_players() then
    raise exception 'bbb_too_many_players'
      using errcode = '23514',
            hint = 'A Bingo Bango Bongo round in progress is one flight: bbb_max_players() active players.';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_bbb_start_size() from public, anon, authenticated;

drop trigger if exists guard_bbb_start_size on public.games;
create trigger guard_bbb_start_size
  before update of status, game_mode on public.games
  for each row execute function public.guard_bbb_start_size();
