-- 0064_chapman_matchplay.sql
-- Chapman matchplay (#290) — 2v2 dobbel tee + bytt ball + velg beste + alternate.
-- Også kjent som Pinehurst (samme spill, to navn — vi seeder ett format «Chapman»).
--
-- Reuser foursomes-storage (kaptein-eier-scores, ingen skjema-endring på scores)
-- og result-kind. Cup-eligible uten intent-mapping (kun via cup-create-flow).
-- Lag-handicap = 60/40-blanding (0,6×lavest + 0,4×høyest, ikke sum) — identisk
-- med greensome; allowance default 100 (WHS Chapman matchplay-standard, full
-- differanse etter 60/40-reduksjonen). Ingen tee-starter-felt: begge slår ut
-- hvert hull, så ingen fast tee-rotasjon å spore.

-- 1. Seed chapman_matchplay i formats (cup-eligible, ingen intent-mapping)
insert into public.formats (slug, display_name, icon_key, short_description, scoring_module, is_active, is_cup_eligible) values
  ('chapman_matchplay', 'Chapman', 'chapman_matchplay',
   'Alternate shot. Begge slår ut, bytt ball, velg beste, spill inn vekselvis. Også kjent som Pinehurst.',
   '@/lib/scoring/modes/chapmanMatchplay', true, true);

-- 2. Cup-level allowance default for chapman-matches. Default 100 (full
--    forskjell av lagenes 60/40-blanding; WHS Chapman matchplay-standard).
alter table public.tournaments
  add column chapman_allowance_pct smallint not null default 100
    check (chapman_allowance_pct between 0 and 100);

comment on column public.tournaments.chapman_allowance_pct is
  'Handicap-allowance for chapman-matches i cupen. 0 = brutto (gross-only), '
  '1..100 = netto. Lag-handicap = 60/40-blanding; denne prosenten skalerer '
  'differansen mellom lagene. WHS-standard 100. Pre-fyller wizard.';
