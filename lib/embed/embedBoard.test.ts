import { describe, it, expect } from 'vitest';
import { buildEmbedBoard, type EmbedBoardSourceRow } from './embedBoard';

// Type A (#2330): the embed card's rows — the top five, how many more, who
// leads, and the name a public page may show.

function row(id: string, rank: number, overrides: Partial<EmbedBoardSourceRow> = {}): EmbedBoardSourceRow {
  return {
    userId: id,
    name: `Spiller ${id.toUpperCase()}`,
    nickname: null,
    rank,
    tied: false,
    total: 30 - rank,
    holesPlayed: 14,
    ...overrides,
  };
}

const field = (n: number) => Array.from({ length: n }, (_, i) => row(`p${i + 1}`, i + 1));

describe('buildEmbedBoard', () => {
  it('shows the top five of eight and counts the rest', () => {
    const board = buildEmbedBoard({ unit: 'points', holesPlayed: 14, leagueFlight: false, rows: field(8) });
    expect(board.rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(board.fieldSize).toBe(8);
    expect(board.moreCount).toBe(3);
    expect(board).toMatchObject({ unit: 'points', holesPlayed: 14, showPlace: true });
  });

  it('collapses at six too: the frame has a fixed height', () => {
    const board = buildEmbedBoard({ unit: 'net', holesPlayed: 14, leagueFlight: false, rows: field(6) });
    expect(board.rows).toHaveLength(5);
    expect(board.moreCount).toBe(1);
  });

  it('exactly five, one and none: nothing more to show', () => {
    for (const n of [5, 1, 0]) {
      const board = buildEmbedBoard({ unit: 'net', holesPlayed: 3, leagueFlight: false, rows: field(n) });
      expect(board.rows).toHaveLength(n);
      expect(board.fieldSize).toBe(n);
      expect(board.moreCount).toBe(0);
    }
  });

  it('only the leader leads; a shared lead leads on both rows', () => {
    const single = buildEmbedBoard({ unit: 'points', holesPlayed: 14, leagueFlight: false, rows: field(3) });
    expect(single.rows.map((r) => r.isLeader)).toEqual([true, false, false]);

    const shared = buildEmbedBoard({
      unit: 'points',
      holesPlayed: 14,
      leagueFlight: false,
      rows: [row('a', 1, { tied: true }), row('b', 1, { tied: true }), row('c', 3)],
    });
    expect(shared.rows.map((r) => [r.isLeader, r.tied])).toEqual([
      [true, true],
      [true, true],
      [false, false],
    ]);
  });

  it('before anyone has played there is no place and no leader', () => {
    const board = buildEmbedBoard({
      unit: 'points',
      holesPlayed: 0,
      leagueFlight: false,
      rows: [row('a', 1, { holesPlayed: 0, total: null }), row('b', 1, { holesPlayed: 0, total: null })],
    });
    expect(board.showPlace).toBe(false);
    expect(board.rows.every((r) => !r.isLeader)).toBe(true);
  });

  it('a league flight (#2712, #2850) shows no place and no leader', () => {
    const board = buildEmbedBoard({ unit: 'net', holesPlayed: 14, leagueFlight: true, rows: field(3) });
    expect(board.showPlace).toBe(false);
    expect(board.rows.every((r) => !r.isLeader)).toBe(true);
    expect(board.rows.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('names are public: first name and the last name’s initial, never the full last name', () => {
    const board = buildEmbedBoard({
      unit: 'points',
      holesPlayed: 14,
      leagueFlight: false,
      rows: [
        row('a', 1, { name: 'Marte Lunde' }),
        row('b', 2, { name: 'Ola Nordmann Hansen', nickname: 'Olabolla' }),
        row('c', 3, { name: null, nickname: 'Kniven' }),
        row('d', 4, { name: '  ', nickname: null }),
        row('e', 5, { name: 'Cher' }),
      ],
    });
    expect(board.rows.map((r) => r.name)).toEqual(['Marte L.', 'Ola H.', 'Kniven', null, 'Cher']);
  });

  it('keeps the number and holes from the source row', () => {
    const board = buildEmbedBoard({
      unit: 'toPar',
      holesPlayed: 14,
      leagueFlight: false,
      rows: [row('a', 1, { total: -3, holesPlayed: 14 }), row('b', 2, { total: null, holesPlayed: 0 })],
    });
    expect(board.rows.map((r) => [r.userId, r.total, r.holesPlayed])).toEqual([
      ['a', -3, 14],
      ['b', null, 0],
    ]);
  });
});
