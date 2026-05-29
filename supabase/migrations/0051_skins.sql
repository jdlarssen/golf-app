-- 0051_skins.sql
-- Skins (med carryover) — kompis-batch i epic #270, issue #275.
--
-- Hvert hull er verdt 1 skin. Lavest score vinner. Delt hull = skinnet ruller
-- videre (carryover) til neste hull, som da er verdt 2, 3, ... til noen vinner
-- alene og scooper hele potten. Ingen ny tabell — carryover er en ren funksjon
-- av eksisterende scores, beregnet i scoring-modulen. Ingen kr/penge-dimensjon
-- i appen; leaderboard gjør det klart hvem som vant hvor mange skins, så
-- spillere kan gjøre opp en avtalt pott utenfor appen.

insert into public.formats (
  slug, display_name, icon_key, short_description, scoring_module, is_active, is_cup_eligible
) values (
  'skins',
  'Skins',
  'skins',
  'Hull for hull: lavest vinner skinnet. Delt hull ruller potten videre.',
  '@/lib/scoring/modes/skins',
  true,
  false
);

insert into public.format_intent_mapping (
  format_slug, intent, is_visible, is_primary, sort_order
) values (
  'skins', 'kompis', true, true, 70
);
