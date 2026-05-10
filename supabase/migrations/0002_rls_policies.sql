-- Enable RLS on all tables
alter table public.users enable row level security;
alter table public.courses enable row level security;
alter table public.course_holes enable row level security;
alter table public.tee_boxes enable row level security;
alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.scores enable row level security;
alter table public.invitations enable row level security;

-- Helper function: is current user admin?
create or replace function public.is_admin() returns boolean
  language sql security definer stable
  as $$
    select exists(select 1 from public.users where id = auth.uid() and is_admin = true);
  $$;

-- Helper: same flight as another user in a game?
create or replace function public.same_flight(p_game_id uuid, p_other_user uuid) returns boolean
  language sql security definer stable
  as $$
    select exists(
      select 1
      from public.game_players me
      join public.game_players them
        on me.game_id = them.game_id
        and me.flight_number = them.flight_number
      where me.game_id = p_game_id
        and me.user_id = auth.uid()
        and them.user_id = p_other_user
    );
  $$;

-- USERS
create policy "users select own or shared games" on public.users
  for select using (
    id = auth.uid()
    or public.is_admin()
    or exists(
      select 1 from public.game_players gp1
      join public.game_players gp2 on gp1.game_id = gp2.game_id
      where gp1.user_id = auth.uid() and gp2.user_id = public.users.id
    )
  );

create policy "users update own" on public.users
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy "users insert own" on public.users
  for insert with check (id = auth.uid());

-- COURSES
create policy "courses select all" on public.courses for select using (true);
create policy "courses admin write" on public.courses
  for all using (public.is_admin()) with check (public.is_admin());

create policy "holes select all" on public.course_holes for select using (true);
create policy "holes admin write" on public.course_holes
  for all using (public.is_admin()) with check (public.is_admin());

create policy "tees select all" on public.tee_boxes for select using (true);
create policy "tees admin write" on public.tee_boxes
  for all using (public.is_admin()) with check (public.is_admin());

-- GAMES
create policy "games select if participant or admin" on public.games
  for select using (
    public.is_admin()
    or exists(select 1 from public.game_players where game_id = public.games.id and user_id = auth.uid())
  );

create policy "games admin write" on public.games
  for all using (public.is_admin()) with check (public.is_admin());

-- GAME_PLAYERS
create policy "game_players select shared game" on public.game_players
  for select using (
    public.is_admin()
    or exists(
      select 1 from public.game_players gp
      where gp.game_id = public.game_players.game_id and gp.user_id = auth.uid()
    )
  );

create policy "game_players admin write" on public.game_players
  for all using (public.is_admin()) with check (public.is_admin());

create policy "game_players self submit" on public.game_players
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- SCORES (the important one)
create policy "scores select gating" on public.scores
  for select using (
    -- admin always sees
    public.is_admin()
    -- finished game: any participant sees all
    or (exists(select 1 from public.games g where g.id = public.scores.game_id and g.status = 'finished')
        and exists(select 1 from public.game_players gp where gp.game_id = public.scores.game_id and gp.user_id = auth.uid()))
    -- active game: own scores
    or user_id = auth.uid()
    -- active game: same-flight scores
    or public.same_flight(public.scores.game_id, public.scores.user_id)
  );

create policy "scores insert by flight" on public.scores
  for insert with check (
    public.is_admin()
    or (
      exists(select 1 from public.games g where g.id = public.scores.game_id and g.status = 'active')
      and entered_by = auth.uid()
      and (user_id = auth.uid() or public.same_flight(public.scores.game_id, public.scores.user_id))
      and not exists(
        select 1 from public.game_players gp
        where gp.game_id = public.scores.game_id and gp.user_id = public.scores.user_id and gp.submitted_at is not null
      )
    )
  );

create policy "scores update by flight" on public.scores
  for update using (
    public.is_admin()
    or (
      exists(select 1 from public.games g where g.id = public.scores.game_id and g.status = 'active')
      and (user_id = auth.uid() or public.same_flight(public.scores.game_id, public.scores.user_id))
      and not exists(
        select 1 from public.game_players gp
        where gp.game_id = public.scores.game_id and gp.user_id = public.scores.user_id and gp.submitted_at is not null
      )
    )
  ) with check (entered_by = auth.uid() or public.is_admin());

-- INVITATIONS
create policy "invitations admin write" on public.invitations
  for all using (public.is_admin()) with check (public.is_admin());

create policy "invitations select by token" on public.invitations
  for select using (true);  -- token is the secret; we filter by it in queries
