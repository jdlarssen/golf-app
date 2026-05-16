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
});
