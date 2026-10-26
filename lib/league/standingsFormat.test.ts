import { describe, expect, it } from 'vitest';
import {
  formatNetToPar,
  formatPoints,
  formatRoundCell,
  formatSeasonValue,
  roundCellValue,
  splitStandings,
  tableRounds,
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

describe('tableRounds — which rounds get a column (#1378)', () => {
  const round = (id: string, sequence: number, opensAt: string, closesAt: string) => ({
    id,
    sequence,
    opensAt,
    closesAt,
  });
  const r1 = round('r1', 1, '2026-10-05T00:00:00Z', '2026-10-11T21:59:59Z');
  const r2 = round('r2', 2, '2026-10-12T00:00:00Z', '2026-10-18T21:59:59Z');
  const r3 = round('r3', 3, '2026-10-19T00:00:00Z', '2026-10-25T21:59:59Z');
  const at = (iso: string) => new Date(iso).getTime();

  it('before the first window opens: no columns, no open round', () => {
    expect(tableRounds([r1, r2, r3], at('2026-10-01T00:00:00Z'))).toEqual({ shown: [], openRoundId: null });
  });

  it('inside a window: opened and closed rounds are shown, the upcoming one is not', () => {
    const { shown, openRoundId } = tableRounds([r1, r2, r3], at('2026-10-14T12:00:00Z'));
    expect(shown.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(openRoundId).toBe('r2');
  });

  it('after the last window: every round is shown and none is open', () => {
    const { shown, openRoundId } = tableRounds([r1, r2, r3], at('2026-11-30T00:00:00Z'));
    expect(shown.map((r) => r.id)).toEqual(['r1', 'r2', 'r3']);
    expect(openRoundId).toBeNull();
  });

  it('sorts on sequence whatever the input order', () => {
    const { shown } = tableRounds([r3, r1, r2], at('2026-11-30T00:00:00Z'));
    expect(shown.map((r) => r.sequence)).toEqual([1, 2, 3]);
  });

  it('two windows open at once: the first in sequence is the open round', () => {
    const wide = round('r1', 1, '2026-10-01T00:00:00Z', '2026-10-31T00:00:00Z');
    const overlap = round('r2', 2, '2026-10-10T00:00:00Z', '2026-10-20T00:00:00Z');
    const { shown, openRoundId } = tableRounds([overlap, wide], at('2026-10-15T00:00:00Z'));
    expect(shown.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(openRoundId).toBe('r1');
  });

  it('the window edges count as open', () => {
    expect(tableRounds([r1], at('2026-10-05T00:00:00Z')).openRoundId).toBe('r1');
    expect(tableRounds([r1], at('2026-10-11T21:59:59Z')).openRoundId).toBe('r1');
  });

  it('no rounds: nothing to show', () => {
    expect(tableRounds([], at('2026-10-15T00:00:00Z'))).toEqual({ shown: [], openRoundId: null });
  });
});

describe('splitStandings — the groups under the ranked rows (#1378)', () => {
  const row = (userId: string, ranked: boolean, roundsPlayed: number) => ({ userId, ranked, roundsPlayed });

  it('keeps the ranked rows in order and sorts the rest by why they are not ranked', () => {
    const rows = [
      row('a', true, 3),
      row('b', true, 2),
      row('c', false, 0),
      row('d', false, 1),
      row('e', false, 0),
      row('f', false, 2),
    ];
    const { ranked, notRanked, notRankedYet } = splitStandings(rows);
    expect(ranked.map((r) => r.userId)).toEqual(['a', 'b']);
    // Skipped a closed round under must_play_all: they have played, but do not count.
    expect(notRanked.map((r) => r.userId)).toEqual(['d', 'f']);
    // No round played yet.
    expect(notRankedYet.map((r) => r.userId)).toEqual(['c', 'e']);
  });

  it('everyone ranked: both groups are empty', () => {
    const { notRanked, notRankedYet } = splitStandings([row('a', true, 1), row('b', true, 1)]);
    expect(notRanked).toEqual([]);
    expect(notRankedYet).toEqual([]);
  });

  it('nobody ranked: the table is only groups', () => {
    const { ranked, notRankedYet } = splitStandings([row('a', false, 0)]);
    expect(ranked).toEqual([]);
    expect(notRankedYet).toHaveLength(1);
  });

  it('no rows', () => {
    expect(splitStandings([])).toEqual({ ranked: [], notRanked: [], notRankedYet: [] });
  });
});
