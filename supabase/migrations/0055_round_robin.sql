-- Round Robin — roterende partnere, 4 spillere (kompis-batch, issue #280).
--
-- Ingen ny tabell: partner-rotasjonen er en ren deterministisk funksjon av
-- (spiller-slot, hull-nummer) — slag tastes via eksisterende scorekort.
-- Eksisterende sort_order under kompis: wolf=50, nassau=60, skins=70,
-- nines=71, modified_stableford=80, bingo_bango_bongo=90 → round_robin=100.

-- 1. Seed format-row
insert into public.formats (slug, display_name, icon_key, short_description, scoring_module, is_active, is_cup_eligible)
  values (
    'round_robin',
    'Round Robin',
    'round_robin',
    '4 spillere, roterende partnere hvert 6. hull. Flest hullseire vinner.',
    '@/lib/scoring/modes/roundRobin',
    true,
    false
  );

-- 2. Seed intent-mapping (sekundær under kompis; sort_order=100 etter
--    bingo_bango_bongo=90)
insert into public.format_intent_mapping (format_slug, intent, is_visible, is_primary, sort_order)
  values ('round_robin', 'kompis', true, false, 100);
