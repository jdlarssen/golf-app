-- 0030_game_modes.sql
-- Introduserer game_mode + mode_config på games, gjør team/flight nullable på game_players.

-- 1. Nye kolonner på games (med default for backfill)
alter table public.games
  add column game_mode text not null default 'best_ball_netto',
  add column mode_config jsonb not null default '{}'::jsonb;

alter table public.games
  add constraint games_mode_check
    check (game_mode in ('best_ball_netto', 'stableford'));

-- 2. Backfill mode_config for eksisterende best-ball-spill
update public.games
  set mode_config = jsonb_build_object('team_size', 2, 'teams_count', 4)
  where game_mode = 'best_ball_netto' and mode_config = '{}'::jsonb;

-- 3. Drop default på game_mode — nye spill må velge eksplisitt
alter table public.games alter column game_mode drop default;

-- 4. game_players: drop NOT NULL på team/flight
alter table public.game_players
  alter column team_number drop not null,
  alter column flight_number drop not null;

-- 5. Rebuild CHECK-constraints for å tillate null
alter table public.game_players
  drop constraint if exists game_players_team_number_check,
  drop constraint if exists game_players_flight_number_check;

alter table public.game_players
  add constraint game_players_team_number_check
    check (team_number is null or team_number between 1 and 4),
  add constraint game_players_flight_number_check
    check (flight_number is null or flight_number between 1 and 4);

-- 6. Konsistens: team og flight må være satt/null sammen
alter table public.game_players
  add constraint game_players_team_flight_consistency
    check ((team_number is null) = (flight_number is null));

-- 7. Indeks på game_mode for queries som filtrerer per mode
create index if not exists games_game_mode_idx on public.games(game_mode);
