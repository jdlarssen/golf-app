-- 0055_patsome.sql
-- Patsome — 6 hull 4BBB → 6 greensome → 6 foursomes (klubb-format, issue #286,
-- del av format-epic #270).
--
-- Patsome scores i én felles valuta (stableford-poeng per lag per hull),
-- summert over tre 6-hulls-segmenter. Scoring er strokeplay-utledet fra
-- `scores`-tabellen — ingen egen score-input-tabell. For hull 7–18 (greensome
-- + foursomes) eier lag-kapteinen (lex-min userId) scores-radene, samme mønster
-- som Texas scramble / foursomes matchplay; ingen skjema-endring på `scores`.
--
-- Den ENESTE nye tabellen er `patsome_tee_starters`: ett valg per lag for hvem
-- som teer ut på oddetallshull i foursomes-segmentet (hull 13–18). Foursomes
-- matchplay (#218) lagrer dette i to hardkodede games-kolonner (side1/side2),
-- men Patsome kan ha N lag, så vi trenger en per-lag-tabell. Rent UI-hint —
-- scoring-laget leser den aldri.

-- 1. patsome_tee_starters — ett tee-starter-valg per (game, lag).
create table public.patsome_tee_starters (
  game_id             uuid not null references public.games(id) on delete cascade,
  team_number         smallint not null check (team_number >= 1),
  -- Spilleren som teer ut på oddetallshull (13/15/17) i foursomes-segmentet.
  -- Makkeren teer partall (14/16/18). Settes av laget via scorekort-velger på
  -- hull 13. NULL-rad finnes ikke — fravær av rad = ikke valgt ennå.
  tee_starter_user_id uuid not null references public.users(id) on delete cascade,
  updated_at          timestamptz not null default now(),
  primary key (game_id, team_number)
);

comment on table public.patsome_tee_starters is
  'For game_mode=patsome: hvem på hvert lag som teer ut på oddetallshull i '
  'foursomes-segmentet (hull 13–18). Rent UI-hint, påvirker ikke scoring. '
  'Fravær av rad = laget har ikke valgt ennå (velger vises på hull 13).';

-- 2. updated_at-trigger (gjenbruker public.set_updated_at fra 0047)
create trigger patsome_tee_starters_set_updated_at
  before update on public.patsome_tee_starters
  for each row execute function public.set_updated_at();

-- 3. RLS — alle deltakere i spillet leser alle lags valg; kun et medlem av det
--    aktuelle laget (eller admin) kan sette/endre sitt eget lags valg.
alter table public.patsome_tee_starters enable row level security;

create policy patsome_tee_starters_read
  on public.patsome_tee_starters for select
  using (
    exists (
      select 1 from public.game_players gp
      where gp.game_id = patsome_tee_starters.game_id
        and gp.user_id = auth.uid()
    )
    or public.is_admin()
  );

create policy patsome_tee_starters_insert
  on public.patsome_tee_starters for insert
  with check (
    exists (
      select 1 from public.game_players gp
      where gp.game_id = patsome_tee_starters.game_id
        and gp.team_number = patsome_tee_starters.team_number
        and gp.user_id = auth.uid()
    )
    or public.is_admin()
  );

create policy patsome_tee_starters_update
  on public.patsome_tee_starters for update
  using (
    exists (
      select 1 from public.game_players gp
      where gp.game_id = patsome_tee_starters.game_id
        and gp.team_number = patsome_tee_starters.team_number
        and gp.user_id = auth.uid()
    )
    or public.is_admin()
  )
  with check (
    exists (
      select 1 from public.game_players gp
      where gp.game_id = patsome_tee_starters.game_id
        and gp.team_number = patsome_tee_starters.team_number
        and gp.user_id = auth.uid()
    )
    or public.is_admin()
  );

create policy patsome_tee_starters_delete
  on public.patsome_tee_starters for delete
  using (
    exists (
      select 1 from public.game_players gp
      where gp.game_id = patsome_tee_starters.game_id
        and gp.team_number = patsome_tee_starters.team_number
        and gp.user_id = auth.uid()
    )
    or public.is_admin()
  );

-- 4. Seed format-row (klubb-format, ikke cup-eligible — aggregat-strokeplay,
--    ikke en matchplay-match).
insert into public.formats (
  slug, display_name, icon_key, short_description, scoring_module, is_active, is_cup_eligible
) values (
  'patsome',
  'Patsome',
  'patsome',
  'Lag à 2, 18 hull i tre former: 4BBB, greensome, foursomes. Flest stableford-poeng vinner.',
  '@/lib/scoring/modes/patsome',
  true,
  false
);

-- 5. Intent-mapping: synlig under Klubb, sekundær (ikke stort primary-kort).
--    Klubb-primaries bruker 10–40, modified_stableford sekundær bruker 80 —
--    Patsome legges etter på 90.
insert into public.format_intent_mapping (
  format_slug, intent, is_visible, is_primary, sort_order
) values (
  'patsome', 'klubb', true, false, 90
);
