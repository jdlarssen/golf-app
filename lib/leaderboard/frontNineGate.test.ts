import { describe, it, expect } from 'vitest';
import { isFrontNineOpen } from './frontNineGate';

type Score = { user_id: string; hole_number: number; strokes: number | null };
type Player = { user_id: string; team_number: number };

const team1: Player[] = [
  { user_id: 'p1', team_number: 1 },
  { user_id: 'p2', team_number: 1 },
];
const team2: Player[] = [
  { user_id: 'p3', team_number: 2 },
  { user_id: 'p4', team_number: 2 },
];
const allPlayers: Player[] = [...team1, ...team2];

function scoresFor(userId: string, holes: number[]): Score[] {
  return holes.map((h) => ({ user_id: userId, hole_number: h, strokes: 4 }));
}

const FRONT_9 = [1, 2, 3, 4, 5, 6, 7, 8, 9];

describe('isFrontNineOpen', () => {
  it('is false when no scores exist', () => {
    expect(isFrontNineOpen({ players: allPlayers, scores: [] })).toBe(false);
  });

  it('is false when only some front-9 holes are filled by one team', () => {
    const scores = [
      ...scoresFor('p1', [1, 2, 3, 4, 5]),
      ...scoresFor('p2', [1, 2, 3, 4, 5]),
    ];
    expect(isFrontNineOpen({ players: allPlayers, scores })).toBe(false);
  });

  it('is true when both players on team 1 have scores on all 9 front holes', () => {
    const scores = [
      ...scoresFor('p1', FRONT_9),
      ...scoresFor('p2', FRONT_9),
    ];
    expect(isFrontNineOpen({ players: allPlayers, scores })).toBe(true);
  });

  it('is false if only one player on the team has all 9 front holes', () => {
    const scores = [
      ...scoresFor('p1', FRONT_9),
      ...scoresFor('p2', [1, 2, 3]),
    ];
    expect(isFrontNineOpen({ players: allPlayers, scores })).toBe(false);
  });

  it('ignores back-9 scores when checking', () => {
    const scores = [
      ...scoresFor('p1', [1, 2, 3, 10, 11, 12]),
      ...scoresFor('p2', [10, 11, 12]),
    ];
    expect(isFrontNineOpen({ players: allPlayers, scores })).toBe(false);
  });

  it('treats null strokes as "not entered"', () => {
    const scores: Score[] = [
      ...FRONT_9.map((h) => ({ user_id: 'p1', hole_number: h, strokes: 4 })),
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((h) => ({
        user_id: 'p2',
        hole_number: h,
        strokes: 4,
      })),
      { user_id: 'p2', hole_number: 9, strokes: null },
    ];
    expect(isFrontNineOpen({ players: allPlayers, scores })).toBe(false);
  });

  // --- Edge cases ---

  it('opens when team 2 is the first to complete the front 9', () => {
    const scores = [
      ...scoresFor('p1', [1, 2, 3]),
      ...scoresFor('p2', [1, 2]),
      ...scoresFor('p3', FRONT_9),
      ...scoresFor('p4', FRONT_9),
    ];
    expect(isFrontNineOpen({ players: allPlayers, scores })).toBe(true);
  });

  it('ignores scores whose user_id is not in the players list', () => {
    const scores = [
      ...scoresFor('ghost', FRONT_9),
      ...scoresFor('p1', [1, 2, 3]),
      ...scoresFor('p2', [1, 2, 3]),
    ];
    expect(isFrontNineOpen({ players: allPlayers, scores })).toBe(false);
  });

  it('tolerates duplicate score rows for the same (user, hole)', () => {
    const scores = [
      ...scoresFor('p1', FRONT_9),
      ...scoresFor('p1', FRONT_9), // duplicate set
      ...scoresFor('p2', FRONT_9),
    ];
    expect(isFrontNineOpen({ players: allPlayers, scores })).toBe(true);
  });

  it('ignores invalid hole numbers (0, 19) outside 1–9', () => {
    const scores: Score[] = [
      ...scoresFor('p1', [0, 19]),
      ...scoresFor('p2', [0, 19]),
    ];
    expect(isFrontNineOpen({ players: allPlayers, scores })).toBe(false);
  });

  it('treats a single-player team as complete when that player has all 9 front holes', () => {
    const soloTeam: Player[] = [{ user_id: 'solo', team_number: 3 }];
    const scores = scoresFor('solo', FRONT_9);
    expect(isFrontNineOpen({ players: soloTeam, scores })).toBe(true);
  });
});
