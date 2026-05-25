// lib/scoring/sideTournamentConfig.ts
// Sentralisert poeng-vekter for sideturneringen. Justering av en vekt gjøres
// ved å endre tallet her — ingen logikk-endring nødvendig. Hver vekt er
// bevisst tier-vektet slik at best netto totalt 18 forblir 10p-grunnpilaren
// (eneste 10p-kategori, alle andre topper på 4p eller lavere).

export const SIDE_TOURNAMENT_POINTS = {
  // Tier 1 — Hovedkonkurranser (eksisterende, uendret)
  bestNetto18: 10,
  bestNettoF9: 5,
  bestNettoB9: 5,

  // Tier 2 — Skill og rarity (4p lag / 2p individ)
  bestBrutto18Team: 4,
  bestBrutto18Individual: 2,
  kingPar3Team: 4,
  kingPar3Individual: 2,
  kingPar5Team: 4,
  kingPar5Individual: 2,
  mostEaglesTeam: 4,
  mostEaglesIndividual: 2,
  longestBogeyFreeStreak: 4,

  // Tier 3 — Moderate (2p lag / 1p individ)
  bestBruttoF9Team: 2,
  bestBruttoF9Individual: 1,
  bestBruttoB9Team: 2,
  bestBruttoB9Individual: 1,
  mostBirdiesTeam: 2,
  mostBirdiesIndividual: 1,
  mostParsTeam: 2,
  mostParsIndividual: 1,
  lowestSingleHoleBrutto: 2,

  // Hull-konkurranser (eksisterende)
  holeWin: 2,
  longestDrive: 2,
  closestToPin: 2,

  // Achievements
  turkeyPerPlayer: 4,
  turkeyCoordPerMember: 4,
  solidPerPlayer: 2,
  solidCoordPerMember: 2,
  snowman: -2,

  // v1.19.0 nye kategorier (issue #169) — 19 nye IDs fordelt på 4 tier.
  // Tier 2 — skill+rarity (4p lag / 2p individ for team+individ-par;
  // 4p individ for ren-runde/rein-halvdel-terskler).
  mostAlbatrossesTeam: 4,
  mostAlbatrossesIndividual: 2,
  mostHoleInOnesTeam: 4,
  mostHoleInOnesIndividual: 2,
  kingPar4Team: 4,
  kingPar4Individual: 2,
  cleanFront9: 4,
  cleanBack9: 4,
  noDoublePlusRound: 4,

  // Tier 3 — moderate (2p individ)
  hardestHoleWinner: 2,
  comebackKid: 2,
  allParGroupsBirdie: 2,
  evenParRound: 2,
  backToBackBirdies: 2,

  // Coord-bonus (lag-koord-stil, stackable; multipliseres med antall medlemmer)
  teamAllBirdiedPerMember: 4,
  teamNoBogeyHoleCoordPerMember: 2,

  // Humor / penalty (-1p individ — mildere enn snowman -2p som er lag-blowup)
  worstSingleHoleBrutto: -1,
  mostDoubleBogeysIndividual: -1,
} as const;

export type SideCategoryId =
  | 'best_netto_18'
  | 'best_netto_f9'
  | 'best_netto_b9'
  | 'best_brutto_18_team'
  | 'best_brutto_18_individual'
  | 'best_brutto_f9_team'
  | 'best_brutto_f9_individual'
  | 'best_brutto_b9_team'
  | 'best_brutto_b9_individual'
  | 'most_birdies_team'
  | 'most_birdies_individual'
  | 'most_eagles_team'
  | 'most_eagles_individual'
  | 'most_pars_team'
  | 'most_pars_individual'
  | 'king_par3_team'
  | 'king_par3_individual'
  | 'king_par5_team'
  | 'king_par5_individual'
  | 'longest_bogey_free_streak'
  | 'lowest_single_hole_brutto'
  | 'hole_win'
  | 'longest_drive'
  | 'closest_to_pin'
  | 'turkey'
  | 'solid'
  | 'snowman'
  // v1.19.0 nye kategorier (issue #169)
  | 'most_albatrosses_team'
  | 'most_albatrosses_individual'
  | 'most_hole_in_ones_team'
  | 'most_hole_in_ones_individual'
  | 'king_par4_team'
  | 'king_par4_individual'
  | 'clean_front_9'
  | 'clean_back_9'
  | 'no_double_plus_round'
  | 'hardest_hole_winner'
  | 'comeback_kid'
  | 'all_par_groups_birdie'
  | 'even_par_round'
  | 'back_to_back_birdies'
  | 'team_all_birdied_bonus'
  | 'team_no_bogey_hole_coord'
  | 'worst_single_hole_brutto'
  | 'most_double_bogeys_individual';

/** Alle gyldige kategori-ID-er. Holdes i sync med DB-constraint i 0026 + 0027. */
export const ALL_CATEGORY_IDS: readonly SideCategoryId[] = [
  'best_netto_18',
  'best_netto_f9',
  'best_netto_b9',
  'best_brutto_18_team',
  'best_brutto_18_individual',
  'best_brutto_f9_team',
  'best_brutto_f9_individual',
  'best_brutto_b9_team',
  'best_brutto_b9_individual',
  'most_birdies_team',
  'most_birdies_individual',
  'most_eagles_team',
  'most_eagles_individual',
  'most_pars_team',
  'most_pars_individual',
  'king_par3_team',
  'king_par3_individual',
  'king_par5_team',
  'king_par5_individual',
  'longest_bogey_free_streak',
  'lowest_single_hole_brutto',
  'hole_win',
  'longest_drive',
  'closest_to_pin',
  'turkey',
  'solid',
  'snowman',
  // v1.19.0 nye kategorier (issue #169)
  'most_albatrosses_team',
  'most_albatrosses_individual',
  'most_hole_in_ones_team',
  'most_hole_in_ones_individual',
  'king_par4_team',
  'king_par4_individual',
  'clean_front_9',
  'clean_back_9',
  'no_double_plus_round',
  'hardest_hole_winner',
  'comeback_kid',
  'all_par_groups_birdie',
  'even_par_round',
  'back_to_back_birdies',
  'team_all_birdied_bonus',
  'team_no_bogey_hole_coord',
  'worst_single_hole_brutto',
  'most_double_bogeys_individual',
] as const;

/**
 * «Klassisk»-preset: kun de seks eksisterende kategoriene fra v1.1.x.
 * Matcher dagens default-oppførsel for spill opprettet før v1.2.0.
 */
export const CLASSIC_ENABLED_CATEGORIES: readonly SideCategoryId[] = [
  'best_netto_18',
  'best_netto_f9',
  'best_netto_b9',
  'hole_win',
  'longest_drive',
  'closest_to_pin',
] as const;

/**
 * Avledet: alle kategorier som IKKE er i Klassisk. Lagres i
 * `games.side_disabled_categories` når brukeren velger Klassisk-preset.
 */
export const CLASSIC_DISABLED_CATEGORIES: readonly SideCategoryId[] =
  ALL_CATEGORY_IDS.filter((id) => !CLASSIC_ENABLED_CATEGORIES.includes(id));
