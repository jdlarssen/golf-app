-- 0055_shamble.sql
-- Shamble / Champagne Scramble (issue #285): lag-format, best N av M per hull.
-- Delt drive, så egen ball — strokeplay-utledet, ingen egen input-tabell.
-- Én umbrella-format-row (variant velges i wizarden, som Nines / Split Sixes).
-- Klubb-turnering, sekundær (ikke primary).

insert into public.formats (
  slug, display_name, icon_key, short_description, scoring_module, is_active, is_cup_eligible
) values (
  'shamble',
  'Shamble / Champagne Scramble',
  'shamble',
  'Lag à 3-4: felles beste utslag, så egen ball. De laveste scorene per hull teller. Champagne Scramble velger antall (1/2/3).',
  '@/lib/scoring/modes/shamble',
  true,
  false
);

insert into public.format_intent_mapping (
  format_slug, intent, is_visible, is_primary, sort_order
) values (
  'shamble', 'klubb', true, false, 90
);
