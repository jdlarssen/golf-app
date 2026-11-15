import { describe, it, expect } from 'vitest';
import type { CourseHoleRow } from '@/lib/supabase/queryFragments';
import { playedOnKey, tallyRareMoments, type MomentGame } from './rareMoments';
import type { BirdiePlayer, BirdieScore } from './seasonBirdies';

/**
 * Type A (#2259, PR 4): «Sjeldne slag». Hvert hull vurderes brutto mot spillerens
 * kjønns-par: 1 slag er hole-in-one (går foran), 3 under par er albatross, 2 under
 * er eagle. Spillene som teller er de samme som for birdie-tellingen, så scramble,
 * foursomes og avledede spill, gjester og trukne er ute.
 */

const hole = (n: number, mens: number, ladies: number): CourseHoleRow => ({
  hole_number: n,
  par_mens: mens,
  par_ladies: ladies,
  par_juniors: mens,
  stroke_index: n,
});
// Hull 1: par 3. Hull 2: par 4. Hull 3: par 5 (herre) / 4 (dame).
const courseHolesByCourse = new Map([
  ['bane', new Map([[1, hole(1, 3, 3)], [2, hole(2, 4, 4)], [3, hole(3, 5, 4)]])],
]);

const game = (id: string, over: Partial<MomentGame> = {}): MomentGame => ({
  id,
  gameMode: 'stableford',
  courseId: 'bane',
  derived: false,
  courseName: 'Bogstad',
  playedOn: '2026-06-12',
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

const tally = (input: Partial<Parameters<typeof tallyRareMoments>[0]>) =>
  tallyRareMoments({ games: [], players: [], scores: [], courseHolesByCourse, ...input });

const one = (scores: BirdieScore[], gamesOver: Partial<MomentGame> = {}, playerOver: Partial<BirdiePlayer> = {}) =>
  tally({ games: [game('g1', gamesOver)], players: [player('g1', 'anne', playerOver)], scores });

describe('tallyRareMoments', () => {
  it('is empty without games', () => {
    expect(tally({})).toEqual([]);
  });

  it('1 stroke on a par 3 is a hole-in-one', () => {
    expect(one([score('g1', 'anne', 1, 1)])).toEqual([
      { kind: 'hole_in_one', userId: 'anne', hole: 1, courseName: 'Bogstad', playedOn: '2026-06-12' },
    ]);
  });

  it('a hole-in-one on a par 4 or 5 is still a hole-in-one, not an albatross or an eagle', () => {
    const kinds = one([score('g1', 'anne', 2, 1), score('g1', 'anne', 3, 1)]).map((m) => m.kind);
    expect(kinds).toEqual(['hole_in_one', 'hole_in_one']);
  });

  it('2 on a par 5 is an albatross, 3 on a par 5 and 2 on a par 4 are eagles', () => {
    const kinds = one([score('g1', 'anne', 3, 2), score('g1', 'anne', 2, 2)]).map((m) => [m.hole, m.kind]);
    expect(kinds).toEqual([
      [3, 'albatross'],
      [2, 'eagle'],
    ]);
    expect(one([score('g1', 'anne', 3, 3)]).map((m) => m.kind)).toEqual(['eagle']);
  });

  it('a birdie, a par, a bogey and an unplayed hole are no rare shot', () => {
    expect(
      one([score('g1', 'anne', 1, 2), score('g1', 'anne', 2, 4), score('g1', 'anne', 3, 6), score('g1', 'anne', 3, null)]),
    ).toEqual([]);
  });

  it('picks par by tee gender: 3 on hole 3 is an eagle from the men’s tee (par 5) and a birdie from the ladies’ (par 4)', () => {
    expect(one([score('g1', 'anne', 3, 3)], {}, { teeGender: 'ladies' })).toEqual([]);
    expect(one([score('g1', 'anne', 3, 3)]).map((m) => m.kind)).toEqual(['eagle']);
  });

  it('does not count a team ball, a derived game, a guest or a withdrawn player', () => {
    const scores = [score('g1', 'anne', 1, 1)];
    expect(one(scores, { gameMode: 'texas_scramble' })).toEqual([]);
    expect(one(scores, { gameMode: 'foursomes_matchplay' })).toEqual([]);
    expect(one(scores, { derived: true })).toEqual([]);
    expect(one(scores, {}, { isGuest: true })).toEqual([]);
    expect(one(scores, {}, { withdrawn: true })).toEqual([]);
  });

  it('leaves out a hole with no par (a game without a course)', () => {
    expect(one([score('g1', 'anne', 1, 1)], { courseId: null })).toEqual([]);
  });

  it('leaves out a round with no date, since the card shows the day', () => {
    expect(one([score('g1', 'anne', 1, 1)], { playedOn: null })).toEqual([]);
  });

  it('gathers moments from several players and rounds', () => {
    const moments = tally({
      games: [game('g1'), game('g2', { courseName: 'Holtsmark', playedOn: '2026-09-03' })],
      players: [player('g1', 'anne'), player('g1', 'bjorn'), player('g2', 'anne')],
      scores: [score('g1', 'anne', 1, 1), score('g1', 'bjorn', 2, 2), score('g2', 'anne', 3, 3)],
    });
    expect(moments.map((m) => [m.userId, m.kind, m.courseName, m.playedOn])).toEqual([
      ['anne', 'hole_in_one', 'Bogstad', '2026-06-12'],
      ['bjorn', 'eagle', 'Bogstad', '2026-06-12'],
      ['anne', 'eagle', 'Holtsmark', '2026-09-03'],
    ]);
  });
});

describe('playedOnKey', () => {
  it('is the planned tee-off day in Oslo time, else the day the game ended', () => {
    expect(playedOnKey({ scheduled_tee_off_at: '2026-06-12T08:00:00Z', ended_at: '2026-06-13T10:00:00Z' })).toBe('2026-06-12');
    expect(playedOnKey({ scheduled_tee_off_at: null, ended_at: '2026-06-13T10:00:00Z' })).toBe('2026-06-13');
  });

  it('reads the day on the Oslo calendar, not UTC: 23:30 UTC on 30 June is 1 July in Oslo', () => {
    expect(playedOnKey({ scheduled_tee_off_at: '2026-06-30T23:30:00Z', ended_at: null })).toBe('2026-07-01');
  });

  it('is null for a round with no date', () => {
    expect(playedOnKey({ scheduled_tee_off_at: null, ended_at: null })).toBeNull();
  });
});
