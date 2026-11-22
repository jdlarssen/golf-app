import { describe, it, expect } from 'vitest';
import { computeRoundScore } from './roundScore';

/** A full 18-hole round: every hole a 4, so brutto 72. */
const FULL = Array<number | null>(18).fill(4);

describe('computeRoundScore', () => {
  it('returns null brutto and netto when there are no score rows', () => {
    expect(computeRoundScore([], 18)).toEqual({ brutto: null, netto: null });
  });

  it('returns null netto when the course handicap is missing', () => {
    expect(computeRoundScore(FULL, null)).toEqual({ brutto: 72, netto: null });
  });

  it('subtracts the course handicap from brutto for a full 18-hole round', () => {
    expect(computeRoundScore(FULL, 18)).toEqual({ brutto: 72, netto: 54 });
    // A plus handicap (stored negative) adds strokes.
    expect(computeRoundScore(FULL, -2)).toEqual({ brutto: 72, netto: 74 });
  });

  // Audit 2026-11-20: the stored course handicap is the 18-hole number, also in
  // a front-nine or back-nine match (prod: 9 holes, 62 strokes, CH 43). Taking
  // it off fewer holes showed «netto 19» in Runder. Brutto stays; netto needs
  // all 18 holes.
  it('gives no netto for a 9-hole segment: the handicap is for 18 holes', () => {
    expect(computeRoundScore(Array(9).fill(7) as number[], 43)).toEqual({
      brutto: 63,
      netto: null,
    });
  });

  it('gives no netto for a round stopped after 11 holes', () => {
    expect(computeRoundScore(Array(11).fill(5) as number[], 18)).toEqual({
      brutto: 55,
      netto: null,
    });
  });

  it('gives no netto when one of 18 rows has no stroke', () => {
    const missingOne = [...FULL];
    missingOne[7] = null;
    // A null stroke still counts as 0 in brutto, so a started round has one.
    expect(computeRoundScore(missingOne, 10)).toEqual({ brutto: 68, netto: null });
  });
});
