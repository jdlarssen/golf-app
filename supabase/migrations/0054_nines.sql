-- 0054_nines.sql
-- Nines / Split Sixes (issue #278): 3-spiller poeng-fordeling per hull.
-- Strokeplay-utledet — ingen egen input-tabell. Format-row + kompis-mapping.

insert into public.formats (
  slug, display_name, icon_key, short_description, scoring_module, is_active, is_cup_eligible
) values (
  'nines',
  'Nines / Split Sixes',
  'nines',
  '3 spillere, poeng per hull: lavest tar mest. Velg Nines (5-3-1) eller Split Sixes (4-2-0).',
  '@/lib/scoring/modes/nines',
  true,
  false
);

insert into public.format_intent_mapping (
  format_slug, intent, is_visible, is_primary, sort_order
) values (
  'nines', 'kompis', true, false, 71
);
