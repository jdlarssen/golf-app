-- 0027_side_tournament_bonus_categories.sql
-- v1.19.0 — utvider sideturnerings-katalogen med 18 nye kategori-IDs
-- (issue #169). 14 nye «bonus»-kategorier fordelt på fire tier:
--   • Skill   (4p/2p eller 4p individ): albatross, hole-in-one, konge-på-par-4,
--     rein-halvdel (F9/B9), ren-runde-uten-double
--   • Moderate (2p individ): hardest-hole-winner, comeback-kid, all-rounder-
--     birdie, even-par-runden, back-to-back-birdies
--   • Coord-bonus (lag-koord-stil): alle-birdied-bonus, lag-par-hull-coord
--   • Humor (-1p): verste-enkelthull, flest-double-bogeys
--
-- Constraint må droppes og re-opprettes atomært i én transaksjon. Eksisterende
-- rader bevares uendret (default = tom array = Full pakke aktiv → nye kategorier
-- triggers automatisk ved neste leaderboard-fetch).

begin;

alter table public.games drop constraint games_side_disabled_categories_valid;

alter table public.games add constraint games_side_disabled_categories_valid check (
  side_disabled_categories <@ array[
    -- Tier 1 — hovedkonkurranse (eksisterende)
    'best_netto_18', 'best_netto_f9', 'best_netto_b9',
    -- Tier 2 — skill+rarity (eksisterende)
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
    'turkey', 'solid', 'snowman',
    -- v1.19.0 nye kategorier (issue #169) — 18 IDs
    -- Tier 2 — skill+rarity
    'most_albatrosses_team', 'most_albatrosses_individual',
    'most_hole_in_ones_team', 'most_hole_in_ones_individual',
    'king_par4_team', 'king_par4_individual',
    'clean_front_9', 'clean_back_9',
    'no_double_plus_round',
    -- Tier 3 — moderate
    'hardest_hole_winner',
    'comeback_kid',
    'all_par_groups_birdie',
    'even_par_round',
    'back_to_back_birdies',
    -- Coord-bonus
    'team_all_birdied_bonus',
    'team_no_bogey_hole_coord',
    -- Humor
    'worst_single_hole_brutto',
    'most_double_bogeys_individual'
  ]
);

commit;
