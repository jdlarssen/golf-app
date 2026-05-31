-- 0063_greensome_matchplay.sql
-- Greensome matchplay (#289) — 2v2 velg-beste-tee + alternate.
-- Begge slår ut, velger det beste tee shot-et, spiller alternate derfra.
--
-- Reuser foursomes-storage (kaptein-eier-scores, ingen skjema-endring på scores)
-- og result-kind. Cup-eligible uten intent-mapping (kun via cup-create-flow).
-- Lag-handicap = 60/40-blanding (ikke sum); allowance default 100 (WHS greensome).
-- Ingen tee-starter-felt: begge slår ut hvert hull, så ingen fast tee-rotasjon.

-- 1. Seed greensome_matchplay i formats (cup-eligible, ingen intent-mapping)
insert into public.formats (slug, display_name, icon_key, short_description, scoring_module, is_active, is_cup_eligible) values
  ('greensome_matchplay', 'Greensome matchplay', 'greensome_matchplay',
   'Alternate shot. Begge slår ut, velg beste utslag, spill inn vekselvis.',
   '@/lib/scoring/modes/greensomeMatchplay', true, true);

-- 2. Cup-level allowance default for greensome-matches. Default 100 (full
--    forskjell av lagenes 60/40-blanding; WHS-standard).
alter table public.tournaments
  add column greensome_allowance_pct smallint not null default 100
    check (greensome_allowance_pct between 0 and 100);

comment on column public.tournaments.greensome_allowance_pct is
  'Handicap-allowance for greensome-matches i cupen. 0 = brutto (gross-only), '
  '1..100 = netto. Lag-handicap = 60/40-blanding; denne prosenten skalerer '
  'differansen mellom lagene. WHS-standard 100. Pre-fyller wizard.';
