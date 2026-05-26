-- 0039_tournaments.sql
-- Fase 1 av #47 — Ryder Cup-stil cup-grunnmur (multi-match singles).
--
-- Wrapper-lag over eksisterende games-tabell: en cup binder N singles_matchplay-
-- spill sammen til én lag-vs-lag-konkurranse. Hver match er fortsatt en vanlig
-- games-rad med uendret scoring/scorekort/approval — `tournament_id` FK kobler
-- match-en til cup-en. Master-leaderboard aggregeres i applikasjons-laget
-- (lib/cup/computeCupLeaderboard.ts).
--
-- For fase 1: eksakt 2 lag, lag-navn på cup-raden (ikke egen teams-tabell).
-- Spillerne på laget hentes via games.tournament_id-join på game_players —
-- ingen ekstra roster-tabell siden enhver cup-spiller MÅ være med i minst én
-- match for å score. (Tomt roster før første match er forventet draft-state.)

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  team_1_name text not null check (char_length(team_1_name) between 1 and 40),
  team_2_name text not null check (char_length(team_2_name) between 1 and 40),
  points_to_win numeric(4,1) not null check (points_to_win > 0),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'finished')),
  winner_team smallint check (winner_team in (1, 2)),
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index tournaments_status_created_at on public.tournaments (status, created_at desc);

comment on table public.tournaments is
  'Ryder Cup-stil multi-match-turnering. Wrapper-lag som binder N games-rader '
  '(singles_matchplay per fase 1) til én lag-vs-lag-konkurranse. Fase 1 av #47.';
comment on column public.tournaments.winner_team is
  'Settes når cup-en er avgjort (status=finished). 1 = team 1, 2 = team 2, NULL = uavgjort.';
comment on column public.tournaments.points_to_win is
  'Point-mål for cup-seier. Vanlig regel: halvparten av tilgjengelige point + 0,5 (8 matches → 4,5).';

-- games.tournament_id: FK til cup. ON DELETE SET NULL slik at cup-slett
-- ikke ødelegger historiske matches — de blir frittstående spill igjen.
alter table public.games
  add column tournament_id uuid references public.tournaments(id) on delete set null,
  add column tournament_match_label text;

create index games_tournament_id on public.games (tournament_id)
  where tournament_id is not null;

comment on column public.games.tournament_id is
  'FK til parent cup. NULL = stand-alone spill. ON DELETE SET NULL: cup-slett rydder ikke matches.';
comment on column public.games.tournament_match_label is
  'Admin-tekst som identifiserer match-en i cup-en («Singles 1», «Singles 2», ...). Fri tekst.';

-- RLS for tournaments: alle innloggede ser cup-en (samme modell som games —
-- leaderboards er sosiale, ikke private). INSERT/UPDATE/DELETE går via admin-
-- client i server-actions (ingen klient-side-policy nødvendig).
alter table public.tournaments enable row level security;

create policy tournaments_select_authenticated
  on public.tournaments for select
  to authenticated
  using (true);
