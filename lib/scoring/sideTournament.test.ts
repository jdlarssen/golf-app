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

// Standard 2-lags-input som test-cases utvider
function baseInput(overrides: Partial<SideTournamentInput> = {}): SideTournamentInput {
  return {
    config: { enabled: true, ldCount: 0, ctpCount: 0, disabledCategories: [] },
    teams: [
      { teamId: 1, userIds: ['user-a', 'user-b'] },
      { teamId: 2, userIds: ['user-c', 'user-d'] },
    ],
    coursePars: new Array(18).fill(4),
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
});
