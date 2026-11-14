import { describe, it, expect } from 'vitest';
import type { CourseHoleRow } from '@/lib/supabase/queryFragments';
import {
  tallySeasonBirdies,
  type BirdieGame,
  type BirdiePlayer,
  type BirdieScore,
} from './seasonBirdies';

/**
 * Type A (#2259): the birdie count behind «Flest birdies». Team-ball games and derived
 * games do not count, nor do guests and withdrawn players; par follows the tee gender.
 */

const hole = (n: number, mens: number, ladies: number): CourseHoleRow => ({
  hole_number: n,
  par_mens: mens,
  par_ladies: ladies,
  par_juniors: mens,
  stroke_index: n,
});
// Hole 1: par 4 (mens) / 5 (ladies). Hole 2: par 3 for both.
const courseHolesByCourse = new Map([
  ['bane', new Map([[1, hole(1, 4, 5)], [2, hole(2, 3, 3)]])],
]);

const game = (id: string, over: Partial<BirdieGame> = {}): BirdieGame => ({
  id,
  gameMode: 'stableford',
  courseId: 'bane',
  derived: false,
  ...over,
});
const player = (gameId: string, userId: string, over: Partial<BirdiePlayer> = {}): BirdiePlayer => ({
  gameId,
  userId,
  teeGender: null,
  withdrawn: false,
  isGuest: false,
  ...over,
});
const score = (gameId: string, userId: string, holeNumber: number, strokes: number | null): BirdieScore => ({
  game_id: gameId,
  user_id: userId,
  hole_number: holeNumber,
  strokes,
});

const tally = (input: Partial<Parameters<typeof tallySeasonBirdies>[0]>) =>
  Object.fromEntries(
    tallySeasonBirdies({ games: [], players: [], scores: [], courseHolesByCourse, ...input }),
  );

describe('tallySeasonBirdies', () => {
  it('is empty without games', () => {
    expect(tally({})).toEqual({});
  });

  it('counts a birdie in stableford', () => {
    expect(
      tally({
        games: [game('g1')],
        players: [player('g1', 'anne')],
        scores: [score('g1', 'anne', 1, 3), score('g1', 'anne', 2, 3)],
      }),
    ).toEqual({ anne: 1 });
  });

  it('does not count a par, a bogey or an unplayed hole; an eagle is not a birdie', () => {
    expect(
      tally({
        games: [game('g1')],
        players: [player('g1', 'anne')],
        scores: [score('g1', 'anne', 1, 4), score('g1', 'anne', 2, null)],
      }),
    ).toEqual({});
    expect(
      tally({
        games: [game('g1')],
        players: [player('g1', 'anne')],
        scores: [score('g1', 'anne', 1, 2)],
      }),
    ).toEqual({});
  });

  it('does not count a team ball: scramble and foursomes', () => {
    expect(
      tally({
        games: [game('g1', { gameMode: 'texas_scramble' }), game('g2', { gameMode: 'foursomes_matchplay' })],
        players: [player('g1', 'anne'), player('g2', 'anne')],
        scores: [score('g1', 'anne', 1, 3), score('g2', 'anne', 1, 3)],
      }),
    ).toEqual({});
  });

  it('does not count a derived game', () => {
    expect(
      tally({
        games: [game('g1', { derived: true })],
        players: [player('g1', 'anne')],
        scores: [score('g1', 'anne', 1, 3)],
      }),
    ).toEqual({});
  });

  it('leaves out guests and withdrawn players', () => {
    expect(
      tally({
        games: [game('g1')],
        players: [
          player('g1', 'gjest', { isGuest: true }),
          player('g1', 'trukket', { withdrawn: true }),
          player('g1', 'anne'),
        ],
        scores: [score('g1', 'gjest', 1, 3), score('g1', 'trukket', 1, 3), score('g1', 'anne', 1, 3)],
      }),
    ).toEqual({ anne: 1 });
  });

  it('picks par by tee gender: 4 on a par 5 is a birdie from the ladies tee only', () => {
    expect(
      tally({
        games: [game('g1')],
        players: [player('g1', 'kari', { teeGender: 'ladies' }), player('g1', 'ola')],
        scores: [score('g1', 'kari', 1, 4), score('g1', 'ola', 1, 4)],
      }),
    ).toEqual({ kari: 1 });
  });

  it('sums over rounds, and a missing course gives none', () => {
    expect(
      tally({
        games: [game('g1'), game('g2'), game('g3', { courseId: null })],
        players: [player('g1', 'anne'), player('g2', 'anne'), player('g3', 'anne')],
        scores: [
          score('g1', 'anne', 1, 3),
          score('g2', 'anne', 1, 3),
          score('g2', 'anne', 2, 2),
          score('g3', 'anne', 1, 1),
        ],
      }),
    ).toEqual({ anne: 3 });
  });
});
