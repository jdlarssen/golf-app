import { describe, it, expect } from 'vitest';
import {
  CUP_PRESETS,
  buildSessions,
  sessionMatchCount,
  type CupSessionFormat,
} from './cupTemplates';

describe('sessionMatchCount', () => {
  it('singles: one match per player', () => {
    expect(sessionMatchCount('singles_matchplay', 4)).toBe(4);
    expect(sessionMatchCount('singles_matchplay', 1)).toBe(1);
  });

  it.each<[CupSessionFormat, number, number]>([
    ['fourball_matchplay', 4, 2],
    ['foursomes_matchplay', 4, 2],
    ['fourball_matchplay', 5, 2], // odd → floor, one bye
    ['foursomes_matchplay', 6, 3],
    ['fourball_matchplay', 1, 0], // can't field a pair
    // #663: greensome/chapman/gruesome are 2v2, same pairing path as foursomes
    ['greensome_matchplay', 4, 2],
    ['greensome_matchplay', 5, 2],
    ['greensome_matchplay', 1, 0],
    ['chapman_matchplay', 4, 2],
    ['chapman_matchplay', 6, 3],
    ['gruesome_matchplay', 4, 2],
    ['gruesome_matchplay', 1, 0],
  ])('2v2 %s @ teamSize %i → %i matches', (format, size, expected) => {
    expect(sessionMatchCount(format, size)).toBe(expected);
  });
});

describe('CUP_PRESETS', () => {
  it('ships the three documented presets with stable ids and sessions', () => {
    const ids = CUP_PRESETS.map((p) => p.id);
    expect(ids).toEqual(['klassisk', 'fourball-singler', 'singler']);
    for (const p of CUP_PRESETS) {
      expect(p.id.length).toBeGreaterThan(0);
      expect(p.sessions.length).toBeGreaterThan(0);
      expect(p.minPerTeam).toBeGreaterThan(0);
    }
  });

  it('klassisk = foursomes → four-ball → singler, minPerTeam 2', () => {
    const klassisk = CUP_PRESETS.find((p) => p.id === 'klassisk')!;
    expect(klassisk.sessions).toEqual([
      'foursomes_matchplay',
      'fourball_matchplay',
      'singles_matchplay',
    ]);
    expect(klassisk.minPerTeam).toBe(2);
  });

  it('singler scales to any team size (minPerTeam 1)', () => {
    const singler = CUP_PRESETS.find((p) => p.id === 'singler')!;
    expect(singler.sessions).toEqual(['singles_matchplay']);
    expect(singler.minPerTeam).toBe(1);
  });
});

describe('buildSessions', () => {
  it('klassisk @ teamSize 4 → 2 foursomes + 2 four-ball + 4 singler', () => {
    const klassisk = CUP_PRESETS.find((p) => p.id === 'klassisk')!;
    expect(buildSessions(klassisk.sessions, 4)).toEqual([
      { format: 'foursomes_matchplay', matchCount: 2 },
      { format: 'fourball_matchplay', matchCount: 2 },
      { format: 'singles_matchplay', matchCount: 4 },
    ]);
  });

  it('drops sessions that cannot be fielded (matchCount 0)', () => {
    const klassisk = CUP_PRESETS.find((p) => p.id === 'klassisk')!;
    // teamSize 1: no 2v2 possible, only singles
    expect(buildSessions(klassisk.sessions, 1)).toEqual([
      { format: 'singles_matchplay', matchCount: 1 },
    ]);
  });

  it('klassisk @ teamSize 6 → 3 + 3 + 6', () => {
    const klassisk = CUP_PRESETS.find((p) => p.id === 'klassisk')!;
    expect(buildSessions(klassisk.sessions, 6)).toEqual([
      { format: 'foursomes_matchplay', matchCount: 3 },
      { format: 'fourball_matchplay', matchCount: 3 },
      { format: 'singles_matchplay', matchCount: 6 },
    ]);
  });
});
