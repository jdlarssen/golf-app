import { describe, expect, it } from 'vitest';
import {
  formatNetToPar,
  formatPoints,
  formatRoundCell,
  formatSeasonValue,
  roundCellValue,
  type FormatDecimal,
} from './standingsFormat';

/** The app's decimal: a comma. The web passes the locale's own. */
const comma: FormatDecimal = (value, decimals) => value.toFixed(decimals).replace('.', ',');

describe('standingsFormat — the league table numbers (#2638)', () => {
  it.each([
    [0, 'E'],
    [3, '+3'],
    [-5, '−5'],
  ])('strokes to par %s → %s', (n, text) => {
    expect(formatNetToPar(n, comma)).toBe(text);
  });

  it('strokes to par with one decimal, and a minus sign rather than a hyphen', () => {
    expect([formatNetToPar(2.25, comma, 1), formatNetToPar(-0.5, comma, 1)]).toEqual(['+2,3', '−0,5']);
  });

  it('points are plain, with one decimal only after a tie split', () => {
    expect([formatPoints(114, comma), formatPoints(36.5, comma)]).toEqual(['114', '36,5']);
  });

  it.each([
    ['best_n', true, 114, '114'],
    ['total', false, -4, '−4'],
    ['total', false, 6.6, '+7'],
    ['average', false, 1.25, '+1,3'],
    ['points', false, 12.5, '12,5'],
  ])('season value under %s (points-based %s): %s → %s', (model, pointsBased, value, text) => {
    expect(formatSeasonValue(value, model, pointsBased, comma)).toBe(text);
  });

  it('a round cell reads points under the points model, the value otherwise, and null when not played', () => {
    const cell = { value: 36, points: 10 };
    expect([
      roundCellValue(cell, 'points'),
      roundCellValue(cell, 'best_n'),
      roundCellValue({ value: null, points: null }, 'total'),
      roundCellValue(undefined, 'total'),
    ]).toEqual([10, 36, null, null]);
  });

  it('a round cell is points in a stableford league and to par in stroke play', () => {
    expect([formatRoundCell(38, 'best_n', true, comma), formatRoundCell(-2, 'total', false, comma)]).toEqual([
      '38',
      '−2',
    ]);
  });
});
