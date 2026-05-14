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
    config: { enabled: true, ldCount: 0, ctpCount: 0 },
    teams: [
      { teamId: 1, userIds: ['user-a', 'user-b'] },
      { teamId: 2, userIds: ['user-c', 'user-d'] },
    ],
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
      config: { enabled: true, ldCount: 1, ctpCount: 0 },
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
      config: { enabled: true, ldCount: 2, ctpCount: 0 },
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
      config: { enabled: true, ldCount: 1, ctpCount: 0 },
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
      config: { enabled: true, ldCount: 0, ctpCount: 1 },
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
      config: { enabled: true, ldCount: 2, ctpCount: 2 },
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
    const input = baseInput({ config: { enabled: false, ldCount: 0, ctpCount: 0 } });
    const result = calculateSideTournament(input);
    for (const team of result.teamStandings) {
      expect(team.totalPoints).toBe(0);
      expect(team.awards).toHaveLength(0);
    }
  });

  it('handles 4-team game without crashing', () => {
    const input: SideTournamentInput = {
      config: { enabled: true, ldCount: 0, ctpCount: 0 },
      teams: [1, 2, 3, 4].map((id) => ({ teamId: id, userIds: [`u${id}`] })),
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
});
