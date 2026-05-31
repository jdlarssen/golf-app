-- 0065_gruesome_matchplay.sql
-- Gruesome matchplay (#291) — 2v2 alternate shot der motstanderlaget velger
-- hvilken av lagets to tee-baller paret må spille videre med (typisk den
-- verste). Også kjent som «Pinehurst Gruesome».
--
-- Reuser foursomes-storage (kaptein-eier-scores, ingen skjema-endring på
-- scores) og result-kind. Lag-handicap = sum av begge partneres CH (samme
-- WHS-formel som foursomes — motstanderens tee-valg endrer ikke handicapet),
-- allowance default 50 (WHS foursomes matchplay-standard). Ingen tee-starter-
-- felt: begge slår ut hvert hull, så ingen fast tee-rotasjon å spore.
--
-- Til forskjell fra foursomes/greensome/chapman seeder vi også en intent-
-- mapping (kompis), så formatet er valgbart standalone i wizarden uten manuell
-- admin-toggle — gruesome spilles typisk casual utenfor cup. Cup-eligible i
-- tillegg, så det kan brukes som cup-leg.

-- 1. Seed gruesome_matchplay i formats (cup-eligible)
insert into public.formats (slug, display_name, icon_key, short_description, scoring_module, is_active, is_cup_eligible) values
  ('gruesome_matchplay', 'Gruesome', 'gruesome_matchplay',
   'Alternate shot. Begge slår ut, men motstanderlaget velger ballen dere må spille videre med (som regel den verste).',
   '@/lib/scoring/modes/gruesomeMatchplay', true, true);

-- 2. Intent-mapping → standalone-synlig under «kompis» (sekundær)
insert into public.format_intent_mapping (format_slug, intent, is_visible, is_primary, sort_order) values
  ('gruesome_matchplay', 'kompis', true, false, 110);

-- 3. Cup-level allowance default for gruesome-matches. Default 50 (WHS
--    foursomes matchplay-standard — gruesome bruker samme sum-handicap som
--    foursomes, så samme default).
alter table public.tournaments
  add column gruesome_allowance_pct smallint not null default 50
    check (gruesome_allowance_pct between 0 and 100);

comment on column public.tournaments.gruesome_allowance_pct is
  'Handicap-allowance for gruesome-matches i cupen. 0 = brutto (gross-only), '
  '1..100 = netto. Lag-handicap = sum av partnernes CH (som foursomes); denne '
  'prosenten skalerer differansen mellom lagene. WHS-standard 50. Pre-fyller wizard.';
