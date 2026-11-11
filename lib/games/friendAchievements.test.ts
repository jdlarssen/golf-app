import { describe, it, expect } from 'vitest';
import { achievementRecipients, friendWorthyMoments } from './friendAchievements';
import type { HoleScore } from '@/lib/stats/achievements';

/** One hole: `strokes` on a hole of `par`. */
const hole = (holeNumber: number, strokes: number | null, par: number): HoleScore => ({
  holeNumber,
  strokes,
  par,
});

describe('friendWorthyMoments', () => {
  it('par 4 in 2 is an eagle', () => {
    expect(friendWorthyMoments([hole(4, 2, 4)], 'stableford')).toEqual([
      { kind: 'eagle', holeNumber: 4 },
    ]);
  });

  it('par 5 in 2 is an albatross', () => {
    expect(friendWorthyMoments([hole(9, 2, 5)], 'solo_strokeplay')).toEqual([
      { kind: 'albatross', holeNumber: 9 },
    ]);
  });

  it('par 3 in 1 is a hole-in-one, never an eagle as well', () => {
    expect(friendWorthyMoments([hole(7, 1, 3)], 'stableford')).toEqual([
      { kind: 'hole_in_one', holeNumber: 7 },
    ]);
  });

  it('par 4 in 1 is a hole-in-one', () => {
    expect(friendWorthyMoments([hole(12, 1, 4)], 'stableford')).toEqual([
      { kind: 'hole_in_one', holeNumber: 12 },
    ]);
  });

  it('a birdie, a par, an unplayed hole and a hole without par give nothing', () => {
    expect(
      friendWorthyMoments(
        [hole(1, 3, 4), hole(2, 4, 4), hole(3, null, 4), hole(4, 2, 0)],
        'stableford',
      ),
    ).toEqual([]);
  });

  it('gives every moment of the round, sorted by hole', () => {
    expect(
      friendWorthyMoments([hole(12, 3, 5), hole(3, 1, 3), hole(8, 4, 4)], 'best_ball'),
    ).toEqual([
      { kind: 'hole_in_one', holeNumber: 3 },
      { kind: 'eagle', holeNumber: 12 },
    ]);
  });

  it('skips every hole in a scramble: the stroke is the team’s', () => {
    expect(friendWorthyMoments([hole(4, 2, 4), hole(7, 1, 3)], 'texas_scramble')).toEqual([]);
  });

  it('skips every hole in foursomes: one ball per team', () => {
    expect(friendWorthyMoments([hole(4, 2, 4), hole(7, 1, 3)], 'foursomes_matchplay')).toEqual([]);
  });

  it('counts holes 1–6 in patsome (own ball) and skips 7–18 (foursomes)', () => {
    expect(
      friendWorthyMoments([hole(6, 2, 4), hole(7, 2, 4), hole(18, 1, 3)], 'patsome'),
    ).toEqual([{ kind: 'eagle', holeNumber: 6 }]);
  });

  it('counts fourball: every player plays their own ball', () => {
    expect(friendWorthyMoments([hole(4, 2, 4)], 'fourball_matchplay')).toEqual([
      { kind: 'eagle', holeNumber: 4 },
    ]);
  });
});

describe('achievementRecipients', () => {
  it('a regular game tells the player’s friends', () => {
    expect(
      achievementRecipients({
        playerId: 'ola',
        leagueMemberIds: null,
        friendIds: ['kari', 'per'],
        gamePlayerIds: ['ola'],
      }),
    ).toEqual(['kari', 'per']);
  });

  it('never tells a friend who played the same game', () => {
    expect(
      achievementRecipients({
        playerId: 'ola',
        leagueMemberIds: null,
        friendIds: ['kari', 'per'],
        gamePlayerIds: ['ola', 'per'],
      }),
    ).toEqual(['kari']);
  });

  it('a league game tells the other league players, not friends outside the league', () => {
    expect(
      achievementRecipients({
        playerId: 'ola',
        leagueMemberIds: ['ola', 'liv', 'per', 'kari'],
        friendIds: ['nils'],
        gamePlayerIds: ['ola', 'liv'],
      }),
    ).toEqual(['per', 'kari']);
  });

  it('never tells the player themselves, and each person once', () => {
    expect(
      achievementRecipients({
        playerId: 'ola',
        leagueMemberIds: null,
        friendIds: ['ola', 'kari', 'kari'],
        gamePlayerIds: [],
      }),
    ).toEqual(['kari']);
  });

  it('nobody to tell gives an empty list', () => {
    expect(
      achievementRecipients({
        playerId: 'ola',
        leagueMemberIds: ['ola'],
        friendIds: [],
        gamePlayerIds: ['ola'],
      }),
    ).toEqual([]);
  });
});
