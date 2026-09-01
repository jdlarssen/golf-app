import { describe, it, expect } from 'vitest';
import {
  CUP_PRESETS,
  buildSessionCountRows,
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
  it('ships the four documented presets with stable ids and sessions', () => {
    const ids = CUP_PRESETS.map((p) => p.id);
    expect(ids).toEqual(['klassisk', 'fourball-singler', 'singler', 'splittet-cup-dag']);
    for (const p of CUP_PRESETS) {
      expect(p.id.length).toBeGreaterThan(0);
      expect(p.sessions.length).toBeGreaterThan(0);
      expect(p.minPerTeam).toBeGreaterThan(0);
    }
  });

  // #1441: preset exists for wizard discovery, but generation routes through
  // generateSplitDayPlan (cupPairing.ts), not buildSessions/generateCupPlan —
  // see the preset's own doc comment in cupTemplates.ts.
  it('splittet-cup-dag: minPerTeam 2 (needs 2 per side per flight)', () => {
    const splitDay = CUP_PRESETS.find((p) => p.id === 'splittet-cup-dag')!;
    expect(splitDay.minPerTeam).toBe(2);
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

describe('buildSessionCountRows / buildSessions with overrides', () => {
  const klassisk = CUP_PRESETS.find((p) => p.id === 'klassisk')!;

  it('the submitted Ryder Cup shape: klassisk @ 16 with singles lowered to 12', () => {
    expect(buildSessions(klassisk.sessions, 16, { 2: 12 })).toEqual([
      { format: 'foursomes_matchplay', matchCount: 8 },
      { format: 'fourball_matchplay', matchCount: 8 },
      { format: 'singles_matchplay', matchCount: 12 },
    ]);
  });

  it.each<[string, Record<number, number>, number, number]>([
    // [case, overrides, sessionIndex, expectedEffective] — klassisk @ teamSize 4
    ['override above derived clamps down', { 2: 99 }, 2, 4],
    ['override below 1 clamps to 1', { 2: 0 }, 2, 1],
    ['negative override clamps to 1', { 2: -3 }, 2, 1],
    ['non-integer override floors', { 2: 2.7 }, 2, 2],
    ['untouched session keeps derived', { 2: 2 }, 0, 2],
  ])('%s', (_case, overrides, sessionIndex, expected) => {
    const rows = buildSessionCountRows(klassisk.sessions, 4, overrides);
    expect(rows.find((r) => r.index === sessionIndex)!.effective).toBe(expected);
  });

  it('rows carry index/format/derived so the UI can render steppers', () => {
    expect(buildSessionCountRows(klassisk.sessions, 4, {})).toEqual([
      { index: 0, format: 'foursomes_matchplay', derived: 2, effective: 2 },
      { index: 1, format: 'fourball_matchplay', derived: 2, effective: 2 },
      { index: 2, format: 'singles_matchplay', derived: 4, effective: 4 },
    ]);
  });

  it('a dropped session (derived 0) stays dropped even with an override', () => {
    // teamSize 1: no 2v2 possible — foursomes/four-ball are gone, override or not.
    expect(buildSessionCountRows(klassisk.sessions, 1, { 0: 5 })).toEqual([
      { index: 2, format: 'singles_matchplay', derived: 1, effective: 1 },
    ]);
  });

  it('duplicate formats are keyed by position, not format', () => {
    // Tilpasset list with foursomes twice (a two-day cup): only the second lowered.
    const sessions: CupSessionFormat[] = [
      'foursomes_matchplay',
      'foursomes_matchplay',
    ];
    expect(buildSessions(sessions, 8, { 1: 2 })).toEqual([
      { format: 'foursomes_matchplay', matchCount: 4 },
      { format: 'foursomes_matchplay', matchCount: 2 },
    ]);
  });

  it('non-finite override is ignored', () => {
    const rows = buildSessionCountRows(klassisk.sessions, 4, { 2: Number.NaN });
    expect(rows.find((r) => r.index === 2)!.effective).toBe(4);
  });
});
