-- 0111_games_game_mode_validity.sql
--
-- Reintroduserer en validitets-skranke på games.game_mode.
--
-- Bakgrunn: games_mode_check ble droppet i 0047 da formats-tabellen ble
-- etablert som master-katalog, med kommentar om at server-action-validering
-- tok over. Men server-action-validering (isValidActiveGameMode) kan
-- bypasses ved direkte PostgREST-insert (bekreftet på staging: 201 for
-- game_mode='totally_not_a_real_mode'). AGENTS.md-felle #4: "a rule has
-- one home." DB er sannhets-laget.
--
-- Valg av FK vs CHECK:
--   FK (games.game_mode → formats.slug) er bevisst UTELATT av 0047 fordi
--   soft-deaktivering av et format (formats.is_active = false) ikke må
--   ugyldiggjøre historiske game-rader som refererer den deaktiverte slugen.
--   En FK vil blokke ON DELETE / ON UPDATE CASCADE og kreve at vi aldri
--   sletter format-rader. CHECK er riktig mekanisme her.
--
-- CHECK-listen speiler nøyaktig de 22 slugene seeded i 0047–0065.
-- Nye formats trenger en ny migrasjon som OGSÅ legger slugen til lista
-- nedenfor (tolererbart: nye format-migrasjoner er alltid nødvendig
-- uansett for wizard/seeding/RLS).
--
-- Scrubbing (steg 1 nedenfor):
--   ALTER TABLE feilet hvis det finnes game-rader med ugyldig game_mode.
--   UPDATE-setningen nedenfor setter disse til 'solo_strokeplay' som fallback.
--   Bør gi 0 påvirkede rader på staging og prod (bekreftet at staging hadde
--   0 rader etter at test-raden ble ryddet i QA-sweep). Owner bør bekrefte
--   at UPDATE ga 0 rader i logg.

-- 1. Scrub eventuelle invalide game_mode-rader (forventes å gi 0 rader).
update public.games
set game_mode = 'solo_strokeplay'
where game_mode not in (
  'stableford',
  'best_ball',
  'texas_scramble',
  'solo_strokeplay',
  'singles_matchplay',
  'fourball_matchplay',
  'foursomes_matchplay',
  'wolf',
  'nassau',
  'skins',
  'modified_stableford',
  'bingo_bango_bongo',
  'nines',
  'round_robin',
  'acey_deucey',
  'ambrose',
  'florida_scramble',
  'shamble',
  'patsome',
  'greensome_matchplay',
  'chapman_matchplay',
  'gruesome_matchplay'
);

-- 2. Legg til CHECK-constraint.
alter table public.games
  add constraint games_game_mode_check check (
    game_mode in (
      'stableford',
      'best_ball',
      'texas_scramble',
      'solo_strokeplay',
      'singles_matchplay',
      'fourball_matchplay',
      'foursomes_matchplay',
      'wolf',
      'nassau',
      'skins',
      'modified_stableford',
      'bingo_bango_bongo',
      'nines',
      'round_robin',
      'acey_deucey',
      'ambrose',
      'florida_scramble',
      'shamble',
      'patsome',
      'greensome_matchplay',
      'chapman_matchplay',
      'gruesome_matchplay'
    )
  );
