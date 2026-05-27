import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock factory: each test sets fromMock.mockReturnValue(...) to control the
// chain. The admin-client mock returns a single .from() function the test
// configures per-call.
type ChainResult = {
  data?: Array<Record<string, unknown>> | null;
  error?: unknown;
};

const fromMock = vi.fn<(table: string) => unknown>();

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({ from: fromMock }),
}));

// unstable_cache wraps a function — in tests we just want pass-through so
// the helper executes immediately with no caching.
vi.mock('next/cache', () => ({
  unstable_cache: <Args extends unknown[], R>(
    fn: (...args: Args) => Promise<R>,
  ) => fn,
}));

import { getFormatsForIntent, getCupEligibleFormats } from './getFormatsForIntent';

beforeEach(() => {
  fromMock.mockReset();
});

// Helper to build a chainable mock that resolves to the given result.
// The chain is .select().eq().eq().eq().order().order() — returns thenable.
function buildIntentChain(result: ChainResult) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    then: (onResolved: (r: ChainResult) => unknown) =>
      Promise.resolve(result).then(onResolved),
  };
  return chain;
}

function buildCupChain(result: ChainResult) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    then: (onResolved: (r: ChainResult) => unknown) =>
      Promise.resolve(result).then(onResolved),
  };
  return chain;
}

describe('getFormatsForIntent', () => {
  it('returner flat liste sortert med primary først, deretter sort_order', async () => {
    fromMock.mockImplementation(() =>
      buildIntentChain({
        data: [
          {
            format_slug: 'stableford',
            is_primary: true,
            sort_order: 10,
            formats: {
              slug: 'stableford',
              display_name: 'Stableford',
              icon_key: 'stableford',
              short_description: 'Solo, poeng vs par.',
              is_active: true,
            },
          },
          {
            format_slug: 'best_ball_netto',
            is_primary: true,
            sort_order: 20,
            formats: {
              slug: 'best_ball_netto',
              display_name: 'Best ball',
              icon_key: 'best_ball_netto',
              short_description: 'Lag à 2.',
              is_active: true,
            },
          },
          {
            format_slug: 'singles_matchplay',
            is_primary: false,
            sort_order: 40,
            formats: {
              slug: 'singles_matchplay',
              display_name: 'Matchplay',
              icon_key: 'singles_matchplay',
              short_description: '1v1.',
              is_active: true,
            },
          },
        ],
        error: null,
      }),
    );

    const result = await getFormatsForIntent('kompis');

    expect(result).toHaveLength(3);
    expect(result[0].slug).toBe('stableford');
    expect(result[0].is_primary).toBe(true);
    expect(result[1].slug).toBe('best_ball_netto');
    expect(result[2].slug).toBe('singles_matchplay');
    expect(result[2].is_primary).toBe(false);
    expect(fromMock).toHaveBeenCalledWith('format_intent_mapping');
  });

  it('returner tom array når ingen mapping finnes for intent', async () => {
    fromMock.mockImplementation(() =>
      buildIntentChain({ data: [], error: null }),
    );

    const result = await getFormatsForIntent('solo');

    expect(result).toEqual([]);
  });

  it('returner tom array når data er null (defensive default)', async () => {
    fromMock.mockImplementation(() =>
      buildIntentChain({ data: null, error: null }),
    );

    const result = await getFormatsForIntent('klubb');

    expect(result).toEqual([]);
  });

  it('kaster feil hvis Supabase-query feiler', async () => {
    fromMock.mockImplementation(() =>
      buildIntentChain({ data: null, error: { message: 'permission denied' } }),
    );

    await expect(getFormatsForIntent('kompis')).rejects.toThrow(
      'Failed to fetch formats for intent kompis',
    );
  });

  it('handterer formats-relasjon som array (PostgREST kant-tilfelle)', async () => {
    fromMock.mockImplementation(() =>
      buildIntentChain({
        data: [
          {
            format_slug: 'stableford',
            is_primary: true,
            sort_order: 10,
            formats: [
              {
                slug: 'stableford',
                display_name: 'Stableford',
                icon_key: 'stableford',
                short_description: 'Solo, poeng vs par.',
                is_active: true,
              },
            ],
          },
        ],
        error: null,
      }),
    );

    const result = await getFormatsForIntent('kompis');

    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe('stableford');
    expect(result[0].display_name).toBe('Stableford');
  });
});

describe('getCupEligibleFormats', () => {
  it('returner liste sortert på display_name', async () => {
    fromMock.mockImplementation(() =>
      buildCupChain({
        data: [
          {
            slug: 'foursomes_matchplay',
            display_name: 'Foursomes matchplay',
            icon_key: 'foursomes_matchplay',
            short_description: '2v2 alternate shot.',
          },
          {
            slug: 'singles_matchplay',
            display_name: 'Matchplay',
            icon_key: 'singles_matchplay',
            short_description: '1v1.',
          },
        ],
        error: null,
      }),
    );

    const result = await getCupEligibleFormats();

    expect(result).toHaveLength(2);
    expect(result[0].slug).toBe('foursomes_matchplay');
    expect(fromMock).toHaveBeenCalledWith('formats');
  });

  it('returner tom array når ingen cup-eligible formats finnes', async () => {
    fromMock.mockImplementation(() =>
      buildCupChain({ data: [], error: null }),
    );

    const result = await getCupEligibleFormats();

    expect(result).toEqual([]);
  });

  it('kaster feil hvis Supabase-query feiler', async () => {
    fromMock.mockImplementation(() =>
      buildCupChain({ data: null, error: { message: 'permission denied' } }),
    );

    await expect(getCupEligibleFormats()).rejects.toThrow(
      'Failed to fetch cup-eligible formats',
    );
  });
});
