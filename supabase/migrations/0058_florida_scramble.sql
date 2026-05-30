-- 0058_florida_scramble.sql
-- Florida Scramble (issue #283): Texas-variant der spilleren hvis slag ble valgt
-- står over neste slag. Mekanisk identisk med Texas/Ambrose (gjenbruker scramble-
-- motoren via lib/scoring/modes/floridaScramble), men med NGF-fasttabell for
-- default lag-handicap (3-mannslag 15 %, 4-mannslag 10 %).
-- Format-row + intent-mapping. Ingen games_mode_check (droppet i 0047 —
-- server-action-validering er gaten).

insert into public.formats (
  slug, display_name, icon_key, short_description, scoring_module, is_active, is_cup_eligible
) values (
  'florida_scramble',
  'Florida Scramble',
  'florida_scramble',
  'Lag à 3 eller 4. Alle slår, beste ball velges. Den som slo det valgte slaget, står over neste slag.',
  '@/lib/scoring/modes/floridaScramble',
  true,
  true
);

insert into public.format_intent_mapping (
  format_slug, intent, is_visible, is_primary, sort_order
) values (
  'florida_scramble', 'klubb', true, false, 37
);
