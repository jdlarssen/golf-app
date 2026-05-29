-- 0052_modified_stableford.sql
-- Modified stableford — pro-stil poeng-tabell (epic #270, issue #281).
--
-- Som standard Stableford, men poeng-tabellen straffer dårlige hull og belønner
-- gode kraftigere: dobbeltbogey eller verre = -3, bogey = -1, par = 0,
-- birdie = +2, eagle = +5, albatross+ = +8. Premierer risiko foran par-jaging.
-- Handicap brukes identisk med standard Stableford. Solo eller par (4BBB-MAX).
--
-- Ingen ny tabell og ingen game_mode-CHECK å utvide: 0047 droppet
-- games_mode_check og lar formats-tabellen + server-action-validering være
-- sannhetskilde. Scoring-modulen gjenbruker stableford-motoren med en egen
-- poeng-tabell og returnerer kind: 'stableford', så leaderboard/podium-visningen
-- er uendret. icon_key gjenbruker 'stableford'-ikonet (samme familie).
--
-- Placement per issue: sekundær (ikke-primær) format under alle tre intents
-- (kompis, klubb, solo).

insert into public.formats (
  slug, display_name, icon_key, short_description, scoring_module, is_active, is_cup_eligible
) values (
  'modified_stableford',
  'Modifisert Stableford',
  'stableford',
  'Solo eller par, poeng vs par med pro-skala. Minuspoeng for blow-ups.',
  '@/lib/scoring/modes/modifiedStableford',
  true,
  false
);

insert into public.format_intent_mapping (
  format_slug, intent, is_visible, is_primary, sort_order
) values
  ('modified_stableford', 'kompis', true, false, 80),
  ('modified_stableford', 'klubb',  true, false, 80),
  ('modified_stableford', 'solo',   true, false, 80);
