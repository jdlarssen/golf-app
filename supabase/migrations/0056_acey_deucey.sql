-- Acey Deucey — 4-spiller per-hull point-game (kompis-batch, issue #279).
--
-- Rent slag-derivert: per hull tar unik lavest score +3, unik høyest −3, og
-- de to i midten 0. Delt lavest eller høyest voider den siden. Ingen ny tabell
-- — poengene regnes fra scores via lib/scoring/modes/aceyDeucey.ts. Brutto/
-- netto styres av mode_config.acey_deucey_scoring.
--
-- Plassering: sekundær (is_primary=false) under kompis-intent. Point-game-
-- klyngen er wolf=50, nassau=60, skins=70, modifisert stableford=80,
-- bingo_bango_bongo=90. sort_order=95 holder Acey Deucey ved siden av søsknene
-- sine, foran den eldre 100-bøtta (foursomes/solo/fourball).

-- 1. Seed format-row
insert into public.formats (slug, display_name, icon_key, short_description, scoring_module, is_active, is_cup_eligible)
  values (
    'acey_deucey',
    'Acey Deucey',
    'acey_deucey',
    '4 spillere. Lavest score tar +3, høyest gir −3, midten 0. Delt lavest/høyest gir ingen poeng.',
    '@/lib/scoring/modes/aceyDeucey',
    true,
    false
  );

-- 2. Seed intent-mapping (sekundær under kompis; sort_order=95, mellom
--    bingo_bango_bongo=90 og 100-bøtta)
insert into public.format_intent_mapping (format_slug, intent, is_visible, is_primary, sort_order)
  values ('acey_deucey', 'kompis', true, false, 95);
