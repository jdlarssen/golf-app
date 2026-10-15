-- 0209 (#2580): «Hvem sitt utslag» — whose tee shot the team used, per hole.
--
-- The organiser of a scramble (Texas, Ambrose, Florida) or shamble game can
-- require every player to have at least N of the team's tee shots used over
-- the round (`games.mode_config.min_tee_shots`, 3–6). The team records whose
-- tee shot it played on each hole, and no card can be delivered while anyone
-- on the team is short. The scoring never reads any of this.
--
--   1. team_tee_shots: one row per game, team and hole. Its own table, not a
--      column on scores: upsert_score_if_newer replaces the whole score row,
--      so a phone that had not seen the choice would wipe it, and a shamble
--      team has no team row to hang it on. Keyed by team_number, not by the
--      captain's id, because the team row's owner can change
--      (formerTeamRowOwnerIds, lib/games/teamCaptain.ts).
--
--   2. RLS on, one SELECT policy, no write policy and no write grants for
--      anon/authenticated: every write goes through
--      set_team_tee_shot_if_newer. Readers are the game's players
--      (is_in_game, as «game_players select shared game») and the creator or an
--      admin (is_game_creator_or_admin, as «game_players creator select»): any
--      signed-in user can create a scramble game with the setting on
--      (/opprett-spill, #427), and an organiser who does not play must see who
--      is short on the end-game pages.
--
--   3. set_team_tee_shot_if_newer: last write wins per row, like
--      upsert_score_if_newer, decided by the guard on the upsert itself so two
--      first writes at the same moment keep the newer stamp. The team's
--      game_players rows are locked FOR SHARE before the delivery check, so a
--      delivery at the same moment waits and then counts the write. A
--      refusal answers with one row of NULLs, the shape a locked refusal from
--      upsert_score_if_newer has, so interpretUpsertReply
--      (lib/sync/upsertReply.ts) reads it as 'refused'.
--      Writers mirror the scores policies: an admin, an active member of the
--      team, or someone who can_score_for an active member of the team (the
--      one keeping the flight's card enters every team in the flight). The
--      delivery branches mirror isTeeShotChangeAllowed in
--      lib/games/teeShots.ts: a scramble team is frozen once its card is in; a
--      shamble team once every card is in, and after the first card only
--      while nobody is short afterwards. The late-round lock is NOT enforced
--      here: a queue from a phone that was offline must not be dropped, and
--      the delivery is the hard gate.
--
--   4. team_tee_shot_shortfall: the only SQL copy of the count (it mirrors
--      totalShort in teeShotStatus). No client role may run it: it is
--      SECURITY DEFINER and answers for any game.
--
--   5. guard_game_players_tee_shots: the delivery is blocked in the base too.
--      «game_players self submit» lets a player set submitted_at on their own
--      row with a direct PATCH, and «game_players creator insert» lets the
--      organiser insert a row already delivered, so a check in
--      submitScorecardCore alone would not hold (AGENTS.md trap 3). It fires
--      for every caller, the service role included. On INSERT the new row is
--      not in the table yet, so the new player is counted via p_extra_member.
--
--   6. games_min_tee_shots_valid: the key is only allowed on the four formats,
--      as a number in {3,4,5,6} with min × team_size ≤ 18 (minTeeShotsFeasible
--      in lib/games/teeShots.ts; supabase/tests/team_tee_shots_test.sql pins
--      that the two agree, trap 4). jsonb_typeof is tested before any cast, so
--      "4" or 3.5 is a CHECK violation (23514), never a cast error (22P02).
--
--   7. The table joins the supabase_realtime publication: the web and app hole
--      pages listen for changes.
--
-- Additive: no existing row changes, and a game without the key behaves as
-- before. Apply to staging first, then prod before the code that reads it.

-- ── 1. Table ────────────────────────────────────────────────────────────────
create table if not exists public.team_tee_shots (
  game_id uuid not null references public.games(id) on delete cascade,
  team_number smallint not null check (team_number >= 1),
  hole_number smallint not null check (hole_number between 1 and 18),
  tee_shot_by uuid null references public.users(id) on delete set null,
  entered_by uuid not null references public.users(id),
  client_updated_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (game_id, team_number, hole_number)
);

comment on table public.team_tee_shots is
  '#2580: whose tee shot the team used on each hole. Written only through set_team_tee_shot_if_newer.';

-- ── 2. RLS ──────────────────────────────────────────────────────────────────
alter table public.team_tee_shots enable row level security;

drop policy if exists "team_tee_shots select players and organiser" on public.team_tee_shots;
create policy "team_tee_shots select players and organiser"
  on public.team_tee_shots
  for select
  to authenticated
  using (public.is_game_creator_or_admin(game_id) or public.is_in_game(game_id));

-- No write grants either: with no write policy RLS already refuses them, and
-- without the grants a write policy added later still cannot open the table.
-- authenticated keeps SELECT (the policy above, and realtime).
revoke insert, update, delete, truncate on public.team_tee_shots from anon, authenticated;

-- ── 4. Shortfall (defined before its callers) ──────────────────────────────
create or replace function public.team_tee_shot_shortfall(
  p_game_id uuid,
  p_team_number integer,
  p_extra_member uuid default null
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  with game as (
    select case
             when jsonb_typeof(g.mode_config -> 'min_tee_shots') = 'number'
               then (g.mode_config ->> 'min_tee_shots')::numeric
           end as minimum
      from public.games g
     where g.id = p_game_id
  ),
  members as (
    select gp.user_id
      from public.game_players gp
     where gp.game_id = p_game_id
       and gp.team_number = p_team_number
       and gp.withdrawn_at is null
    union
    select p_extra_member
     where p_extra_member is not null
  )
  select coalesce(sum(greatest(
           game.minimum - (
             select count(*)
               from public.team_tee_shots t
              where t.game_id = p_game_id
                and t.team_number = p_team_number
                and t.tee_shot_by = m.user_id
           ),
           0
         )), 0)::integer
    from members m
    cross join game
   where game.minimum is not null;
$$;

-- ── 3. The write RPC ───────────────────────────────────────────────────────
create or replace function public.set_team_tee_shot_if_newer(
  p_game_id uuid,
  p_team_number integer,
  p_hole_number integer,
  p_tee_shot_by uuid,
  p_client_updated_at timestamptz
)
returns table (
  game_id uuid,
  team_number integer,
  hole_number integer,
  tee_shot_by uuid,
  entered_by uuid,
  client_updated_at timestamptz,
  updated_at timestamptz,
  was_applied boolean
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_status public.game_status;
  v_mode text;
  v_config jsonb;
  v_active integer;
  v_delivered integer;
  v_existing public.team_tee_shots%rowtype;
begin
  -- Every refusal below is `return next` with every OUT column still NULL.
  if v_uid is null
     or p_team_number is null
     or p_hole_number is null
     or p_hole_number not between 1 and 18
     or p_client_updated_at is null then
    return next;
    return;
  end if;

  select g.status, g.game_mode, g.mode_config
    into v_status, v_mode, v_config
    from public.games g
   where g.id = p_game_id;

  if not found
     or v_status <> 'active'
     or v_mode not in ('texas_scramble', 'ambrose', 'florida_scramble', 'shamble')
     or not (v_config ? 'min_tee_shots') then
    return next;
    return;
  end if;

  -- Who may write: an admin, an active member of the team, or someone who can
  -- score for an active member of the team (the scores policies' rule).
  if not (
    public.is_admin()
    or exists (
      select 1
        from public.game_players gp
       where gp.game_id = p_game_id
         and gp.team_number = p_team_number
         and gp.withdrawn_at is null
         and (gp.user_id = v_uid or public.can_score_for(p_game_id, gp.user_id))
    )
  ) then
    return next;
    return;
  end if;

  -- #803's rule for scores: a stamp far in the future would win every later
  -- write and freeze the hole.
  if p_client_updated_at > now() + interval '5 minutes' and not public.is_admin() then
    return next;
    return;
  end if;

  -- The tee shot must belong to an active member of the same team.
  if p_tee_shot_by is not null and not exists (
    select 1
      from public.game_players gp
     where gp.game_id = p_game_id
       and gp.team_number = p_team_number
       and gp.user_id = p_tee_shot_by
       and gp.withdrawn_at is null
  ) then
    return next;
    return;
  end if;

  -- Delivery: scramble is frozen once the team card is in; shamble once every
  -- card is in. teamTeeShotDelivery in lib/games/teeShots.ts is the mirror.
  -- The team's rows are locked FOR SHARE first: a delivery at the same moment
  -- waits for this write, and its guard (guard_game_players_tee_shots) then
  -- counts it; a write after a delivery sees the delivery here.
  perform 1
    from public.game_players gp
   where gp.game_id = p_game_id
     and gp.team_number = p_team_number
   order by gp.user_id
     for share;

  select count(*), count(gp.submitted_at)
    into v_active, v_delivered
    from public.game_players gp
   where gp.game_id = p_game_id
     and gp.team_number = p_team_number
     and gp.withdrawn_at is null;

  if v_delivered > 0 and (v_mode <> 'shamble' or v_delivered = v_active) then
    return next;
    return;
  end if;

  begin
    -- Last write wins per row, decided in this one statement: two first
    -- writes at the same moment both reach the INSERT, and the guard on DO
    -- UPDATE keeps the newer stamp whichever of them commits first.
    insert into public.team_tee_shots as t (
      game_id, team_number, hole_number, tee_shot_by, entered_by, client_updated_at
    ) values (
      p_game_id, p_team_number, p_hole_number, p_tee_shot_by, v_uid, p_client_updated_at
    )
    on conflict on constraint team_tee_shots_pkey do update
      set tee_shot_by = excluded.tee_shot_by,
          entered_by = excluded.entered_by,
          client_updated_at = excluded.client_updated_at,
          updated_at = now()
      where t.client_updated_at < excluded.client_updated_at
    returning t.game_id, t.team_number, t.hole_number, t.tee_shot_by,
              t.entered_by, t.client_updated_at, t.updated_at, true
    into game_id, team_number, hole_number, tee_shot_by,
         entered_by, client_updated_at, updated_at, was_applied;

    if not found then
      -- An older or equal stamp: nothing changed. Answer with the row that
      -- stands, as upsert_score_if_newer does.
      select t.*
        into v_existing
        from public.team_tee_shots t
       where t.game_id = p_game_id
         and t.team_number = p_team_number
         and t.hole_number = p_hole_number;
      game_id := v_existing.game_id;
      team_number := v_existing.team_number;
      hole_number := v_existing.hole_number;
      tee_shot_by := v_existing.tee_shot_by;
      entered_by := v_existing.entered_by;
      client_updated_at := v_existing.client_updated_at;
      updated_at := v_existing.updated_at;
      was_applied := false;
      return next;
      return;
    end if;

    -- Shamble after the first card: only while nobody is short afterwards,
    -- clearing included.
    if v_delivered > 0 and public.team_tee_shot_shortfall(p_game_id, p_team_number) > 0 then
      raise exception 'tee_shots_partial_short';
    end if;
  exception
    when raise_exception then
      -- The write above is rolled back with the block; PL/pgSQL variables
      -- are not, so clear the reply by hand.
      game_id := null;
      team_number := null;
      hole_number := null;
      tee_shot_by := null;
      entered_by := null;
      client_updated_at := null;
      updated_at := null;
      was_applied := null;
  end;

  return next;
end;
$$;

-- ── 5. Delivery guard on game_players ──────────────────────────────────────
create or replace function public.guard_game_players_tee_shots()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.submitted_at is null or new.team_number is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.submitted_at is not null then
    return new;
  end if;

  if public.team_tee_shot_shortfall(
       new.game_id,
       new.team_number,
       case when tg_op = 'INSERT' and new.withdrawn_at is null then new.user_id end
     ) > 0 then
    raise exception 'tee_shots_short'
      using hint = 'Every active player on the team needs games.mode_config.min_tee_shots tee shots in team_tee_shots before a card is delivered (#2580).';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_game_players_tee_shots on public.game_players;
create trigger guard_game_players_tee_shots
  before insert or update of submitted_at on public.game_players
  for each row execute function public.guard_game_players_tee_shots();

-- ── 6. The setting on games ────────────────────────────────────────────────
alter table public.games drop constraint if exists games_min_tee_shots_valid;
alter table public.games add constraint games_min_tee_shots_valid check (
  not (mode_config ? 'min_tee_shots')
  or (
    game_mode in ('texas_scramble', 'ambrose', 'florida_scramble', 'shamble')
    and case
      when jsonb_typeof(mode_config -> 'min_tee_shots') = 'number'
       and jsonb_typeof(mode_config -> 'team_size') = 'number'
        then (mode_config ->> 'min_tee_shots')::numeric in (3, 4, 5, 6)
         and (mode_config ->> 'min_tee_shots')::numeric
             * (mode_config ->> 'team_size')::numeric <= 18
      else false
    end
  )
);

-- ── Grants ─────────────────────────────────────────────────────────────────
-- The default privileges in public give anon and authenticated EXECUTE on
-- every new function, so revoking from public alone removes nothing.
revoke all on function public.set_team_tee_shot_if_newer(uuid, integer, integer, uuid, timestamptz) from public, anon;
grant execute on function public.set_team_tee_shot_if_newer(uuid, integer, integer, uuid, timestamptz) to authenticated;

revoke all on function public.team_tee_shot_shortfall(uuid, integer, uuid) from public, anon, authenticated;
revoke all on function public.guard_game_players_tee_shots() from public, anon, authenticated;

-- ── 7. Realtime ────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'team_tee_shots'
  ) then
    alter publication supabase_realtime add table public.team_tee_shots;
  end if;
end $$;
