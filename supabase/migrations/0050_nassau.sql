-- 0050_nassau.sql
-- Nassau — front 9 + back 9 + total 18 (kompis-batch i epic #270, issue #276).
--
-- Tre konkurranser i én runde med klassiske Nassau-regler. Ingen ny tabell —
-- scoring leser eksisterende scores. Push på tie er standard (ingen unit
-- deles ut når seksjonen er tied etter cascade).

insert into public.formats (
  slug, display_name, icon_key, short_description, scoring_module, is_active, is_cup_eligible
) values (
  'nassau',
  'Nassau',
  'nassau',
  'Tre konkurranser i én: front 9, back 9, total 18.',
  '@/lib/scoring/modes/nassau',
  true,
  false
);

insert into public.format_intent_mapping (
  format_slug, intent, is_visible, is_primary, sort_order
) values (
  'nassau', 'kompis', true, true, 60
);
