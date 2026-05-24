-- 0033_texas_scramble.sql
-- Widen games_mode_check fra 2 til 5 verdier:
--   * eksisterende: best_ball_netto, stableford
--   * fra epic #45 og #46 (singles_matchplay, solo_strokeplay_netto): modusene
--     er shipped i TS-koden, men prod-CHECK avviste dem. Ingen rader enda
--     fordi ingen har provd a lage et slikt spill.
--   * ny: texas_scramble (issue #44)
--
-- Ingen backfill: mode_config for eksisterende rader er allerede gyldig.

alter table public.games
  drop constraint games_mode_check;

alter table public.games
  add constraint games_mode_check
    check (game_mode in (
      'best_ball_netto',
      'stableford',
      'singles_matchplay',
      'solo_strokeplay_netto',
      'texas_scramble'
    ));
