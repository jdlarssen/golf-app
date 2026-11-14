-- 0237 (#2283, PR A): the side contest on the hole. The flight reports who was
-- closest to the pin or hit the longest drive, and a cup match ticks off who
-- hit the green in regulation (GIR). The organiser still picks the winners
-- (game_side_winners) and types the cup's GIR counts (tournament_side_awards):
-- nothing here is ever copied into either.
--
--   1. games.side_ld_holes / games.side_ctp_holes: the hole for each slot,
--      chosen when the game is made. Slot i has the hole holes[i] only while
--      i <= side_*_count (holeForSlot in lib/games/sideContest.ts), so a
--      lowered count never breaks the CHECK. A null element is a slot without
--      a hole; a null column is «no holes chosen», the behaviour before 0237.
--
--   2. game_side_claims: one row per game, category, hole and flight. The
--      flight's latest report wins (on conflict do update). winner_user_id
--      null = «Ingen på green/fairway». distance_m only for closest_to_pin
--      with a winner.
--
--   3. game_gir_claims: one row per game, hole and player, so two phones
--      ticking off different players never overwrite each other. No row =
--      not reported, hit = false = reported, missed (the cup counters' NULL
--      vs 0). GIR exists only in a cup: the game's own side tournament has no
--      GIR category, and the cup formats keep no putts to derive it from.
--
--   4. side_claim_flight_key: the caller's flight key. 0 in a single-flight
--      game (Wolf, or at most four active players: isSingleFlightGame in
--      lib/games/flightScope.ts and branch (b) of can_score_for), else the
--      caller's flight_number. Null for a withdrawn player or a non-player.
--      Both tables' SELECT policy is «flight_number = my key», so a flight
--      never sees another flight's reports, and an organiser who plays sees
--      only their own flight's.
--
--   5. is_side_contest_hole: the SQL copy of contestsForHole. A hole is a
--      contest hole for a category when the game's own slot has it, or when
--      the cup (tournament_side_awards) has that kind on the hole. A derived
--      cup game (source_game_id set, 0151) keeps no scores of its own, so it
--      has no contest holes either.
--
--   6. record_side_claim / record_gir_claims: the only write paths. RLS has
--      no write policy and the API roles have no write grants. Each answers
--      'ok' only when it wrote the rows it was asked to, else a code:
--      not_player, not_active, no_slot, wrong_flight, bad_distance. Every
--      check runs before the write, so a refused call writes nothing.
--
--   7. side_claims_for_finish: every flight's reports for the organiser's
--      finish screen in the app, which has no service role. The web and the
--      cup read with the admin client behind their own gates.
--
-- The bounds (holes 1–18, distance 0.1–99.9) also live in
-- lib/games/sideContest.ts; lib/games/sideContestDbCheck.test.ts pins that
-- the two agree (AGENTS.md trap 4). supabase/tests/game_side_claims_rls_test.sql
-- is the hostile-request test.
--
-- Additive: no existing row changes. GAME_SELECT on the web and in the app
-- reads the two new columns, so this goes to prod before the code that reads
-- it is merged.

-- ── 1. The holes on games ──────────────────────────────────────────────────
alter table public.games
  add column if not exists side_ld_holes integer[] null,
  add column if not exists side_ctp_holes integer[] null;

comment on column public.games.side_ld_holes is
  '#2283: the hole for each longest-drive slot (slot i = side_ld_holes[i] while i <= side_ld_count). Null element = no hole for that slot.';
comment on column public.games.side_ctp_holes is
  '#2283: the hole for each closest-to-pin slot (slot i = side_ctp_holes[i] while i <= side_ctp_count). Null element = no hole for that slot.';

alter table public.games
  drop constraint if exists games_side_holes_valid;
alter table public.games
  add constraint games_side_holes_valid check (
    (
      side_ld_holes is null
      or (
        coalesce(array_ndims(side_ld_holes), 1) = 1
        and cardinality(side_ld_holes) <= 2
        and array_remove(side_ld_holes, null) <@ '{1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18}'::integer[]
      )
    )
    and (
      side_ctp_holes is null
      or (
        coalesce(array_ndims(side_ctp_holes), 1) = 1
        and cardinality(side_ctp_holes) <= 2
        and array_remove(side_ctp_holes, null) <@ '{1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18}'::integer[]
      )
    )
  );

-- ── 2. game_side_claims ────────────────────────────────────────────────────
create table if not exists public.game_side_claims (
  game_id uuid not null references public.games(id) on delete cascade,
  category text not null
    constraint game_side_claims_category_check
    check (category in ('longest_drive', 'closest_to_pin')),
  hole_number integer not null
    constraint game_side_claims_hole_number_check
    check (hole_number between 1 and 18),
  flight_number integer not null
    constraint game_side_claims_flight_number_check
    check (flight_number >= 0),
  winner_user_id uuid null references public.users(id) on delete cascade,
  distance_m numeric(3, 1) null
    constraint game_side_claims_distance_range
    check (distance_m is null or distance_m between 0.1 and 99.9),
  entered_by uuid not null references public.users(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (game_id, category, hole_number, flight_number),
  constraint game_side_claims_distance_shape check (
    distance_m is null or (category = 'closest_to_pin' and winner_user_id is not null)
  )
);

comment on table public.game_side_claims is
  '#2283: the flight''s report of who was closest to the pin or hit the longest drive on a contest hole. Written only through record_side_claim; the organiser still picks the winner.';

-- ── 3. game_gir_claims ─────────────────────────────────────────────────────
create table if not exists public.game_gir_claims (
  game_id uuid not null references public.games(id) on delete cascade,
  hole_number integer not null
    constraint game_gir_claims_hole_number_check
    check (hole_number between 1 and 18),
  user_id uuid not null references public.users(id) on delete cascade,
  flight_number integer not null
    constraint game_gir_claims_flight_number_check
    check (flight_number >= 0),
  hit boolean not null,
  entered_by uuid not null references public.users(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (game_id, hole_number, user_id)
);

comment on table public.game_gir_claims is
  '#2283: a cup match''s report of who hit the green in regulation on a cup GIR hole. No row = not reported, hit = false = missed. Written only through record_gir_claims; the organiser still types the cup''s GIR counts.';

-- ── 4. The flight key ──────────────────────────────────────────────────────
create or replace function public.side_claim_flight_key(p_game_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when g.game_mode = 'wolf'
             or (
               select count(*)
                 from public.game_players gp
                where gp.game_id = g.id
                  and gp.withdrawn_at is null
             ) <= 4
             then 0
           else me.flight_number
         end
    from public.games g
    join public.game_players me
      on me.game_id = g.id
     and me.user_id = auth.uid()
     and me.withdrawn_at is null
   where g.id = p_game_id;
$$;

-- ── 5. Which holes are contest holes ───────────────────────────────────────
create or replace function public.is_side_contest_hole(
  p_game_id uuid,
  p_category text,
  p_hole_number integer
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select g.source_game_id is null
       and p_hole_number between 1 and 18
       and (
         (p_category = 'closest_to_pin'
           and p_hole_number = any (g.side_ctp_holes[1:g.side_ctp_count]))
         or (p_category = 'longest_drive'
           and p_hole_number = any (g.side_ld_holes[1:g.side_ld_count]))
         or (
           g.tournament_id is not null
           and exists (
             select 1
               from public.tournament_side_awards a
              where a.tournament_id = g.tournament_id
                and a.hole_number = p_hole_number
                and a.kind = case p_category
                               when 'closest_to_pin' then 'ctp'
                               when 'longest_drive' then 'ld'
                               when 'gir' then 'gir'
                             end
           )
         )
       )
      from public.games g
     where g.id = p_game_id
  ), false);
$$;

-- ── 6a. The write path for closest to pin and longest drive ───────────────
create or replace function public.record_side_claim(
  p_game_id uuid,
  p_category text,
  p_hole_number integer,
  p_winner_user_id uuid,
  p_distance_m numeric
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key integer;
  v_status public.game_status;
  v_distance numeric;
  v_written integer;
begin
  v_key := public.side_claim_flight_key(p_game_id);
  if v_key is null then
    return 'not_player';
  end if;

  select g.status into v_status from public.games g where g.id = p_game_id;
  if v_status is distinct from 'active' then
    return 'not_active';
  end if;

  if p_category is null
     or p_category not in ('closest_to_pin', 'longest_drive')
     or not public.is_side_contest_hole(p_game_id, p_category, p_hole_number) then
    return 'no_slot';
  end if;

  -- can_score_for: the winner is an active player in the caller's flight.
  if p_winner_user_id is not null
     and not public.can_score_for(p_game_id, p_winner_user_id) then
    return 'wrong_flight';
  end if;

  if p_distance_m is not null then
    v_distance := round(p_distance_m, 1);
    if p_category <> 'closest_to_pin'
       or p_winner_user_id is null
       or v_distance < 0.1
       or v_distance > 99.9 then
      return 'bad_distance';
    end if;
  end if;

  insert into public.game_side_claims
    (game_id, category, hole_number, flight_number, winner_user_id, distance_m, entered_by, updated_at)
  values
    (p_game_id, p_category, p_hole_number, v_key, p_winner_user_id, v_distance, auth.uid(), now())
  on conflict (game_id, category, hole_number, flight_number) do update
    set winner_user_id = excluded.winner_user_id,
        distance_m = excluded.distance_m,
        entered_by = excluded.entered_by,
        updated_at = excluded.updated_at;

  get diagnostics v_written = row_count;
  if v_written <> 1 then
    raise exception 'record_side_claim wrote % rows, expected 1', v_written;
  end if;
  return 'ok';
end;
$$;

-- ── 6b. The write path for GIR ─────────────────────────────────────────────
create or replace function public.record_gir_claims(
  p_game_id uuid,
  p_hole_number integer,
  p_user_ids uuid[],
  p_hit boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key integer;
  v_status public.game_status;
  v_ids uuid[];
  v_written integer;
begin
  v_key := public.side_claim_flight_key(p_game_id);
  if v_key is null then
    return 'not_player';
  end if;

  select g.status into v_status from public.games g where g.id = p_game_id;
  if v_status is distinct from 'active' then
    return 'not_active';
  end if;

  -- 'gir' is only ever a cup kind, so a game without tournament_id (or a
  -- derived cup game) has no GIR hole.
  if not public.is_side_contest_hole(p_game_id, 'gir', p_hole_number) then
    return 'no_slot';
  end if;

  if p_hit is null then
    raise exception using
      errcode = '22004',
      message = 'record_gir_claims: p_hit is required';
  end if;

  -- An empty list names no ball in the caller's flight.
  v_ids := array(select distinct u from unnest(p_user_ids) as t(u));
  if cardinality(v_ids) = 0
     or exists (
       select 1
         from unnest(v_ids) as t(u)
        where u is null
           or not public.can_score_for(p_game_id, u)
     ) then
    return 'wrong_flight';
  end if;

  insert into public.game_gir_claims
    (game_id, hole_number, user_id, flight_number, hit, entered_by, updated_at)
  select p_game_id, p_hole_number, t.u, v_key, p_hit, auth.uid(), now()
    from unnest(v_ids) as t(u)
  on conflict (game_id, hole_number, user_id) do update
    set hit = excluded.hit,
        flight_number = excluded.flight_number,
        entered_by = excluded.entered_by,
        updated_at = excluded.updated_at;

  get diagnostics v_written = row_count;
  if v_written <> cardinality(v_ids) then
    raise exception 'record_gir_claims wrote % rows, expected %', v_written, cardinality(v_ids);
  end if;
  return 'ok';
end;
$$;

-- ── 7. The organiser's read for the finish screen ─────────────────────────
-- Name and nickname come back raw: which one is shown is decided in
-- lib/names/playerName.ts, the rule's one home.
create or replace function public.side_claims_for_finish(p_game_id uuid)
returns table (
  category text,
  hole_number integer,
  flight_number integer,
  winner_user_id uuid,
  winner_name text,
  winner_nickname text,
  distance_m numeric,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_game_creator_or_admin(p_game_id) then
    raise exception using
      errcode = '42501',
      message = 'side_claims_for_finish: only the organiser or an admin';
  end if;

  return query
    select c.category, c.hole_number, c.flight_number, c.winner_user_id,
           u.name, u.nickname, c.distance_m, c.updated_at
      from public.game_side_claims c
      left join public.users u on u.id = c.winner_user_id
     where c.game_id = p_game_id
     order by c.category, c.hole_number, c.flight_number;
end;
$$;

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.game_side_claims enable row level security;
alter table public.game_gir_claims enable row level security;

drop policy if exists "game_side_claims select own flight" on public.game_side_claims;
create policy "game_side_claims select own flight"
  on public.game_side_claims
  for select
  to authenticated
  using (flight_number = public.side_claim_flight_key(game_id));

drop policy if exists "game_gir_claims select own flight" on public.game_gir_claims;
create policy "game_gir_claims select own flight"
  on public.game_gir_claims
  for select
  to authenticated
  using (flight_number = public.side_claim_flight_key(game_id));

-- No write grants either: with no write policy RLS already refuses them, and
-- without the grants a write policy added later still cannot open the tables.
-- anon gets nothing, and authenticated keeps only SELECT (the policy above),
-- as in 0210/0236.
revoke all on public.game_side_claims from anon;
revoke insert, update, delete, truncate, references, trigger on public.game_side_claims from authenticated;
revoke all on public.game_gir_claims from anon;
revoke insert, update, delete, truncate, references, trigger on public.game_gir_claims from authenticated;

-- ── Function grants ────────────────────────────────────────────────────────
revoke all on function public.side_claim_flight_key(uuid) from public, anon;
grant execute on function public.side_claim_flight_key(uuid) to authenticated;

revoke all on function public.is_side_contest_hole(uuid, text, integer) from public, anon, authenticated;

revoke all on function public.record_side_claim(uuid, text, integer, uuid, numeric) from public, anon;
grant execute on function public.record_side_claim(uuid, text, integer, uuid, numeric) to authenticated;

revoke all on function public.record_gir_claims(uuid, integer, uuid[], boolean) from public, anon;
grant execute on function public.record_gir_claims(uuid, integer, uuid[], boolean) to authenticated;

revoke all on function public.side_claims_for_finish(uuid) from public, anon;
grant execute on function public.side_claims_for_finish(uuid) to authenticated;
