import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSupabaseMock, makeLocaleRedirectMock } from '@/tests/serverActionMocks';
import { NoRowsAffectedError } from '@/lib/supabase/affectedRows';

/**
 * confirmHandicap (#2280): «Ja, stemmer» on the stale-handicap card must
 * confirm that exactly one users row was written. A 0-row write is logged,
 * not thrown — the card simply stays put, which is the player's signal.
 */

const redirectMock = makeLocaleRedirectMock();
vi.mock('@/i18n/navigation', () => ({
  redirect: (arg: { href: string; locale?: string } | string) => redirectMock(arg),
}));
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'no',
}));

const revalidatePathMock = vi.fn();
vi.mock('@/lib/i18n/revalidateLocalePath', () => ({
  revalidatePath: (path: string) => revalidatePathMock(path),
}));

let serverMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => serverMock,
}));

const USER_ID = '11111111-1111-1111-1111-111111111111';
const GAME_ID = '22222222-2222-2222-2222-222222222222';

function authedWithUpdateResult(result: { data: unknown; error: unknown }): void {
  serverMock = buildSupabaseMock([result]);
  (serverMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { user: { id: USER_ID } },
  });
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe('confirmHandicap', () => {
  it('a 0-row write is logged with [confirmHandicap], not thrown', async () => {
    authedWithUpdateResult({ data: [], error: null });
    const { confirmHandicap } = await import('./actions');

    await expect(confirmHandicap(GAME_ID)).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      '[confirmHandicap] update failed',
      expect.any(NoRowsAffectedError),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith(`/games/${GAME_ID}`);
  });

  it('one row written → no error, own row only, id selected back', async () => {
    authedWithUpdateResult({ data: [{ id: USER_ID }], error: null });
    const { confirmHandicap } = await import('./actions');

    await confirmHandicap(GAME_ID);

    expect(errorSpy).not.toHaveBeenCalled();
    const calls = serverMock.__fromCalls.filter((c) => c.table === 'users');
    expect(calls).toContainEqual({ table: 'users', method: 'eq', args: ['id', USER_ID] });
    expect(calls).toContainEqual({ table: 'users', method: 'select', args: ['id'] });
    expect(revalidatePathMock).toHaveBeenCalledWith(`/games/${GAME_ID}`);
  });
});
