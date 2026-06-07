-- 0083_leagues_group_scoping.sql
--
-- #480 Fase 1 — klubb-scopet liga. Gir `leagues` en valgfri klubb-tilknytning
-- (`group_id`) og åpner skrive-tilgang for klubb-eiere/-admins på rader scopet
-- til en klubb de styrer. Frittstående ligaer (`group_id IS NULL`) er uendret:
-- synlige for alle innloggede (som #453), og kun global admin kan skrive dem
-- (demokratisert frittstående liga-oppretting er bevisst et eget issue).
--
-- RLS-modell:
--   leagues SELECT  : group_id null → alle; ellers medlemmer + global admin.
--   leagues WRITE   : global admin alt; klubb-admin kun klubb-scopede rader.
--   rounds/players  : SELECT uendret (using(true) — lesing går via admin-client-
--                     snapshot); WRITE = global admin eller klubb-admin av
--                     parent-ligaens klubb (via SECURITY DEFINER league_group_id).
--
-- Bygger på groups/group_members (0074) og speiler games.group_id-mønsteret (0075).

-- ── leagues.group_id ─────────────────────────────────────────────────────────

alter table public.leagues
  add column group_id uuid references public.groups(id) on delete set null;

create index leagues_group_id_idx on public.leagues (group_id)
  where group_id is not null;

comment on column public.leagues.group_id is
  'Valgfri klubb-tilknytning (#480 Fase 1). NULL = frittstående (venner). Satt = '
  'klubb-liga: klubbmedlemmer ser den, klubb-eier/-admin oppretter og styrer den.';

-- ── leagues RLS ──────────────────────────────────────────────────────────────

-- SELECT: frittstående synlig for alle (uendret); klubb-scopet kun medlemmer +
-- global admin. Eksisterende ligaer har group_id null → ingen synlighets-regresjon.
drop policy "leagues select authenticated" on public.leagues;
create policy "leagues select scoped"
  on public.leagues for select to authenticated
  using (
    group_id is null
    or public.is_admin()
    or public.is_group_member(group_id)
  );

-- WRITE: global admin alt; klubb-admin kun rader scopet til en klubb de admin-er.
-- Frittstående (group_id null) → kun global admin (krever is_admin()).
drop policy "leagues admin write" on public.leagues;
create policy "leagues admin or club-admin write"
  on public.leagues for all to authenticated
  using (
    public.is_admin()
    or (group_id is not null and public.is_group_admin(group_id))
  )
  with check (
    public.is_admin()
    or (group_id is not null and public.is_group_admin(group_id))
  );

-- ── child-table WRITE: parent-ligaens klubb ──────────────────────────────────

-- SECURITY DEFINER-oppslag på parent-ligaens group_id. Bryter RLS-rekursjon:
-- barn-tabellenes write-policy må lese leagues, men gjør det med definer-rettigheter
-- (samme mønster som is_group_member/is_group_admin i 0074).
create or replace function public.league_group_id(p_league_id uuid)
  returns uuid
  language sql
  security definer
  stable
  set search_path = ''
  as $$
    select group_id from public.leagues where id = p_league_id
  $$;

grant execute on function public.league_group_id(uuid) to authenticated;

-- league_rounds WRITE: global admin eller klubb-admin av parent-ligaens klubb.
-- SELECT forblir using(true) (uendret).
drop policy "league_rounds admin write" on public.league_rounds;
create policy "league_rounds admin or club-admin write"
  on public.league_rounds for all to authenticated
  using (
    public.is_admin()
    or (
      public.league_group_id(league_id) is not null
      and public.is_group_admin(public.league_group_id(league_id))
    )
  )
  with check (
    public.is_admin()
    or (
      public.league_group_id(league_id) is not null
      and public.is_group_admin(public.league_group_id(league_id))
    )
  );

-- league_players WRITE: samme regel som rounds.
drop policy "league_players admin write" on public.league_players;
create policy "league_players admin or club-admin write"
  on public.league_players for all to authenticated
  using (
    public.is_admin()
    or (
      public.league_group_id(league_id) is not null
      and public.is_group_admin(public.league_group_id(league_id))
    )
  )
  with check (
    public.is_admin()
    or (
      public.league_group_id(league_id) is not null
      and public.is_group_admin(public.league_group_id(league_id))
    )
  );
