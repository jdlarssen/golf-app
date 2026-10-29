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

import { getFormatsForIntent } from './getFormatsForIntent';
import { compareStep2 } from './step2Order';

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

describe('getFormatsForIntent', () => {
  it('returner flat liste sortert med primary først, deretter sort_order', async () => {
    fromMock.mockImplementation(() =>
      buildIntentChain({
        data: [
          {
            format_slug: 'stableford',
            is_primary: true,
            sort_order: 10,
            formats: { slug: 'stableford', icon_key: 'stableford', is_active: true },
          },
          {
            format_slug: 'best_ball_netto',
            is_primary: true,
            sort_order: 20,
            formats: { slug: 'best_ball_netto', icon_key: 'best_ball_netto', is_active: true },
          },
          {
            format_slug: 'singles_matchplay',
            is_primary: false,
            sort_order: 40,
            formats: { slug: 'singles_matchplay', icon_key: 'singles_matchplay', is_active: true },
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

  it('asks the DB for the order compareStep2 gives, ties on sort_order included (#2347)', async () => {
    const chain = buildIntentChain({ data: [], error: null });
    fromMock.mockImplementation(() => chain);
    await getFormatsForIntent('kompis');

    // The DB sorts; Format-styring sorts with compareStep2. Same keys, same
    // directions, same order of keys.
    expect(chain.order.mock.calls).toEqual([
      ['is_primary', { ascending: false }],
      ['sort_order', { ascending: true }],
      ['format_slug', { ascending: true }],
    ]);
    const tied = [
      { slug: 'florida_scramble', is_primary: true, sort_order: 100 },
      { slug: 'texas_scramble', is_primary: false, sort_order: 30 },
      { slug: 'ambrose', is_primary: true, sort_order: 100 },
      { slug: 'wolf', is_primary: true, sort_order: 3 },
    ];
    // What those three ORDER BY keys give for the rows above.
    expect([...tied].sort(compareStep2).map((r) => r.slug)).toEqual([
      'wolf',
      'ambrose',
      'florida_scramble',
      'texas_scramble',
    ]);
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
});
