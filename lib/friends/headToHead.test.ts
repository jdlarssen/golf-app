import { describe, it, expect } from 'vitest';
import type { GameMode } from '@/lib/scoring/modes/types';
import type { ResultSummary } from '@/lib/scoring/resultSummary';
import { headToHeadRecord, roundBadge, type RoundBadge, type RoundSide } from './headToHead';

/**
 * Type A (#2381): «Mot hverandre» on the app's friend page. A round counts
 * between you and a friend only when you played against each other: never on
 * the same team, never in a league flight (no place, #2850), and only when
 * both of you have a stored result of the same shape.
 */

const place = (rank: number, isTeam = false): ResultSummary => ({
  kind: 'placement',
  rank,
  fieldSize: 4,
  isTeam,
});
const match = (outcome: 'win' | 'loss' | 'tie'): ResultSummary => ({
  kind: 'matchplay',
  outcome,
  margin: outcome === 'tie' ? null : '3&2',
});
const skins = (rank: number, count = 2): ResultSummary => ({ kind: 'skins', skins: count, rank, fieldSize: 4 });

const side = (summary: ResultSummary | null, teamNumber: number | null = null): RoundSide => ({
  teamNumber,
  summary,
});

function badge(
  gameMode: GameMode,
  me: RoundSide,
  them: RoundSide,
  { teamSize = 1, leagueFlight = false }: { teamSize?: number; leagueFlight?: boolean } = {},
) {
  return roundBadge({ gameMode, teamSize, leagueFlight, me, them });
}

describe('roundBadge', () => {
  it('puts the lower placement ahead and an equal one level', () => {
    expect(badge('solo_strokeplay', side(place(1)), side(place(3)))).toBe('you_ahead');
    expect(badge('solo_strokeplay', side(place(4)), side(place(2)))).toBe('them_ahead');
    expect(badge('solo_strokeplay', side(place(2)), side(place(2)))).toBe('tied');
  });

  it('reads skins by rank', () => {
    expect(badge('skins', side(skins(1, 5)), side(skins(2, 1)))).toBe('you_ahead');
    expect(badge('skins', side(skins(3, 0)), side(skins(1, 4)))).toBe('them_ahead');
    expect(badge('skins', side(skins(2, 1)), side(skins(2, 1)))).toBe('tied');
  });

  it('reads matchplay by outcome, singles on sides 1 and 2', () => {
    expect(badge('singles_matchplay', side(match('win'), 1), side(match('loss'), 2))).toBe('you_ahead');
    expect(badge('singles_matchplay', side(match('loss'), 2), side(match('win'), 1))).toBe('them_ahead');
    expect(badge('singles_matchplay', side(match('tie'), 1), side(match('tie'), 2))).toBe('tied');
  });

  it('gives no badge for a matchplay pair that cannot both be true', () => {
    expect(badge('singles_matchplay', side(match('win'), 1), side(match('win'), 2))).toBeNull();
    expect(badge('singles_matchplay', side(match('tie'), 1), side(match('loss'), 2))).toBeNull();
  });

  it('marks fourball and foursomes partners on the same side as one team', () => {
    expect(
      badge('fourball_matchplay', side(match('win'), 1), side(match('win'), 1), { teamSize: 2 }),
    ).toBe('same_team');
    expect(
      badge('foursomes_matchplay', side(match('loss'), 2), side(match('loss'), 2), { teamSize: 2 }),
    ).toBe('same_team');
    expect(
      badge('fourball_matchplay', side(match('win'), 1), side(match('loss'), 2), { teamSize: 2 }),
    ).toBe('you_ahead');
  });

  it('marks a scramble team as one team and compares two teams by their rank', () => {
    expect(
      badge('texas_scramble', side(place(1, true), 3), side(place(1, true), 3), { teamSize: 4 }),
    ).toBe('same_team');
    expect(
      badge('texas_scramble', side(place(2, true), 1), side(place(1, true), 2), { teamSize: 4 }),
    ).toBe('them_ahead');
  });

  it('splits stableford on team size: solo with 1, a pair with 2', () => {
    // team_number is a slot nobody reads in solo stableford, so equal numbers say nothing.
    expect(badge('stableford', side(place(1), 1), side(place(3), 1), { teamSize: 1 })).toBe('you_ahead');
    expect(
      badge('stableford', side(place(1, true), 1), side(place(1, true), 1), { teamSize: 2 }),
    ).toBe('same_team');
    expect(
      badge('stableford', side(place(1, true), 1), side(place(2, true), 2), { teamSize: 2 }),
    ).toBe('you_ahead');
  });

  it('never calls Wolf or Round Robin rotation slots a team', () => {
    expect(badge('wolf', side(place(2), 1), side(place(1), 1))).toBe('them_ahead');
    expect(badge('round_robin', side(place(1), 2), side(place(1), 2))).toBe('tied');
  });

  it('does not take a missing team number for a shared team', () => {
    expect(
      badge('texas_scramble', side(place(1, true), null), side(place(2, true), null), { teamSize: 4 }),
    ).toBe('you_ahead');
  });

  it('gives a league flight no badge, since it has no place', () => {
    expect(badge('solo_strokeplay', side(place(1)), side(place(2)), { leagueFlight: true })).toBeNull();
    expect(badge('stableford', side(place(2)), side(place(2)), { leagueFlight: true })).toBeNull();
  });

  it('checks the team before the league flight', () => {
    expect(
      badge('best_ball', side(place(1, true), 1), side(place(1, true), 1), { teamSize: 2, leagueFlight: true }),
    ).toBe('same_team');
  });

  it('gives no badge without a result on both sides or with two shapes', () => {
    expect(badge('solo_strokeplay', side(null), side(place(1)))).toBeNull();
    expect(badge('solo_strokeplay', side(place(1)), side(null))).toBeNull();
    expect(badge('skins', side(skins(1)), side(place(2)))).toBeNull();
    expect(badge('singles_matchplay', side(match('win'), 1), side(place(2), 2))).toBeNull();
  });
});

describe('headToHeadRecord', () => {
  it('is empty without rounds', () => {
    expect(headToHeadRecord([])).toEqual({ played: 0, youAhead: 0, themAhead: 0, tied: 0 });
  });

  it('counts a tie as played without a point, and leaves out team rounds and unplaced ones', () => {
    const badges: (RoundBadge | null)[] = [
      'you_ahead',
      'you_ahead',
      'them_ahead',
      'tied',
      'same_team',
      null,
      'you_ahead',
    ];
    expect(headToHeadRecord(badges)).toEqual({ played: 5, youAhead: 3, themAhead: 1, tied: 1 });
  });

  it('is zero played when every round was on the same team', () => {
    expect(headToHeadRecord(['same_team', 'same_team'])).toEqual({
      played: 0,
      youAhead: 0,
      themAhead: 0,
      tied: 0,
    });
  });
});
