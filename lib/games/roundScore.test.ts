import { describe, it, expect } from 'vitest';
import { computeRoundScore } from './roundScore';

describe('computeRoundScore', () => {
  it('returns null brutto and netto when there are no score rows', () => {
    expect(computeRoundScore([], 18)).toEqual({ brutto: null, netto: null });
  });

  it('returns null netto when the course handicap is missing', () => {
    expect(computeRoundScore([4, 5, 3], null)).toEqual({
      brutto: 12,
      netto: null,
    });
  });

  it('subtracts the course handicap from brutto for netto', () => {
    expect(computeRoundScore([4, 5, 3], 2)).toEqual({ brutto: 12, netto: 10 });
  });

  it('counts a null stroke as 0 so a started round still has a brutto', () => {
    expect(computeRoundScore([4, null, 5], 1)).toEqual({ brutto: 9, netto: 8 });
  });

  it.each([
    { strokes: [3, 4, 5, 4], hcp: 0, brutto: 16, netto: 16 },
    { strokes: [5], hcp: 10, brutto: 5, netto: -5 },
    { strokes: [], hcp: null, brutto: null, netto: null },
  ])(
    'strokes=$strokes hcp=$hcp → brutto=$brutto, netto=$netto',
    ({ strokes, hcp, brutto, netto }) => {
      expect(computeRoundScore(strokes, hcp)).toEqual({ brutto, netto });
    },
  );
});
