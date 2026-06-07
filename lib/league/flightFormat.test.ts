import { describe, it, expect } from 'vitest';
import { isPointsBasedFormat, leagueFlightGameConfig } from './flightFormat';
import type { LeagueFormat } from './types';

describe('isPointsBasedFormat', () => {
  it.each([
    ['stroke', false],
    ['stableford', true],
    ['modified_stableford', true],
  ] as [LeagueFormat, boolean][])('%s → %s', (format, expected) => {
    expect(isPointsBasedFormat(format)).toBe(expected);
  });
});

describe('leagueFlightGameConfig', () => {
  it('stroke → solo_strokeplay flight', () => {
    expect(leagueFlightGameConfig('stroke')).toEqual({
      gameMode: 'solo_strokeplay',
      modeConfig: { kind: 'solo_strokeplay', team_size: 1 },
    });
  });

  it('stableford → standard stableford solo flight', () => {
    expect(leagueFlightGameConfig('stableford')).toEqual({
      gameMode: 'stableford',
      modeConfig: { kind: 'stableford', team_size: 1, points_table: 'standard' },
    });
  });

  it('modified_stableford → modified stableford solo flight', () => {
    expect(leagueFlightGameConfig('modified_stableford')).toEqual({
      gameMode: 'modified_stableford',
      modeConfig: { kind: 'modified_stableford', team_size: 1, points_table: 'modified' },
    });
  });
});
