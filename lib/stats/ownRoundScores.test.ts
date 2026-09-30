import { describe, it, expect } from 'vitest';
import type { GameMode } from '@/lib/scoring/modes/types';
import { isTeamBallRound, ownRoundScores } from './ownRoundScores';

const rows = [
  { hole_number: 1, strokes: 4 },
  { hole_number: 2, strokes: 5 },
];

describe('ownRoundScores', () => {
  it.each<GameMode>([
    'texas_scramble',
    'ambrose',
    'florida_scramble',
    'foursomes_matchplay',
    'greensome_matchplay',
    'chapman_matchplay',
    'gruesome_matchplay',
    'patsome',
  ])('gives no own strokes when the team shares one ball (%s)', (mode) => {
    expect(isTeamBallRound(mode)).toBe(true);
    expect(ownRoundScores(mode, rows)).toEqual([]);
  });

  it.each<GameMode>([
    'solo_strokeplay',
    'stableford',
    'best_ball',
    'shamble',
    'singles_matchplay',
    'fourball_matchplay',
    'wolf',
  ])('keeps the rows when every player plays their own ball (%s)', (mode) => {
    expect(isTeamBallRound(mode)).toBe(false);
    expect(ownRoundScores(mode, rows)).toBe(rows);
  });
});
