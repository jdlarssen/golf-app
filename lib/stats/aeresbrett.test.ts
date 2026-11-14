import { describe, it, expect } from 'vitest';
import { rankBoard, soleLeader, topTen, viewerPlace, type BoardEntry } from './aeresbrett';

/**
 * Type A — the honour board's places (#2326): most wins first, equal counts
 * share a place (1, 2, 2, 4), the places counted after the member filter. #2259 adds
 * the viewer's own place, the sole leader and the ten-row cut.
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

describe('viewerPlace', () => {
  const board = rankBoard([
    e('a', 'Anne', 9),
    e('b', 'Bjørn', 7),
    e('c', 'Carl', 6),
    e('d', 'Dina', 5),
    e('f', 'Frode', 4),
    e('g', 'Gro', 4),
    e('h', 'Hans', 2),
    e('i', 'Ida', 1),
  ]);

  it('is null when the viewer has no entry (zero counts are not ranked)', () => {
    expect(viewerPlace(board, 'ukjent')).toBeNull();
    expect(viewerPlace(rankBoard([e('x', 'Xena', 0)]), 'x')).toBeNull();
  });

  it('gives place and count, with no distance when the viewer is in the top 5', () => {
    expect(viewerPlace(board, 'c')).toEqual({ place: 3, count: 6, toTop5: null });
  });

  it('counts a shared fifth place as top 5', () => {
    expect(viewerPlace(board, 'g')).toEqual({ place: 5, count: 4, toTop5: null });
  });

  it('gives the distance to the fifth row when the viewer is outside the top 5', () => {
    expect(viewerPlace(board, 'h')).toEqual({ place: 7, count: 2, toTop5: 2 });
    expect(viewerPlace(board, 'i')).toEqual({ place: 8, count: 1, toTop5: 3 });
  });

  it('measures against the fifth row even when the fifth place is shared', () => {
    const tied = rankBoard([
      e('a', 'Anne', 8),
      e('b', 'Bjørn', 7),
      e('c', 'Carl', 6),
      e('d', 'Dina', 5),
      e('f', 'Frode', 3),
      e('g', 'Gro', 3),
      e('h', 'Hans', 1),
    ]);
    expect(viewerPlace(tied, 'h')).toEqual({ place: 7, count: 1, toTop5: 2 });
  });
});

describe('soleLeader', () => {
  it('is null on an empty board', () => {
    expect(soleLeader([])).toBeNull();
  });

  it('is the one on place 1', () => {
    const board = rankBoard([e('a', 'Anne', 6), e('b', 'Bjørn', 5)]);
    expect(soleLeader(board)?.userId).toBe('a');
  });

  it('is null when the top is shared', () => {
    expect(soleLeader(rankBoard([e('a', 'Anne', 6), e('b', 'Bjørn', 6)]))).toBeNull();
  });
});

describe('topTen', () => {
  const many = (counts: number[]) =>
    rankBoard(counts.map((count, i) => e(`u${i}`, `Navn ${String(i).padStart(2, '0')}`, count)));

  it('cuts after place 10', () => {
    expect(topTen(many([12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]))).toHaveLength(10);
  });

  it('keeps everyone who shares place 10, so the board can run past ten rows', () => {
    const board = many([12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 3, 3, 1]);
    expect(topTen(board).map((r) => r.place)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10]);
  });

  it('keeps a short board as it is', () => {
    expect(topTen(many([3, 2]))).toHaveLength(2);
  });
});
