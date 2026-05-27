-- 0048_foursomes_matchplay.sql
-- Foursomes matchplay (#218) — 2v2 alternate shot, første i alternate-shot-
-- familien (#289 Greensome, #290 Chapman, #291 Gruesome adopterer mønstret).
--
-- Storage: Texas-pattern (kaptein-userId eier scores-radene), så ingen
-- skjema-endring på scores-tabellen. Cup-level allowance default 50 (WHS).
-- Per-side tee-starter-felt på games for flightens runtime-valg på hull 1.

-- 1. Seed foursomes_matchplay i formats-tabellen (cup-eligible, ingen intent-mapping
--    siden formatet kun er tilgjengelig via cup-create-flow, samme som fourball)
insert into public.formats (slug, display_name, icon_key, short_description, scoring_module, is_active, is_cup_eligible) values
  ('foursomes_matchplay', 'Foursomes matchplay', 'foursomes_matchplay',
   '2v2 alternate shot. Én ball per lag, spillerne alternerer slag.',
   '@/lib/scoring/modes/foursomesMatchplay', true, true);

-- 2. Cup-level allowance default for foursomes-matches i en cup
alter table public.tournaments
  add column foursomes_allowance_pct smallint not null default 50
    check (foursomes_allowance_pct between 0 and 100);

comment on column public.tournaments.foursomes_allowance_pct is
  'Handicap-allowance for foursomes-matches i cupen. 0 = brutto (gross-only), '
  '1..100 = netto (WHS-standard 50 % av differansen mellom lagenes summerte HCP). '
  'Pre-fyller wizard ved foursomes-match-create; admin kan overstyre per match.';

-- 3. Per-side tee-starter — settes av flighten via scorekort-banner på hull 1.
--    NULL = ikke valgt ennå (banner vises). Satt = hint per hull («X slår ut»).
--    Bare meningsfull for game_mode='foursomes_matchplay' og resten av
--    alternate-shot-familien som lander senere — andre modi ignorerer feltene.
alter table public.games
  add column foursomes_side1_tee_starter_user_id uuid
    references public.users(id) on delete set null,
  add column foursomes_side2_tee_starter_user_id uuid
    references public.users(id) on delete set null;

comment on column public.games.foursomes_side1_tee_starter_user_id is
  'For game_mode=foursomes_matchplay: hvem på side 1 teer ut på odd-hull. '
  'Settes av flighten via scorekort-banner på hull 1. NULL = ikke valgt ennå.';

comment on column public.games.foursomes_side2_tee_starter_user_id is
  'For game_mode=foursomes_matchplay: hvem på side 2 teer ut på odd-hull. '
  'NULL = ikke valgt ennå. Driver kun et UI-hint, ingen validering av faktiske slag.';
