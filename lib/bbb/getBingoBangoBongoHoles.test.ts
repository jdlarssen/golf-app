import { describe, it, expect, vi, beforeEach } from 'vitest';

type ChainResult = {
  data?: Array<Record<string, unknown>> | null;
  error?: unknown;
};

const fromMock = vi.fn<(table: string) => unknown>();

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({ from: fromMock }),
}));

vi.mock('next/cache', () => ({
  unstable_cache: <Args extends unknown[], R>(
    fn: (...args: Args) => Promise<R>,
  ) => fn,
}));

import { getBingoBangoBongoHoles } from './getBingoBangoBongoHoles';

beforeEach(() => {
  fromMock.mockReset();
});

function buildChain(result: ChainResult) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    then: (onResolved: (r: ChainResult) => unknown) =>
      Promise.resolve(result).then(onResolved),
  };
}

describe('getBingoBangoBongoHoles', () => {
  it('returnerer normalisert liste sortert på hole_number ASC', async () => {
    fromMock.mockImplementation(() =>
      buildChain({
        data: [
          {
            hole_number: 1,
            bingo_user_id: 'u-1',
            bango_user_id: 'u-2',
            bongo_user_id: 'u-3',
          },
          {
            hole_number: 2,
            bingo_user_id: 'u-2',
            bango_user_id: null,
            bongo_user_id: 'u-1',
          },
          {
            hole_number: 3,
            bingo_user_id: 'u-3',
            bango_user_id: 'u-3',
            bongo_user_id: 'u-3',
          },
        ],
        error: null,
      }),
    );

    const result = await getBingoBangoBongoHoles('game-1');

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      holeNumber: 1,
      bingoUserId: 'u-1',
      bangoUserId: 'u-2',
      bongoUserId: 'u-3',
    });
    expect(result[1].bangoUserId).toBeNull();
    expect(result[1].bingoUserId).toBe('u-2');
    expect(result[1].bongoUserId).toBe('u-1');
    // Hull 3: samme spiller alle tre (lovlig — 3 poeng)
    expect(result[2]).toEqual({
      holeNumber: 3,
      bingoUserId: 'u-3',
      bangoUserId: 'u-3',
      bongoUserId: 'u-3',
    });
    expect(fromMock).toHaveBeenCalledWith('bingo_bango_bongo_holes');
  });

  it('returnerer tom array når ingen hull-rader finnes', async () => {
    fromMock.mockImplementation(() => buildChain({ data: [], error: null }));

    const result = await getBingoBangoBongoHoles('game-1');

    expect(result).toEqual([]);
  });

  it('returnerer tom array når data er null (defensive default)', async () => {
    fromMock.mockImplementation(() => buildChain({ data: null, error: null }));

    const result = await getBingoBangoBongoHoles('game-1');

    expect(result).toEqual([]);
  });

  it('kaster feil hvis Supabase-query feiler', async () => {
    fromMock.mockImplementation(() =>
      buildChain({ data: null, error: { message: 'permission denied' } }),
    );

    await expect(getBingoBangoBongoHoles('game-1')).rejects.toThrow(
      'Failed to fetch bingo bango bongo holes',
    );
  });

  it('bevarer null-kategorier i output (bango udelt er lovlig)', async () => {
    fromMock.mockImplementation(() =>
      buildChain({
        data: [
          {
            hole_number: 5,
            bingo_user_id: 'u-1',
            bango_user_id: null,
            bongo_user_id: null,
          },
        ],
        error: null,
      }),
    );

    const result = await getBingoBangoBongoHoles('game-42');

    expect(result[0]).toEqual({
      holeNumber: 5,
      bingoUserId: 'u-1',
      bangoUserId: null,
      bongoUserId: null,
    });
  });
});
