import { describe, it, expect } from 'vitest';
import {
  parseGenderRating,
  isCompleteRating,
  isPartiallyFilledRating,
  parseLengthMeters,
  isValidPar,
  isValidStrokeIndex,
  allStrokeIndicesUnique,
} from './coursePayload';

describe('parseGenderRating', () => {
  it.each<[string, string, number | null, number | null]>([
    // [slopeStr, crStr, expectedSlope, expectedCr]
    ['55', '50', 55, 50], // lower edges inside
    ['155', '80', 155, 80], // upper edges inside
    ['54', '49.9', null, null], // just below → null per field
    ['156', '80.1', null, null], // just above → null per field
    ['113', '72.5', 113, 72.5], // typical: integer slope, fractional CR (finite ok)
    ['100.5', '65', null, 65], // non-integer slope → null, CR ok
    ['', '', null, null], // empty → null
    ['  120  ', '  68  ', 120, 68], // whitespace is trimmed
    ['abc', 'xyz', null, null], // garbage → null
  ])('parses slope=%j cr=%j → {slope:%j, cr:%j}', (slopeStr, crStr, slope, course_rating) => {
    expect(parseGenderRating(slopeStr, crStr)).toEqual({ slope, course_rating });
  });
});

describe('isCompleteRating', () => {
  it('is true only when both slope and CR are set', () => {
    expect(isCompleteRating({ slope: 120, course_rating: 68 })).toBe(true);
    expect(isCompleteRating({ slope: 120, course_rating: null })).toBe(false);
    expect(isCompleteRating({ slope: null, course_rating: 68 })).toBe(false);
    expect(isCompleteRating({ slope: null, course_rating: null })).toBe(false);
  });
});

describe('isPartiallyFilledRating', () => {
  it.each<[string, string, boolean]>([
    ['', '', false], // neither filled — legitimate blank
    ['120', '', true], // slope only — rejectable
    ['', '68', true], // CR only — rejectable
    ['120', '68', false], // both filled — complete
    ['   ', '   ', false], // whitespace-only counts as empty
    ['  120  ', '', true], // whitespace around a value still counts as filled
  ])('slope=%j cr=%j → partial=%j', (slopeStr, crStr, expected) => {
    expect(isPartiallyFilledRating(slopeStr, crStr)).toBe(expected);
  });
});

describe('parseLengthMeters', () => {
  it.each<[string, number | null]>([
    ['', null], // empty → null (optional)
    ['999', null], // below DB CHECK
    ['1000', 1000], // lower edge
    ['12000', 12000], // upper edge
    ['12001', null], // above DB CHECK
    ['5000.5', null], // non-integer → null
    ['abc', null], // garbage → null
    ['  6000  ', 6000], // trimmed
  ])('parses %j → %j', (raw, expected) => {
    expect(parseLengthMeters(raw)).toBe(expected);
  });
});

describe('isValidPar', () => {
  it.each<[number, boolean]>([
    [2, false],
    [3, true],
    [6, true],
    [7, false],
    [4.5, false],
  ])('par %j → %j', (par, expected) => {
    expect(isValidPar(par)).toBe(expected);
  });
});

describe('isValidStrokeIndex', () => {
  it.each<[number, boolean]>([
    [0, false],
    [1, true],
    [18, true],
    [19, false],
    [9.5, false],
  ])('si %j → %j', (si, expected) => {
    expect(isValidStrokeIndex(si)).toBe(expected);
  });
});

describe('allStrokeIndicesUnique', () => {
  it('is true for a full 1..18 permutation', () => {
    const perm = Array.from({ length: 18 }, (_, i) => i + 1);
    expect(allStrokeIndicesUnique(perm)).toBe(true);
  });

  it('is false when an SI is duplicated', () => {
    const dup = Array.from({ length: 18 }, (_, i) => i + 1);
    dup[17] = 1; // 1 appears twice, 18 missing
    expect(allStrokeIndicesUnique(dup)).toBe(false);
  });
});
