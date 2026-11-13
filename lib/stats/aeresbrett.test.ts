import { describe, it, expect } from 'vitest';
import { rankBoard, type BoardEntry } from './aeresbrett';

/**
 * Type A — the honour board's places (#2326): most wins first, equal counts
 * share a place (1, 2, 2, 4), the places counted after the member filter.
 */

const e = (userId: string, name: string, count: number): BoardEntry => ({ userId, name, count });

describe('rankBoard', () => {
  it('is empty without wins', () => {
    expect(rankBoard([])).toEqual([]);
  });

  it('places one winner first', () => {
    expect(rankBoard([e('a', 'Marte Lie', 6)])).toEqual([{ ...e('a', 'Marte Lie', 6), place: 1 }]);
  });

  it('sorts on wins, then name, and gives equal counts the same place (1, 2, 2, 4)', () => {
    const board = rankBoard([
      e('d', 'Dina', 1),
      e('c', 'Carl', 4),
      e('a', 'Anne', 6),
      e('b', 'Bjørn', 4),
    ]);
    expect(board.map((r) => [r.name, r.place])).toEqual([
      ['Anne', 1],
      ['Bjørn', 2],
      ['Carl', 2],
      ['Dina', 4],
    ]);
  });

  it('sorts names the Norwegian way (Ø after Z)', () => {
    const board = rankBoard([e('o', 'Øyvind', 2), e('z', 'Zara', 2)]);
    expect(board.map((r) => r.name)).toEqual(['Zara', 'Øyvind']);
  });

  it('leaves out a count of zero', () => {
    expect(rankBoard([e('a', 'Anne', 0)])).toEqual([]);
  });

  it('keeps only the given users and counts the places after the filter', () => {
    const board = rankBoard(
      [e('gone', 'Tidligere medlem', 9), e('a', 'Anne', 6), e('b', 'Bjørn', 6), e('c', 'Carl', 2)],
      { onlyUserIds: new Set(['a', 'b', 'c']) },
    );
    expect(board.map((r) => [r.userId, r.place])).toEqual([
      ['a', 1],
      ['b', 1],
      ['c', 3],
    ]);
  });

  it('is empty when nobody is left after the filter', () => {
    expect(rankBoard([e('gone', 'X', 3)], { onlyUserIds: new Set(['a']) })).toEqual([]);
  });
});
