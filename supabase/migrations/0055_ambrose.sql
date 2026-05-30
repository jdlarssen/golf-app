-- 0055_ambrose.sql
-- Ambrose (issue #284): net scramble med team-handicap. Mekanisk identisk med
-- Texas scramble (gjenbruker scramble-motoren via lib/scoring/modes/ambrose),
-- men med standard Ambrose-default-handicap (combinedCH ÷ 2×lagstørrelse).
-- Format-row + intent-mapping. Ingen games_mode_check (droppet i 0047 — server-
-- action-validering er gaten).

insert into public.formats (
  slug, display_name, icon_key, short_description, scoring_module, is_active, is_cup_eligible
) values (
  'ambrose',
  'Ambrose',
  'ambrose',
  'Lag à 2 eller 4. Alle slår, beste ball velges. Lag-handicap jevner ut forskjeller mellom lagene.',
  '@/lib/scoring/modes/ambrose',
  true,
  false
);

insert into public.format_intent_mapping (
  format_slug, intent, is_visible, is_primary, sort_order
) values (
  'ambrose', 'klubb', true, false, 35
);
