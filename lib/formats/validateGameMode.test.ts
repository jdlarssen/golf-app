import { describe, it, expect, vi, beforeEach } from 'vitest';

type ChainResult = {
  data?: { slug: string } | null;
  error?: unknown;
};

const maybeSingleMock = vi.fn<() => Promise<ChainResult>>();

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: maybeSingleMock,
          }),
        }),
      }),
    }),
  }),
}));

import { isValidActiveGameMode } from './validateGameMode';

beforeEach(() => {
  maybeSingleMock.mockReset();
});

describe('isValidActiveGameMode', () => {
  it('returner true når slug refererer et aktivt format', async () => {
    maybeSingleMock.mockResolvedValue({ data: { slug: 'stableford' }, error: null });

    const result = await isValidActiveGameMode('stableford');

    expect(result).toBe(true);
  });

  it('returner false når slug ikke matcher noen format-rad', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    const result = await isValidActiveGameMode('wolf');

    expect(result).toBe(false);
  });

  it('returner false når formatet finnes men er inaktivt (data filtered by is_active)', async () => {
    // Query bruker .eq('is_active', true) — inaktiv slug returnerer null data.
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    const result = await isValidActiveGameMode('legacy_format');

    expect(result).toBe(false);
  });

  it('returner false ved query-feil (loggges, kaster ikke)', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    maybeSingleMock.mockResolvedValue({
      data: null,
      error: { message: 'connection error' },
    });

    const result = await isValidActiveGameMode('stableford');

    expect(result).toBe(false);
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});
