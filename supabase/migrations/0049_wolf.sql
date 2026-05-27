-- 0048_wolf.sql
-- Wolf — 4-spiller rotating partner-format (kompis-batch i epic #270, issue #274).
--
-- Wolf introduserer DYNAMISKE lag per hull: Wolf-spilleren velger Partner-X,
-- Lone Wolf eller Blind Wolf per hull. wolf_hole_choices lagrer det valget
-- som driver scoring + UI-rendering. Realtime-sub på tabellen syncer valget
-- mellom de 4 spillerne.
--
-- Rotasjon (random første 16, trailing-wolf siste 2) er kun lagret i kode —
-- game_players.team_number (1-4) er random permutasjon satt av wizarden ved
-- opprett, hull 17-18 finner Wolf via lavest poeng-total etter forrige hull.

-- 1. wolf_hole_choices — én rad per (game, hull) med Wolf-spillerens valg
create table public.wolf_hole_choices (
  game_id          uuid not null references public.games(id) on delete cascade,
  hole_number      int  not null check (hole_number between 1 and 18),
  -- Wolf-spilleren for dette hullet (rotation slot eller trailing-player).
  -- Lagret eksplisitt så scoring-laget ikke trenger å rekompute rotasjonen.
  wolf_user_id     uuid not null references public.users(id) on delete cascade,
  choice           text not null check (choice in ('partner', 'lone', 'blind')),
  -- Required når choice='partner', null ellers (CHECK håndhever det).
  partner_user_id  uuid references public.users(id) on delete cascade,
  -- Audit: hvem som faktisk submittet valget. Vanligvis = wolf_user_id, men
  -- admin kan overstyre via RLS-policy under (manual recovery hvis en
  -- spiller har droppet ut).
  entered_by       uuid not null references public.users(id) on delete cascade,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (game_id, hole_number),
  constraint partner_only_when_partner_choice
    check (
      (choice = 'partner' and partner_user_id is not null)
      or (choice <> 'partner' and partner_user_id is null)
    )
);

comment on table public.wolf_hole_choices is
  'Wolf-spillerens valg per hull for game_mode=wolf-spill. Driver scoring + UI. '
  'Honor-system på timing for Blind Wolf — UI nudger ("Velg før tee shot") men '
  'CHECK håndhever ikke når valget ble gjort.';

comment on column public.wolf_hole_choices.choice is
  'partner = 2v2 (Wolf + valgt partner mot de to andre). '
  'lone = 1v3 (Wolf alene mot de tre andre, 2x stake). '
  'blind = 1v3 deklarert FØR tee shots (3x stake, honor-system).';

-- 2. updated_at-trigger (gjenbruker public.set_updated_at fra 0047)
create trigger wolf_hole_choices_set_updated_at
  before update on public.wolf_hole_choices
  for each row execute function public.set_updated_at();

-- 3. RLS — spillere i samme game leser hverandres valg, kun Wolf-spilleren
--    selv (eller admin) kan endre. Samme mønster som scores-tabellen.
alter table public.wolf_hole_choices enable row level security;

create policy wolf_choices_read
  on public.wolf_hole_choices for select
  using (
    exists (
      select 1 from public.game_players gp
      where gp.game_id = wolf_hole_choices.game_id
        and gp.user_id = auth.uid()
    )
  );

create policy wolf_choices_insert
  on public.wolf_hole_choices for insert
  with check (
    wolf_user_id = auth.uid() or public.is_admin()
  );

create policy wolf_choices_update
  on public.wolf_hole_choices for update
  using (wolf_user_id = auth.uid() or public.is_admin())
  with check (wolf_user_id = auth.uid() or public.is_admin());

create policy wolf_choices_delete
  on public.wolf_hole_choices for delete
  using (wolf_user_id = auth.uid() or public.is_admin());

-- 4. Seed format-row + intent-mapping (kompis primary)
insert into public.formats (
  slug, display_name, icon_key, short_description, scoring_module, is_active, is_cup_eligible
) values (
  'wolf',
  'Wolf',
  'wolf',
  '4 spillere, rotereende Wolf. Velg partner eller gå alene.',
  '@/lib/scoring/modes/wolf',
  true,
  false
);

insert into public.format_intent_mapping (
  format_slug, intent, is_visible, is_primary, sort_order
) values (
  'wolf', 'kompis', true, true, 50
);
