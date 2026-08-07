-- 0155_tournament_plans_and_participants.sql
--
-- Cup-oppsett i tre adskilte rom (#1472): Oppsett-rommet persisterer
-- bane/tee/tee-off/preset/strategi server-side (erstatter localStorage-
-- utkastet i generer-wizarden), Spillere-rommet persisterer en LAG-LØS
-- deltakerliste (eierbeslutning 2026-08-07: lagfordeling skjer først i
-- Fordel & generer-steget og persisteres aldri før generering).
--
-- Én plan per cup i v1 via UNIQUE(tournament_id) — egen tabell (ikke kolonner
-- på tournaments) slik at fremtidig plan-per-runde bare er å droppe
-- constrainten (eierbeslutning 1). preset_id/strategy valideres i
-- server-action mot cupTemplates.ts — regelens ene hjem, ingen DB-CHECK som
-- dupliserer preset-listen.
--
-- RLS: samme mønster som 0154 (tournament_side_awards) — SELECT for
-- authenticated, INGEN write-policies. Skriv går kun via service-role i
-- server-actions gatet av requireAdminOrClubAdminOfCup, så en direkte
-- PostgREST-write avvises av RLS (AGENTS.md-felle 3).

create table public.tournament_plans (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade unique,
  course_id uuid references public.courses(id) on delete set null,
  tee_box_id uuid references public.tee_boxes(id) on delete set null,
  scheduled_tee_off_at timestamptz,
  preset_id text not null default 'klassisk',
  custom_sessions jsonb,
  strategy text not null default 'handicap',
  best_ball_allowance_pct smallint check (
    best_ball_allowance_pct is null
    or (best_ball_allowance_pct between 0 and 100)
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tournament_participants (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (tournament_id, user_id)
);

-- FK-oppslagene trenger indekser utover PK/UNIQUE: course/tee for
-- on delete set null-sveip, user_id for cascade fra users.
create index tournament_plans_course_id_idx
  on public.tournament_plans (course_id);
create index tournament_plans_tee_box_id_idx
  on public.tournament_plans (tee_box_id);
create index tournament_participants_user_id_idx
  on public.tournament_participants (user_id);

alter table public.tournament_plans enable row level security;
alter table public.tournament_participants enable row level security;

create policy tournament_plans_select_authenticated
  on public.tournament_plans
  for select
  to authenticated
  using (true);

create policy tournament_participants_select_authenticated
  on public.tournament_participants
  for select
  to authenticated
  using (true);
