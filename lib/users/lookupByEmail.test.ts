import { describe, it, expect, vi, beforeEach } from 'vitest';

const ilikeMock = vi.fn();
const maybeSingleMock = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: () => ({
      select: () => ({
        ilike: (...args: unknown[]) => {
          ilikeMock(...args);
          return {
            maybeSingle: maybeSingleMock,
          };
        },
      }),
    }),
  }),
}));

beforeEach(() => {
  ilikeMock.mockReset();
  maybeSingleMock.mockReset();
});

describe('lookupUserByEmail', () => {
  it('normaliserer e-post (lowercase + trim) før lookup', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: null });
    const { lookupUserByEmail } = await import('./lookupByEmail');
    await lookupUserByEmail('  Per@Example.COM  ');
    expect(ilikeMock).toHaveBeenCalledWith('email', 'per@example.com');
  });

  it('returnerer null for åpenbart ugyldig input (mangler @)', async () => {
    const { lookupUserByEmail } = await import('./lookupByEmail');
    expect(await lookupUserByEmail('ikke-en-epost')).toBeNull();
    expect(await lookupUserByEmail('')).toBeNull();
    expect(maybeSingleMock).not.toHaveBeenCalled();
  });

  it('returnerer brukerdata når match', async () => {
    maybeSingleMock.mockResolvedValueOnce({
      data: { id: 'u1', name: 'Per', email: 'per@example.com' },
      error: null,
    });
    const { lookupUserByEmail } = await import('./lookupByEmail');
    const result = await lookupUserByEmail('per@example.com');
    expect(result).toEqual({ id: 'u1', name: 'Per', email: 'per@example.com' });
  });

  it('logger og returnerer null ved DB-feil', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    maybeSingleMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'connection lost' },
    });
    const { lookupUserByEmail } = await import('./lookupByEmail');
    const result = await lookupUserByEmail('per@example.com');
    expect(result).toBeNull();
    expect(consoleErr).toHaveBeenCalledWith(
      '[lookupUserByEmail] lookup failed',
      expect.anything(),
    );
    consoleErr.mockRestore();
  });

  it('returnerer null hvis ingen rad funnet', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: null });
    const { lookupUserByEmail } = await import('./lookupByEmail');
    expect(await lookupUserByEmail('ukjent@example.com')).toBeNull();
  });
});
