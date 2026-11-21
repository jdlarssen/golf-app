// Audit 2026-11-20 (S8, S11): the side tournament reads every weight from
// SIDE_TOURNAMENT_POINTS, measures each player against their own par, and
// ranks shared places the way the engines do (1, 1, 3).
import { describe, it, expect, vi } from 'vitest';

// The engine must take every weight from the list. Changing the six weights
// that used to be literals proves it: a literal would keep the old number.
vi.mock('./sideTournamentConfig', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./sideTournamentConfig')>();
  return {
    ...actual,
    SIDE_TOURNAMENT_POINTS: {
      ...actual.SIDE_TOURNAMENT_POINTS,
      bestNetto18: 11,
      bestNettoF9: 7,
      bestNettoB9: 6,
      holeWin: 3,
      longestDrive: 9,
      closestToPin: 8,
    },
  };
});

import {
  calculateSideTournament,
  rankSideStandings,
  type SideTournamentInput,
} from './sideTournament';

function baseInput(overrides: Partial<SideTournamentInput> = {}): SideTournamentInput {
  return {
    config: { enabled: true, ldCount: 1, ctpCount: 1, disabledCategories: [] },
    teams: [
      { teamId: 1, userIds: ['user-a'] },
      { teamId: 2, userIds: ['user-b'] },
    ],
    coursePars: new Array(18).fill(4),
    courseStrokeIndices: Array.from({ length: 18 }, (_, i) => i + 1),
    playerScoresPerHole: [],
    nettoBestBallPerHole: [
      { teamId: 1, perHoleNetto: [3, ...new Array(17).fill(4)] },
      { teamId: 2, perHoleNetto: new Array(18).fill(5) },
    ],
    sideWinners: [],
    ...overrides,
  };
}

const pointsOf = (
  result: ReturnType<typeof calculateSideTournament>,
  teamId: number,
  category: string,
): number[] =>
  result.teamStandings
    .find((t) => t.teamId === teamId)!
    .awards.filter((a) => a.category === category)
    .map((a) => a.points);

describe('side tournament weights come from SIDE_TOURNAMENT_POINTS', () => {
  it('net 18, front 9, back 9, hole win, longest drive and closest to pin', () => {
    const result = calculateSideTournament(
      baseInput({
        sideWinners: [
          { category: 'longest_drive', position: 1, winnerUserId: 'user-b' },
          { category: 'closest_to_pin', position: 1, winnerUserId: 'user-b' },
        ],
      }),
    );
    expect(pointsOf(result, 1, 'best_netto_18')).toEqual([11]);
    expect(pointsOf(result, 1, 'best_netto_f9')).toEqual([7]);
    expect(pointsOf(result, 1, 'best_netto_b9')).toEqual([6]);
    expect(pointsOf(result, 1, 'hole_win')).toHaveLength(18);
    expect(new Set(pointsOf(result, 1, 'hole_win'))).toEqual(new Set([3]));
    expect(pointsOf(result, 2, 'longest_drive')).toEqual([9]);
    expect(pointsOf(result, 2, 'closest_to_pin')).toEqual([8]);
  });
});

describe('side tournament measures each player against their own par', () => {
  // Hole 1 is par 4 from the men's tee and par 5 from the ladies' tee.
  // Kari (ladies' tee) scores net 4 there: a birdie for her, a par for a man.
  const coursePars = new Array(18).fill(4);
  const ladiesPars = [5, ...new Array(17).fill(4)];
  const input = (perHolePar?: number[]): SideTournamentInput =>
    baseInput({
      config: {
        enabled: true,
        ldCount: 0,
        ctpCount: 0,
        // Only the birdie categories are of interest here.
        disabledCategories: [],
      },
      teams: [
        { teamId: 1, userIds: ['ola'] },
        { teamId: 2, userIds: ['kari'] },
      ],
      coursePars,
      playerScoresPerHole: [
        {
          userId: 'ola',
          perHoleGross: new Array(18).fill(5),
          perHoleNetto: new Array(18).fill(5),
        },
        {
          userId: 'kari',
          perHoleGross: [4, ...new Array(17).fill(5)],
          perHoleNetto: [4, ...new Array(17).fill(5)],
          ...(perHolePar ? { perHolePar } : {}),
        },
      ],
    });

  it("a player's own par makes net 4 on a par-5 hole a birdie", () => {
    const result = calculateSideTournament(input(ladiesPars));
    expect(pointsOf(result, 2, 'most_birdies_individual')).toHaveLength(1);
    expect(pointsOf(result, 1, 'most_birdies_individual')).toHaveLength(0);
  });

  it('without a per-player par, the course par still applies', () => {
    const result = calculateSideTournament(input());
    expect(pointsOf(result, 2, 'most_birdies_individual')).toHaveLength(0);
  });

  it('the even-par round uses the sum of her own par', () => {
    // Kari: net 5 on the par-5 hole and net 4 on the other seventeen = 73,
    // which is her own par. Ola: net 72 on his par 72. Both are even par.
    const result = calculateSideTournament(
      baseInput({
        config: { enabled: true, ldCount: 0, ctpCount: 0, disabledCategories: [] },
        teams: [
          { teamId: 1, userIds: ['ola'] },
          { teamId: 2, userIds: ['kari'] },
        ],
        playerScoresPerHole: [
          { userId: 'ola', perHoleGross: new Array(18).fill(4), perHoleNetto: new Array(18).fill(4) },
          {
            userId: 'kari',
            perHoleGross: [5, ...new Array(17).fill(4)],
            perHoleNetto: [5, ...new Array(17).fill(4)],
            perHolePar: ladiesPars,
          },
        ],
      }),
    );
    expect(pointsOf(result, 1, 'even_par_round')).toHaveLength(1);
    expect(pointsOf(result, 2, 'even_par_round')).toHaveLength(1);
  });
});

describe('rankSideStandings', () => {
  it('shares a place and skips the next one, like the engines (1, 1, 3)', () => {
    const ranked = rankSideStandings([
      { teamId: 1, totalPoints: 4 },
      { teamId: 2, totalPoints: 10 },
      { teamId: 3, totalPoints: 10 },
      { teamId: 4, totalPoints: 2 },
    ]);
    expect(ranked.map((r) => [r.teamId, r.rank])).toEqual([
      [2, 1],
      [3, 1],
      [1, 3],
      [4, 4],
    ]);
  });
});
