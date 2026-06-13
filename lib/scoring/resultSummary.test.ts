import { describe, it, expect } from 'vitest';
import { computeResultSummaries } from './resultSummary';
import type { ModeResult } from './modes/types';

/**
 * Minimal ModeResult-byggere. `computeResultSummaries` leser kun et lite knippe
 * felt per kind (rank/fieldSize/userId/result.winner/formatted/totalSkins), så
 * vi konstruerer partial-literaler og caster — holder testene fokuserte på
 * mapper-logikken (Type A), ikke på å re-kjøre scoring-motoren.
 */
function asResult(r: unknown): ModeResult {
  return r as ModeResult;
}

describe('computeResultSummaries', () => {
  it('individuell strokeplay/stableford → placement, isTeam=false, fieldSize=antall spillere', () => {
    const result = asResult({
      kind: 'stableford',
      variant: 'solo',
      players: [
        { userId: 'a', rank: 1 },
        { userId: 'b', rank: 2 },
        { userId: 'c', rank: 2 },
      ],
      holes: [],
    });

    const map = computeResultSummaries(result);

    expect(map.get('a')).toEqual({
      kind: 'placement',
      rank: 1,
      fieldSize: 3,
      isTeam: false,
    });
    expect(map.get('b')).toEqual({
      kind: 'placement',
      rank: 2,
      fieldSize: 3,
      isTeam: false,
    });
    expect(map.get('c')?.kind).toBe('placement');
  });

  it('lag-strokeplay (best_ball) → placement, isTeam=true, fieldSize=antall lag, alle lagmedlemmer arver', () => {
    const result = asResult({
      kind: 'best_ball',
      teams: [
        { teamNumber: 1, playerIds: ['a', 'b'], rank: 1 },
        { teamNumber: 2, playerIds: ['c', 'd'], rank: 2 },
      ],
    });

    const map = computeResultSummaries(result);

    expect(map.get('a')).toEqual({
      kind: 'placement',
      rank: 1,
      fieldSize: 2,
      isTeam: true,
    });
    expect(map.get('b')).toEqual({
      kind: 'placement',
      rank: 1,
      fieldSize: 2,
      isTeam: true,
    });
    expect(map.get('d')).toEqual({
      kind: 'placement',
      rank: 2,
      fieldSize: 2,
      isTeam: true,
    });
  });

  it('texas_scramble bruker team.members[].userId', () => {
    const result = asResult({
      kind: 'texas_scramble',
      teams: [
        {
          teamNumber: 1,
          members: [{ userId: 'a' }, { userId: 'b' }],
          rank: 1,
        },
        {
          teamNumber: 2,
          members: [{ userId: 'c' }, { userId: 'd' }],
          rank: 2,
        },
      ],
    });

    const map = computeResultSummaries(result);
    expect(map.get('a')).toEqual({
      kind: 'placement',
      rank: 1,
      fieldSize: 2,
      isTeam: true,
    });
    expect(map.get('c')).toMatchObject({ rank: 2 });
  });

  it('shamble bruker team.members (string[])', () => {
    const result = asResult({
      kind: 'shamble',
      variant: 'shamble',
      count: 2,
      scoring: 'net',
      teamSize: 4,
      holes: [],
      teams: [
        { teamNumber: 1, members: ['a', 'b', 'c', 'd'], rank: 1 },
        { teamNumber: 2, members: ['e', 'f', 'g', 'h'], rank: 2 },
      ],
    });

    const map = computeResultSummaries(result);
    expect(map.get('a')?.kind).toBe('placement');
    expect(map.get('a')).toMatchObject({ rank: 1, isTeam: true, fieldSize: 2 });
    expect(map.get('h')).toMatchObject({ rank: 2, isTeam: true });
  });

  it('singles matchplay avgjort → vinner-side win, taper-side loss, margin = formatted', () => {
    const result = asResult({
      kind: 'singles_matchplay',
      sides: [
        { sideNumber: 1, userId: 'a' },
        { sideNumber: 2, userId: 'b' },
      ],
      holes: [],
      holesUp: 3,
      holesPlayed: 16,
      holesRemaining: 2,
      result: { winner: 'side1', marginUp: 3, formatted: '3&2' },
    });

    const map = computeResultSummaries(result);
    expect(map.get('a')).toEqual({
      kind: 'matchplay',
      outcome: 'win',
      margin: '3&2',
    });
    expect(map.get('b')).toEqual({
      kind: 'matchplay',
      outcome: 'loss',
      margin: '3&2',
    });
  });

  it('matchplay uavgjort (AS) → begge sider tie, margin = null', () => {
    const result = asResult({
      kind: 'singles_matchplay',
      sides: [
        { sideNumber: 1, userId: 'a' },
        { sideNumber: 2, userId: 'b' },
      ],
      holes: [],
      holesUp: 0,
      holesPlayed: 18,
      holesRemaining: 0,
      result: { winner: 'tied', marginUp: 0, formatted: 'AS' },
    });

    const map = computeResultSummaries(result);
    expect(map.get('a')).toEqual({
      kind: 'matchplay',
      outcome: 'tie',
      margin: null,
    });
    expect(map.get('b')).toEqual({
      kind: 'matchplay',
      outcome: 'tie',
      margin: null,
    });
  });

  it('matchplay uten avgjort resultat (result=null) → ingen oppføringer (faller tilbake til 🏆)', () => {
    const result = asResult({
      kind: 'singles_matchplay',
      sides: [
        { sideNumber: 1, userId: 'a' },
        { sideNumber: 2, userId: 'b' },
      ],
      holes: [],
      holesUp: 0,
      holesPlayed: 4,
      holesRemaining: 14,
      result: null,
    });

    const map = computeResultSummaries(result);
    expect(map.size).toBe(0);
  });

  it('fourball/foursomes matchplay → begge spillere på siden arver utfallet', () => {
    const result = asResult({
      kind: 'fourball_matchplay',
      sides: [
        {
          sideNumber: 1,
          players: [{ userId: 'a' }, { userId: 'b' }],
        },
        {
          sideNumber: 2,
          players: [{ userId: 'c' }, { userId: 'd' }],
        },
      ],
      holes: [],
      holesUp: -2,
      holesPlayed: 18,
      holesRemaining: 0,
      result: { winner: 'side2', marginUp: 2, formatted: '2 up' },
    });

    const map = computeResultSummaries(result);
    expect(map.get('a')).toEqual({
      kind: 'matchplay',
      outcome: 'loss',
      margin: '2 up',
    });
    expect(map.get('c')).toEqual({
      kind: 'matchplay',
      outcome: 'win',
      margin: '2 up',
    });
    expect(map.get('d')).toMatchObject({ outcome: 'win' });
  });

  it('skins → skins-summary med totalSkins, rank og fieldSize', () => {
    const result = asResult({
      kind: 'skins',
      scoring: 'net',
      holes: [],
      carriedPot: 0,
      players: [
        { userId: 'a', totalSkins: 4, holesWon: 4, rank: 1 },
        { userId: 'b', totalSkins: 1, holesWon: 1, rank: 2 },
        { userId: 'c', totalSkins: 0, holesWon: 0, rank: 3 },
      ],
    });

    const map = computeResultSummaries(result);
    expect(map.get('a')).toEqual({
      kind: 'skins',
      skins: 4,
      rank: 1,
      fieldSize: 3,
    });
    expect(map.get('c')).toEqual({
      kind: 'skins',
      skins: 0,
      rank: 3,
      fieldSize: 3,
    });
  });

  it('points-modi (wolf/nassau/nines/acey/round_robin/bbb) → placement, isTeam=false', () => {
    const wolf = asResult({
      kind: 'wolf',
      scoring: 'net',
      rotation: 'random_with_trailing',
      holes: [],
      players: [
        { userId: 'a', rank: 1 },
        { userId: 'b', rank: 2 },
      ],
    });
    expect(computeResultSummaries(wolf).get('a')).toEqual({
      kind: 'placement',
      rank: 1,
      fieldSize: 2,
      isTeam: false,
    });

    const nassau = asResult({
      kind: 'nassau',
      scoring: 'net',
      sections: {},
      holes: [],
      players: [
        { userId: 'x', units: 2, rank: 1 },
        { userId: 'y', units: 0, rank: 2 },
        { userId: 'z', units: 1, rank: 2 },
      ],
    });
    expect(computeResultSummaries(nassau).get('x')).toMatchObject({
      kind: 'placement',
      rank: 1,
      fieldSize: 3,
      isTeam: false,
    });
  });
});
