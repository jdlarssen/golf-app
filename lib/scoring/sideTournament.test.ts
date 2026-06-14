import { describe, it, expect } from 'vitest';
import {
  calculateSideTournament,
  type SideTournamentInput,
} from './sideTournament';

// Helper: bygg per-hole-netto-array for et lag
function holes(values: Array<number | null>): Array<number | null> {
  if (values.length !== 18) throw new Error('test bug: must be 18 holes');
  return values;
}

// Default stroke indices (1..18 in order). Tests for `hardest_hole_winner`
// override this to position SI=1 on a specific hole.
function defaultStrokeIndices(): number[] {
  return Array.from({ length: 18 }, (_, i) => i + 1);
}

// Standard 2-lags-input som test-cases utvider
function baseInput(overrides: Partial<SideTournamentInput> = {}): SideTournamentInput {
  return {
    config: { enabled: true, ldCount: 0, ctpCount: 0, disabledCategories: [] },
    teams: [
      { teamId: 1, userIds: ['user-a', 'user-b'] },
      { teamId: 2, userIds: ['user-c', 'user-d'] },
    ],
    coursePars: new Array(18).fill(4),
    courseStrokeIndices: defaultStrokeIndices(),
    playerScoresPerHole: [],
    nettoBestBallPerHole: [
      { teamId: 1, perHoleNetto: holes(new Array(18).fill(4)) },
      { teamId: 2, perHoleNetto: holes(new Array(18).fill(5)) },
    ],
    sideWinners: [],
    ...overrides,
  };
}

describe('calculateSideTournament', () => {
  it('best netto 18: single winner gets 10 points', () => {
    const result = calculateSideTournament(baseInput());
    const team1 = result.teamStandings.find((t) => t.teamId === 1)!;
    const team2 = result.teamStandings.find((t) => t.teamId === 2)!;

    const team1Award = team1.awards.find((a) => a.category === 'best_netto_18');
    expect(team1Award?.points).toBe(10);
    expect(team2.awards.find((a) => a.category === 'best_netto_18')).toBeUndefined();
  });

  it('best netto 18: tie → both teams get full 10 (no split)', () => {
    const input = baseInput({
      nettoBestBallPerHole: [
        { teamId: 1, perHoleNetto: holes(new Array(18).fill(4)) },
        { teamId: 2, perHoleNetto: holes(new Array(18).fill(4)) }, // tie
      ],
    });
    const result = calculateSideTournament(input);
    const team1 = result.teamStandings.find((t) => t.teamId === 1)!;
    const team2 = result.teamStandings.find((t) => t.teamId === 2)!;

    expect(team1.awards.find((a) => a.category === 'best_netto_18')?.points).toBe(10);
    expect(team2.awards.find((a) => a.category === 'best_netto_18')?.points).toBe(10);
  });

  it('front 9 and back 9 winners can be different teams', () => {
    // Team 1 sterk på F9 (3 per hull), Team 2 sterk på B9 (3 per hull)
    const team1 = [...Array(9).fill(3), ...Array(9).fill(5)];
    const team2 = [...Array(9).fill(5), ...Array(9).fill(3)];
    const result = calculateSideTournament(baseInput({
      nettoBestBallPerHole: [
        { teamId: 1, perHoleNetto: holes(team1) },
        { teamId: 2, perHoleNetto: holes(team2) },
      ],
    }));

    const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
    const t2 = result.teamStandings.find((t) => t.teamId === 2)!;

    expect(t1.awards.find((a) => a.category === 'best_netto_front9')?.points).toBe(5);
    expect(t2.awards.find((a) => a.category === 'best_netto_back9')?.points).toBe(5);
  });

  it('hole-win: alone winner gets 2 points per hole', () => {
    // Team 1 vinner alle 18 hull alene → 18 × 2 = 36 hole-win-poeng
    const result = calculateSideTournament(baseInput());
    const t1 = result.teamStandings.find((t) => t.teamId === 1)!;

    const holeWinAwards = t1.awards.filter((a) => a.category === 'hole_win');
    const totalHoleWin = holeWinAwards.reduce((sum, a) => sum + a.points, 0);
    expect(totalHoleWin).toBe(36);
  });

  it('hole-win: tie on a hole → no points for that hole', () => {
    // Begge lag 4 på hull 1, ulikt resten (team 1 vinner resten)
    const t1Holes = [4, ...new Array(17).fill(3)];
    const t2Holes = [4, ...new Array(17).fill(5)];
    const result = calculateSideTournament(baseInput({
      nettoBestBallPerHole: [
        { teamId: 1, perHoleNetto: holes(t1Holes) },
        { teamId: 2, perHoleNetto: holes(t2Holes) },
      ],
    }));

    const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
    const t2 = result.teamStandings.find((t) => t.teamId === 2)!;

    // Team 1 vinner hull 2-18 alene → 17 × 2 = 34p
    expect(t1.awards.filter((a) => a.category === 'hole_win').reduce((s, a) => s + a.points, 0)).toBe(34);
    // Team 2 vinner ingen hull alene
    expect(t2.awards.filter((a) => a.category === 'hole_win').length).toBe(0);
  });

  it('hole-win: 3-way tie → no points', () => {
    const input = baseInput({
      teams: [
        { teamId: 1, userIds: ['a'] },
        { teamId: 2, userIds: ['b'] },
        { teamId: 3, userIds: ['c'] },
      ],
      nettoBestBallPerHole: [
        { teamId: 1, perHoleNetto: holes(new Array(18).fill(4)) },
        { teamId: 2, perHoleNetto: holes(new Array(18).fill(4)) },
        { teamId: 3, perHoleNetto: holes(new Array(18).fill(4)) },
      ],
    });
    const result = calculateSideTournament(input);
    const totalHoleWin = result.teamStandings.reduce((sum, t) => {
      return sum + t.awards.filter((a) => a.category === 'hole_win').reduce((s, a) => s + a.points, 0);
    }, 0);
    expect(totalHoleWin).toBe(0);
  });

  it('LD: 1 slot, winner set → 2p to winner team', () => {
    const input = baseInput({
      config: { enabled: true, ldCount: 1, ctpCount: 0, disabledCategories: [] },
      sideWinners: [
        { category: 'longest_drive', position: 1, winnerUserId: 'user-a' },
      ],
    });
    const result = calculateSideTournament(input);
    const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
    expect(t1.awards.find((a) => a.category === 'longest_drive')?.points).toBe(2);
  });

  it('LD: 2 slots, same player both → 4p to that team', () => {
    const input = baseInput({
      config: { enabled: true, ldCount: 2, ctpCount: 0, disabledCategories: [] },
      sideWinners: [
        { category: 'longest_drive', position: 1, winnerUserId: 'user-a' },
        { category: 'longest_drive', position: 2, winnerUserId: 'user-a' },
      ],
    });
    const result = calculateSideTournament(input);
    const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
    const ldAwards = t1.awards.filter((a) => a.category === 'longest_drive');
    expect(ldAwards.reduce((s, a) => s + a.points, 0)).toBe(4);
  });

  it('LD: slot with null winner → 0p, no award', () => {
    const input = baseInput({
      config: { enabled: true, ldCount: 1, ctpCount: 0, disabledCategories: [] },
      sideWinners: [
        { category: 'longest_drive', position: 1, winnerUserId: null },
      ],
    });
    const result = calculateSideTournament(input);
    const totalLd = result.teamStandings.reduce(
      (sum, t) => sum + t.awards.filter((a) => a.category === 'longest_drive').reduce((s, a) => s + a.points, 0),
      0
    );
    expect(totalLd).toBe(0);
  });

  it('CTP mirrors LD logic', () => {
    const input = baseInput({
      config: { enabled: true, ldCount: 0, ctpCount: 1, disabledCategories: [] },
      sideWinners: [
        { category: 'closest_to_pin', position: 1, winnerUserId: 'user-c' }, // user-c is on team 2
      ],
    });
    const result = calculateSideTournament(input);
    const t2 = result.teamStandings.find((t) => t.teamId === 2)!;
    expect(t2.awards.find((a) => a.category === 'closest_to_pin')?.points).toBe(2);
  });

  it('integration: all modules on, totals add up', () => {
    // Team 1: vinner F9 alene (3p/hull → 27 sum), Team 2 vinner B9 alene (3p/hull → 27 sum)
    // Begge har sum 27 + 45 = 72 totalt = tie på 18 → begge får 10
    // Hole-wins: team 1 vinner alle F9-hull alene = 9 × 2 = 18p, team 2 vinner alle B9-hull alene = 18p
    // LD: 2 slots; user-a + user-c (lag 1 og 2)
    // CTP: 2 slots; user-b + user-d (lag 1 og 2)
    const t1 = [...Array(9).fill(3), ...Array(9).fill(5)];
    const t2 = [...Array(9).fill(5), ...Array(9).fill(3)];
    const input = baseInput({
      config: { enabled: true, ldCount: 2, ctpCount: 2, disabledCategories: [] },
      nettoBestBallPerHole: [
        { teamId: 1, perHoleNetto: holes(t1) },
        { teamId: 2, perHoleNetto: holes(t2) },
      ],
      sideWinners: [
        { category: 'longest_drive', position: 1, winnerUserId: 'user-a' },
        { category: 'longest_drive', position: 2, winnerUserId: 'user-c' },
        { category: 'closest_to_pin', position: 1, winnerUserId: 'user-b' },
        { category: 'closest_to_pin', position: 2, winnerUserId: 'user-d' },
      ],
    });
    const result = calculateSideTournament(input);
    const team1 = result.teamStandings.find((t) => t.teamId === 1)!;
    const team2 = result.teamStandings.find((t) => t.teamId === 2)!;

    // Team 1: best_netto_18 (10, tie) + best_netto_front9 (5) + hole_win F9 (18) + LD (2) + CTP (2) = 37
    expect(team1.totalPoints).toBe(37);
    // Team 2: best_netto_18 (10, tie) + best_netto_back9 (5) + hole_win B9 (18) + LD (2) + CTP (2) = 37
    expect(team2.totalPoints).toBe(37);
  });

  it('config.enabled = false → all teams 0 points, no awards', () => {
    const input = baseInput({ config: { enabled: false, ldCount: 0, ctpCount: 0, disabledCategories: [] } });
    const result = calculateSideTournament(input);
    for (const team of result.teamStandings) {
      expect(team.totalPoints).toBe(0);
      expect(team.awards).toHaveLength(0);
    }
  });

  it('handles 4-team game without crashing', () => {
    const input: SideTournamentInput = {
      config: { enabled: true, ldCount: 0, ctpCount: 0, disabledCategories: [] },
      teams: [1, 2, 3, 4].map((id) => ({ teamId: id, userIds: [`u${id}`] })),
      coursePars: new Array(18).fill(4),
      courseStrokeIndices: Array.from({ length: 18 }, (_, i) => i + 1),
      playerScoresPerHole: [],
      nettoBestBallPerHole: [1, 2, 3, 4].map((id) => ({
        teamId: id,
        perHoleNetto: holes(new Array(18).fill(3 + id)), // team 1 best (4/hole), team 4 worst (7/hole)
      })),
      sideWinners: [],
    };
    const result = calculateSideTournament(input);
    expect(result.teamStandings).toHaveLength(4);
    const team1 = result.teamStandings.find((t) => t.teamId === 1)!;
    expect(team1.awards.find((a) => a.category === 'best_netto_18')?.points).toBe(10);
    expect(team1.awards.filter((a) => a.category === 'hole_win').reduce((s, a) => s + a.points, 0)).toBe(36);
  });

  describe('extended input shape (v1.2.0)', () => {
    it('accepts coursePars, playerScoresPerHole, and disabledCategories without throwing', () => {
      const input: SideTournamentInput = {
        config: { enabled: true, ldCount: 0, ctpCount: 0, disabledCategories: [] },
        teams: [{ teamId: 1, userIds: ['u1'] }],
        coursePars: Array(18).fill(4),
        courseStrokeIndices: Array.from({ length: 18 }, (_, i) => i + 1),
        playerScoresPerHole: [{
          userId: 'u1',
          perHoleGross: Array(18).fill(4),
          perHoleNetto: Array(18).fill(4),
        }],
        nettoBestBallPerHole: [{ teamId: 1, perHoleNetto: Array(18).fill(4) }],
        sideWinners: [],
      };
      expect(() => calculateSideTournament(input)).not.toThrow();
    });
  });

  describe('disabled categories', () => {
    it('skips best_netto_18 when in disabledCategories', () => {
      // Default baseInput has team 1 winning 18-hole netto outright
      const input = baseInput();
      input.config = { ...input.config, disabledCategories: ['best_netto_18'] };
      const result = calculateSideTournament(input);
      const awards = result.teamStandings.flatMap((s) => s.awards);

      expect(awards.some((a) => a.category === 'best_netto_18')).toBe(false);
      // Spot-check: other categories still fire (team 1 still wins F9/B9/hole-wins)
      expect(awards.some((a) => a.category === 'best_netto_front9')).toBe(true);
      expect(awards.some((a) => a.category === 'hole_win')).toBe(true);
    });

    it('skips best_netto_front9 when best_netto_f9 in disabledCategories', () => {
      // Team 1 wins F9 outright in baseInput
      const input = baseInput();
      input.config = { ...input.config, disabledCategories: ['best_netto_f9'] };
      const result = calculateSideTournament(input);
      const awards = result.teamStandings.flatMap((s) => s.awards);

      expect(awards.some((a) => a.category === 'best_netto_front9')).toBe(false);
      // Spot-check: 18-hole netto and B9 still fire
      expect(awards.some((a) => a.category === 'best_netto_18')).toBe(true);
      expect(awards.some((a) => a.category === 'best_netto_back9')).toBe(true);
    });

    it('skips best_netto_back9 when best_netto_b9 in disabledCategories', () => {
      const input = baseInput();
      input.config = { ...input.config, disabledCategories: ['best_netto_b9'] };
      const result = calculateSideTournament(input);
      const awards = result.teamStandings.flatMap((s) => s.awards);

      expect(awards.some((a) => a.category === 'best_netto_back9')).toBe(false);
      // Spot-check: 18-hole netto and F9 still fire
      expect(awards.some((a) => a.category === 'best_netto_18')).toBe(true);
      expect(awards.some((a) => a.category === 'best_netto_front9')).toBe(true);
    });

    it('skips hole_win when in disabledCategories', () => {
      // baseInput: team 1 wins all 18 holes alone → would normally award 18 hole-wins
      const input = baseInput();
      input.config = { ...input.config, disabledCategories: ['hole_win'] };
      const result = calculateSideTournament(input);
      const awards = result.teamStandings.flatMap((s) => s.awards);

      expect(awards.some((a) => a.category === 'hole_win')).toBe(false);
      // Spot-check: best_netto_18 still fires (team 1 still wins outright)
      expect(awards.some((a) => a.category === 'best_netto_18')).toBe(true);
    });

    it('skips longest_drive when in disabledCategories', () => {
      const input = baseInput({
        config: { enabled: true, ldCount: 1, ctpCount: 1, disabledCategories: ['longest_drive'] },
        sideWinners: [
          { category: 'longest_drive', position: 1, winnerUserId: 'user-a' },
          { category: 'closest_to_pin', position: 1, winnerUserId: 'user-c' },
        ],
      });
      const result = calculateSideTournament(input);
      const awards = result.teamStandings.flatMap((s) => s.awards);

      expect(awards.some((a) => a.category === 'longest_drive')).toBe(false);
      // Spot-check: CTP still fires
      expect(awards.some((a) => a.category === 'closest_to_pin')).toBe(true);
    });

    it('skips closest_to_pin when in disabledCategories', () => {
      const input = baseInput({
        config: { enabled: true, ldCount: 1, ctpCount: 1, disabledCategories: ['closest_to_pin'] },
        sideWinners: [
          { category: 'longest_drive', position: 1, winnerUserId: 'user-a' },
          { category: 'closest_to_pin', position: 1, winnerUserId: 'user-c' },
        ],
      });
      const result = calculateSideTournament(input);
      const awards = result.teamStandings.flatMap((s) => s.awards);

      expect(awards.some((a) => a.category === 'closest_to_pin')).toBe(false);
      // Spot-check: LD still fires
      expect(awards.some((a) => a.category === 'longest_drive')).toBe(true);
    });

    it('skips multiple categories when several are disabled', () => {
      const input = baseInput();
      input.config = {
        ...input.config,
        disabledCategories: ['hole_win', 'best_netto_18'],
      };
      const result = calculateSideTournament(input);
      const awards = result.teamStandings.flatMap((s) => s.awards);

      expect(awards.some((a) => a.category === 'hole_win')).toBe(false);
      expect(awards.some((a) => a.category === 'best_netto_18')).toBe(false);
      // Spot-check: F9 and B9 still fire
      expect(awards.some((a) => a.category === 'best_netto_front9')).toBe(true);
      expect(awards.some((a) => a.category === 'best_netto_back9')).toBe(true);
    });
  });

  describe('most_birdies', () => {
    // Helper: build an 18-hole array filled with par 4
    const par4Course = (): number[] => new Array(18).fill(4);

    // Helper: per-player score with same gross/netto and explicit netto array
    const player = (
      userId: string,
      perHoleNetto: Array<number | null>,
    ): SideTournamentInput['playerScoresPerHole'][number] => ({
      userId,
      perHoleGross: perHoleNetto, // brutto irrelevant for these tests
      perHoleNetto,
    });

    it('awards team-aggregate to single team with most birdies', () => {
      // Team 1 (user-a + user-b): 5 netto-birdies total (a=3, b=2)
      // Team 2 (user-c + user-d): 2 netto-birdies total (c=1, d=1)
      const userANetto = [3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
      const userBNetto = [3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
      const userCNetto = [3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
      const userDNetto = [3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];

      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;

      expect(t1.awards.find((a) => a.category === 'most_birdies_team')?.points).toBe(2);
      expect(t2.awards.find((a) => a.category === 'most_birdies_team')).toBeUndefined();
    });

    it('awards team-aggregate to both teams on a tie (full pot, no split)', () => {
      // Both teams have 3 birdies total
      const userANetto = [3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
      const userBNetto = [3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
      const userCNetto = [3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
      const userDNetto = [3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];

      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;

      expect(t1.awards.find((a) => a.category === 'most_birdies_team')?.points).toBe(2);
      expect(t2.awards.find((a) => a.category === 'most_birdies_team')?.points).toBe(2);
    });

    it('awards individual to single player with most birdies', () => {
      // user-c has 4 birdies, all others have fewer
      const userANetto = [3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
      const userBNetto = [3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
      const userCNetto = [3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
      const userDNetto = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];

      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });

      const result = calculateSideTournament(input);
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;

      // user-c is on team 2 → team 2 gets the individual award
      expect(t2.awards.find((a) => a.category === 'most_birdies_individual')?.points).toBe(1);
      expect(t2.awards.find((a) => a.category === 'most_birdies_individual')?.winnerUserId).toBe('user-c');
      expect(t1.awards.find((a) => a.category === 'most_birdies_individual')).toBeUndefined();
    });

    it('awards individual to each tied player team on a tie', () => {
      // user-a and user-c both have 3 birdies — both on different teams
      const userANetto = [3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
      const userBNetto = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
      const userCNetto = [3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
      const userDNetto = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];

      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;

      expect(t1.awards.find((a) => a.category === 'most_birdies_individual')?.points).toBe(1);
      expect(t2.awards.find((a) => a.category === 'most_birdies_individual')?.points).toBe(1);
    });

    it('skips team-aggregate when both teams have only 1 player (1v1)', () => {
      const userANetto = [3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
      const userBNetto = [3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];

      const input: SideTournamentInput = {
        config: { enabled: true, ldCount: 0, ctpCount: 0, disabledCategories: [] },
        teams: [
          { teamId: 1, userIds: ['user-a'] },
          { teamId: 2, userIds: ['user-b'] },
        ],
        coursePars: par4Course(),
        courseStrokeIndices: Array.from({ length: 18 }, (_, i) => i + 1),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
        ],
        nettoBestBallPerHole: [
          { teamId: 1, perHoleNetto: userANetto },
          { teamId: 2, perHoleNetto: userBNetto },
        ],
        sideWinners: [],
      };

      const result = calculateSideTournament(input);
      const allAwards = result.teamStandings.flatMap((s) => s.awards);

      // No team-aggregate award; individual still fires
      expect(allAwards.some((a) => a.category === 'most_birdies_team')).toBe(false);
      expect(allAwards.some((a) => a.category === 'most_birdies_individual')).toBe(true);
    });

    it('honors disabledCategories: ["most_birdies_team"]', () => {
      const userANetto = [3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
      const userBNetto = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
      const userCNetto = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
      const userDNetto = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];

      const input = baseInput({
        config: { enabled: true, ldCount: 0, ctpCount: 0, disabledCategories: ['most_birdies_team'] },
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });

      const result = calculateSideTournament(input);
      const awards = result.teamStandings.flatMap((s) => s.awards);

      expect(awards.some((a) => a.category === 'most_birdies_team')).toBe(false);
      // Individual still fires
      expect(awards.some((a) => a.category === 'most_birdies_individual')).toBe(true);
    });

    it('honors disabledCategories: ["most_birdies_individual"]', () => {
      const userANetto = [3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
      const userBNetto = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
      const userCNetto = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
      const userDNetto = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];

      const input = baseInput({
        config: { enabled: true, ldCount: 0, ctpCount: 0, disabledCategories: ['most_birdies_individual'] },
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });

      const result = calculateSideTournament(input);
      const awards = result.teamStandings.flatMap((s) => s.awards);

      expect(awards.some((a) => a.category === 'most_birdies_individual')).toBe(false);
      // Team-aggregate still fires
      expect(awards.some((a) => a.category === 'most_birdies_team')).toBe(true);
    });
  });

  describe('most_eagles', () => {
    // Helper: build an 18-hole array filled with par 4
    const par4Course = (): number[] => new Array(18).fill(4);

    // Helper: per-player score with same gross/netto and explicit netto array
    const player = (
      userId: string,
      perHoleNetto: Array<number | null>,
    ): SideTournamentInput['playerScoresPerHole'][number] => ({
      userId,
      perHoleGross: perHoleNetto,
      perHoleNetto,
    });

    it('awards team-aggregate to single team with most eagles+', () => {
      // Eagle+ = netto <= par - 2 (so on par-4: netto ≤ 2)
      // Team 1: 3 eagles (a=2, b=1)
      // Team 2: 1 eagle (c=1, d=0)
      const userANetto = [2, 2, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
      const userBNetto = [2, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
      const userCNetto = [2, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
      const userDNetto = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];

      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;

      expect(t1.awards.find((a) => a.category === 'most_eagles_team')?.points).toBe(4);
      expect(t2.awards.find((a) => a.category === 'most_eagles_team')).toBeUndefined();
    });

    it('awards team-aggregate to both teams on a tie (full pot, no split)', () => {
      // Both teams: 2 eagles total
      const userANetto = [2, 2, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
      const userBNetto = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
      const userCNetto = [2, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
      const userDNetto = [2, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];

      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;

      expect(t1.awards.find((a) => a.category === 'most_eagles_team')?.points).toBe(4);
      expect(t2.awards.find((a) => a.category === 'most_eagles_team')?.points).toBe(4);
    });

    it('awards individual to single player with most eagles+', () => {
      // user-a has 3 eagles, all others have at most 1
      const userANetto = [2, 2, 2, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
      const userBNetto = [2, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
      const userCNetto = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
      const userDNetto = [2, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];

      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;

      // user-a on team 1 → team 1 gets the award
      expect(t1.awards.find((a) => a.category === 'most_eagles_individual')?.points).toBe(2);
      expect(t1.awards.find((a) => a.category === 'most_eagles_individual')?.winnerUserId).toBe('user-a');
      expect(t2.awards.find((a) => a.category === 'most_eagles_individual')).toBeUndefined();
    });

    it('awards individual to each tied player team on a tie', () => {
      // user-a and user-c both have 2 eagles
      const userANetto = [2, 2, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
      const userBNetto = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
      const userCNetto = [2, 2, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
      const userDNetto = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];

      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;

      expect(t1.awards.find((a) => a.category === 'most_eagles_individual')?.points).toBe(2);
      expect(t2.awards.find((a) => a.category === 'most_eagles_individual')?.points).toBe(2);
    });

    it('skips team-aggregate when both teams have only 1 player (1v1)', () => {
      const userANetto = [2, 2, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
      const userBNetto = [2, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];

      const input: SideTournamentInput = {
        config: { enabled: true, ldCount: 0, ctpCount: 0, disabledCategories: [] },
        teams: [
          { teamId: 1, userIds: ['user-a'] },
          { teamId: 2, userIds: ['user-b'] },
        ],
        coursePars: par4Course(),
        courseStrokeIndices: Array.from({ length: 18 }, (_, i) => i + 1),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
        ],
        nettoBestBallPerHole: [
          { teamId: 1, perHoleNetto: userANetto },
          { teamId: 2, perHoleNetto: userBNetto },
        ],
        sideWinners: [],
      };

      const result = calculateSideTournament(input);
      const allAwards = result.teamStandings.flatMap((s) => s.awards);

      expect(allAwards.some((a) => a.category === 'most_eagles_team')).toBe(false);
      expect(allAwards.some((a) => a.category === 'most_eagles_individual')).toBe(true);
    });

    it('honors disabledCategories: ["most_eagles_team"]', () => {
      const userANetto = [2, 2, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
      const userBNetto = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
      const userCNetto = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
      const userDNetto = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];

      const input = baseInput({
        config: { enabled: true, ldCount: 0, ctpCount: 0, disabledCategories: ['most_eagles_team'] },
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });

      const result = calculateSideTournament(input);
      const awards = result.teamStandings.flatMap((s) => s.awards);

      expect(awards.some((a) => a.category === 'most_eagles_team')).toBe(false);
      expect(awards.some((a) => a.category === 'most_eagles_individual')).toBe(true);
    });

    it('honors disabledCategories: ["most_eagles_individual"]', () => {
      const userANetto = [2, 2, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
      const userBNetto = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
      const userCNetto = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
      const userDNetto = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];

      const input = baseInput({
        config: { enabled: true, ldCount: 0, ctpCount: 0, disabledCategories: ['most_eagles_individual'] },
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });

      const result = calculateSideTournament(input);
      const awards = result.teamStandings.flatMap((s) => s.awards);

      expect(awards.some((a) => a.category === 'most_eagles_individual')).toBe(false);
      expect(awards.some((a) => a.category === 'most_eagles_team')).toBe(true);
    });
  });

  describe('most_pars', () => {
    // Helper: build an 18-hole array filled with par 4
    const par4Course = (): number[] => new Array(18).fill(4);

    // Helper: per-player score with same gross/netto and explicit netto array
    const player = (
      userId: string,
      perHoleNetto: Array<number | null>,
    ): SideTournamentInput['playerScoresPerHole'][number] => ({
      userId,
      perHoleGross: perHoleNetto,
      perHoleNetto,
    });

    it('awards team-aggregate to single team with most pars+', () => {
      // Par or better = netto <= par (so on par-4: netto ≤ 4)
      // Team 1: 6 pars+ total (a=4, b=2)
      // Team 2: 3 pars+ total (c=2, d=1)
      const userANetto = [4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userBNetto = [4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userCNetto = [4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userDNetto = [4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];

      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;

      expect(t1.awards.find((a) => a.category === 'most_pars_team')?.points).toBe(2);
      expect(t2.awards.find((a) => a.category === 'most_pars_team')).toBeUndefined();
    });

    it('awards team-aggregate to both teams on a tie (full pot, no split)', () => {
      // Both teams: 4 pars+ total
      const userANetto = [4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userBNetto = [4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userCNetto = [4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userDNetto = [4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];

      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;

      expect(t1.awards.find((a) => a.category === 'most_pars_team')?.points).toBe(2);
      expect(t2.awards.find((a) => a.category === 'most_pars_team')?.points).toBe(2);
    });

    it('awards individual to single player with most pars+', () => {
      // user-b has 5 pars+, all others have at most 3
      const userANetto = [4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userBNetto = [4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userCNetto = [4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userDNetto = [4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];

      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;

      // user-b on team 1 → team 1 gets the award
      expect(t1.awards.find((a) => a.category === 'most_pars_individual')?.points).toBe(1);
      expect(t1.awards.find((a) => a.category === 'most_pars_individual')?.winnerUserId).toBe('user-b');
      expect(t2.awards.find((a) => a.category === 'most_pars_individual')).toBeUndefined();
    });

    it('awards individual to each tied player team on a tie', () => {
      // user-a and user-c both have 4 pars+, others have less
      const userANetto = [4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userBNetto = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userCNetto = [4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userDNetto = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];

      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;

      expect(t1.awards.find((a) => a.category === 'most_pars_individual')?.points).toBe(1);
      expect(t2.awards.find((a) => a.category === 'most_pars_individual')?.points).toBe(1);
    });

    it('skips team-aggregate when both teams have only 1 player (1v1)', () => {
      const userANetto = [4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userBNetto = [4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];

      const input: SideTournamentInput = {
        config: { enabled: true, ldCount: 0, ctpCount: 0, disabledCategories: [] },
        teams: [
          { teamId: 1, userIds: ['user-a'] },
          { teamId: 2, userIds: ['user-b'] },
        ],
        coursePars: par4Course(),
        courseStrokeIndices: Array.from({ length: 18 }, (_, i) => i + 1),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
        ],
        nettoBestBallPerHole: [
          { teamId: 1, perHoleNetto: userANetto },
          { teamId: 2, perHoleNetto: userBNetto },
        ],
        sideWinners: [],
      };

      const result = calculateSideTournament(input);
      const allAwards = result.teamStandings.flatMap((s) => s.awards);

      expect(allAwards.some((a) => a.category === 'most_pars_team')).toBe(false);
      expect(allAwards.some((a) => a.category === 'most_pars_individual')).toBe(true);
    });

    it('honors disabledCategories: ["most_pars_team"]', () => {
      const userANetto = [4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userBNetto = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userCNetto = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userDNetto = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];

      const input = baseInput({
        config: { enabled: true, ldCount: 0, ctpCount: 0, disabledCategories: ['most_pars_team'] },
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });

      const result = calculateSideTournament(input);
      const awards = result.teamStandings.flatMap((s) => s.awards);

      expect(awards.some((a) => a.category === 'most_pars_team')).toBe(false);
      expect(awards.some((a) => a.category === 'most_pars_individual')).toBe(true);
    });

    it('honors disabledCategories: ["most_pars_individual"]', () => {
      const userANetto = [4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userBNetto = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userCNetto = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userDNetto = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];

      const input = baseInput({
        config: { enabled: true, ldCount: 0, ctpCount: 0, disabledCategories: ['most_pars_individual'] },
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });

      const result = calculateSideTournament(input);
      const awards = result.teamStandings.flatMap((s) => s.awards);

      expect(awards.some((a) => a.category === 'most_pars_individual')).toBe(false);
      expect(awards.some((a) => a.category === 'most_pars_team')).toBe(true);
    });
  });

  describe('best_brutto_18', () => {
    // Helper: build an 18-hole array filled with par 4
    const par4Course = (): number[] => new Array(18).fill(4);

    // Helper: per-player score with explicit gross + matching netto (irrelevant here)
    const player = (
      userId: string,
      perHoleGross: Array<number | null>,
    ): SideTournamentInput['playerScoresPerHole'][number] => ({
      userId,
      perHoleGross,
      perHoleNetto: perHoleGross, // netto ignored by brutto categories
    });

    it('awards team-aggregate (best ball brutto) to single team with lowest sum', () => {
      // Team 1 (user-a + user-b): best-ball brutto per hole = min(a,b)
      // user-a: [4,4,4,...] (sum 72), user-b: [5,5,5,...] (sum 90) → team best-ball = 4 every hole → sum 72
      // Team 2 (user-c + user-d):
      // user-c: [5,5,5,...] (sum 90), user-d: [5,5,5,...] (sum 90) → team best-ball = 5 every hole → sum 90
      const userAGross = new Array(18).fill(4);
      const userBGross = new Array(18).fill(5);
      const userCGross = new Array(18).fill(5);
      const userDGross = new Array(18).fill(5);

      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userAGross),
          player('user-b', userBGross),
          player('user-c', userCGross),
          player('user-d', userDGross),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;

      expect(t1.awards.find((a) => a.category === 'best_brutto_18_team')?.points).toBe(4);
      expect(t2.awards.find((a) => a.category === 'best_brutto_18_team')).toBeUndefined();
    });

    it('awards team-aggregate to both teams on a tie (full pot)', () => {
      // Both teams: best-ball brutto sum = 72
      const userAGross = new Array(18).fill(4);
      const userBGross = new Array(18).fill(5);
      const userCGross = new Array(18).fill(4);
      const userDGross = new Array(18).fill(5);

      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userAGross),
          player('user-b', userBGross),
          player('user-c', userCGross),
          player('user-d', userDGross),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;

      expect(t1.awards.find((a) => a.category === 'best_brutto_18_team')?.points).toBe(4);
      expect(t2.awards.find((a) => a.category === 'best_brutto_18_team')?.points).toBe(4);
    });

    it('awards individual-best to single player with lowest brutto sum', () => {
      // user-c has the lowest brutto sum (70 = 4×16 + 3×2)
      const userAGross = new Array(18).fill(4); // sum 72
      const userBGross = new Array(18).fill(5); // sum 90
      const userCGross = [3, 3, ...new Array(16).fill(4)]; // sum 70
      const userDGross = new Array(18).fill(5); // sum 90

      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userAGross),
          player('user-b', userBGross),
          player('user-c', userCGross),
          player('user-d', userDGross),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;

      // user-c on team 2
      expect(t2.awards.find((a) => a.category === 'best_brutto_18_individual')?.points).toBe(2);
      expect(t2.awards.find((a) => a.category === 'best_brutto_18_individual')?.winnerUserId).toBe('user-c');
      expect(t1.awards.find((a) => a.category === 'best_brutto_18_individual')).toBeUndefined();
    });

    it('awards individual-best to each tied player team on a tie', () => {
      // user-a (team 1) and user-c (team 2) both have sum 70
      const userAGross = [3, 3, ...new Array(16).fill(4)]; // sum 70
      const userBGross = new Array(18).fill(5); // sum 90
      const userCGross = [3, 3, ...new Array(16).fill(4)]; // sum 70
      const userDGross = new Array(18).fill(5); // sum 90

      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userAGross),
          player('user-b', userBGross),
          player('user-c', userCGross),
          player('user-d', userDGross),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;

      expect(t1.awards.find((a) => a.category === 'best_brutto_18_individual')?.points).toBe(2);
      expect(t2.awards.find((a) => a.category === 'best_brutto_18_individual')?.points).toBe(2);
    });

    it('skips team-aggregate when both teams have only 1 player (1v1)', () => {
      const userAGross = new Array(18).fill(4);
      const userBGross = new Array(18).fill(5);

      const input: SideTournamentInput = {
        config: { enabled: true, ldCount: 0, ctpCount: 0, disabledCategories: [] },
        teams: [
          { teamId: 1, userIds: ['user-a'] },
          { teamId: 2, userIds: ['user-b'] },
        ],
        coursePars: par4Course(),
        courseStrokeIndices: Array.from({ length: 18 }, (_, i) => i + 1),
        playerScoresPerHole: [
          player('user-a', userAGross),
          player('user-b', userBGross),
        ],
        nettoBestBallPerHole: [
          { teamId: 1, perHoleNetto: userAGross },
          { teamId: 2, perHoleNetto: userBGross },
        ],
        sideWinners: [],
      };

      const result = calculateSideTournament(input);
      const allAwards = result.teamStandings.flatMap((s) => s.awards);

      expect(allAwards.some((a) => a.category === 'best_brutto_18_team')).toBe(false);
      expect(allAwards.some((a) => a.category === 'best_brutto_18_individual')).toBe(true);
    });

    it('honors disabledCategories: ["best_brutto_18_team"]', () => {
      const userAGross = new Array(18).fill(4);
      const userBGross = new Array(18).fill(5);
      const userCGross = new Array(18).fill(5);
      const userDGross = new Array(18).fill(5);

      const input = baseInput({
        config: { enabled: true, ldCount: 0, ctpCount: 0, disabledCategories: ['best_brutto_18_team'] },
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userAGross),
          player('user-b', userBGross),
          player('user-c', userCGross),
          player('user-d', userDGross),
        ],
      });

      const result = calculateSideTournament(input);
      const awards = result.teamStandings.flatMap((s) => s.awards);

      expect(awards.some((a) => a.category === 'best_brutto_18_team')).toBe(false);
      expect(awards.some((a) => a.category === 'best_brutto_18_individual')).toBe(true);
    });

    it('honors disabledCategories: ["best_brutto_18_individual"]', () => {
      const userAGross = new Array(18).fill(4);
      const userBGross = new Array(18).fill(5);
      const userCGross = new Array(18).fill(5);
      const userDGross = new Array(18).fill(5);

      const input = baseInput({
        config: { enabled: true, ldCount: 0, ctpCount: 0, disabledCategories: ['best_brutto_18_individual'] },
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userAGross),
          player('user-b', userBGross),
          player('user-c', userCGross),
          player('user-d', userDGross),
        ],
      });

      const result = calculateSideTournament(input);
      const awards = result.teamStandings.flatMap((s) => s.awards);

      expect(awards.some((a) => a.category === 'best_brutto_18_individual')).toBe(false);
      expect(awards.some((a) => a.category === 'best_brutto_18_team')).toBe(true);
    });
  });

  describe('best_brutto_f9', () => {
    const par4Course = (): number[] => new Array(18).fill(4);

    const player = (
      userId: string,
      perHoleGross: Array<number | null>,
    ): SideTournamentInput['playerScoresPerHole'][number] => ({
      userId,
      perHoleGross,
      perHoleNetto: perHoleGross,
    });

    it('awards team-aggregate to single team with lowest F9 best-ball brutto sum', () => {
      // F9 only: hole 0-8 (inclusive)
      // Team 1: a + b → best-ball every F9 hole = min(4,5) = 4; B9 ignored
      // Team 2: c + d → best-ball every F9 hole = 5
      const userAGross = [...new Array(9).fill(4), ...new Array(9).fill(7)];
      const userBGross = [...new Array(9).fill(5), ...new Array(9).fill(8)];
      const userCGross = [...new Array(9).fill(5), ...new Array(9).fill(4)]; // B9 doesn't help
      const userDGross = [...new Array(9).fill(5), ...new Array(9).fill(4)];

      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userAGross),
          player('user-b', userBGross),
          player('user-c', userCGross),
          player('user-d', userDGross),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;

      expect(t1.awards.find((a) => a.category === 'best_brutto_f9_team')?.points).toBe(2);
      expect(t2.awards.find((a) => a.category === 'best_brutto_f9_team')).toBeUndefined();
    });

    it('awards team-aggregate to both teams on F9 tie', () => {
      // Both teams: F9 best-ball brutto sum = 36 (4×9)
      const userAGross = [...new Array(9).fill(4), ...new Array(9).fill(4)];
      const userBGross = [...new Array(9).fill(5), ...new Array(9).fill(5)];
      const userCGross = [...new Array(9).fill(4), ...new Array(9).fill(4)];
      const userDGross = [...new Array(9).fill(5), ...new Array(9).fill(5)];

      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userAGross),
          player('user-b', userBGross),
          player('user-c', userCGross),
          player('user-d', userDGross),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;

      expect(t1.awards.find((a) => a.category === 'best_brutto_f9_team')?.points).toBe(2);
      expect(t2.awards.find((a) => a.category === 'best_brutto_f9_team')?.points).toBe(2);
    });

    it('awards individual-best F9 to single player', () => {
      // user-c lowest F9 brutto sum = 32 (3×4 + 4×5)
      const userAGross = [...new Array(9).fill(4), ...new Array(9).fill(4)]; // F9: 36
      const userBGross = [...new Array(9).fill(5), ...new Array(9).fill(5)]; // F9: 45
      const userCGross = [3, 3, 3, 3, 4, 4, 4, 4, 4, ...new Array(9).fill(5)]; // F9: 32
      const userDGross = [...new Array(9).fill(5), ...new Array(9).fill(5)]; // F9: 45

      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userAGross),
          player('user-b', userBGross),
          player('user-c', userCGross),
          player('user-d', userDGross),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;

      // user-c on team 2
      expect(t2.awards.find((a) => a.category === 'best_brutto_f9_individual')?.points).toBe(1);
      expect(t2.awards.find((a) => a.category === 'best_brutto_f9_individual')?.winnerUserId).toBe('user-c');
      expect(t1.awards.find((a) => a.category === 'best_brutto_f9_individual')).toBeUndefined();
    });

    it('awards individual-best F9 to each tied player team on a tie', () => {
      // user-a (team 1) and user-c (team 2) both F9 = 32
      const userAGross = [3, 3, 3, 3, 4, 4, 4, 4, 4, ...new Array(9).fill(5)];
      const userBGross = [...new Array(9).fill(5), ...new Array(9).fill(5)];
      const userCGross = [3, 3, 3, 3, 4, 4, 4, 4, 4, ...new Array(9).fill(5)];
      const userDGross = [...new Array(9).fill(5), ...new Array(9).fill(5)];

      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userAGross),
          player('user-b', userBGross),
          player('user-c', userCGross),
          player('user-d', userDGross),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;

      expect(t1.awards.find((a) => a.category === 'best_brutto_f9_individual')?.points).toBe(1);
      expect(t2.awards.find((a) => a.category === 'best_brutto_f9_individual')?.points).toBe(1);
    });

    it('skips team-aggregate when both teams have only 1 player (1v1)', () => {
      const userAGross = [...new Array(9).fill(4), ...new Array(9).fill(4)];
      const userBGross = [...new Array(9).fill(5), ...new Array(9).fill(5)];

      const input: SideTournamentInput = {
        config: { enabled: true, ldCount: 0, ctpCount: 0, disabledCategories: [] },
        teams: [
          { teamId: 1, userIds: ['user-a'] },
          { teamId: 2, userIds: ['user-b'] },
        ],
        coursePars: par4Course(),
        courseStrokeIndices: Array.from({ length: 18 }, (_, i) => i + 1),
        playerScoresPerHole: [
          player('user-a', userAGross),
          player('user-b', userBGross),
        ],
        nettoBestBallPerHole: [
          { teamId: 1, perHoleNetto: userAGross },
          { teamId: 2, perHoleNetto: userBGross },
        ],
        sideWinners: [],
      };

      const result = calculateSideTournament(input);
      const allAwards = result.teamStandings.flatMap((s) => s.awards);

      expect(allAwards.some((a) => a.category === 'best_brutto_f9_team')).toBe(false);
      expect(allAwards.some((a) => a.category === 'best_brutto_f9_individual')).toBe(true);
    });

    it('honors disabledCategories: ["best_brutto_f9_team"]', () => {
      const userAGross = [...new Array(9).fill(4), ...new Array(9).fill(4)];
      const userBGross = [...new Array(9).fill(5), ...new Array(9).fill(5)];
      const userCGross = [...new Array(9).fill(5), ...new Array(9).fill(5)];
      const userDGross = [...new Array(9).fill(5), ...new Array(9).fill(5)];

      const input = baseInput({
        config: { enabled: true, ldCount: 0, ctpCount: 0, disabledCategories: ['best_brutto_f9_team'] },
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userAGross),
          player('user-b', userBGross),
          player('user-c', userCGross),
          player('user-d', userDGross),
        ],
      });

      const result = calculateSideTournament(input);
      const awards = result.teamStandings.flatMap((s) => s.awards);

      expect(awards.some((a) => a.category === 'best_brutto_f9_team')).toBe(false);
      expect(awards.some((a) => a.category === 'best_brutto_f9_individual')).toBe(true);
    });

    it('honors disabledCategories: ["best_brutto_f9_individual"]', () => {
      const userAGross = [...new Array(9).fill(4), ...new Array(9).fill(4)];
      const userBGross = [...new Array(9).fill(5), ...new Array(9).fill(5)];
      const userCGross = [...new Array(9).fill(5), ...new Array(9).fill(5)];
      const userDGross = [...new Array(9).fill(5), ...new Array(9).fill(5)];

      const input = baseInput({
        config: { enabled: true, ldCount: 0, ctpCount: 0, disabledCategories: ['best_brutto_f9_individual'] },
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userAGross),
          player('user-b', userBGross),
          player('user-c', userCGross),
          player('user-d', userDGross),
        ],
      });

      const result = calculateSideTournament(input);
      const awards = result.teamStandings.flatMap((s) => s.awards);

      expect(awards.some((a) => a.category === 'best_brutto_f9_individual')).toBe(false);
      expect(awards.some((a) => a.category === 'best_brutto_f9_team')).toBe(true);
    });
  });

  describe('best_brutto_b9', () => {
    const par4Course = (): number[] => new Array(18).fill(4);

    const player = (
      userId: string,
      perHoleGross: Array<number | null>,
    ): SideTournamentInput['playerScoresPerHole'][number] => ({
      userId,
      perHoleGross,
      perHoleNetto: perHoleGross,
    });

    it('awards team-aggregate to single team with lowest B9 best-ball brutto sum', () => {
      // B9 only: holes 10-18 (indices 9..17)
      // Team 1 B9 best-ball: min(7,8)=7 each → sum 63
      // Team 2 B9 best-ball: min(4,4)=4 each → sum 36
      const userAGross = [...new Array(9).fill(4), ...new Array(9).fill(7)];
      const userBGross = [...new Array(9).fill(5), ...new Array(9).fill(8)];
      const userCGross = [...new Array(9).fill(5), ...new Array(9).fill(4)];
      const userDGross = [...new Array(9).fill(5), ...new Array(9).fill(4)];

      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userAGross),
          player('user-b', userBGross),
          player('user-c', userCGross),
          player('user-d', userDGross),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;

      expect(t2.awards.find((a) => a.category === 'best_brutto_b9_team')?.points).toBe(2);
      expect(t1.awards.find((a) => a.category === 'best_brutto_b9_team')).toBeUndefined();
    });

    it('awards team-aggregate to both teams on B9 tie', () => {
      // Both teams: B9 best-ball brutto sum = 36
      const userAGross = [...new Array(9).fill(4), ...new Array(9).fill(4)];
      const userBGross = [...new Array(9).fill(5), ...new Array(9).fill(5)];
      const userCGross = [...new Array(9).fill(5), ...new Array(9).fill(4)];
      const userDGross = [...new Array(9).fill(5), ...new Array(9).fill(5)];

      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userAGross),
          player('user-b', userBGross),
          player('user-c', userCGross),
          player('user-d', userDGross),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;

      expect(t1.awards.find((a) => a.category === 'best_brutto_b9_team')?.points).toBe(2);
      expect(t2.awards.find((a) => a.category === 'best_brutto_b9_team')?.points).toBe(2);
    });

    it('awards individual-best B9 to single player', () => {
      // user-d lowest B9 = 32 (4×4 + 5×4 = 16+20 → adjusted below)
      const userAGross = [...new Array(9).fill(5), ...new Array(9).fill(5)]; // B9: 45
      const userBGross = [...new Array(9).fill(5), ...new Array(9).fill(5)]; // B9: 45
      const userCGross = [...new Array(9).fill(5), ...new Array(9).fill(5)]; // B9: 45
      const userDGross = [...new Array(9).fill(5), 3, 3, 3, 3, 4, 4, 4, 4, 4]; // B9: 32

      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userAGross),
          player('user-b', userBGross),
          player('user-c', userCGross),
          player('user-d', userDGross),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;

      // user-d on team 2
      expect(t2.awards.find((a) => a.category === 'best_brutto_b9_individual')?.points).toBe(1);
      expect(t2.awards.find((a) => a.category === 'best_brutto_b9_individual')?.winnerUserId).toBe('user-d');
      expect(t1.awards.find((a) => a.category === 'best_brutto_b9_individual')).toBeUndefined();
    });

    it('awards individual-best B9 to each tied player team on a tie', () => {
      // user-b (team 1) and user-d (team 2) both B9 = 32
      const userAGross = [...new Array(9).fill(5), ...new Array(9).fill(5)];
      const userBGross = [...new Array(9).fill(5), 3, 3, 3, 3, 4, 4, 4, 4, 4];
      const userCGross = [...new Array(9).fill(5), ...new Array(9).fill(5)];
      const userDGross = [...new Array(9).fill(5), 3, 3, 3, 3, 4, 4, 4, 4, 4];

      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userAGross),
          player('user-b', userBGross),
          player('user-c', userCGross),
          player('user-d', userDGross),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;

      expect(t1.awards.find((a) => a.category === 'best_brutto_b9_individual')?.points).toBe(1);
      expect(t2.awards.find((a) => a.category === 'best_brutto_b9_individual')?.points).toBe(1);
    });

    it('skips team-aggregate when both teams have only 1 player (1v1)', () => {
      const userAGross = [...new Array(9).fill(5), ...new Array(9).fill(4)];
      const userBGross = [...new Array(9).fill(5), ...new Array(9).fill(5)];

      const input: SideTournamentInput = {
        config: { enabled: true, ldCount: 0, ctpCount: 0, disabledCategories: [] },
        teams: [
          { teamId: 1, userIds: ['user-a'] },
          { teamId: 2, userIds: ['user-b'] },
        ],
        coursePars: par4Course(),
        courseStrokeIndices: Array.from({ length: 18 }, (_, i) => i + 1),
        playerScoresPerHole: [
          player('user-a', userAGross),
          player('user-b', userBGross),
        ],
        nettoBestBallPerHole: [
          { teamId: 1, perHoleNetto: userAGross },
          { teamId: 2, perHoleNetto: userBGross },
        ],
        sideWinners: [],
      };

      const result = calculateSideTournament(input);
      const allAwards = result.teamStandings.flatMap((s) => s.awards);

      expect(allAwards.some((a) => a.category === 'best_brutto_b9_team')).toBe(false);
      expect(allAwards.some((a) => a.category === 'best_brutto_b9_individual')).toBe(true);
    });

    it('honors disabledCategories: ["best_brutto_b9_team"]', () => {
      const userAGross = [...new Array(9).fill(5), ...new Array(9).fill(4)];
      const userBGross = [...new Array(9).fill(5), ...new Array(9).fill(5)];
      const userCGross = [...new Array(9).fill(5), ...new Array(9).fill(5)];
      const userDGross = [...new Array(9).fill(5), ...new Array(9).fill(5)];

      const input = baseInput({
        config: { enabled: true, ldCount: 0, ctpCount: 0, disabledCategories: ['best_brutto_b9_team'] },
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userAGross),
          player('user-b', userBGross),
          player('user-c', userCGross),
          player('user-d', userDGross),
        ],
      });

      const result = calculateSideTournament(input);
      const awards = result.teamStandings.flatMap((s) => s.awards);

      expect(awards.some((a) => a.category === 'best_brutto_b9_team')).toBe(false);
      expect(awards.some((a) => a.category === 'best_brutto_b9_individual')).toBe(true);
    });

    it('honors disabledCategories: ["best_brutto_b9_individual"]', () => {
      const userAGross = [...new Array(9).fill(5), ...new Array(9).fill(4)];
      const userBGross = [...new Array(9).fill(5), ...new Array(9).fill(5)];
      const userCGross = [...new Array(9).fill(5), ...new Array(9).fill(5)];
      const userDGross = [...new Array(9).fill(5), ...new Array(9).fill(5)];

      const input = baseInput({
        config: { enabled: true, ldCount: 0, ctpCount: 0, disabledCategories: ['best_brutto_b9_individual'] },
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userAGross),
          player('user-b', userBGross),
          player('user-c', userCGross),
          player('user-d', userDGross),
        ],
      });

      const result = calculateSideTournament(input);
      const awards = result.teamStandings.flatMap((s) => s.awards);

      expect(awards.some((a) => a.category === 'best_brutto_b9_individual')).toBe(false);
      expect(awards.some((a) => a.category === 'best_brutto_b9_team')).toBe(true);
    });
  });

  describe('king_par3', () => {
    // Course with par-3 on holes 3, 7, 12, 16 (1-indexed) → indices 2, 6, 11, 15
    // All other holes are par-4
    const mixedParCourse = (): number[] => {
      const pars = new Array(18).fill(4);
      pars[2] = 3;
      pars[6] = 3;
      pars[11] = 3;
      pars[15] = 3;
      return pars;
    };

    const player = (
      userId: string,
      perHoleGross: Array<number | null>,
    ): SideTournamentInput['playerScoresPerHole'][number] => ({
      userId,
      perHoleGross,
      perHoleNetto: perHoleGross,
    });

    it('awards team-aggregate (best ball brutto) to single team with lowest par-3 sum', () => {
      // Filter to par-3 holes (indices 2, 6, 11, 15)
      // Team 1: a=3 on all par-3, b=4 → best-ball par-3 = 3, sum=12
      // Team 2: c=4, d=4 → best-ball par-3 = 4, sum=16
      const userAGross = new Array(18).fill(4);
      userAGross[2] = 3; userAGross[6] = 3; userAGross[11] = 3; userAGross[15] = 3;
      const userBGross = new Array(18).fill(4);
      const userCGross = new Array(18).fill(4);
      const userDGross = new Array(18).fill(4);

      const input = baseInput({
        coursePars: mixedParCourse(),
        playerScoresPerHole: [
          player('user-a', userAGross),
          player('user-b', userBGross),
          player('user-c', userCGross),
          player('user-d', userDGross),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;

      expect(t1.awards.find((a) => a.category === 'king_par3_team')?.points).toBe(4);
      expect(t2.awards.find((a) => a.category === 'king_par3_team')).toBeUndefined();
    });

    it('awards team-aggregate to both teams on tie (full pot)', () => {
      // Both teams: par-3 sum = 12
      const userAGross = new Array(18).fill(4);
      userAGross[2] = 3; userAGross[6] = 3; userAGross[11] = 3; userAGross[15] = 3;
      const userBGross = new Array(18).fill(5);
      const userCGross = new Array(18).fill(4);
      userCGross[2] = 3; userCGross[6] = 3; userCGross[11] = 3; userCGross[15] = 3;
      const userDGross = new Array(18).fill(5);

      const input = baseInput({
        coursePars: mixedParCourse(),
        playerScoresPerHole: [
          player('user-a', userAGross),
          player('user-b', userBGross),
          player('user-c', userCGross),
          player('user-d', userDGross),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;

      expect(t1.awards.find((a) => a.category === 'king_par3_team')?.points).toBe(4);
      expect(t2.awards.find((a) => a.category === 'king_par3_team')?.points).toBe(4);
    });

    it('awards individual-best to single player with lowest par-3 sum', () => {
      // user-c has lowest par-3 brutto sum (2+2+2+2 = 8)
      const userAGross = new Array(18).fill(4);
      userAGross[2] = 3; userAGross[6] = 3; userAGross[11] = 3; userAGross[15] = 3; // par-3 sum 12
      const userBGross = new Array(18).fill(4); // par-3 sum 16
      const userCGross = new Array(18).fill(4);
      userCGross[2] = 2; userCGross[6] = 2; userCGross[11] = 2; userCGross[15] = 2; // par-3 sum 8
      const userDGross = new Array(18).fill(4); // par-3 sum 16

      const input = baseInput({
        coursePars: mixedParCourse(),
        playerScoresPerHole: [
          player('user-a', userAGross),
          player('user-b', userBGross),
          player('user-c', userCGross),
          player('user-d', userDGross),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;

      // user-c on team 2
      expect(t2.awards.find((a) => a.category === 'king_par3_individual')?.points).toBe(2);
      expect(t2.awards.find((a) => a.category === 'king_par3_individual')?.winnerUserId).toBe('user-c');
      expect(t1.awards.find((a) => a.category === 'king_par3_individual')).toBeUndefined();
    });

    it('awards individual-best to each tied player team on a tie', () => {
      // user-a (team 1) and user-c (team 2) both par-3 sum = 8
      const userAGross = new Array(18).fill(4);
      userAGross[2] = 2; userAGross[6] = 2; userAGross[11] = 2; userAGross[15] = 2;
      const userBGross = new Array(18).fill(5);
      const userCGross = new Array(18).fill(4);
      userCGross[2] = 2; userCGross[6] = 2; userCGross[11] = 2; userCGross[15] = 2;
      const userDGross = new Array(18).fill(5);

      const input = baseInput({
        coursePars: mixedParCourse(),
        playerScoresPerHole: [
          player('user-a', userAGross),
          player('user-b', userBGross),
          player('user-c', userCGross),
          player('user-d', userDGross),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;

      expect(t1.awards.find((a) => a.category === 'king_par3_individual')?.points).toBe(2);
      expect(t2.awards.find((a) => a.category === 'king_par3_individual')?.points).toBe(2);
    });

    it('skips team-aggregate when both teams have only 1 player (1v1)', () => {
      const userAGross = new Array(18).fill(4);
      userAGross[2] = 3; userAGross[6] = 3; userAGross[11] = 3; userAGross[15] = 3;
      const userBGross = new Array(18).fill(4);

      const input: SideTournamentInput = {
        config: { enabled: true, ldCount: 0, ctpCount: 0, disabledCategories: [] },
        teams: [
          { teamId: 1, userIds: ['user-a'] },
          { teamId: 2, userIds: ['user-b'] },
        ],
        coursePars: mixedParCourse(),
        courseStrokeIndices: Array.from({ length: 18 }, (_, i) => i + 1),
        playerScoresPerHole: [
          player('user-a', userAGross),
          player('user-b', userBGross),
        ],
        nettoBestBallPerHole: [
          { teamId: 1, perHoleNetto: userAGross },
          { teamId: 2, perHoleNetto: userBGross },
        ],
        sideWinners: [],
      };

      const result = calculateSideTournament(input);
      const allAwards = result.teamStandings.flatMap((s) => s.awards);

      expect(allAwards.some((a) => a.category === 'king_par3_team')).toBe(false);
      expect(allAwards.some((a) => a.category === 'king_par3_individual')).toBe(true);
    });

    it('awards nothing when course has no par-3 holes', () => {
      // All par-4 course → no par-3 holes to filter
      const userAGross = new Array(18).fill(3);
      const userBGross = new Array(18).fill(5);
      const userCGross = new Array(18).fill(5);
      const userDGross = new Array(18).fill(5);

      const input = baseInput({
        coursePars: new Array(18).fill(4), // no par-3 holes
        playerScoresPerHole: [
          player('user-a', userAGross),
          player('user-b', userBGross),
          player('user-c', userCGross),
          player('user-d', userDGross),
        ],
      });

      const result = calculateSideTournament(input);
      const awards = result.teamStandings.flatMap((s) => s.awards);

      expect(awards.some((a) => a.category === 'king_par3_team')).toBe(false);
      expect(awards.some((a) => a.category === 'king_par3_individual')).toBe(false);
    });

    it('honors disabledCategories: ["king_par3_team"] and ["king_par3_individual"]', () => {
      const userAGross = new Array(18).fill(4);
      userAGross[2] = 3; userAGross[6] = 3; userAGross[11] = 3; userAGross[15] = 3;
      const userBGross = new Array(18).fill(5);
      const userCGross = new Array(18).fill(5);
      const userDGross = new Array(18).fill(5);

      const inputTeam = baseInput({
        config: { enabled: true, ldCount: 0, ctpCount: 0, disabledCategories: ['king_par3_team'] },
        coursePars: mixedParCourse(),
        playerScoresPerHole: [
          player('user-a', userAGross),
          player('user-b', userBGross),
          player('user-c', userCGross),
          player('user-d', userDGross),
        ],
      });

      const resultTeam = calculateSideTournament(inputTeam);
      const awardsTeam = resultTeam.teamStandings.flatMap((s) => s.awards);
      expect(awardsTeam.some((a) => a.category === 'king_par3_team')).toBe(false);
      expect(awardsTeam.some((a) => a.category === 'king_par3_individual')).toBe(true);

      const inputIndividual = baseInput({
        config: { enabled: true, ldCount: 0, ctpCount: 0, disabledCategories: ['king_par3_individual'] },
        coursePars: mixedParCourse(),
        playerScoresPerHole: [
          player('user-a', userAGross),
          player('user-b', userBGross),
          player('user-c', userCGross),
          player('user-d', userDGross),
        ],
      });

      const resultIndividual = calculateSideTournament(inputIndividual);
      const awardsIndividual = resultIndividual.teamStandings.flatMap((s) => s.awards);
      expect(awardsIndividual.some((a) => a.category === 'king_par3_individual')).toBe(false);
      expect(awardsIndividual.some((a) => a.category === 'king_par3_team')).toBe(true);
    });
  });

  describe('king_par5', () => {
    // Course with par-5 on holes 4, 9, 13, 18 (1-indexed) → indices 3, 8, 12, 17
    const mixedParCourse = (): number[] => {
      const pars = new Array(18).fill(4);
      pars[3] = 5;
      pars[8] = 5;
      pars[12] = 5;
      pars[17] = 5;
      return pars;
    };

    const player = (
      userId: string,
      perHoleGross: Array<number | null>,
    ): SideTournamentInput['playerScoresPerHole'][number] => ({
      userId,
      perHoleGross,
      perHoleNetto: perHoleGross,
    });

    it('awards team-aggregate to single team with lowest par-5 sum', () => {
      // Team 1: a=5 on par-5, b=6 → best-ball par-5 = 5, sum=20
      // Team 2: c=6, d=6 → best-ball par-5 = 6, sum=24
      const userAGross = new Array(18).fill(4);
      userAGross[3] = 5; userAGross[8] = 5; userAGross[12] = 5; userAGross[17] = 5;
      const userBGross = new Array(18).fill(4);
      userBGross[3] = 6; userBGross[8] = 6; userBGross[12] = 6; userBGross[17] = 6;
      const userCGross = new Array(18).fill(4);
      userCGross[3] = 6; userCGross[8] = 6; userCGross[12] = 6; userCGross[17] = 6;
      const userDGross = new Array(18).fill(4);
      userDGross[3] = 6; userDGross[8] = 6; userDGross[12] = 6; userDGross[17] = 6;

      const input = baseInput({
        coursePars: mixedParCourse(),
        playerScoresPerHole: [
          player('user-a', userAGross),
          player('user-b', userBGross),
          player('user-c', userCGross),
          player('user-d', userDGross),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;

      expect(t1.awards.find((a) => a.category === 'king_par5_team')?.points).toBe(4);
      expect(t2.awards.find((a) => a.category === 'king_par5_team')).toBeUndefined();
    });

    it('awards team-aggregate to both teams on tie (full pot)', () => {
      // Both teams: par-5 sum = 20
      const userAGross = new Array(18).fill(4);
      userAGross[3] = 5; userAGross[8] = 5; userAGross[12] = 5; userAGross[17] = 5;
      const userBGross = new Array(18).fill(4);
      userBGross[3] = 6; userBGross[8] = 6; userBGross[12] = 6; userBGross[17] = 6;
      const userCGross = new Array(18).fill(4);
      userCGross[3] = 5; userCGross[8] = 5; userCGross[12] = 5; userCGross[17] = 5;
      const userDGross = new Array(18).fill(4);
      userDGross[3] = 6; userDGross[8] = 6; userDGross[12] = 6; userDGross[17] = 6;

      const input = baseInput({
        coursePars: mixedParCourse(),
        playerScoresPerHole: [
          player('user-a', userAGross),
          player('user-b', userBGross),
          player('user-c', userCGross),
          player('user-d', userDGross),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;

      expect(t1.awards.find((a) => a.category === 'king_par5_team')?.points).toBe(4);
      expect(t2.awards.find((a) => a.category === 'king_par5_team')?.points).toBe(4);
    });

    it('awards individual-best to single player with lowest par-5 sum', () => {
      // user-c has lowest par-5 brutto sum (4+4+4+4 = 16)
      const userAGross = new Array(18).fill(4);
      userAGross[3] = 5; userAGross[8] = 5; userAGross[12] = 5; userAGross[17] = 5; // par-5 sum 20
      const userBGross = new Array(18).fill(4);
      userBGross[3] = 6; userBGross[8] = 6; userBGross[12] = 6; userBGross[17] = 6; // par-5 sum 24
      const userCGross = new Array(18).fill(4);
      userCGross[3] = 4; userCGross[8] = 4; userCGross[12] = 4; userCGross[17] = 4; // par-5 sum 16
      const userDGross = new Array(18).fill(4);
      userDGross[3] = 6; userDGross[8] = 6; userDGross[12] = 6; userDGross[17] = 6; // par-5 sum 24

      const input = baseInput({
        coursePars: mixedParCourse(),
        playerScoresPerHole: [
          player('user-a', userAGross),
          player('user-b', userBGross),
          player('user-c', userCGross),
          player('user-d', userDGross),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;

      // user-c on team 2
      expect(t2.awards.find((a) => a.category === 'king_par5_individual')?.points).toBe(2);
      expect(t2.awards.find((a) => a.category === 'king_par5_individual')?.winnerUserId).toBe('user-c');
      expect(t1.awards.find((a) => a.category === 'king_par5_individual')).toBeUndefined();
    });

    it('awards individual-best to each tied player team on a tie', () => {
      // user-a (team 1) and user-c (team 2) both par-5 sum = 16
      const userAGross = new Array(18).fill(4);
      userAGross[3] = 4; userAGross[8] = 4; userAGross[12] = 4; userAGross[17] = 4;
      const userBGross = new Array(18).fill(5);
      const userCGross = new Array(18).fill(4);
      userCGross[3] = 4; userCGross[8] = 4; userCGross[12] = 4; userCGross[17] = 4;
      const userDGross = new Array(18).fill(5);

      const input = baseInput({
        coursePars: mixedParCourse(),
        playerScoresPerHole: [
          player('user-a', userAGross),
          player('user-b', userBGross),
          player('user-c', userCGross),
          player('user-d', userDGross),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;

      expect(t1.awards.find((a) => a.category === 'king_par5_individual')?.points).toBe(2);
      expect(t2.awards.find((a) => a.category === 'king_par5_individual')?.points).toBe(2);
    });

    it('skips team-aggregate when both teams have only 1 player (1v1)', () => {
      const userAGross = new Array(18).fill(4);
      userAGross[3] = 5; userAGross[8] = 5; userAGross[12] = 5; userAGross[17] = 5;
      const userBGross = new Array(18).fill(4);
      userBGross[3] = 6; userBGross[8] = 6; userBGross[12] = 6; userBGross[17] = 6;

      const input: SideTournamentInput = {
        config: { enabled: true, ldCount: 0, ctpCount: 0, disabledCategories: [] },
        teams: [
          { teamId: 1, userIds: ['user-a'] },
          { teamId: 2, userIds: ['user-b'] },
        ],
        coursePars: mixedParCourse(),
        courseStrokeIndices: Array.from({ length: 18 }, (_, i) => i + 1),
        playerScoresPerHole: [
          player('user-a', userAGross),
          player('user-b', userBGross),
        ],
        nettoBestBallPerHole: [
          { teamId: 1, perHoleNetto: userAGross },
          { teamId: 2, perHoleNetto: userBGross },
        ],
        sideWinners: [],
      };

      const result = calculateSideTournament(input);
      const allAwards = result.teamStandings.flatMap((s) => s.awards);

      expect(allAwards.some((a) => a.category === 'king_par5_team')).toBe(false);
      expect(allAwards.some((a) => a.category === 'king_par5_individual')).toBe(true);
    });

    it('awards nothing when course has no par-5 holes', () => {
      const userAGross = new Array(18).fill(3);
      const userBGross = new Array(18).fill(5);
      const userCGross = new Array(18).fill(5);
      const userDGross = new Array(18).fill(5);

      const input = baseInput({
        coursePars: new Array(18).fill(4), // no par-5 holes
        playerScoresPerHole: [
          player('user-a', userAGross),
          player('user-b', userBGross),
          player('user-c', userCGross),
          player('user-d', userDGross),
        ],
      });

      const result = calculateSideTournament(input);
      const awards = result.teamStandings.flatMap((s) => s.awards);

      expect(awards.some((a) => a.category === 'king_par5_team')).toBe(false);
      expect(awards.some((a) => a.category === 'king_par5_individual')).toBe(false);
    });

    it('honors disabledCategories: ["king_par5_team"] and ["king_par5_individual"]', () => {
      const userAGross = new Array(18).fill(4);
      userAGross[3] = 5; userAGross[8] = 5; userAGross[12] = 5; userAGross[17] = 5;
      const userBGross = new Array(18).fill(5);
      const userCGross = new Array(18).fill(5);
      const userDGross = new Array(18).fill(5);

      const inputTeam = baseInput({
        config: { enabled: true, ldCount: 0, ctpCount: 0, disabledCategories: ['king_par5_team'] },
        coursePars: mixedParCourse(),
        playerScoresPerHole: [
          player('user-a', userAGross),
          player('user-b', userBGross),
          player('user-c', userCGross),
          player('user-d', userDGross),
        ],
      });

      const resultTeam = calculateSideTournament(inputTeam);
      const awardsTeam = resultTeam.teamStandings.flatMap((s) => s.awards);
      expect(awardsTeam.some((a) => a.category === 'king_par5_team')).toBe(false);
      expect(awardsTeam.some((a) => a.category === 'king_par5_individual')).toBe(true);

      const inputIndividual = baseInput({
        config: { enabled: true, ldCount: 0, ctpCount: 0, disabledCategories: ['king_par5_individual'] },
        coursePars: mixedParCourse(),
        playerScoresPerHole: [
          player('user-a', userAGross),
          player('user-b', userBGross),
          player('user-c', userCGross),
          player('user-d', userDGross),
        ],
      });

      const resultIndividual = calculateSideTournament(inputIndividual);
      const awardsIndividual = resultIndividual.teamStandings.flatMap((s) => s.awards);
      expect(awardsIndividual.some((a) => a.category === 'king_par5_individual')).toBe(false);
      expect(awardsIndividual.some((a) => a.category === 'king_par5_team')).toBe(true);
    });
  });

  describe('longest_bogey_free_streak', () => {
    const par4Course = (): number[] => new Array(18).fill(4);

    const player = (
      userId: string,
      perHoleNetto: Array<number | null>,
    ): SideTournamentInput['playerScoresPerHole'][number] => ({
      userId,
      perHoleGross: perHoleNetto,
      perHoleNetto,
    });

    it('awards 4p to single team with longest bogey-free streak', () => {
      // user-a: 7-hole streak (holes 3-9, indices 2-8)
      // user-b: 3-hole streak
      // user-c: 4-hole streak
      // user-d: 2-hole streak
      const userANetto = [5, 5, 4, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5]; // 7 in a row at idx 2-8
      const userBNetto = [4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5]; // 3 in a row
      const userCNetto = [5, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5]; // 4 in a row
      const userDNetto = [4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5]; // 2 in a row

      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;

      // user-a on team 1 wins (7 hull)
      const award = t1.awards.find((a) => a.category === 'longest_bogey_free_streak');
      expect(award?.points).toBe(4);
      expect(award?.streakLength).toBe(7);
      expect(award?.streakStartHole).toBe(3); // 1-indexed
      expect(award?.streakEndHole).toBe(9); // 1-indexed
      expect(t2.awards.find((a) => a.category === 'longest_bogey_free_streak')).toBeUndefined();
    });

    it('awards 4p to each tied team on a streak tie', () => {
      // user-a (team 1) and user-c (team 2) both have 5-hole streaks
      const userANetto = [4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userBNetto = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userCNetto = [4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userDNetto = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];

      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;

      expect(t1.awards.find((a) => a.category === 'longest_bogey_free_streak')?.points).toBe(4);
      expect(t2.awards.find((a) => a.category === 'longest_bogey_free_streak')?.points).toBe(4);
    });

    it('dedups same-team ties (one award per team)', () => {
      // user-a + user-b both on team 1 have 4-hole streaks (tied)
      // user-c best on team 2 has 3-hole streak
      const userANetto = [4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userBNetto = [4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userCNetto = [4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userDNetto = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];

      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;

      // Team 1 wins but with only ONE award (deduped), not two
      const t1Awards = t1.awards.filter((a) => a.category === 'longest_bogey_free_streak');
      expect(t1Awards).toHaveLength(1);
      expect(t1Awards[0]?.points).toBe(4);
      expect(t2.awards.find((a) => a.category === 'longest_bogey_free_streak')).toBeUndefined();
    });

    it('awards nothing when no player has any par-or-better hole', () => {
      // Everyone bogeys every hole (5 on par 4)
      const userANetto = new Array(18).fill(5);
      const userBNetto = new Array(18).fill(5);
      const userCNetto = new Array(18).fill(5);
      const userDNetto = new Array(18).fill(5);

      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });

      const result = calculateSideTournament(input);
      const awards = result.teamStandings.flatMap((s) => s.awards);
      expect(awards.some((a) => a.category === 'longest_bogey_free_streak')).toBe(false);
    });

    it('counts partial streak correctly (4 in a row counts as 4, not 0)', () => {
      // user-a streak ends on a bogey at hole 5 → 4-hole streak
      const userANetto = [4, 4, 4, 4, 5, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userBNetto = new Array(18).fill(5);
      const userCNetto = new Array(18).fill(5);
      const userDNetto = new Array(18).fill(5);

      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const award = t1.awards.find((a) => a.category === 'longest_bogey_free_streak');
      expect(award?.points).toBe(4);
      expect(award?.streakLength).toBe(4);
      expect(award?.streakStartHole).toBe(1);
      expect(award?.streakEndHole).toBe(4);
    });

    it('honors disabledCategories: ["longest_bogey_free_streak"]', () => {
      const userANetto = [4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userBNetto = new Array(18).fill(5);
      const userCNetto = new Array(18).fill(5);
      const userDNetto = new Array(18).fill(5);

      const input = baseInput({
        config: {
          enabled: true,
          ldCount: 0,
          ctpCount: 0,
          disabledCategories: ['longest_bogey_free_streak'],
        },
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });

      const result = calculateSideTournament(input);
      const awards = result.teamStandings.flatMap((s) => s.awards);
      expect(awards.some((a) => a.category === 'longest_bogey_free_streak')).toBe(false);
    });
  });

  describe('lowest_single_hole_brutto', () => {
    const par4Course = (): number[] => new Array(18).fill(4);

    const player = (
      userId: string,
      perHoleGross: Array<number | null>,
    ): SideTournamentInput['playerScoresPerHole'][number] => ({
      userId,
      perHoleGross,
      perHoleNetto: perHoleGross,
    });

    it('awards 2p to team of single player with the lowest single-hole brutto', () => {
      // user-c has the absolute lowest: 2 on hole 5 (idx 4)
      const userAGross = new Array(18).fill(4);
      userAGross[0] = 3; // best=3
      const userBGross = new Array(18).fill(4); // best=4
      const userCGross = new Array(18).fill(4);
      userCGross[4] = 2; // best=2
      const userDGross = new Array(18).fill(4); // best=4

      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userAGross),
          player('user-b', userBGross),
          player('user-c', userCGross),
          player('user-d', userDGross),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;

      // user-c on team 2 wins
      const award = t2.awards.find((a) => a.category === 'lowest_single_hole_brutto');
      expect(award?.points).toBe(2);
      expect(award?.score).toBe(2);
      expect(award?.holeNumber).toBe(5); // 1-indexed
      expect(t1.awards.find((a) => a.category === 'lowest_single_hole_brutto')).toBeUndefined();
    });

    it('awards 2p to each tied team on a tie', () => {
      // user-a (team 1) and user-c (team 2) both have 2 as lowest
      const userAGross = new Array(18).fill(4);
      userAGross[0] = 2;
      const userBGross = new Array(18).fill(5);
      const userCGross = new Array(18).fill(4);
      userCGross[10] = 2;
      const userDGross = new Array(18).fill(5);

      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userAGross),
          player('user-b', userBGross),
          player('user-c', userCGross),
          player('user-d', userDGross),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;

      expect(t1.awards.find((a) => a.category === 'lowest_single_hole_brutto')?.points).toBe(2);
      expect(t2.awards.find((a) => a.category === 'lowest_single_hole_brutto')?.points).toBe(2);
    });

    it('dedups same-team ties (one award per team)', () => {
      // user-a and user-b both on team 1 have 2 as lowest
      const userAGross = new Array(18).fill(4);
      userAGross[0] = 2;
      const userBGross = new Array(18).fill(4);
      userBGross[5] = 2;
      const userCGross = new Array(18).fill(5);
      const userDGross = new Array(18).fill(5);

      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userAGross),
          player('user-b', userBGross),
          player('user-c', userCGross),
          player('user-d', userDGross),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;

      // Team 1 wins but with only one award (deduped)
      const t1Awards = t1.awards.filter((a) => a.category === 'lowest_single_hole_brutto');
      expect(t1Awards).toHaveLength(1);
      expect(t1Awards[0]?.points).toBe(2);
      expect(t2.awards.find((a) => a.category === 'lowest_single_hole_brutto')).toBeUndefined();
    });

    it('all players have similar lows → still awards to one (or ties)', () => {
      // All four players have a 3 somewhere → 4-way tie, both teams get full pot
      const userAGross = new Array(18).fill(4);
      userAGross[0] = 3;
      const userBGross = new Array(18).fill(4);
      userBGross[1] = 3;
      const userCGross = new Array(18).fill(4);
      userCGross[2] = 3;
      const userDGross = new Array(18).fill(4);
      userDGross[3] = 3;

      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userAGross),
          player('user-b', userBGross),
          player('user-c', userCGross),
          player('user-d', userDGross),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;

      // Both teams get one award (deduped per team)
      expect(t1.awards.filter((a) => a.category === 'lowest_single_hole_brutto')).toHaveLength(1);
      expect(t2.awards.filter((a) => a.category === 'lowest_single_hole_brutto')).toHaveLength(1);
    });

    it('honors disabledCategories: ["lowest_single_hole_brutto"]', () => {
      const userAGross = new Array(18).fill(4);
      userAGross[0] = 2;
      const userBGross = new Array(18).fill(5);
      const userCGross = new Array(18).fill(5);
      const userDGross = new Array(18).fill(5);

      const input = baseInput({
        config: {
          enabled: true,
          ldCount: 0,
          ctpCount: 0,
          disabledCategories: ['lowest_single_hole_brutto'],
        },
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userAGross),
          player('user-b', userBGross),
          player('user-c', userCGross),
          player('user-d', userDGross),
        ],
      });

      const result = calculateSideTournament(input);
      const awards = result.teamStandings.flatMap((s) => s.awards);
      expect(awards.some((a) => a.category === 'lowest_single_hole_brutto')).toBe(false);
    });
  });

  describe('turkey (per spiller)', () => {
    const par4Course = (): number[] => new Array(18).fill(4);

    const player = (
      userId: string,
      perHoleNetto: Array<number | null>,
    ): SideTournamentInput['playerScoresPerHole'][number] => ({
      userId,
      perHoleGross: perHoleNetto,
      perHoleNetto,
    });

    // Quiet baseInput where no other achievement/award lights up — par-4 course,
    // teams with neutral netto best-ball totals, no LD/CTP slots.
    const neutralInput = (
      players: SideTournamentInput['playerScoresPerHole'],
      overrides: Partial<SideTournamentInput> = {},
    ): SideTournamentInput => baseInput({
      coursePars: par4Course(),
      playerScoresPerHole: players,
      ...overrides,
    });

    it('single player with 3 birdies in a row → 1 turkey, 4p', () => {
      // user-a: 3 in a row on holes 1-2-3, then bogeys
      const userANetto = [3, 3, 3, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userBNetto = new Array(18).fill(5);
      const userCNetto = new Array(18).fill(5);
      const userDNetto = new Array(18).fill(5);

      const result = calculateSideTournament(neutralInput([
        player('user-a', userANetto),
        player('user-b', userBNetto),
        player('user-c', userCNetto),
        player('user-d', userDNetto),
      ]));
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;

      const turkeys = t1.awards.filter((a) => a.category === 'turkey');
      expect(turkeys).toHaveLength(1);
      expect(turkeys[0]?.points).toBe(4);
      expect(turkeys[0]?.winnerUserId).toBe('user-a');
      expect(turkeys[0]?.streakLength).toBe(3);
      expect(turkeys[0]?.streakStartHole).toBe(1);
      expect(turkeys[0]?.streakEndHole).toBe(3);
    });

    it('6 birdies in a row → 2 turkeys, 8p total', () => {
      const userANetto = [3, 3, 3, 3, 3, 3, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userBNetto = new Array(18).fill(5);
      const userCNetto = new Array(18).fill(5);
      const userDNetto = new Array(18).fill(5);

      const result = calculateSideTournament(neutralInput([
        player('user-a', userANetto),
        player('user-b', userBNetto),
        player('user-c', userCNetto),
        player('user-d', userDNetto),
      ]));
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;

      const turkeys = t1.awards.filter((a) => a.category === 'turkey');
      expect(turkeys).toHaveLength(2);
      expect(turkeys.reduce((sum, a) => sum + a.points, 0)).toBe(8);
      // First turkey: holes 1-2-3
      expect(turkeys[0]?.streakStartHole).toBe(1);
      expect(turkeys[0]?.streakEndHole).toBe(3);
      // Second turkey: holes 4-5-6
      expect(turkeys[1]?.streakStartHole).toBe(4);
      expect(turkeys[1]?.streakEndHole).toBe(6);
    });

    it('5 birdies in a row → 1 turkey (holes 1-3), holes 4-5 too short', () => {
      const userANetto = [3, 3, 3, 3, 3, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userBNetto = new Array(18).fill(5);
      const userCNetto = new Array(18).fill(5);
      const userDNetto = new Array(18).fill(5);

      const result = calculateSideTournament(neutralInput([
        player('user-a', userANetto),
        player('user-b', userBNetto),
        player('user-c', userCNetto),
        player('user-d', userDNetto),
      ]));
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;

      const turkeys = t1.awards.filter((a) => a.category === 'turkey');
      expect(turkeys).toHaveLength(1);
      expect(turkeys[0]?.points).toBe(4);
      expect(turkeys[0]?.streakStartHole).toBe(1);
      expect(turkeys[0]?.streakEndHole).toBe(3);
    });

    it('spread birdies (holes 1, 5, 10) → 0 turkeys', () => {
      const userANetto = new Array(18).fill(5);
      userANetto[0] = 3;
      userANetto[4] = 3;
      userANetto[9] = 3;
      const userBNetto = new Array(18).fill(5);
      const userCNetto = new Array(18).fill(5);
      const userDNetto = new Array(18).fill(5);

      const result = calculateSideTournament(neutralInput([
        player('user-a', userANetto),
        player('user-b', userBNetto),
        player('user-c', userCNetto),
        player('user-d', userDNetto),
      ]));
      const awards = result.teamStandings.flatMap((s) => s.awards);
      expect(awards.some((a) => a.category === 'turkey')).toBe(false);
    });

    it('4 birdies in a row → 1 turkey', () => {
      const userANetto = [3, 3, 3, 3, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userBNetto = new Array(18).fill(5);
      const userCNetto = new Array(18).fill(5);
      const userDNetto = new Array(18).fill(5);

      const result = calculateSideTournament(neutralInput([
        player('user-a', userANetto),
        player('user-b', userBNetto),
        player('user-c', userCNetto),
        player('user-d', userDNetto),
      ]));
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;

      const turkeys = t1.awards.filter((a) => a.category === 'turkey');
      expect(turkeys).toHaveLength(1);
      expect(turkeys[0]?.streakStartHole).toBe(1);
      expect(turkeys[0]?.streakEndHole).toBe(3);
    });

    it('single-player team (N=1) still gets per-player turkey (4p)', () => {
      // Override teams to a single 1-player team
      const userANetto = [3, 3, 3, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const result = calculateSideTournament(neutralInput(
        [player('user-a', userANetto)],
        {
          teams: [{ teamId: 1, userIds: ['user-a'] }],
          nettoBestBallPerHole: [
            { teamId: 1, perHoleNetto: holes(new Array(18).fill(4)) },
          ],
        },
      ));
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;

      const turkeys = t1.awards.filter((a) => a.category === 'turkey');
      expect(turkeys).toHaveLength(1);
      expect(turkeys[0]?.points).toBe(4);
      expect(turkeys[0]?.winnerUserId).toBe('user-a');
    });

    it('honors disabledCategories: ["turkey"]', () => {
      const userANetto = [3, 3, 3, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userBNetto = new Array(18).fill(5);
      const userCNetto = new Array(18).fill(5);
      const userDNetto = new Array(18).fill(5);

      const input = baseInput({
        config: {
          enabled: true,
          ldCount: 0,
          ctpCount: 0,
          disabledCategories: ['turkey'],
        },
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });

      const result = calculateSideTournament(input);
      const awards = result.teamStandings.flatMap((s) => s.awards);
      expect(awards.some((a) => a.category === 'turkey')).toBe(false);
    });
  });

  describe('turkey (lag-koord-bonus)', () => {
    const par4Course = (): number[] => new Array(18).fill(4);

    const player = (
      userId: string,
      perHoleNetto: Array<number | null>,
    ): SideTournamentInput['playerScoresPerHole'][number] => ({
      userId,
      perHoleGross: perHoleNetto,
      perHoleNetto,
    });

    it('2v2 both birdie 1-2-3 → 8p koord-bonus (4p × 2)', () => {
      // Both user-a and user-b on team 1 birdie holes 1-2-3
      const userANetto = [3, 3, 3, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userBNetto = [3, 3, 3, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userCNetto = new Array(18).fill(5);
      const userDNetto = new Array(18).fill(5);

      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;

      const coordAwards = t1.awards.filter((a) => a.category === 'turkey' && a.coordBonus === true);
      expect(coordAwards).toHaveLength(1);
      expect(coordAwards[0]?.points).toBe(8);
      expect(coordAwards[0]?.streakStartHole).toBe(1);
      expect(coordAwards[0]?.streakEndHole).toBe(3);
    });

    it('4v4 all 4 birdie 1-2-3 → 16p koord-bonus (4p × 4)', () => {
      const userANetto = [3, 3, 3, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userBNetto = [3, 3, 3, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userCNetto = [3, 3, 3, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userDNetto = [3, 3, 3, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];

      // One 4-player team
      const input = baseInput({
        teams: [{ teamId: 1, userIds: ['user-a', 'user-b', 'user-c', 'user-d'] }],
        coursePars: par4Course(),
        nettoBestBallPerHole: [
          { teamId: 1, perHoleNetto: holes(new Array(18).fill(4)) },
        ],
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;

      const coordAwards = t1.awards.filter((a) => a.category === 'turkey' && a.coordBonus === true);
      expect(coordAwards).toHaveLength(1);
      expect(coordAwards[0]?.points).toBe(16); // 4p × 4
    });

    it('3 of 4 birdie 1-2-3 → 0 koord-bonus', () => {
      // user-d is the holdout
      const userANetto = [3, 3, 3, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userBNetto = [3, 3, 3, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userCNetto = [3, 3, 3, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userDNetto = new Array(18).fill(5);

      const input = baseInput({
        teams: [{ teamId: 1, userIds: ['user-a', 'user-b', 'user-c', 'user-d'] }],
        coursePars: par4Course(),
        nettoBestBallPerHole: [
          { teamId: 1, perHoleNetto: holes(new Array(18).fill(4)) },
        ],
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;

      const coordAwards = t1.awards.filter((a) => a.category === 'turkey' && a.coordBonus === true);
      expect(coordAwards).toHaveLength(0);
    });

    it('1-player team → 0 koord-bonus (per-player still awarded)', () => {
      // Single-player team with 3 birdies in a row — gets per-player turkey
      // but NO koord-bonus (rule requires N >= 2)
      const userANetto = [3, 3, 3, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];

      const input = baseInput({
        teams: [{ teamId: 1, userIds: ['user-a'] }],
        coursePars: par4Course(),
        nettoBestBallPerHole: [
          { teamId: 1, perHoleNetto: holes(new Array(18).fill(4)) },
        ],
        playerScoresPerHole: [player('user-a', userANetto)],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;

      const perPlayer = t1.awards.filter((a) => a.category === 'turkey' && !a.coordBonus);
      const coord = t1.awards.filter((a) => a.category === 'turkey' && a.coordBonus === true);
      expect(perPlayer).toHaveLength(1);
      expect(coord).toHaveLength(0);
    });

    it('2v2 both birdie 1-2-3 AND 4-5-6 → 2 koord-bonuses = 16p', () => {
      // Both players on team 1 birdie holes 1-6 in a row
      const userANetto = [3, 3, 3, 3, 3, 3, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userBNetto = [3, 3, 3, 3, 3, 3, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userCNetto = new Array(18).fill(5);
      const userDNetto = new Array(18).fill(5);

      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;

      const coordAwards = t1.awards.filter((a) => a.category === 'turkey' && a.coordBonus === true);
      expect(coordAwards).toHaveLength(2);
      expect(coordAwards.reduce((sum, a) => sum + a.points, 0)).toBe(16); // 2 × 8p
      // First bonus: holes 1-2-3
      expect(coordAwards[0]?.streakStartHole).toBe(1);
      expect(coordAwards[0]?.streakEndHole).toBe(3);
      // Second bonus: holes 4-5-6
      expect(coordAwards[1]?.streakStartHole).toBe(4);
      expect(coordAwards[1]?.streakEndHole).toBe(6);
    });

    it('honors disabledCategories: ["turkey"] for koord-bonus too', () => {
      const userANetto = [3, 3, 3, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userBNetto = [3, 3, 3, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userCNetto = new Array(18).fill(5);
      const userDNetto = new Array(18).fill(5);

      const input = baseInput({
        config: {
          enabled: true,
          ldCount: 0,
          ctpCount: 0,
          disabledCategories: ['turkey'],
        },
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });

      const result = calculateSideTournament(input);
      const awards = result.teamStandings.flatMap((s) => s.awards);
      expect(awards.some((a) => a.category === 'turkey')).toBe(false);
    });

    it('combined: 2v2 both birdie 1-2-3 → per-player + koord = 16p', () => {
      // Validates the full Task 4.1 + 4.2 stack: 4p (a) + 4p (b) + 8p (coord)
      const userANetto = [3, 3, 3, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userBNetto = [3, 3, 3, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userCNetto = new Array(18).fill(5);
      const userDNetto = new Array(18).fill(5);

      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;

      const allTurkeys = t1.awards.filter((a) => a.category === 'turkey');
      const totalTurkeyPoints = allTurkeys.reduce((sum, a) => sum + a.points, 0);
      expect(totalTurkeyPoints).toBe(16);
    });
  });

  describe('solid (per spiller)', () => {
    const par4Course = (): number[] => new Array(18).fill(4);

    const player = (
      userId: string,
      perHoleNetto: Array<number | null>,
    ): SideTournamentInput['playerScoresPerHole'][number] => ({
      userId,
      perHoleGross: perHoleNetto,
      perHoleNetto,
    });

    it('single player with 5 pars in a row → 1 solid, 2p', () => {
      // user-a: 5 pars (netto == par) on holes 1-5, then bogeys
      const userANetto = [4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userBNetto = new Array(18).fill(5);
      const userCNetto = new Array(18).fill(5);
      const userDNetto = new Array(18).fill(5);

      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;

      const solids = t1.awards.filter((a) => a.category === 'solid');
      expect(solids).toHaveLength(1);
      expect(solids[0]?.points).toBe(2);
      expect(solids[0]?.winnerUserId).toBe('user-a');
      expect(solids[0]?.streakLength).toBe(5);
      expect(solids[0]?.streakStartHole).toBe(1);
      expect(solids[0]?.streakEndHole).toBe(5);
    });

    it('10 pars in a row → 2 solids, 4p total', () => {
      const userANetto = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5];
      const userBNetto = new Array(18).fill(5);
      const userCNetto = new Array(18).fill(5);
      const userDNetto = new Array(18).fill(5);

      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;

      const solids = t1.awards.filter((a) => a.category === 'solid');
      expect(solids).toHaveLength(2);
      expect(solids.reduce((sum, a) => sum + a.points, 0)).toBe(4);
      // First: holes 1-5
      expect(solids[0]?.streakStartHole).toBe(1);
      expect(solids[0]?.streakEndHole).toBe(5);
      // Second: holes 6-10
      expect(solids[1]?.streakStartHole).toBe(6);
      expect(solids[1]?.streakEndHole).toBe(10);
    });

    it('9 pars in a row → 1 solid (holes 1-5), holes 6-9 too short', () => {
      const userANetto = [4, 4, 4, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userBNetto = new Array(18).fill(5);
      const userCNetto = new Array(18).fill(5);
      const userDNetto = new Array(18).fill(5);

      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;

      const solids = t1.awards.filter((a) => a.category === 'solid');
      expect(solids).toHaveLength(1);
      expect(solids[0]?.streakStartHole).toBe(1);
      expect(solids[0]?.streakEndHole).toBe(5);
    });

    it('spread pars (holes 1, 5, 10, 14) → 0 solids', () => {
      const userANetto = new Array(18).fill(5);
      userANetto[0] = 4;
      userANetto[4] = 4;
      userANetto[9] = 4;
      userANetto[13] = 4;
      const userBNetto = new Array(18).fill(5);
      const userCNetto = new Array(18).fill(5);
      const userDNetto = new Array(18).fill(5);

      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });

      const result = calculateSideTournament(input);
      const awards = result.teamStandings.flatMap((s) => s.awards);
      expect(awards.some((a) => a.category === 'solid')).toBe(false);
    });

    it('4 pars in a row → 0 solids (need 5)', () => {
      const userANetto = [4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userBNetto = new Array(18).fill(5);
      const userCNetto = new Array(18).fill(5);
      const userDNetto = new Array(18).fill(5);

      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });

      const result = calculateSideTournament(input);
      const awards = result.teamStandings.flatMap((s) => s.awards);
      expect(awards.some((a) => a.category === 'solid')).toBe(false);
    });

    it('single-player team (N=1) still gets per-player solid (2p)', () => {
      const userANetto = [4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];

      const input = baseInput({
        teams: [{ teamId: 1, userIds: ['user-a'] }],
        coursePars: par4Course(),
        nettoBestBallPerHole: [
          { teamId: 1, perHoleNetto: holes(new Array(18).fill(4)) },
        ],
        playerScoresPerHole: [player('user-a', userANetto)],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;

      const solids = t1.awards.filter((a) => a.category === 'solid');
      expect(solids).toHaveLength(1);
      expect(solids[0]?.points).toBe(2);
      expect(solids[0]?.winnerUserId).toBe('user-a');
    });

    it('mix of pars and birdies in 5-streak still counts (netto <= par)', () => {
      // pars + birdies all qualify as netto <= par
      const userANetto = [3, 4, 3, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userBNetto = new Array(18).fill(5);
      const userCNetto = new Array(18).fill(5);
      const userDNetto = new Array(18).fill(5);

      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;

      const solids = t1.awards.filter((a) => a.category === 'solid');
      expect(solids).toHaveLength(1);
      expect(solids[0]?.streakStartHole).toBe(1);
      expect(solids[0]?.streakEndHole).toBe(5);
    });

    it('honors disabledCategories: ["solid"]', () => {
      const userANetto = [4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userBNetto = new Array(18).fill(5);
      const userCNetto = new Array(18).fill(5);
      const userDNetto = new Array(18).fill(5);

      const input = baseInput({
        config: {
          enabled: true,
          ldCount: 0,
          ctpCount: 0,
          disabledCategories: ['solid'],
        },
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });

      const result = calculateSideTournament(input);
      const awards = result.teamStandings.flatMap((s) => s.awards);
      expect(awards.some((a) => a.category === 'solid')).toBe(false);
    });
  });

  describe('solid (lag-koord-bonus)', () => {
    const par4Course = (): number[] => new Array(18).fill(4);

    const player = (
      userId: string,
      perHoleNetto: Array<number | null>,
    ): SideTournamentInput['playerScoresPerHole'][number] => ({
      userId,
      perHoleGross: perHoleNetto,
      perHoleNetto,
    });

    it('2v2 both par-or-better 1-5 → 4p koord-bonus (2p × 2)', () => {
      const userANetto = [4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userBNetto = [4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userCNetto = new Array(18).fill(5);
      const userDNetto = new Array(18).fill(5);

      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;

      const coord = t1.awards.filter((a) => a.category === 'solid' && a.coordBonus === true);
      expect(coord).toHaveLength(1);
      expect(coord[0]?.points).toBe(4);
      expect(coord[0]?.streakStartHole).toBe(1);
      expect(coord[0]?.streakEndHole).toBe(5);
    });

    it('4v4 all 4 par-or-better 1-5 → 8p koord-bonus (2p × 4)', () => {
      const userANetto = [4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userBNetto = [4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userCNetto = [4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userDNetto = [4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];

      const input = baseInput({
        teams: [{ teamId: 1, userIds: ['user-a', 'user-b', 'user-c', 'user-d'] }],
        coursePars: par4Course(),
        nettoBestBallPerHole: [
          { teamId: 1, perHoleNetto: holes(new Array(18).fill(4)) },
        ],
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;

      const coord = t1.awards.filter((a) => a.category === 'solid' && a.coordBonus === true);
      expect(coord).toHaveLength(1);
      expect(coord[0]?.points).toBe(8); // 2p × 4
    });

    it('3 of 4 par-or-better → 0 koord-bonus', () => {
      const userANetto = [4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userBNetto = [4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userCNetto = [4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      // user-d has bogey on hole 3 → breaks the joint streak
      const userDNetto = [4, 4, 5, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];

      const input = baseInput({
        teams: [{ teamId: 1, userIds: ['user-a', 'user-b', 'user-c', 'user-d'] }],
        coursePars: par4Course(),
        nettoBestBallPerHole: [
          { teamId: 1, perHoleNetto: holes(new Array(18).fill(4)) },
        ],
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;

      const coord = t1.awards.filter((a) => a.category === 'solid' && a.coordBonus === true);
      expect(coord).toHaveLength(0);
    });

    it('1-player team → 0 koord-bonus', () => {
      const userANetto = [4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];

      const input = baseInput({
        teams: [{ teamId: 1, userIds: ['user-a'] }],
        coursePars: par4Course(),
        nettoBestBallPerHole: [
          { teamId: 1, perHoleNetto: holes(new Array(18).fill(4)) },
        ],
        playerScoresPerHole: [player('user-a', userANetto)],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;

      const perPlayer = t1.awards.filter((a) => a.category === 'solid' && !a.coordBonus);
      const coord = t1.awards.filter((a) => a.category === 'solid' && a.coordBonus === true);
      expect(perPlayer).toHaveLength(1);
      expect(coord).toHaveLength(0);
    });

    it('2v2 both par-or-better 1-5 AND 6-10 → 2 koord-bonuses = 8p', () => {
      const userANetto = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5];
      const userBNetto = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5];
      const userCNetto = new Array(18).fill(5);
      const userDNetto = new Array(18).fill(5);

      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;

      const coord = t1.awards.filter((a) => a.category === 'solid' && a.coordBonus === true);
      expect(coord).toHaveLength(2);
      expect(coord.reduce((sum, a) => sum + a.points, 0)).toBe(8);
      expect(coord[0]?.streakStartHole).toBe(1);
      expect(coord[0]?.streakEndHole).toBe(5);
      expect(coord[1]?.streakStartHole).toBe(6);
      expect(coord[1]?.streakEndHole).toBe(10);
    });

    it('honors disabledCategories: ["solid"] for koord-bonus too', () => {
      const userANetto = [4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userBNetto = [4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const userCNetto = new Array(18).fill(5);
      const userDNetto = new Array(18).fill(5);

      const input = baseInput({
        config: {
          enabled: true,
          ldCount: 0,
          ctpCount: 0,
          disabledCategories: ['solid'],
        },
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });

      const result = calculateSideTournament(input);
      const awards = result.teamStandings.flatMap((s) => s.awards);
      expect(awards.some((a) => a.category === 'solid')).toBe(false);
    });
  });

  describe('snowman', () => {
    const par4Course = (): number[] => new Array(18).fill(4);

    // Snowman uses brutto, not netto — pass distinct arrays
    const playerGN = (
      userId: string,
      perHoleGross: Array<number | null>,
      perHoleNetto?: Array<number | null>,
    ): SideTournamentInput['playerScoresPerHole'][number] => ({
      userId,
      perHoleGross,
      perHoleNetto: perHoleNetto ?? perHoleGross,
    });

    it('2v2 both gross ≥ par+5 on hole 5 → -2p snowman', () => {
      // par 4, both team-1 players score 9 (par+5) on hole 5 (idx 4)
      const userAGross = new Array(18).fill(4);
      userAGross[4] = 9; // par+5
      const userBGross = new Array(18).fill(4);
      userBGross[4] = 10; // par+6
      const userCGross = new Array(18).fill(4);
      const userDGross = new Array(18).fill(4);

      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          playerGN('user-a', userAGross),
          playerGN('user-b', userBGross),
          playerGN('user-c', userCGross),
          playerGN('user-d', userDGross),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;

      const t1Snowmen = t1.awards.filter((a) => a.category === 'snowman');
      expect(t1Snowmen).toHaveLength(1);
      expect(t1Snowmen[0]?.points).toBe(-2);
      expect(t1Snowmen[0]?.holeNumber).toBe(5);
      expect(t1Snowmen[0]?.score).toBe(6); // worst over-par = +6 (user-b's 10 on par-4)
      expect(t2.awards.some((a) => a.category === 'snowman')).toBe(false);
    });

    it('1 player gross +5, 1 player gross +4 → 0 snowman (not all team)', () => {
      const userAGross = new Array(18).fill(4);
      userAGross[4] = 9; // par+5
      const userBGross = new Array(18).fill(4);
      userBGross[4] = 8; // par+4 — does NOT qualify
      const userCGross = new Array(18).fill(4);
      const userDGross = new Array(18).fill(4);

      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          playerGN('user-a', userAGross),
          playerGN('user-b', userBGross),
          playerGN('user-c', userCGross),
          playerGN('user-d', userDGross),
        ],
      });

      const result = calculateSideTournament(input);
      const awards = result.teamStandings.flatMap((s) => s.awards);
      expect(awards.some((a) => a.category === 'snowman')).toBe(false);
    });

    it('multiple snowman holes (5 and 7) → -4p total', () => {
      // Both team-1 players ≥ par+5 on holes 5 AND 7
      const userAGross = new Array(18).fill(4);
      userAGross[4] = 9;
      userAGross[6] = 9;
      const userBGross = new Array(18).fill(4);
      userBGross[4] = 9;
      userBGross[6] = 10;
      const userCGross = new Array(18).fill(4);
      const userDGross = new Array(18).fill(4);

      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          playerGN('user-a', userAGross),
          playerGN('user-b', userBGross),
          playerGN('user-c', userCGross),
          playerGN('user-d', userDGross),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;

      const snowmen = t1.awards.filter((a) => a.category === 'snowman');
      expect(snowmen).toHaveLength(2);
      expect(snowmen.reduce((sum, a) => sum + a.points, 0)).toBe(-4);
      expect(snowmen[0]?.holeNumber).toBe(5);
      expect(snowmen[1]?.holeNumber).toBe(7);
    });

    it('1-player team gets snowman when the one player gross ≥ par+5', () => {
      const userAGross = new Array(18).fill(4);
      userAGross[11] = 9; // par+5 on hole 12

      const input = baseInput({
        teams: [{ teamId: 1, userIds: ['user-a'] }],
        coursePars: par4Course(),
        nettoBestBallPerHole: [
          { teamId: 1, perHoleNetto: holes(new Array(18).fill(4)) },
        ],
        playerScoresPerHole: [playerGN('user-a', userAGross)],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;

      const snowmen = t1.awards.filter((a) => a.category === 'snowman');
      expect(snowmen).toHaveLength(1);
      expect(snowmen[0]?.points).toBe(-2);
      expect(snowmen[0]?.holeNumber).toBe(12);
      expect(snowmen[0]?.score).toBe(5);
    });

    it('4-player team, all 4 gross ≥ par+5 on same hole → -2p (no scaling)', () => {
      // Snowman is per-hole penalty regardless of team size
      const userAGross = new Array(18).fill(4);
      userAGross[2] = 9;
      const userBGross = new Array(18).fill(4);
      userBGross[2] = 10;
      const userCGross = new Array(18).fill(4);
      userCGross[2] = 11;
      const userDGross = new Array(18).fill(4);
      userDGross[2] = 9;

      const input = baseInput({
        teams: [{ teamId: 1, userIds: ['user-a', 'user-b', 'user-c', 'user-d'] }],
        coursePars: par4Course(),
        nettoBestBallPerHole: [
          { teamId: 1, perHoleNetto: holes(new Array(18).fill(4)) },
        ],
        playerScoresPerHole: [
          playerGN('user-a', userAGross),
          playerGN('user-b', userBGross),
          playerGN('user-c', userCGross),
          playerGN('user-d', userDGross),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;

      const snowmen = t1.awards.filter((a) => a.category === 'snowman');
      expect(snowmen).toHaveLength(1);
      expect(snowmen[0]?.points).toBe(-2);
      expect(snowmen[0]?.score).toBe(7); // worst over-par = user-c's 11 on par-4
    });

    it('honors disabledCategories: ["snowman"]', () => {
      const userAGross = new Array(18).fill(4);
      userAGross[4] = 9;
      const userBGross = new Array(18).fill(4);
      userBGross[4] = 10;
      const userCGross = new Array(18).fill(4);
      const userDGross = new Array(18).fill(4);

      const input = baseInput({
        config: {
          enabled: true,
          ldCount: 0,
          ctpCount: 0,
          disabledCategories: ['snowman'],
        },
        coursePars: par4Course(),
        playerScoresPerHole: [
          playerGN('user-a', userAGross),
          playerGN('user-b', userBGross),
          playerGN('user-c', userCGross),
          playerGN('user-d', userDGross),
        ],
      });

      const result = calculateSideTournament(input);
      const awards = result.teamStandings.flatMap((s) => s.awards);
      expect(awards.some((a) => a.category === 'snowman')).toBe(false);
    });
  });

  describe('team-size integration', () => {
    // Course: par 72 with mixed par-3/4/5 holes — exercises king_par3 / king_par5.
    // par-3 indices: 2, 7, 11, 15.  par-5 indices: 1, 5, 12, 17.
    const mixedCourse: number[] = [4, 5, 3, 4, 4, 5, 4, 3, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5];

    const playerGN = (
      userId: string,
      perHoleGross: Array<number | null>,
      perHoleNetto?: Array<number | null>,
    ): SideTournamentInput['playerScoresPerHole'][number] => ({
      userId,
      perHoleGross,
      perHoleNetto: perHoleNetto ?? perHoleGross,
    });

    it('integration: 1v1v1 game (N=1 per team) — team-aggregate gates skip, individual + achievements still fire', () => {
      // Three solo teams. Realistic scores chosen to fire as many categories
      // as possible while exercising N=1 gates.
      //
      // user-a (team 1) — strong: birdies on h1, h2, h3 (turkey), h12, h13.
      //                  Snowman on h7 (gross 9 = par+5 on par-4).
      //                  Eleven-hole bogey-free streak (h8-h18).
      // user-b (team 2) — medium: no birdies, two 5-hole par-or-better solid
      //                  streaks (h5-h9 and h10-h14).
      // user-c (team 3) — weakest: bogeys everywhere, no awards.
      const userA = [3, 4, 2, 4, 4, 5, 9, 3, 4, 4, 4, 2, 4, 4, 4, 3, 4, 5];
      const userB = [4, 6, 4, 5, 4, 5, 4, 3, 4, 4, 4, 3, 5, 4, 5, 3, 4, 6];
      const userC = [5, 6, 4, 5, 5, 6, 5, 4, 5, 5, 5, 4, 6, 5, 5, 4, 5, 6];

      const input: SideTournamentInput = {
        config: { enabled: true, ldCount: 1, ctpCount: 1, disabledCategories: [] },
        teams: [
          { teamId: 1, userIds: ['user-a'] },
          { teamId: 2, userIds: ['user-b'] },
          { teamId: 3, userIds: ['user-c'] },
        ],
        coursePars: mixedCourse,
        courseStrokeIndices: Array.from({ length: 18 }, (_, i) => i + 1),
        playerScoresPerHole: [
          playerGN('user-a', userA),
          playerGN('user-b', userB),
          playerGN('user-c', userC),
        ],
        nettoBestBallPerHole: [
          { teamId: 1, perHoleNetto: userA },
          { teamId: 2, perHoleNetto: userB },
          { teamId: 3, perHoleNetto: userC },
        ],
        sideWinners: [
          { category: 'longest_drive', position: 1, winnerUserId: 'user-c' },
          { category: 'closest_to_pin', position: 1, winnerUserId: 'user-b' },
        ],
      };

      const result = calculateSideTournament(input);
      const allAwards = result.teamStandings.flatMap((s) => s.awards);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;
      const t3 = result.teamStandings.find((t) => t.teamId === 3)!;

      // --- Team-aggregate categories that gate on N>=2: ZERO awards across all teams ---
      expect(allAwards.find((a) => a.category === 'most_birdies_team')).toBeUndefined();
      expect(allAwards.find((a) => a.category === 'most_eagles_team')).toBeUndefined();
      expect(allAwards.find((a) => a.category === 'most_pars_team')).toBeUndefined();
      expect(allAwards.find((a) => a.category === 'best_brutto_18_team')).toBeUndefined();
      expect(allAwards.find((a) => a.category === 'best_brutto_f9_team')).toBeUndefined();
      expect(allAwards.find((a) => a.category === 'best_brutto_b9_team')).toBeUndefined();
      expect(allAwards.find((a) => a.category === 'king_par3_team')).toBeUndefined();
      expect(allAwards.find((a) => a.category === 'king_par5_team')).toBeUndefined();

      // --- Individual-best categories STILL fire (user-a wins all) ---
      expect(t1.awards.find((a) => a.category === 'most_birdies_individual')?.points).toBe(1);
      expect(t1.awards.find((a) => a.category === 'most_pars_individual')?.points).toBe(1);
      expect(t1.awards.find((a) => a.category === 'best_brutto_18_individual')?.points).toBe(2);
      expect(t1.awards.find((a) => a.category === 'best_brutto_f9_individual')?.points).toBe(1);
      expect(t1.awards.find((a) => a.category === 'best_brutto_b9_individual')?.points).toBe(1);
      expect(t1.awards.find((a) => a.category === 'king_par3_individual')?.points).toBe(2);
      expect(t1.awards.find((a) => a.category === 'king_par5_individual')?.points).toBe(2);

      // most_eagles_individual: nobody scores netto<=par-2 anywhere → no award fires
      expect(allAwards.find((a) => a.category === 'most_eagles_individual')).toBeUndefined();

      // --- Turkey/Solid per-player TIER fires ---
      // user-a: birdies h1-h3 → exactly one turkey, 4p
      const t1Turkeys = t1.awards.filter((a) => a.category === 'turkey');
      expect(t1Turkeys).toHaveLength(1);
      expect(t1Turkeys[0]?.points).toBe(4);
      expect(t1Turkeys[0]?.winnerUserId).toBe('user-a');
      expect(t1Turkeys[0]?.coordBonus).toBeUndefined();

      // user-a: solid streaks across the bogey-free h8-h18 stretch (3 non-
      // overlapping 5-windows: h1-h5, h8-h12, h13-h17). user-b: solid streaks
      // from his two-long-streak h5-h14. Both teams get per-player solids,
      // none flagged as coordBonus.
      const t1Solids = t1.awards.filter((a) => a.category === 'solid');
      const t2Solids = t2.awards.filter((a) => a.category === 'solid');
      expect(t1Solids.length).toBeGreaterThan(0);
      expect(t2Solids.length).toBeGreaterThan(0);
      expect(t1Solids.every((a) => a.coordBonus === undefined)).toBe(true);
      expect(t2Solids.every((a) => a.coordBonus === undefined)).toBe(true);
      expect(t1Solids[0]?.winnerUserId).toBe('user-a');
      expect(t2Solids[0]?.winnerUserId).toBe('user-b');

      // --- Turkey/Solid lag-koord-bonus is NEVER awarded for N=1 teams ---
      expect(allAwards.find((a) => a.category === 'turkey' && a.coordBonus === true)).toBeUndefined();
      expect(allAwards.find((a) => a.category === 'solid' && a.coordBonus === true)).toBeUndefined();

      // --- Snowman CAN fire for a solo team (user-a's +5 on h7) ---
      const t1Snowmen = t1.awards.filter((a) => a.category === 'snowman');
      expect(t1Snowmen).toHaveLength(1);
      expect(t1Snowmen[0]?.points).toBe(-2);
      expect(t1Snowmen[0]?.holeNumber).toBe(7);
      expect(t1Snowmen[0]?.score).toBe(5); // gross 9 on par-4 = +5

      // --- The six original base categories all work normally ---
      // best_netto_18: user-a wins outright (sum 72 vs 77 vs 90)
      expect(t1.awards.find((a) => a.category === 'best_netto_18')?.points).toBe(10);
      expect(t2.awards.find((a) => a.category === 'best_netto_18')).toBeUndefined();
      expect(t3.awards.find((a) => a.category === 'best_netto_18')).toBeUndefined();

      // best_netto_front9 / back9: user-a wins both (38 vs 39 vs 45 and 34 vs 38 vs 45)
      expect(t1.awards.find((a) => a.category === 'best_netto_front9')?.points).toBe(5);
      expect(t1.awards.find((a) => a.category === 'best_netto_back9')?.points).toBe(5);

      // hole_win: at least some alone-wins fire (team 1 wins many alone)
      const t1HoleWins = t1.awards.filter((a) => a.category === 'hole_win');
      expect(t1HoleWins.length).toBeGreaterThan(0);
      // team 2 wins h7 alone (user-a snowmans there)
      const t2HoleWins = t2.awards.filter((a) => a.category === 'hole_win');
      expect(t2HoleWins.find((a) => a.holeNumber === 7)).toBeDefined();

      // LD goes to user-c (team 3), CTP to user-b (team 2)
      expect(t3.awards.find((a) => a.category === 'longest_drive')?.points).toBe(2);
      expect(t2.awards.find((a) => a.category === 'closest_to_pin')?.points).toBe(2);

      // Achievement attribution: longest_bogey_free_streak goes to user-a
      // (11-hole run h8-h18 beats user-b's 10-hole run h5-h14)
      const bogeyFree = t1.awards.find((a) => a.category === 'longest_bogey_free_streak');
      expect(bogeyFree?.streakLength).toBe(11);
      expect(bogeyFree?.points).toBe(4);

      // lowest_single_hole_brutto: user-a's 2 (par-3 holes) beats everyone
      expect(t1.awards.find((a) => a.category === 'lowest_single_hole_brutto')?.points).toBe(2);
    });

    it('integration: 4v4 game (N=4 per team) — team-aggregates sum across 4 players, koord-bonuses scale with team size', () => {
      // Flat par-4 course keeps brutto arithmetic transparent.
      const par4: number[] = new Array(18).fill(4);

      // Team 1 (u1..u4) — engineered to fire ALL the team-size-aware paths:
      //  - h1-h3: all 4 birdie    → turkey coord-bonus fires (4p × 4 = 16p)
      //  - h4-h6: only 3 birdie   → no turkey coord (u4 holds out, pars instead)
      //  - h7-h11: all 4 par      → 5-window for solid coord-bonus
      //  - h12: all 4 gross 9     → snowman fires (every member ≥par+5)
      //  - h13: only 3 are +5     → snowman does NOT fire (u4 only +4 with gross 8)
      //  - h14-h18: all 4 par     → another 5-window for solid coord-bonus
      const u1: number[] = [3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 9, 9, 4, 4, 4, 4, 4];
      const u2: number[] = [3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 9, 9, 4, 4, 4, 4, 4];
      const u3: number[] = [3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 9, 9, 4, 4, 4, 4, 4];
      const u4: number[] = [3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 9, 8, 4, 4, 4, 4, 4];

      // Team 2 (u5..u8) — uniform bogeys (score 5 on par-4 every hole). Lose
      // every team-aggregate category cleanly so team 1 awards are unambiguous.
      const flatBogey: number[] = new Array(18).fill(5);

      const input: SideTournamentInput = {
        config: { enabled: true, ldCount: 0, ctpCount: 0, disabledCategories: [] },
        teams: [
          { teamId: 1, userIds: ['u1', 'u2', 'u3', 'u4'] },
          { teamId: 2, userIds: ['u5', 'u6', 'u7', 'u8'] },
        ],
        coursePars: par4,
        courseStrokeIndices: Array.from({ length: 18 }, (_, i) => i + 1),
        playerScoresPerHole: [
          playerGN('u1', u1),
          playerGN('u2', u2),
          playerGN('u3', u3),
          playerGN('u4', u4),
          playerGN('u5', flatBogey),
          playerGN('u6', flatBogey),
          playerGN('u7', flatBogey),
          playerGN('u8', flatBogey),
        ],
        // Best-ball netto already computed by caller (here using brutto). Team
        // 1's best-ball-netto must reflect lowest score per hole among the 4.
        nettoBestBallPerHole: [
          { teamId: 1, perHoleNetto: [3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 9, 8, 4, 4, 4, 4, 4] },
          { teamId: 2, perHoleNetto: flatBogey },
        ],
        sideWinners: [],
      };

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;

      // --- Team-aggregate over 4 players correctly counts/sums across all 4 ---
      // most_birdies_team: team 1 has 6+6+6+3 = 21 birdies, team 2 has 0.
      expect(t1.awards.find((a) => a.category === 'most_birdies_team')?.points).toBe(2);
      expect(t2.awards.find((a) => a.category === 'most_birdies_team')).toBeUndefined();

      // most_pars_team: team 1 has every member par-or-better on 16 holes
      // (everything except h12 and h13). Team 2 has 0 pars-or-better. Team 1 wins.
      expect(t1.awards.find((a) => a.category === 'most_pars_team')?.points).toBe(2);
      expect(t2.awards.find((a) => a.category === 'most_pars_team')).toBeUndefined();

      // most_eagles_team: nobody scores netto<=par-2 on a par-4 course. No award.
      expect(t1.awards.find((a) => a.category === 'most_eagles_team')).toBeUndefined();
      expect(t2.awards.find((a) => a.category === 'most_eagles_team')).toBeUndefined();

      // --- Best brutto best-ball correctly picks the LOWEST among 4 brutto values per hole ---
      // Team 1 best-ball brutto sum (min-of-4 per hole): 3×6 + 4×5 + 9 + 8 + 4×5
      //   = 18 + 20 + 9 + 8 + 20 = 75 (decisively < team 2's 5×18 = 90).
      expect(t1.awards.find((a) => a.category === 'best_brutto_18_team')?.points).toBe(4);
      expect(t2.awards.find((a) => a.category === 'best_brutto_18_team')).toBeUndefined();

      // F9 best-ball: team 1 = 3×6 + 4×3 = 30 < team 2 = 45.
      expect(t1.awards.find((a) => a.category === 'best_brutto_f9_team')?.points).toBe(2);
      // B9 best-ball: team 1 = 4 + 4 + 9 + 8 + 4×5 = 45 < team 2 = 45 → tie.
      // Both teams get awarded on a tie (per existing tie semantics).
      expect(t1.awards.find((a) => a.category === 'best_brutto_b9_team')?.points).toBe(2);
      expect(t2.awards.find((a) => a.category === 'best_brutto_b9_team')?.points).toBe(2);

      // --- Snowman requires ALL 4 players to be +5 over par on same hole (NOT just 3 of 4) ---
      const t1Snowmen = t1.awards.filter((a) => a.category === 'snowman');
      expect(t1Snowmen).toHaveLength(1);
      expect(t1Snowmen[0]?.holeNumber).toBe(12);
      expect(t1Snowmen[0]?.score).toBe(5); // gross 9 on par-4 = +5
      expect(t1Snowmen[0]?.points).toBe(-2);
      // h13: u4 only +4 → 3 of 4 doesn't trigger snowman
      expect(t1Snowmen.some((a) => a.holeNumber === 13)).toBe(false);

      // --- Turkey lag-koord-bonus = 4p × 4 = 16p when all 4 birdie same 3 holes ---
      const t1TurkeyCoords = t1.awards.filter(
        (a) => a.category === 'turkey' && a.coordBonus === true,
      );
      expect(t1TurkeyCoords).toHaveLength(1); // only h1-h3 qualifies
      expect(t1TurkeyCoords[0]?.points).toBe(16); // 4p × 4 members
      expect(t1TurkeyCoords[0]?.streakStartHole).toBe(1);
      expect(t1TurkeyCoords[0]?.streakEndHole).toBe(3);

      // --- Turkey lag-koord-bonus = 0 when only 3 of 4 birdie same holes ---
      // h4-h6 had only u1/u2/u3 birdie. No coord-bonus on that window.
      expect(t1TurkeyCoords.some((a) => a.streakStartHole === 4)).toBe(false);
      // u1/u2/u3 still each get a per-player turkey for h4-h6 → 3 extras (4p each)
      const t1TurkeysPerPlayer = t1.awards.filter(
        (a) => a.category === 'turkey' && a.coordBonus !== true,
      );
      // h1-h3 across 4 players (4) + h4-h6 across u1/u2/u3 (3) = 7 personal turkeys
      expect(t1TurkeysPerPlayer).toHaveLength(7);
      // Each personal turkey carries a winnerUserId; verify all 7 have one set
      expect(t1TurkeysPerPlayer.every((a) => typeof a.winnerUserId === 'string')).toBe(true);

      // --- Solid koord-bonus = 2p × 4 = 8p when all 4 par-or-better on same 5 holes ---
      // Coord par-or-better flag: TTTTTTTTTTT FF TTTTT (h1-h11 then h12/h13 break,
      // then h14-h18). Non-overlapping 5-windows: h1-h5, h6-h10, h14-h18 → 3 bonuses.
      const t1SolidCoords = t1.awards.filter(
        (a) => a.category === 'solid' && a.coordBonus === true,
      );
      expect(t1SolidCoords).toHaveLength(3);
      // Every coord-bonus pays 2p × 4 = 8p
      expect(t1SolidCoords.every((a) => a.points === 8)).toBe(true);
      // Verify the streak windows we expect
      expect(t1SolidCoords.map((a) => a.streakStartHole)).toEqual([1, 6, 14]);
      expect(t1SolidCoords.map((a) => a.streakEndHole)).toEqual([5, 10, 18]);

      // --- Team 2 (4 players, all bogey) has none of the achievement awards ---
      expect(t2.awards.filter((a) => a.category === 'turkey')).toHaveLength(0);
      expect(t2.awards.filter((a) => a.category === 'solid')).toHaveLength(0);
      expect(t2.awards.filter((a) => a.category === 'snowman')).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    // Helper: build an 18-hole array filled with par 4
    const par4Course = (): number[] => new Array(18).fill(4);

    // Helper: per-player score with same gross/netto and explicit netto array
    const player = (
      userId: string,
      perHoleNetto: Array<number | null>,
    ): SideTournamentInput['playerScoresPerHole'][number] => ({
      userId,
      perHoleGross: perHoleNetto,
      perHoleNetto,
    });

    it('individual-best: same-team tie produces ONE team award (Set dedup)', () => {
      // Both user-a AND user-b are on team 1 and BOTH have 4 birdies (tied
      // for max). The implementation uses a `Set<TeamId>` to dedup so team 1
      // appears once in the winners list, not twice.
      // Team 2 (c, d) has only 1 birdie each → no contention.
      const userANetto = [3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
      const userBNetto = [3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
      const userCNetto = [3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
      const userDNetto = [3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];

      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });

      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;

      // Team 1 must appear EXACTLY ONCE in the individual-best winners list,
      // even though two of its players tied for the lead.
      const t1IndAwards = t1.awards.filter(
        (a) => a.category === 'most_birdies_individual',
      );
      expect(t1IndAwards).toHaveLength(1);
      expect(t1IndAwards[0]?.points).toBe(1);

      // Team 2 must not appear (its players have fewer birdies than the tied pair).
      expect(
        t2.awards.some((a) => a.category === 'most_birdies_individual'),
      ).toBe(false);
    });

    it('mixed-size game: team-aggregate skips N=1 team, individual-best runs across all', () => {
      // Three teams of mixed sizes:
      //   Team A (1 player): user-solo with 5 birdies — solo player
      //   Team B (2 players): user-b1 (2 birdies) + user-b2 (2 birdies) → team total 4
      //   Team C (2 players): user-c1 (3 birdies) + user-c2 (3 birdies) → team total 6
      // Expectations:
      //   - most_birdies_team: only B and C compete (A is skipped by the
      //     N<2 gate). C wins with 6 > 4.
      //   - most_birdies_individual: user-solo wins outright with 5 birdies,
      //     awarding team A — proving individual-best ignores team size.
      const userSoloNetto = [3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
      const userB1Netto = [3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
      const userB2Netto = [3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
      const userC1Netto = [3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
      const userC2Netto = [3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];

      const input: SideTournamentInput = {
        config: { enabled: true, ldCount: 0, ctpCount: 0, disabledCategories: [] },
        teams: [
          { teamId: 1, userIds: ['user-solo'] },
          { teamId: 2, userIds: ['user-b1', 'user-b2'] },
          { teamId: 3, userIds: ['user-c1', 'user-c2'] },
        ],
        coursePars: par4Course(),
        courseStrokeIndices: Array.from({ length: 18 }, (_, i) => i + 1),
        playerScoresPerHole: [
          player('user-solo', userSoloNetto),
          player('user-b1', userB1Netto),
          player('user-b2', userB2Netto),
          player('user-c1', userC1Netto),
          player('user-c2', userC2Netto),
        ],
        nettoBestBallPerHole: [
          { teamId: 1, perHoleNetto: userSoloNetto },
          { teamId: 2, perHoleNetto: holes(new Array(18).fill(4)) },
          { teamId: 3, perHoleNetto: holes(new Array(18).fill(4)) },
        ],
        sideWinners: [],
      };

      const result = calculateSideTournament(input);
      const tA = result.teamStandings.find((t) => t.teamId === 1)!;
      const tB = result.teamStandings.find((t) => t.teamId === 2)!;
      const tC = result.teamStandings.find((t) => t.teamId === 3)!;

      // Team-aggregate: Team A (N=1) skipped; Team C wins outright (6 > 4)
      expect(
        tA.awards.some((a) => a.category === 'most_birdies_team'),
      ).toBe(false);
      expect(
        tB.awards.some((a) => a.category === 'most_birdies_team'),
      ).toBe(false);
      expect(
        tC.awards.find((a) => a.category === 'most_birdies_team')?.points,
      ).toBe(2);

      // Individual-best: user-solo wins (5 birdies) → team A gets the award,
      // proving the N<2 gate does NOT apply to individual categories.
      expect(
        tA.awards.find((a) => a.category === 'most_birdies_individual')?.points,
      ).toBe(1);
      expect(
        tB.awards.some((a) => a.category === 'most_birdies_individual'),
      ).toBe(false);
      expect(
        tC.awards.some((a) => a.category === 'most_birdies_individual'),
      ).toBe(false);
    });
  });

  describe('most_albatrosses (v1.19.0)', () => {
    // par-5-holes on indices 0, 5, 10, 15 — albatross requires netto ≤ par-3,
    // so on a par-5 hole that means netto ≤ 2 (eagle territory is netto ≤ 3).
    const par5MixCourse = (): number[] => {
      const pars = new Array(18).fill(4);
      pars[0] = 5; pars[5] = 5; pars[10] = 5; pars[15] = 5;
      return pars;
    };

    const player = (
      userId: string,
      perHoleNetto: Array<number | null>,
    ): SideTournamentInput['playerScoresPerHole'][number] => ({
      userId,
      perHoleGross: perHoleNetto,
      perHoleNetto,
    });

    it('team-aggregate: team with most albatrosses gets 4p', () => {
      // Team 1: user-a has 2 albatrosses (par5 with netto 2), user-b has 0
      // Team 2: user-c has 1, user-d has 0
      const userANetto = new Array(18).fill(4);
      userANetto[0] = 2; userANetto[5] = 2; // 2 albatrosses
      const userBNetto = new Array(18).fill(4);
      const userCNetto = new Array(18).fill(4);
      userCNetto[10] = 2; // 1 albatross
      const userDNetto = new Array(18).fill(4);

      const input = baseInput({
        coursePars: par5MixCourse(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });
      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;
      expect(t1.awards.find((a) => a.category === 'most_albatrosses_team')?.points).toBe(4);
      expect(t2.awards.some((a) => a.category === 'most_albatrosses_team')).toBe(false);
    });

    it('individual-best: player with most albatrosses → team award', () => {
      // user-c has 2 albatrosses, others have 0 or 1
      const userANetto = new Array(18).fill(4);
      userANetto[0] = 2; // 1 albatross
      const userBNetto = new Array(18).fill(4);
      const userCNetto = new Array(18).fill(4);
      userCNetto[5] = 2; userCNetto[10] = 2; // 2 albatrosses
      const userDNetto = new Array(18).fill(4);

      const input = baseInput({
        coursePars: par5MixCourse(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });
      const result = calculateSideTournament(input);
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      // user-c is on team 2
      expect(t2.awards.find((a) => a.category === 'most_albatrosses_individual')?.points).toBe(2);
      expect(t2.awards.find((a) => a.category === 'most_albatrosses_individual')?.winnerUserId).toBe('user-c');
      expect(t1.awards.some((a) => a.category === 'most_albatrosses_individual')).toBe(false);
    });
  });

  describe('most_hole_in_ones (v1.19.0)', () => {
    const par4Course = (): number[] => new Array(18).fill(4);

    const playerGN = (
      userId: string,
      perHoleGross: Array<number | null>,
      perHoleNetto?: Array<number | null>,
    ): SideTournamentInput['playerScoresPerHole'][number] => ({
      userId,
      perHoleGross,
      perHoleNetto: perHoleNetto ?? perHoleGross,
    });

    it('team-aggregate: team with most aces gets 4p', () => {
      // Team 1: user-a has 1 ace (gross 1 on hole 5), user-b has 0 → team total 1
      // Team 2: 0
      const userAGross = new Array(18).fill(4);
      userAGross[4] = 1; // ace
      const userBGross = new Array(18).fill(4);
      const userCGross = new Array(18).fill(4);
      const userDGross = new Array(18).fill(4);
      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          playerGN('user-a', userAGross),
          playerGN('user-b', userBGross),
          playerGN('user-c', userCGross),
          playerGN('user-d', userDGross),
        ],
      });
      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;
      expect(t1.awards.find((a) => a.category === 'most_hole_in_ones_team')?.points).toBe(4);
      expect(t2.awards.some((a) => a.category === 'most_hole_in_ones_team')).toBe(false);
    });

    it('individual-best: player with the only ace → 2p to their team', () => {
      const userAGross = new Array(18).fill(4);
      const userBGross = new Array(18).fill(4);
      const userCGross = new Array(18).fill(4);
      userCGross[7] = 1; // ace
      const userDGross = new Array(18).fill(4);
      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          playerGN('user-a', userAGross),
          playerGN('user-b', userBGross),
          playerGN('user-c', userCGross),
          playerGN('user-d', userDGross),
        ],
      });
      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;
      // user-c on team 2
      expect(t2.awards.find((a) => a.category === 'most_hole_in_ones_individual')?.points).toBe(2);
      expect(t2.awards.find((a) => a.category === 'most_hole_in_ones_individual')?.winnerUserId).toBe('user-c');
      expect(t1.awards.some((a) => a.category === 'most_hole_in_ones_individual')).toBe(false);
    });

    it('no aces in round → no award', () => {
      const userAGross = new Array(18).fill(4);
      const userBGross = new Array(18).fill(4);
      const userCGross = new Array(18).fill(4);
      const userDGross = new Array(18).fill(4);
      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          playerGN('user-a', userAGross),
          playerGN('user-b', userBGross),
          playerGN('user-c', userCGross),
          playerGN('user-d', userDGross),
        ],
      });
      const result = calculateSideTournament(input);
      const awards = result.teamStandings.flatMap((s) => s.awards);
      expect(awards.some((a) => a.category === 'most_hole_in_ones_team')).toBe(false);
      expect(awards.some((a) => a.category === 'most_hole_in_ones_individual')).toBe(false);
    });
  });

  describe('king_par4 (v1.19.0)', () => {
    // par-4 holes on indices 0,1,2,3,4 — five par-4s. Indices 5-17 are par-3 / par-5.
    const mixedParCourse = (): number[] => {
      const pars: number[] = [4, 4, 4, 4, 4, 3, 5, 3, 5, 3, 5, 3, 5, 3, 5, 3, 5, 3];
      return pars;
    };

    const player = (
      userId: string,
      perHoleGross: Array<number | null>,
    ): SideTournamentInput['playerScoresPerHole'][number] => ({
      userId,
      perHoleGross,
      perHoleNetto: perHoleGross,
    });

    it('team-aggregate: best-ball brutto across par-4 holes wins 4p', () => {
      // par-4 indices 0..4. team 1 best-ball par-4 sum: min(3,4)=3 ×5 = 15
      // team 2 best-ball par-4 sum: min(4,4)=4 ×5 = 20
      const userAGross = new Array(18).fill(4);
      for (let i = 0; i < 5; i++) userAGross[i] = 3;
      const userBGross = new Array(18).fill(4);
      const userCGross = new Array(18).fill(4);
      const userDGross = new Array(18).fill(4);
      const input = baseInput({
        coursePars: mixedParCourse(),
        playerScoresPerHole: [
          player('user-a', userAGross),
          player('user-b', userBGross),
          player('user-c', userCGross),
          player('user-d', userDGross),
        ],
      });
      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;
      expect(t1.awards.find((a) => a.category === 'king_par4_team')?.points).toBe(4);
      expect(t2.awards.some((a) => a.category === 'king_par4_team')).toBe(false);
    });

    it('individual-best: lowest par-4 brutto sum wins 2p', () => {
      const userAGross = new Array(18).fill(4);
      const userBGross = new Array(18).fill(4);
      const userCGross = new Array(18).fill(4);
      for (let i = 0; i < 5; i++) userCGross[i] = 3; // par-4 sum 15 — best
      const userDGross = new Array(18).fill(4);
      const input = baseInput({
        coursePars: mixedParCourse(),
        playerScoresPerHole: [
          player('user-a', userAGross),
          player('user-b', userBGross),
          player('user-c', userCGross),
          player('user-d', userDGross),
        ],
      });
      const result = calculateSideTournament(input);
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      expect(t2.awards.find((a) => a.category === 'king_par4_individual')?.points).toBe(2);
      expect(t2.awards.find((a) => a.category === 'king_par4_individual')?.winnerUserId).toBe('user-c');
      expect(t1.awards.some((a) => a.category === 'king_par4_individual')).toBe(false);
    });

    it('course with no par-4 holes → no award', () => {
      const noPar4Course: number[] = [
        3, 3, 3, 3, 5, 5, 5, 5, 3, 3, 3, 5, 5, 3, 3, 5, 5, 3,
      ];
      const userAGross = new Array(18).fill(4);
      const userBGross = new Array(18).fill(4);
      const userCGross = new Array(18).fill(5);
      const userDGross = new Array(18).fill(5);
      const input = baseInput({
        coursePars: noPar4Course,
        playerScoresPerHole: [
          player('user-a', userAGross),
          player('user-b', userBGross),
          player('user-c', userCGross),
          player('user-d', userDGross),
        ],
      });
      const result = calculateSideTournament(input);
      const awards = result.teamStandings.flatMap((s) => s.awards);
      expect(awards.some((a) => a.category === 'king_par4_team')).toBe(false);
      expect(awards.some((a) => a.category === 'king_par4_individual')).toBe(false);
    });
  });

  describe('clean_front_9 / clean_back_9 (v1.19.0)', () => {
    const par4Course = (): number[] => new Array(18).fill(4);

    const player = (
      userId: string,
      perHoleNetto: Array<number | null>,
    ): SideTournamentInput['playerScoresPerHole'][number] => ({
      userId,
      perHoleGross: perHoleNetto,
      perHoleNetto,
    });

    it('player with all F9 netto ≤ par earns 4p', () => {
      const userANetto = new Array(18).fill(4); // F9 all par → clean
      const userBNetto = new Array(18).fill(5); // F9 all bogey → no
      const userCNetto = new Array(18).fill(5);
      const userDNetto = new Array(18).fill(5);
      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });
      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;
      expect(t1.awards.find((a) => a.category === 'clean_front_9')?.points).toBe(4);
      expect(t2.awards.some((a) => a.category === 'clean_front_9')).toBe(false);
    });

    it('one bogey on F9 disqualifies → no award', () => {
      const userANetto = new Array(18).fill(4);
      userANetto[3] = 5; // bogey on hole 4 (F9)
      const userBNetto = new Array(18).fill(5);
      const userCNetto = new Array(18).fill(5);
      const userDNetto = new Array(18).fill(5);
      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });
      const result = calculateSideTournament(input);
      const awards = result.teamStandings.flatMap((s) => s.awards);
      expect(awards.some((a) => a.category === 'clean_front_9')).toBe(false);
    });
  });

  describe('no_double_plus_round (v1.19.0)', () => {
    const par4Course = (): number[] => new Array(18).fill(4);

    const player = (
      userId: string,
      perHoleNetto: Array<number | null>,
    ): SideTournamentInput['playerScoresPerHole'][number] => ({
      userId,
      perHoleGross: perHoleNetto,
      perHoleNetto,
    });

    it('player with no hole > par+1 earns 4p', () => {
      // All holes ≤ par+1 (mix of par and bogey)
      const userANetto = new Array(18).fill(5); // all bogey — still OK
      userANetto[0] = 4; userANetto[1] = 4; // a couple of pars
      const userBNetto = new Array(18).fill(6); // all double → fails
      const userCNetto = new Array(18).fill(6);
      const userDNetto = new Array(18).fill(6);
      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });
      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      expect(t1.awards.find((a) => a.category === 'no_double_plus_round')?.points).toBe(4);
    });

    it('one double-bogey disqualifies → no award', () => {
      const userANetto = new Array(18).fill(5);
      userANetto[10] = 6; // one double
      const userBNetto = new Array(18).fill(6);
      const userCNetto = new Array(18).fill(6);
      const userDNetto = new Array(18).fill(6);
      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });
      const result = calculateSideTournament(input);
      const awards = result.teamStandings.flatMap((s) => s.awards);
      expect(awards.some((a) => a.category === 'no_double_plus_round')).toBe(false);
    });
  });

  describe('hardest_hole_winner (v1.19.0)', () => {
    const par4Course = (): number[] => new Array(18).fill(4);

    const playerGN = (
      userId: string,
      perHoleGross: Array<number | null>,
      perHoleNetto?: Array<number | null>,
    ): SideTournamentInput['playerScoresPerHole'][number] => ({
      userId,
      perHoleGross,
      perHoleNetto: perHoleNetto ?? perHoleGross,
    });

    it('lowest brutto on SI=1 hole earns 2p', () => {
      // SI=1 on hole 5 (idx 4). user-a has lowest gross there (3).
      const si = Array.from({ length: 18 }, (_, i) => i + 1);
      // Move SI=1 to hole index 4
      si[0] = 5; si[4] = 1;
      const userAGross = new Array(18).fill(5);
      userAGross[4] = 3; // lowest on SI=1
      const userBGross = new Array(18).fill(5);
      userBGross[4] = 4;
      const userCGross = new Array(18).fill(5);
      userCGross[4] = 5;
      const userDGross = new Array(18).fill(5);
      userDGross[4] = 5;
      const input = baseInput({
        coursePars: par4Course(),
        courseStrokeIndices: si,
        playerScoresPerHole: [
          playerGN('user-a', userAGross),
          playerGN('user-b', userBGross),
          playerGN('user-c', userCGross),
          playerGN('user-d', userDGross),
        ],
      });
      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const award = t1.awards.find((a) => a.category === 'hardest_hole_winner');
      expect(award?.points).toBe(2);
      expect(award?.holeNumber).toBe(5);
      expect(award?.score).toBe(3);
    });

    it('tie on hardest hole → both teams get 2p deduped', () => {
      const si = Array.from({ length: 18 }, (_, i) => i + 1);
      si[0] = 2; si[7] = 1; // SI=1 on hole 8
      const userAGross = new Array(18).fill(5);
      userAGross[7] = 3;
      const userBGross = new Array(18).fill(5);
      const userCGross = new Array(18).fill(5);
      userCGross[7] = 3; // tied with user-a
      const userDGross = new Array(18).fill(5);
      const input = baseInput({
        coursePars: par4Course(),
        courseStrokeIndices: si,
        playerScoresPerHole: [
          playerGN('user-a', userAGross),
          playerGN('user-b', userBGross),
          playerGN('user-c', userCGross),
          playerGN('user-d', userDGross),
        ],
      });
      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;
      expect(t1.awards.find((a) => a.category === 'hardest_hole_winner')?.points).toBe(2);
      expect(t2.awards.find((a) => a.category === 'hardest_hole_winner')?.points).toBe(2);
    });
  });

  describe('comeback_kid (v1.19.0)', () => {
    const par4Course = (): number[] => new Array(18).fill(4);

    const player = (
      userId: string,
      perHoleNetto: Array<number | null>,
    ): SideTournamentInput['playerScoresPerHole'][number] => ({
      userId,
      perHoleGross: perHoleNetto,
      perHoleNetto,
    });

    it('player with biggest B9-F9 improvement earns 2p', () => {
      // user-a: F9 sum = 9×5=45, B9 = 9×3=27 → delta -18 (best)
      // others: flat 4
      const userANetto = [5, 5, 5, 5, 5, 5, 5, 5, 5, 3, 3, 3, 3, 3, 3, 3, 3, 3];
      const userBNetto = new Array(18).fill(4);
      const userCNetto = new Array(18).fill(4);
      const userDNetto = new Array(18).fill(4);
      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });
      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const award = t1.awards.find((a) => a.category === 'comeback_kid');
      expect(award?.points).toBe(2);
      expect(award?.delta).toBe(-18);
      expect(award?.winnerUserId).toBe('user-a');
    });

    it('no player improves on B9 → no award', () => {
      const userANetto = new Array(18).fill(4); // delta 0
      const userBNetto = new Array(18).fill(4);
      const userCNetto = new Array(18).fill(4);
      const userDNetto = new Array(18).fill(4);
      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });
      const result = calculateSideTournament(input);
      const awards = result.teamStandings.flatMap((s) => s.awards);
      expect(awards.some((a) => a.category === 'comeback_kid')).toBe(false);
    });
  });

  describe('all_par_groups_birdie (v1.19.0)', () => {
    // par-3 indices: 2, 6
    // par-5 indices: 5, 17
    // rest par-4
    const mixedParCourse = (): number[] => {
      const pars = new Array(18).fill(4);
      pars[2] = 3; pars[6] = 3;
      pars[5] = 5; pars[17] = 5;
      return pars;
    };

    const player = (
      userId: string,
      perHoleNetto: Array<number | null>,
    ): SideTournamentInput['playerScoresPerHole'][number] => ({
      userId,
      perHoleGross: perHoleNetto,
      perHoleNetto,
    });

    it('player with birdie on par-3, par-4, AND par-5 earns 2p', () => {
      const userANetto = new Array(18).fill(4);
      userANetto[2] = 2; // par-3 birdie (par 3)
      userANetto[0] = 3; // par-4 birdie (par 4)
      userANetto[5] = 4; // par-5 birdie (par 5)
      const userBNetto = new Array(18).fill(4);
      const userCNetto = new Array(18).fill(4);
      const userDNetto = new Array(18).fill(4);
      const input = baseInput({
        coursePars: mixedParCourse(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });
      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      expect(t1.awards.find((a) => a.category === 'all_par_groups_birdie')?.points).toBe(2);
    });

    it('missing par-5 birdie disqualifies → no award', () => {
      // Fill above-par to start (5 = par on par-5, 5 = bogey on par-4,
      // 5 = double on par-3); then dial in a par-3 and par-4 birdie ONLY.
      const userANetto = new Array(18).fill(5);
      userANetto[2] = 2; // par-3 birdie
      userANetto[0] = 3; // par-4 birdie
      // par-5 holes (5, 17) stay at 5 — par on par-5, NOT a birdie
      const userBNetto = new Array(18).fill(5);
      const userCNetto = new Array(18).fill(5);
      const userDNetto = new Array(18).fill(5);
      const input = baseInput({
        coursePars: mixedParCourse(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });
      const result = calculateSideTournament(input);
      const awards = result.teamStandings.flatMap((s) => s.awards);
      expect(awards.some((a) => a.category === 'all_par_groups_birdie')).toBe(false);
    });
  });

  describe('even_par_round (v1.19.0)', () => {
    const par4Course = (): number[] => new Array(18).fill(4);

    const player = (
      userId: string,
      perHoleNetto: Array<number | null>,
    ): SideTournamentInput['playerScoresPerHole'][number] => ({
      userId,
      perHoleGross: perHoleNetto,
      perHoleNetto,
    });

    it('player with netto-sum equal to par-sum earns 2p', () => {
      // par-sum = 72. user-a: 17×4=68 + one 4 → 72 (all par)
      const userANetto = new Array(18).fill(4);
      const userBNetto = new Array(18).fill(5); // over par
      const userCNetto = new Array(18).fill(5);
      const userDNetto = new Array(18).fill(5);
      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });
      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      expect(t1.awards.find((a) => a.category === 'even_par_round')?.points).toBe(2);
    });

    it('every player over or under par → no award', () => {
      const userANetto = new Array(18).fill(5); // 90, par-sum 72
      const userBNetto = new Array(18).fill(5);
      const userCNetto = new Array(18).fill(3); // 54
      const userDNetto = new Array(18).fill(5);
      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });
      const result = calculateSideTournament(input);
      const awards = result.teamStandings.flatMap((s) => s.awards);
      expect(awards.some((a) => a.category === 'even_par_round')).toBe(false);
    });
  });

  describe('back_to_back_birdies (v1.19.0)', () => {
    const par4Course = (): number[] => new Array(18).fill(4);

    const player = (
      userId: string,
      perHoleNetto: Array<number | null>,
    ): SideTournamentInput['playerScoresPerHole'][number] => ({
      userId,
      perHoleGross: perHoleNetto,
      perHoleNetto,
    });

    it('player with 2 separate 2-streaks earns 2p × 2 = 4p stacked', () => {
      // birdie on holes 1-2, par, par, birdie on holes 5-6
      const userANetto = [3, 3, 4, 4, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
      const userBNetto = new Array(18).fill(4);
      const userCNetto = new Array(18).fill(4);
      const userDNetto = new Array(18).fill(4);
      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });
      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const awards = t1.awards.filter((a) => a.category === 'back_to_back_birdies');
      expect(awards).toHaveLength(2);
      expect(awards.reduce((s, a) => s + a.points, 0)).toBe(4);
      expect(awards[0]?.streakStartHole).toBe(1);
      expect(awards[0]?.streakEndHole).toBe(2);
      expect(awards[1]?.streakStartHole).toBe(5);
      expect(awards[1]?.streakEndHole).toBe(6);
    });
  });

  describe('team_all_birdied_bonus (v1.19.0)', () => {
    const par4Course = (): number[] => new Array(18).fill(4);

    const player = (
      userId: string,
      perHoleNetto: Array<number | null>,
    ): SideTournamentInput['playerScoresPerHole'][number] => ({
      userId,
      perHoleGross: perHoleNetto,
      perHoleNetto,
    });

    it('all team-1 members have ≥1 birdie → 4p × 2 = 8p coord-bonus', () => {
      const userANetto = new Array(18).fill(4);
      userANetto[0] = 3; // birdie
      const userBNetto = new Array(18).fill(4);
      userBNetto[5] = 3; // birdie
      const userCNetto = new Array(18).fill(4);
      const userDNetto = new Array(18).fill(4);
      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });
      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const t2 = result.teamStandings.find((t) => t.teamId === 2)!;
      const award = t1.awards.find((a) => a.category === 'team_all_birdied_bonus');
      expect(award?.points).toBe(8);
      expect(award?.coordBonus).toBe(true);
      expect(t2.awards.some((a) => a.category === 'team_all_birdied_bonus')).toBe(false);
    });

    it('one team member missing a birdie → no bonus', () => {
      const userANetto = new Array(18).fill(4);
      userANetto[0] = 3;
      const userBNetto = new Array(18).fill(4); // no birdie
      const userCNetto = new Array(18).fill(4);
      const userDNetto = new Array(18).fill(4);
      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });
      const result = calculateSideTournament(input);
      const awards = result.teamStandings.flatMap((s) => s.awards);
      expect(awards.some((a) => a.category === 'team_all_birdied_bonus')).toBe(false);
    });
  });

  describe('team_no_bogey_hole_coord (v1.19.0)', () => {
    const par4Course = (): number[] => new Array(18).fill(4);

    const player = (
      userId: string,
      perHoleNetto: Array<number | null>,
    ): SideTournamentInput['playerScoresPerHole'][number] => ({
      userId,
      perHoleGross: perHoleNetto,
      perHoleNetto,
    });

    it('2 holes where both team-1 members netto ≤ par → 2 awards', () => {
      // Team 1: user-a netto par on hole 1 + 5, user-b netto par on hole 1 + 5
      // Other holes: at least one member is bogey
      const userANetto = new Array(18).fill(5);
      userANetto[0] = 4; userANetto[4] = 4; // par
      const userBNetto = new Array(18).fill(5);
      userBNetto[0] = 4; userBNetto[4] = 4;
      // team 2 — all bogey
      const userCNetto = new Array(18).fill(5);
      const userDNetto = new Array(18).fill(5);
      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });
      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const awards = t1.awards.filter((a) => a.category === 'team_no_bogey_hole_coord');
      expect(awards).toHaveLength(2);
      expect(awards.reduce((s, a) => s + a.points, 0)).toBe(8); // 2p × 2 members × 2 holes
      expect(awards[0]?.coordBonus).toBe(true);
      expect(awards[0]?.holeNumber).toBe(1);
      expect(awards[1]?.holeNumber).toBe(5);
    });

    it('one player bogey on the hole → no coord award', () => {
      const userANetto = new Array(18).fill(5);
      userANetto[0] = 4; // par
      const userBNetto = new Array(18).fill(5); // bogey on hole 1
      const userCNetto = new Array(18).fill(5);
      const userDNetto = new Array(18).fill(5);
      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });
      const result = calculateSideTournament(input);
      const awards = result.teamStandings.flatMap((s) => s.awards);
      expect(awards.some((a) => a.category === 'team_no_bogey_hole_coord')).toBe(false);
    });
  });

  describe('worst_single_hole_brutto (v1.19.0)', () => {
    const par4Course = (): number[] => new Array(18).fill(4);

    const playerGN = (
      userId: string,
      perHoleGross: Array<number | null>,
      perHoleNetto?: Array<number | null>,
    ): SideTournamentInput['playerScoresPerHole'][number] => ({
      userId,
      perHoleGross,
      perHoleNetto: perHoleNetto ?? perHoleGross,
    });

    it('player with highest brutto on any single hole earns -1p', () => {
      const userAGross = new Array(18).fill(4);
      userAGross[7] = 10; // worst on the round
      const userBGross = new Array(18).fill(4);
      userBGross[3] = 6;
      const userCGross = new Array(18).fill(4);
      const userDGross = new Array(18).fill(4);
      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          playerGN('user-a', userAGross),
          playerGN('user-b', userBGross),
          playerGN('user-c', userCGross),
          playerGN('user-d', userDGross),
        ],
      });
      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      const award = t1.awards.find((a) => a.category === 'worst_single_hole_brutto');
      expect(award?.points).toBe(-1);
      expect(award?.holeNumber).toBe(8);
      expect(award?.score).toBe(10);
    });
  });

  describe('most_double_bogeys_individual (v1.19.0)', () => {
    const par4Course = (): number[] => new Array(18).fill(4);

    const player = (
      userId: string,
      perHoleNetto: Array<number | null>,
    ): SideTournamentInput['playerScoresPerHole'][number] => ({
      userId,
      perHoleGross: perHoleNetto,
      perHoleNetto,
    });

    it('player with most double-bogeys (netto ≥ par+2) earns -1p', () => {
      // user-a has 4 doubles (netto 6 on par 4), others 0-1
      const userANetto = new Array(18).fill(4);
      userANetto[0] = 6; userANetto[1] = 6; userANetto[2] = 6; userANetto[3] = 6;
      const userBNetto = new Array(18).fill(4);
      const userCNetto = new Array(18).fill(4);
      userCNetto[0] = 6; // 1 double
      const userDNetto = new Array(18).fill(4);
      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });
      const result = calculateSideTournament(input);
      const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
      expect(t1.awards.find((a) => a.category === 'most_double_bogeys_individual')?.points).toBe(-1);
    });

    it('no doubles in the round → no award', () => {
      const userANetto = new Array(18).fill(4);
      const userBNetto = new Array(18).fill(4);
      const userCNetto = new Array(18).fill(4);
      const userDNetto = new Array(18).fill(4);
      const input = baseInput({
        coursePars: par4Course(),
        playerScoresPerHole: [
          player('user-a', userANetto),
          player('user-b', userBNetto),
          player('user-c', userCNetto),
          player('user-d', userDNetto),
        ],
      });
      const result = calculateSideTournament(input);
      const awards = result.teamStandings.flatMap((s) => s.awards);
      expect(awards.some((a) => a.category === 'most_double_bogeys_individual')).toBe(false);
    });
  });
});
