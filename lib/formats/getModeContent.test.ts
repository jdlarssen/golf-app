import { describe, it, expect } from 'vitest';
import { mergeModeContent } from './getModeContent';
import { MODE_GUIDE, STABLEFORD_4BBB_GUIDE } from './modeGuide';

// Type A: pure-logic tests for mergeModeContent.
// Does NOT test getModeContentMap (requires DB/cache mocks).

describe('mergeModeContent', () => {
  it('(a) all DB fields non-null → DB wins for all four fields', () => {
    const dbRow = {
      rules_summary: 'DB summary',
      rules_points: ['DB point 1', 'DB point 2'],
      rules_long: 'DB long prose',
      rules_example: 'DB example text',
    };
    const result = mergeModeContent(dbRow, 'best_ball', 2);
    expect(result.summary).toBe('DB summary');
    expect(result.points).toEqual(['DB point 1', 'DB point 2']);
    expect(result.long).toBe('DB long prose');
    expect(result.example).toBe('DB example text');
  });

  it('(b) all DB fields null → summary/points fall back to MODE_GUIDE; long/example null', () => {
    const dbRow = {
      rules_summary: null,
      rules_points: null,
      rules_long: null,
      rules_example: null,
    };
    const result = mergeModeContent(dbRow, 'stableford', 1);
    expect(result.summary).toBe(MODE_GUIDE.stableford.summary);
    expect(result.points).toEqual(MODE_GUIDE.stableford.points);
    expect(result.long).toBeNull();
    expect(result.example).toBeNull();
  });

  it('(b) null dbRow → full MODE_GUIDE fallback, long/example null', () => {
    const result = mergeModeContent(null, 'solo_strokeplay', 1);
    expect(result.summary).toBe(MODE_GUIDE.solo_strokeplay.summary);
    expect(result.points).toEqual(MODE_GUIDE.solo_strokeplay.points);
    expect(result.long).toBeNull();
    expect(result.example).toBeNull();
  });

  it('(c) mixed: DB summary set, points null → DB summary wins, points fall back', () => {
    const dbRow = {
      rules_summary: 'Custom summary',
      rules_points: null,
      rules_long: 'Some long text',
      rules_example: null,
    };
    const result = mergeModeContent(dbRow, 'texas_scramble', 4);
    expect(result.summary).toBe('Custom summary');
    expect(result.points).toEqual(MODE_GUIDE.texas_scramble.points);
    expect(result.long).toBe('Some long text');
    expect(result.example).toBeNull();
  });

  it('(d) stableford team_size 2 → uses STABLEFORD_4BBB_GUIDE for summary/points fallback', () => {
    const dbRow = {
      rules_summary: null,
      rules_points: null,
      rules_long: null,
      rules_example: null,
    };
    const result = mergeModeContent(dbRow, 'stableford', 2);
    expect(result.summary).toBe(STABLEFORD_4BBB_GUIDE.summary);
    expect(result.points).toEqual(STABLEFORD_4BBB_GUIDE.points);
    expect(result.long).toBeNull();
    expect(result.example).toBeNull();
  });

  it('(d) modified_stableford team_size 2 → uses STABLEFORD_4BBB_GUIDE fallback', () => {
    const dbRow = {
      rules_summary: null,
      rules_points: null,
      rules_long: null,
      rules_example: null,
    };
    const result = mergeModeContent(dbRow, 'modified_stableford', 2);
    expect(result.summary).toBe(STABLEFORD_4BBB_GUIDE.summary);
    expect(result.points).toEqual(STABLEFORD_4BBB_GUIDE.points);
  });
});
