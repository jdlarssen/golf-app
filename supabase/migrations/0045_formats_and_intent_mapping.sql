-- 0045_formats_and_intent_mapping.sql
-- Foundation F1 for epic #270 (format-katalog og intent-først wizard).
-- Etablerer `formats` som master-katalog over spilltyper, og
-- `format_intent_mapping` for å styre hvor hvert format dukker opp i
-- wizardens step 2. Seeder de 5 eksisterende formats med default mapping.
--
-- Bevisst: ingen FK mellom games.game_mode og formats.slug — soft-
-- deactivation av et format må ikke ødelegge historiske games.
--
-- Dropper games_mode_check siden formats-tabellen overtar som sannhets-
-- kilde. Server-action-validering tar over for å unngå å ALTER constraint
-- per nye format-issue.

-- 1. Felles updated_at-trigger-funksjon (gjenbrukes av begge tabeller)
create or replace function public.set_updated_at()
  returns trigger
  language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- 2. formats: master-katalog
create table public.formats (
  slug              text primary key,
  display_name      text not null,
  icon_key          text not null,
  short_description text not null,
  scoring_module    text not null,
  is_active         boolean not null default true,
  is_cup_eligible   boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.formats is
  'Master-katalog over spilltyper. Slug brukes som game_mode i games-tabellen (ingen FK — soft-deactivation må bevare historikk).';

comment on column public.formats.icon_key is
  'Stabil identifier som UI mapper til en ikon-komponent. For nå: ofte lik slug. Holdes som egen kolonne for å åpne for ikon-bytting uten slug-endring.';

create trigger formats_set_updated_at
  before update on public.formats
  for each row execute function public.set_updated_at();

-- 3. format_intent_mapping: wizard-placering per intent
create table public.format_intent_mapping (
  format_slug  text not null references public.formats(slug) on update cascade,
  intent       text not null check (intent in ('kompis', 'klubb', 'solo')),
  is_visible   boolean not null default true,
  is_primary   boolean not null default false,
  sort_order   int not null default 100,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (format_slug, intent),
  constraint primary_implies_visible
    check (not is_primary or is_visible)
);

comment on table public.format_intent_mapping is
  'Per intent (kompis/klubb/solo): er formatet synlig, og er det primary (stort kort)?';

create trigger format_intent_mapping_set_updated_at
  before update on public.format_intent_mapping
  for each row execute function public.set_updated_at();

-- 4. RLS: read for alle authenticated, write kun for admin
alter table public.formats enable row level security;
alter table public.format_intent_mapping enable row level security;

create policy formats_read
  on public.formats for select
  using (auth.role() = 'authenticated');

create policy formats_admin_write
  on public.formats for all
  using (public.is_admin())
  with check (public.is_admin());

create policy format_intent_mapping_read
  on public.format_intent_mapping for select
  using (auth.role() = 'authenticated');

create policy format_intent_mapping_admin_write
  on public.format_intent_mapping for all
  using (public.is_admin())
  with check (public.is_admin());

-- 5. Drop games_mode_check — server-action-validering tar over
alter table public.games
  drop constraint if exists games_mode_check;

-- 6. Seed eksisterende 5 formats
insert into public.formats (slug, display_name, icon_key, short_description, scoring_module, is_active, is_cup_eligible) values
  ('stableford',            'Stableford',     'stableford',            'Solo, poeng vs par. Klassisk klubb-format.',          '@/lib/scoring/modes/stableford',          true, false),
  ('best_ball_netto',       'Best ball',      'best_ball_netto',       'Lag à 2, beste netto per hull.',                       '@/lib/scoring/modes/bestBall',            true, false),
  ('texas_scramble',        'Texas scramble', 'texas_scramble',        'Lag à 4. Alle slår, beste velges.',                    '@/lib/scoring/modes/texasScramble',       true, false),
  ('solo_strokeplay_netto', 'Slagspill',      'solo_strokeplay_netto', 'Individuell, lavest total vinner.',                    '@/lib/scoring/modes/soloStrokeplayNetto', true, false),
  ('singles_matchplay',     'Matchplay',      'singles_matchplay',     '1v1, vinn flest hull.',                                '@/lib/scoring/modes/singlesMatchplay',    true, true);

-- 7. Seed default format_intent_mapping per design-doc-tabellen
insert into public.format_intent_mapping (format_slug, intent, is_visible, is_primary, sort_order) values
  -- Stableford: primary under Kompis, Klubb, Solo
  ('stableford',            'kompis', true,  true,  10),
  ('stableford',            'klubb',  true,  true,  10),
  ('stableford',            'solo',   true,  true,  10),
  -- Best Ball Netto: primary under Kompis, Klubb
  ('best_ball_netto',       'kompis', true,  true,  20),
  ('best_ball_netto',       'klubb',  true,  true,  20),
  -- Texas Scramble: sekundær under Kompis, primary under Klubb
  ('texas_scramble',        'kompis', true,  false, 30),
  ('texas_scramble',        'klubb',  true,  true,  30),
  -- Solo Strokeplay: primary under Klubb og Solo
  ('solo_strokeplay_netto', 'klubb',  true,  true,  40),
  ('solo_strokeplay_netto', 'solo',   true,  true,  20),
  -- Singles matchplay: sekundær under Kompis (cup-eligibility håndteres via formats.is_cup_eligible)
  ('singles_matchplay',     'kompis', true,  false, 40);
