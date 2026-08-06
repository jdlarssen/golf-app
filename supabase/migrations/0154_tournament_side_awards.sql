-- 0154_tournament_side_awards.sql
--
-- Manuelle sidepoeng for cup (#1441, D9): closest/longest på utvalgte hull
-- gir poeng til vinnerens lag i cup-totalen. Konfigureres i cup-oppsettet
-- (kind + hull + poeng), vinner-spilleren tastes av arrangøren ETTER runden
-- (winner_user_id er NULL til da). Bevisst IKKE koblet til spill-nivåets
-- sideturnering (#576-skjulingen står) — dette er rene cup-poeng.
--
-- RLS: SELECT for authenticated (cup-siden er lesbar for innloggede; snapshot
-- bruker uansett admin-client). INGEN write-policies — skriv går kun via
-- service-role i server-actions gatet av requireAdminOrClubAdminOfCup, så en
-- direkte PostgREST-write avvises av RLS (AGENTS.md-felle #3).

create table public.tournament_side_awards (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  kind text not null check (kind in ('ctp', 'ld')),
  hole_number integer not null check (hole_number between 1 and 18),
  points numeric not null check (points > 0),
  winner_user_id uuid null references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tournament_id, kind, hole_number)
);

create index tournament_side_awards_tournament_id_idx
  on public.tournament_side_awards (tournament_id);

alter table public.tournament_side_awards enable row level security;

create policy tournament_side_awards_select_authenticated
  on public.tournament_side_awards
  for select
  to authenticated
  using (true);
