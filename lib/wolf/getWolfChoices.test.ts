import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeUnstableCacheSpy } from '@/tests/serverActionMocks';

type ChainResult = {
  data?: Array<Record<string, unknown>> | null;
  error?: unknown;
};

const fromMock = vi.fn<(table: string) => unknown>();

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({ from: fromMock }),
}));

const cacheSpy = makeUnstableCacheSpy();
vi.mock('next/cache', () => ({
  unstable_cache: (...args: Parameters<typeof cacheSpy>) => cacheSpy(...args),
}));

import { getWolfChoices } from './getWolfChoices';

beforeEach(() => {
  fromMock.mockReset();
  cacheSpy.mockClear();
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

describe('getWolfChoices', () => {
  it('returnerer normalisert liste sortert på hole_number ASC', async () => {
    fromMock.mockImplementation(() =>
      buildChain({
        data: [
          {
            hole_number: 1,
            wolf_user_id: 'u-1',
            choice: 'partner',
            partner_user_id: 'u-2',
          },
          {
            hole_number: 2,
            wolf_user_id: 'u-2',
            choice: 'lone',
            partner_user_id: null,
          },
          {
            hole_number: 3,
            wolf_user_id: 'u-3',
            choice: 'blind',
            partner_user_id: null,
          },
        ],
        error: null,
      }),
    );

    const result = await getWolfChoices('game-1');

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      holeNumber: 1,
      wolfUserId: 'u-1',
      choice: 'partner',
      partnerUserId: 'u-2',
    });
    expect(result[1].choice).toBe('lone');
    expect(result[1].partnerUserId).toBeNull();
    expect(result[2].choice).toBe('blind');
    expect(fromMock).toHaveBeenCalledWith('wolf_hole_choices');
  });

  it('returnerer tom array når ingen valg finnes', async () => {
    fromMock.mockImplementation(() => buildChain({ data: [], error: null }));

    const result = await getWolfChoices('game-1');

    expect(result).toEqual([]);
  });

  it('returnerer tom array når data er null (defensive default)', async () => {
    fromMock.mockImplementation(() => buildChain({ data: null, error: null }));

    const result = await getWolfChoices('game-1');

    expect(result).toEqual([]);
  });

  it('kaster feil hvis Supabase-query feiler', async () => {
    fromMock.mockImplementation(() =>
      buildChain({ data: null, error: { message: 'permission denied' } }),
    );

    await expect(getWolfChoices('game-1')).rejects.toThrow(
      'Failed to fetch wolf choices',
    );
  });

  // #2224: the select string is part of the key, so a select change gives a
  // new cache entry without a hand bump.
  it('keys the cache entry on the select string and tags it game-<id>', async () => {
    const chain = buildChain({ data: [], error: null });
    fromMock.mockImplementation(() => chain);

    await getWolfChoices('game-1');

    const [, keyParts, options] = cacheSpy.mock.calls[0];
    expect(keyParts).toContain(chain.select.mock.calls[0][0]);
    expect(options?.tags).toEqual(['game-game-1']);
  });
});
