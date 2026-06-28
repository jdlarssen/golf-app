// lib/games/sideTournamentAwards.ts
// Norwegian labels and notable-award selection for shareable result-card images
// (#942). Pure — no I/O, no side effects.

import type { SideCategory, SideCategoryAward } from '@/lib/scoring/sideTournament';

// ---------------------------------------------------------------------------
// Norwegian card labels (one per SideCategory)
//
// Source: messages/no.json → sideTournament namespace (picker labels, the
// concise single-word / short-phrase wording). We use the picker labels
// (e.g. "sideTournament.picker.categories.kingPar3") because they are already
// the right length for a card badge — the leaderboard-row labels include
// name-interpolation placeholders that don't belong on a card.
//
// Deviations from the exact JSON wording are noted inline.
// ---------------------------------------------------------------------------

/**
 * Short Norwegian label for each {@link SideCategory}, suitable for a
 * compact result-card badge. Every entry is non-empty — a unit test asserts
 * completeness so a future category addition can't silently slip through
 * unlabelled.
 */
export const SIDE_CATEGORY_CARD_LABEL: Record<SideCategory, string> = {
  // Netto-race (podium duplicates — filtered out by selectNotableAwards)
  best_netto_18: 'Best netto 18',
  best_netto_front9: 'Best netto F9',
  best_netto_back9: 'Best netto B9',

  // Hull-konkurranser
  hole_win: 'Hole-win',
  longest_drive: 'Longest drive',
  closest_to_pin: 'Closest to pin',

  // Birdier / eagles / pars
  most_birdies_team: 'Flest birdier (lag)',
  most_birdies_individual: 'Flest birdier',
  most_eagles_team: 'Flest eagles+ (lag)',
  most_eagles_individual: 'Flest eagles+',
  most_pars_team: 'Flest pars+ (lag)',
  most_pars_individual: 'Flest pars+',
  most_albatrosses_team: 'Flest albatrosser (lag)',
  most_albatrosses_individual: 'Flest albatrosser',
  most_hole_in_ones_team: 'Flest hole-in-one (lag)',
  most_hole_in_ones_individual: 'Flest hole-in-one',

  // Brutto
  best_brutto_18_team: 'Best brutto 18 (lag)',
  best_brutto_18_individual: 'Best brutto 18',
  best_brutto_f9_team: 'Best brutto F9 (lag)',
  best_brutto_f9_individual: 'Best brutto F9',
  best_brutto_b9_team: 'Best brutto B9 (lag)',
  best_brutto_b9_individual: 'Best brutto B9',

  // Kongekategorier
  king_par3_team: 'Konge på par-3 (lag)',
  king_par3_individual: 'Konge på par-3',
  king_par4_team: 'Konge på par-4 (lag)',
  king_par4_individual: 'Konge på par-4',
  king_par5_team: 'Konge på par-5 (lag)',
  king_par5_individual: 'Konge på par-5',

  // Rekker og prestasjoner
  longest_bogey_free_streak: 'Lengste bogey-fri rekke',
  lowest_single_hole_brutto: 'Lavest enkelthull brutto',
  hardest_hole_winner: 'Best på hardeste hull',
  turkey: 'Turkey',
  solid: 'Solid',
  back_to_back_birdies: 'To birdier på rad',

  // Rene runder
  clean_front_9: 'Rein front-9',
  clean_back_9: 'Rein back-9',
  no_double_plus_round: 'Ren runde',

  // Andre achievements
  comeback_kid: 'Comeback kid',
  all_par_groups_birdie: 'Allsidig birdie',
  even_par_round: 'Even-par-runden',

  // Lag-koord-bonus
  team_all_birdied_bonus: 'Alle birdied (lag-bonus)',
  team_no_bogey_hole_coord: 'Lag-par-hull (lag-bonus)',

  // Penalty / humor
  snowman: 'Snowman',
  worst_single_hole_brutto: 'Verste enkelthull',
  most_double_bogeys_individual: 'Flest double-bogeys',
};

// ---------------------------------------------------------------------------
// Netto-race categories to suppress on the card (they duplicate the podium).
// ---------------------------------------------------------------------------

const NETTO_RACE_CATEGORIES = new Set<SideCategory>([
  'best_netto_18',
  'best_netto_front9',
  'best_netto_back9',
]);

// ---------------------------------------------------------------------------
// selectNotableAwards
// ---------------------------------------------------------------------------

/**
 * Selects up to `max` notable awards from a team's (or the field's) award list
 * for display on a shareable result-card image.
 *
 * Selection rules (applied in order):
 * 1. Drop the base netto-race categories (`best_netto_18`, `best_netto_front9`,
 *    `best_netto_back9`) — those duplicate the podium/standings strip.
 * 2. Deduplicate by `category` — keep the entry with the highest `points` per
 *    category (stackable categories like `turkey` can appear multiple times; we
 *    collapse to the representative highest-value instance).
 * 3. Split into positives (`points > 0`, sorted by points descending) and
 *    negatives (`points < 0`, most-negative first, i.e. worst penalty first).
 * 4. Build result:
 *    - Start with up to `max - 1` positives (or `max` if no negatives).
 *    - If negatives exist, append the single worst negative (the "funny fail").
 *    - Top up from remaining positives until `length === max` or none left.
 *    - Cap at `max`.
 *
 * This ensures that a Snowman (or other penalty) shows alongside achievements
 * rather than crowding them out entirely, while positive awards always anchor
 * the selection.
 */
export function selectNotableAwards(
  awards: SideCategoryAward[],
  max: number,
): SideCategoryAward[] {
  if (max <= 0) return [];

  // Step 1: drop netto-race categories.
  const filtered = awards.filter((a) => !NETTO_RACE_CATEGORIES.has(a.category));

  // Step 2: deduplicate by category — keep highest points per category.
  const bestByCategory = new Map<SideCategory, SideCategoryAward>();
  for (const award of filtered) {
    const existing = bestByCategory.get(award.category);
    if (!existing || award.points > existing.points) {
      bestByCategory.set(award.category, award);
    }
  }
  const deduped = Array.from(bestByCategory.values());

  // Step 3: split into positives and negatives.
  const positives = deduped
    .filter((a) => a.points > 0)
    .sort((a, b) => b.points - a.points); // highest first

  const negatives = deduped
    .filter((a) => a.points < 0)
    .sort((a, b) => a.points - b.points); // most-negative (worst) first

  // Step 4: build result with at most one "funny fail" from negatives.
  const result: SideCategoryAward[] = [];

  if (negatives.length > 0) {
    // Reserve one slot for the worst negative. Fill the rest with positives.
    const positiveSlots = max - 1;
    result.push(...positives.slice(0, positiveSlots));
    result.push(negatives[0]!); // the single worst negative
    // Top up from positives that didn't fit in the initial slice.
    const remaining = positives.slice(positiveSlots);
    for (const a of remaining) {
      if (result.length >= max) break;
      result.push(a);
    }
  } else {
    result.push(...positives.slice(0, max));
  }

  return result.slice(0, max);
}
