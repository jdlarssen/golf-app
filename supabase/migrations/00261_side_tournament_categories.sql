-- 0026_side_tournament_categories.sql
-- v1.2.0 — utvidet sideturnerings-poengsystem.
-- Lagrer per-spill hvilke nye kategorier som er slått av. Tomt array = alle aktive
-- (Full pakke). Default 'Klassisk'-preset settes i admin-UI ved spill-opprett ved å
-- pre-populere arrayet med de 22 nye kategori-IDene; tomt array bekrefter eksplisitt
-- at brukeren valgte Full pakke.

alter table public.games
  add column side_disabled_categories text[] not null default '{}';

alter table public.games add constraint games_side_disabled_categories_valid check (
  side_disabled_categories <@ array[
    'best_netto_18', 'best_netto_f9', 'best_netto_b9',
    'best_brutto_18_team', 'best_brutto_18_individual',
    'best_brutto_f9_team', 'best_brutto_f9_individual',
    'best_brutto_b9_team', 'best_brutto_b9_individual',
    'most_birdies_team', 'most_birdies_individual',
    'most_eagles_team', 'most_eagles_individual',
    'most_pars_team', 'most_pars_individual',
    'king_par3_team', 'king_par3_individual',
    'king_par5_team', 'king_par5_individual',
    'longest_bogey_free_streak',
    'lowest_single_hole_brutto',
    'hole_win',
    'longest_drive', 'closest_to_pin',
    'turkey', 'solid', 'snowman'
  ]
);
