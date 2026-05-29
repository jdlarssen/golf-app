-- Bingo Bango Bongo — tre prestasjons-poeng per hull (kompis-batch, issue #277).
--
-- Wolf=50, Nassau=60, Skins=70, Modifisert Stableford=80 under kompis-intent.
-- BBB er sekundær (is_primary=false) og plasseres på sort_order=90 — neste
-- ledige verdi (80 er allerede tatt av modified_stableford i 0052).

-- 1. Tabell
create table public.bingo_bango_bongo_holes (
  game_id        uuid not null references public.games(id) on delete cascade,
  hole_number    int  not null check (hole_number between 1 and 18),
  bingo_user_id  uuid references public.users(id) on delete set null,
  bango_user_id  uuid references public.users(id) on delete set null,
  bongo_user_id  uuid references public.users(id) on delete set null,
  -- Hvem som faktisk registrerte (audit). Delt registrering: hvilken som
  -- helst flight-spiller kan sette/endre raden.
  entered_by     uuid not null references public.users(id) on delete cascade,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (game_id, hole_number)
);

-- 2. Updated-at trigger (gjenbruker eksisterende set_updated_at-funksjon)
create trigger bingo_bango_bongo_holes_set_updated_at
  before update on public.bingo_bango_bongo_holes
  for each row execute function public.set_updated_at();

-- 3. Row Level Security
alter table public.bingo_bango_bongo_holes enable row level security;

-- Delt registrering: enhver spiller i samme game leser.
create policy bbb_holes_read
  on public.bingo_bango_bongo_holes for select
  using (
    exists (
      select 1 from public.game_players gp
      where gp.game_id = bingo_bango_bongo_holes.game_id
        and gp.user_id = auth.uid()
    )
  );

-- Delt registrering: enhver spiller i samme game skriver (+ admin).
create policy bbb_holes_write
  on public.bingo_bango_bongo_holes for all
  using (
    public.is_admin() or exists (
      select 1 from public.game_players gp
      where gp.game_id = bingo_bango_bongo_holes.game_id
        and gp.user_id = auth.uid()
    )
  )
  with check (
    public.is_admin() or exists (
      select 1 from public.game_players gp
      where gp.game_id = bingo_bango_bongo_holes.game_id
        and gp.user_id = auth.uid()
    )
  );

-- 4. Seed format-row
insert into public.formats (slug, display_name, icon_key, short_description, scoring_module, is_active, is_cup_eligible)
  values (
    'bingo_bango_bongo',
    'Bingo Bango Bongo',
    'bingo_bango_bongo',
    '2–4 spillere. Tre poeng per hull: først på green, nærmest, først i hull.',
    '@/lib/scoring/modes/bingoBangoBongo',
    true,
    false
  );

-- 5. Seed intent-mapping (sekundær under kompis; sort_order=90 etter
--    modified_stableford=80)
insert into public.format_intent_mapping (format_slug, intent, is_visible, is_primary, sort_order)
  values ('bingo_bango_bongo', 'kompis', true, false, 90);
