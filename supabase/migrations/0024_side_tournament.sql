-- 0024_side_tournament.sql
-- Adds opt-in side tournament: parallel point competition layered onto best-ball netto.

-- 1. Konfig-kolonner på games
alter table public.games
  add column side_tournament_enabled boolean not null default false,
  add column side_ld_count int not null default 0
    check (side_ld_count between 0 and 2),
  add column side_ctp_count int not null default 0
    check (side_ctp_count between 0 and 2);

-- Consistency: hvis sideturnering ikke er aktivert, må LD/CTP-counts være 0
alter table public.games add constraint games_side_consistency check (
  side_tournament_enabled = true
  or (side_ld_count = 0 and side_ctp_count = 0)
);

-- 2. LD/CTP-vinnere
create table public.game_side_winners (
  game_id uuid not null references public.games(id) on delete cascade,
  category text not null check (category in ('longest_drive', 'closest_to_pin')),
  position int not null check (position between 1 and 2),
  winner_user_id uuid references public.users(id),  -- null = "Ingen kvalifiserte"
  decided_at timestamptz not null default now(),
  primary key (game_id, category, position)
);

create index game_side_winners_game on public.game_side_winners(game_id);

-- 3. RLS
alter table public.game_side_winners enable row level security;

-- Select: admins ser alt; spillere ser vinnere bare når spillet er ferdig
create policy game_side_winners_select on public.game_side_winners
  for select using (
    public.is_admin()
    or exists (
      select 1
      from public.games g
      join public.game_players gp on gp.game_id = g.id
      where g.id = game_side_winners.game_id
        and g.status = 'finished'
        and gp.user_id = auth.uid()
    )
  );

-- Insert/update/delete: kun admin (matches is_admin()-mønsteret fra 0002)
create policy game_side_winners_admin_all on public.game_side_winners
  for all using (public.is_admin())
  with check (public.is_admin());
