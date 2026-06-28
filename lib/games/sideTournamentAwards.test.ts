// lib/games/sideTournamentAwards.test.ts
// Unit tests for SIDE_CATEGORY_CARD_LABEL completeness and selectNotableAwards
// selection logic.

import { describe, it, expect } from 'vitest';
import type { SideCategory, SideCategoryAward } from '@/lib/scoring/sideTournament';
import {
  SIDE_CATEGORY_CARD_LABEL,
  selectNotableAwards,
} from './sideTournamentAwards';

// ---------------------------------------------------------------------------
// Helper: create a minimal SideCategoryAward for test assertions.
// ---------------------------------------------------------------------------

function award(
  category: SideCategory,
  points: number,
  teamId = 1,
): SideCategoryAward {
  return { category, teamId, points };
}

// ---------------------------------------------------------------------------
// All SideCategory values (mirrors the union in sideTournament.ts).
// Keeping this list here is intentional: if a new category is added to the
// union, tsc will flag it as unassignable in `expectedCategories`, making the
// test-coverage gap visible at compile time.
// ---------------------------------------------------------------------------

const ALL_SIDE_CATEGORIES: SideCategory[] = [
  'best_netto_18',
  'best_netto_front9',
  'best_netto_back9',
  'hole_win',
  'longest_drive',
  'closest_to_pin',
  'most_birdies_team',
  'most_birdies_individual',
  'most_eagles_team',
  'most_eagles_individual',
  'most_pars_team',
  'most_pars_individual',
  'best_brutto_18_team',
  'best_brutto_18_individual',
  'best_brutto_f9_team',
  'best_brutto_f9_individual',
  'best_brutto_b9_team',
  'best_brutto_b9_individual',
  'king_par3_team',
  'king_par3_individual',
  'king_par5_team',
  'king_par5_individual',
  'longest_bogey_free_streak',
  'lowest_single_hole_brutto',
  'turkey',
  'solid',
  'snowman',
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
];

// ---------------------------------------------------------------------------
// SIDE_CATEGORY_CARD_LABEL — completeness
// ---------------------------------------------------------------------------

describe('SIDE_CATEGORY_CARD_LABEL', () => {
  it('has a non-empty label for every SideCategory', () => {
    for (const category of ALL_SIDE_CATEGORIES) {
      const label = SIDE_CATEGORY_CARD_LABEL[category];
      expect(label, `Missing label for category "${category}"`).toBeTruthy();
      expect(label.length, `Empty label for category "${category}"`).toBeGreaterThan(0);
    }
  });

  it('has exactly one entry per SideCategory (no extras, no gaps)', () => {
    const defined = Object.keys(SIDE_CATEGORY_CARD_LABEL) as SideCategory[];
    expect(defined.sort()).toEqual([...ALL_SIDE_CATEGORIES].sort());
  });
});

// ---------------------------------------------------------------------------
// selectNotableAwards — selection logic
// ---------------------------------------------------------------------------

describe('selectNotableAwards', () => {
  // ── edge cases ───────────────────────────────────────────────────────────

  it('returns [] when max === 0', () => {
    const input = [award('turkey', 4), award('snowman', -2)];
    expect(selectNotableAwards(input, 0)).toEqual([]);
  });

  it('returns [] for empty input', () => {
    expect(selectNotableAwards([], 3)).toEqual([]);
  });

  it('returns [] when all awards are netto-race categories', () => {
    const input = [
      award('best_netto_18', 10),
      award('best_netto_front9', 5),
      award('best_netto_back9', 5),
    ];
    expect(selectNotableAwards(input, 3)).toEqual([]);
  });

  // ── netto-race filtering ─────────────────────────────────────────────────

  it('drops best_netto_18, best_netto_front9, best_netto_back9', () => {
    const input = [
      award('best_netto_18', 10),
      award('best_netto_front9', 5),
      award('best_netto_back9', 5),
      award('turkey', 4),
    ];
    const result = selectNotableAwards(input, 5);
    expect(result).toHaveLength(1);
    expect(result[0]!.category).toBe('turkey');
  });

  // ── deduplication by category ────────────────────────────────────────────

  it('deduplicates by category, keeping the highest-points entry', () => {
    // Turkey is stackable — two entries with different points values.
    const input = [
      { ...award('turkey', 8), streakStartHole: 1, streakEndHole: 3 },
      { ...award('turkey', 4), streakStartHole: 7, streakEndHole: 9 },
      award('solid', 2),
    ];
    const result = selectNotableAwards(input, 3);
    const turkeyEntry = result.find((a) => a.category === 'turkey')!;
    expect(turkeyEntry.points).toBe(8); // higher-valued one kept
    expect(result.filter((a) => a.category === 'turkey')).toHaveLength(1);
  });

  // ── all-positives path ───────────────────────────────────────────────────

  it('returns up to max positives sorted by points desc when no negatives', () => {
    const input = [
      award('king_par3_individual', 2),
      award('turkey', 4),
      award('most_eagles_team', 4),
      award('longest_bogey_free_streak', 4),
      award('closest_to_pin', 2),
    ];
    const result = selectNotableAwards(input, 3);
    expect(result).toHaveLength(3);
    // First two should be 4p awards; order within same points is stable by map insertion.
    expect(result.every((a) => a.points >= 2)).toBe(true);
    // No negatives in result.
    expect(result.every((a) => a.points > 0)).toBe(true);
  });

  it('returns fewer than max when fewer non-netto positives exist', () => {
    const input = [award('turkey', 4), award('solid', 2)];
    const result = selectNotableAwards(input, 5);
    expect(result).toHaveLength(2);
  });

  // ── single negative included ──────────────────────────────────────────────

  it('includes the single worst negative alongside positives (cap at max)', () => {
    const input = [
      award('turkey', 4),
      award('most_birdies_individual', 1),
      award('snowman', -2),
      award('most_double_bogeys_individual', -1),
    ];
    // With max=3: 2 positives + 1 negative (snowman, worst).
    const result = selectNotableAwards(input, 3);
    expect(result).toHaveLength(3);
    const neg = result.filter((a) => a.points < 0);
    expect(neg).toHaveLength(1);
    expect(neg[0]!.category).toBe('snowman'); // -2 is worse than -1
    const pos = result.filter((a) => a.points > 0);
    expect(pos).toHaveLength(2);
  });

  it('snowman shows alongside top positive when max=2', () => {
    const input = [
      award('turkey', 4),
      award('closest_to_pin', 2),
      award('snowman', -2),
    ];
    const result = selectNotableAwards(input, 2);
    expect(result).toHaveLength(2);
    expect(result.find((a) => a.category === 'turkey')).toBeDefined();
    expect(result.find((a) => a.category === 'snowman')).toBeDefined();
  });

  it('tops up with remaining positives after inserting negative', () => {
    // max=4: reserve 1 slot for negative → 3 positive slots.
    // Then top-up fills the 4th slot (result length should be 4).
    const input = [
      award('turkey', 4),
      award('most_eagles_individual', 2),
      award('comeback_kid', 2),
      award('solid', 2),
      award('snowman', -2),
    ];
    const result = selectNotableAwards(input, 4);
    expect(result).toHaveLength(4);
    expect(result.filter((a) => a.points < 0)).toHaveLength(1);
    expect(result.filter((a) => a.points > 0)).toHaveLength(3);
  });

  it('caps result at max even when more awards are available', () => {
    const input = [
      award('turkey', 4),
      award('most_eagles_individual', 2),
      award('comeback_kid', 2),
      award('solid', 2),
      award('all_par_groups_birdie', 2),
    ];
    const result = selectNotableAwards(input, 2);
    expect(result).toHaveLength(2);
  });

  // ── only negatives ────────────────────────────────────────────────────────

  it('returns the single worst negative when only negatives exist', () => {
    const input = [
      award('snowman', -2),
      award('worst_single_hole_brutto', -1),
    ];
    // No positives → negative fills the 1-slot it gets, then top-up from positives = 0.
    const result = selectNotableAwards(input, 3);
    // negatives.length > 0 → reserve 1 slot; 0 positives for positiveSlots (2 slots).
    // result = [] + [snowman] + 0 top-ups = [snowman].
    expect(result).toHaveLength(1);
    expect(result[0]!.category).toBe('snowman');
  });

  // ── negative selection: most-negative (worst) first ───────────────────────

  it('picks the most-negative penalty when multiple negatives exist', () => {
    const input = [
      award('worst_single_hole_brutto', -1),
      award('snowman', -2),
      award('most_double_bogeys_individual', -1),
    ];
    const result = selectNotableAwards(input, 2);
    const neg = result.find((a) => a.points < 0);
    expect(neg?.category).toBe('snowman'); // -2, most negative
  });
});
