import { describe, it, expect } from 'vitest';
import { calculateCourseHandicap, applyAllowance } from './courseHandicap';
import { allStrokeAllocations } from './strokeAllocation';
import { bestBallForHole, teamTotal, type PlayerHoleScore, type HoleTeamScore } from './modes/bestBall';
import { rankTeams } from './tiebreaker';

/**
 * Full scenario: 4 teams of 2 players, 18-hole round at a fictional course.
 * Course: par 72, slope 130, CR 71.0.
 * Allowance: 100%.
 */

const HOLES = [
  // [par, SI]
  [4, 7], [3, 15], [5, 3], [4, 11], [4, 1],
  [3, 17], [5, 5], [4, 13], [4, 9],
  [4, 6], [3, 14], [5, 2], [4, 8], [4, 16],
  [3, 18], [5, 4], [4, 10], [4, 12],
];

interface Player {
  id: string;
  hcpIndex: number;
}

interface Team {
  id: number;
  players: [Player, Player];
}

const teams: Team[] = [
  { id: 1, players: [{ id: 'p1a', hcpIndex: 10.0 }, { id: 'p1b', hcpIndex: 18.0 }] },
  { id: 2, players: [{ id: 'p2a', hcpIndex: 22.0 }, { id: 'p2b', hcpIndex: 6.0 }] },
  { id: 3, players: [{ id: 'p3a', hcpIndex: 14.0 }, { id: 'p3b', hcpIndex: 14.0 }] },
  { id: 4, players: [{ id: 'p4a', hcpIndex: 28.0 }, { id: 'p4b', hcpIndex: 2.0 }] },
];

// Realistic gross scores (one row per player, length 18). Deterministic.
const gross: Record<string, number[]> = {
  p1a: [5,3,6,4,5,3,6,4,4, 5,4,6,4,5,3,6,4,4],   // = 81
  p1b: [6,4,7,5,6,4,6,5,5, 6,4,7,5,5,4,6,5,5],   // = 95
  p2a: [6,4,7,5,6,4,7,5,5, 6,4,7,5,6,4,6,5,5],   // = 97
  p2b: [4,3,5,4,4,3,5,4,4, 4,3,5,4,4,3,5,4,4],   // = 72
  p3a: [5,3,6,4,5,3,6,4,4, 5,3,6,4,5,3,6,4,5],   // = 81
  p3b: [5,4,6,4,5,3,6,5,4, 5,4,6,5,5,3,6,4,5],   // = 85
  p4a: [7,5,8,6,7,5,8,6,5, 7,5,8,6,7,5,7,6,6],   // = 114
  p4b: [4,3,5,4,4,3,5,4,4, 4,3,5,4,4,3,5,4,4],   // = 72
};

describe('full game scoring integration', () => {
  it('computes correct leaderboard end-to-end', () => {
    // 1. Course handicap per player (100% allowance)
    const ch: Record<string, number> = {};
    for (const team of teams) {
      for (const p of team.players) {
        const raw = calculateCourseHandicap({
          hcpIndex: p.hcpIndex,
          slope: 130,
          courseRating: 71.0,
          par: 72,
        });
        ch[p.id] = applyAllowance(raw, 100);
      }
    }
    // Oracle (computed independently, #2226): round(HI × 130/113 − 1).
    expect(ch).toEqual({
      p1a: 11, p1b: 20, p2a: 24, p2b: 6, p3a: 15, p3b: 15, p4a: 31, p4b: 1,
    });

    // 2. Stroke allocations per player
    const alloc: Record<string, Record<number, number>> = {};
    for (const id of Object.keys(ch)) {
      alloc[id] = allStrokeAllocations(ch[id]);
    }

    // 3. Per team, per hole, best ball net
    const teamHoleScores: Record<number, HoleTeamScore[]> = {};
    for (const team of teams) {
      const holes: HoleTeamScore[] = [];
      for (let h = 1; h <= 18; h++) {
        const si = HOLES[h - 1][1];
        const players: PlayerHoleScore[] = team.players.map((p) => ({
          userId: p.id,
          gross: gross[p.id][h - 1],
          extraStrokes: alloc[p.id][si],
        }));
        const result = bestBallForHole(players);
        holes.push({ holeNumber: h, teamNet: result.teamNet });
      }
      teamHoleScores[team.id] = holes;
    }

    // 4. Team totals
    const totals: Record<number, number> = {};
    for (const team of teams) {
      const { total, missingHoles } = teamTotal(teamHoleScores[team.id]);
      expect(missingHoles).toEqual([]);
      totals[team.id] = total;
    }
    expect(totals).toEqual({ 1: 68, 2: 66, 3: 66, 4: 70 });

    // 5. Ranking
    const ranking = rankTeams(
      teams.map((t) => ({
        id: t.id,
        holes: teamHoleScores[t.id].map((h) => h.teamNet as number),
      })),
    );

    // Teams 2 and 3 tie on 66; the back nine settles it — team 2 has 33 there
    // against team 3's 34, so team 2 ranks first and nobody shares a rank.
    expect(
      ranking.map(({ id, total, rank, tiedWith }) => ({ id, total, rank, tiedWith })),
    ).toEqual([
      { id: 2, total: 66, rank: 1, tiedWith: [] },
      { id: 3, total: 66, rank: 2, tiedWith: [] },
      { id: 1, total: 68, rank: 3, tiedWith: [] },
      { id: 4, total: 70, rank: 4, tiedWith: [] },
    ]);
  });
});
