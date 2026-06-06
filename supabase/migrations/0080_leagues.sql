-- 0080_leagues.sql
-- #453 (Liga-epic #452, Fase 1): grunnmur for sesong-liga.
--
-- Wrapper-lag over eksisterende games-tabell, samme idé som cup (0039): en liga
-- binder N runder sammen til én sesong-konkurranse. Hver runde spilles av små
-- flights, og hver flight er en helt vanlig solo_strokeplay-`games`-rad merket
-- med `league_round_id`. Sesong-tabellen aggregeres i app-laget
-- (lib/league/computeLeagueStandings.ts), akkurat som computeCupLeaderboard.
--
-- Additivt: tre nye tabeller + to nullable games-kolonner + select-RLS. Ingen
-- eksisterende kolonne/policy endres. Samme trygge klasse som 0074/0075 — kan
-- applyes før kode-deploy.
--
-- RLS-modell (kontrakt #453): SELECT for alle innloggede (leaderboards er
-- sosiale, som tournaments). Skriv til liga-tabellene kun for global admin via
-- `is_admin()` (speiler den live «games admin write»-policyen). Deltakere skriver
-- ALDRI liga-tabellene — de inserter kun games-rader (dekket av «games creator
-- insert», 0071).

-- ── leagues (paraply) ────────────────────────────────────────────────────────
create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  season_start date not null,
  season_end date not null check (season_end >= season_start),
  -- Fast format for hele ligaen. Fase 1 låst til 'stroke' (slagspill).
  format text not null default 'stroke',
  -- Visning: netto / brutto / begge. Fase 1 skriver kun 'net'.
  scoring text not null default 'net' check (scoring in ('net', 'gross', 'both')),
  -- Sesong-modell. Fase 1 bruker 'total' (gjengens metode) + 'average'.
  standings_model text not null
    check (standings_model in ('total', 'average', 'best_n', 'points')),
  -- Kun relevant for 'total': hvordan en manglende runde håndteres.
  missed_round_policy text not null default 'penalty'
    check (missed_round_policy in ('penalty', 'must_play_all')),
  penalty_kind text not null default 'worst_plus_one'
    check (penalty_kind in ('worst_plus_one', 'fixed')),
  penalty_fixed_over_par int,
  -- Bane-omfang-trappen: styrer hva som velges per runde.
  course_scope text not null
    check (course_scope in ('single_course_single_tee', 'single_course', 'multi_course')),
  -- Liga-nivå bane/tee (arves av runder når omfanget tilsier det).
  course_id uuid references public.courses(id),
  tee_box_id uuid references public.tee_boxes(id),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'finished')),
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  -- 'fixed' straffescore krever et tall.
  constraint leagues_penalty_fixed_requires_value
    check (penalty_kind <> 'fixed' or penalty_fixed_over_par is not null),
  -- Bane-omfang ↔ liga-nivå bane/tee-konsistens.
  constraint leagues_course_scope_consistency check (
    (course_scope = 'single_course_single_tee' and course_id is not null and tee_box_id is not null)
    or (course_scope = 'single_course' and course_id is not null and tee_box_id is null)
    or (course_scope = 'multi_course' and course_id is null and tee_box_id is null)
  )
);

create index leagues_status_created_at on public.leagues (status, created_at desc);

comment on table public.leagues is
  'Sesong-liga (#453). Paraply som binder N runder (league_rounds) til én '
  'individuell order-of-merit-konkurranse. Sesong-tabell aggregeres i app-laget.';
comment on column public.leagues.course_scope is
  'single_course_single_tee = lås bane+tee på liga-nivå; single_course = bane fast, '
  'tee per runde; multi_course = bane+tee per runde.';

-- ── league_rounds (en runde med eget spillevindu + tee) ──────────────────────
create table public.league_rounds (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  sequence int not null,
  label text not null,
  -- Per-runde bane/tee. NULL ⇒ arv fra leagues (avhengig av course_scope).
  course_id uuid references public.courses(id),
  tee_box_id uuid references public.tee_boxes(id),
  opens_at timestamptz not null,
  closes_at timestamptz not null check (closes_at > opens_at),
  -- Opprinnelig frist (settes = closes_at ved opprettelse). Brukes til å flagge
  -- flights levert utenfor vindu når admin har utvidet closes_at.
  original_closes_at timestamptz not null,
  window_overridden_by uuid references public.users(id),
  window_overridden_at timestamptz,
  created_at timestamptz not null default now(),
  unique (league_id, sequence)
);

create index league_rounds_league_id on public.league_rounds (league_id);

comment on table public.league_rounds is
  'En liga-runde med spillevindu [opens_at, closes_at] og evt. egen bane/tee. '
  'Flights opprettes innenfor vinduet; admin kan utvide closes_at (override).';

-- ── league_players (deltaker-liste for frittstående liga) ────────────────────
create table public.league_players (
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);

create index league_players_user_id on public.league_players (user_id);

comment on table public.league_players is
  'Deltakere i en frittstående liga (Fase 1). Fase 3 utvider med klubb-medlemskap.';

-- ── games-kobling ────────────────────────────────────────────────────────────
-- En flight = en solo_strokeplay-games-rad merket med runden den hører til.
-- SET NULL: sletter man en runde overlever spillet (mister bare liga-koblingen),
-- samme mønster som games.tournament_id (0039).
alter table public.games
  add column league_round_id uuid references public.league_rounds(id) on delete set null,
  add column delivered_outside_window boolean not null default false;

create index games_league_round_id on public.games (league_round_id)
  where league_round_id is not null;

comment on column public.games.league_round_id is
  'FK til liga-runde. NULL = ikke en liga-flight. ON DELETE SET NULL.';
comment on column public.games.delivered_outside_window is
  'true når flighten ble opprettet etter rundens original_closes_at (kun mulig '
  'via admin-override av vinduet). Flagges for admin på liga-detalj.';

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.leagues        enable row level security;
alter table public.league_rounds  enable row level security;
alter table public.league_players enable row level security;

-- SELECT: alle innloggede (sosiale leaderboards, som tournaments 0039).
create policy "leagues select authenticated"
  on public.leagues for select to authenticated using (true);
create policy "league_rounds select authenticated"
  on public.league_rounds for select to authenticated using (true);
create policy "league_players select authenticated"
  on public.league_players for select to authenticated using (true);

-- WRITE: kun global admin (speiler live «games admin write»). Deltakere skriver
-- aldri disse tabellene; de inserter kun games-rader via creator-RLS (0071).
create policy "leagues admin write"
  on public.leagues for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "league_rounds admin write"
  on public.league_rounds for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "league_players admin write"
  on public.league_players for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
