import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GamePrize } from './prizes';

// The reference check reads other games through the service client.
const containsMock = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: () => ({
      select: () => ({
        neq: () => ({
          contains: (...args: unknown[]) => ({
            limit: () => containsMock(...args),
          }),
        }),
      }),
    }),
  }),
}));

import { removeReplacedSponsorLogos, replacedSponsorLogoPaths } from './sponsorLogoCleanup';

function prize(position: number, sponsorLogoPath: string | null): GamePrize {
  return { category: 'placement', position, description: 'Premie', sponsor: null, sponsorLogoPath };
}

function requestClient() {
  const remove = vi.fn(async (..._args: unknown[]) => ({ data: [], error: null }));
  return {
    remove,
    client: { storage: { from: vi.fn(() => ({ remove })) } },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  containsMock.mockResolvedValue({ data: [], error: null });
});

describe('replacedSponsorLogoPaths (audit 20.11, p11)', () => {
  it('gives the stored logos the saved prizes no longer use', () => {
    const before = [prize(1, 'u/a.webp'), prize(2, 'u/b.webp'), prize(3, null)];
    const after = [prize(1, 'u/a.webp'), prize(2, 'u/c.webp')];
    expect(replacedSponsorLogoPaths(before, after)).toEqual(['u/b.webp']);
  });

  it('gives nothing for unreadable stored prizes or a logo moved to another slot', () => {
    expect(replacedSponsorLogoPaths('not json', [])).toEqual([]);
    expect(replacedSponsorLogoPaths([prize(1, 'u/a.webp')], [prize(2, 'u/a.webp')])).toEqual([]);
  });
});

describe('removeReplacedSponsorLogos (audit 20.11, p11)', () => {
  it('removes a replaced logo no other game uses, through the request client', async () => {
    const { client, remove } = requestClient();
    await removeReplacedSponsorLogos({
      client: client as never,
      gameId: 'game-1',
      before: [prize(1, 'u/old.webp')],
      after: [prize(1, 'u/new.webp')],
    });
    expect(containsMock).toHaveBeenCalledWith('prizes', [{ sponsorLogoPath: 'u/old.webp' }]);
    expect(client.storage.from).toHaveBeenCalledWith('sponsor-logos');
    expect(remove).toHaveBeenCalledWith(['u/old.webp']);
  });

  it('keeps a logo another game still shows (a weekly repeat copies the prizes)', async () => {
    containsMock.mockResolvedValue({ data: [{ id: 'game-0' }], error: null });
    const { client, remove } = requestClient();
    await removeReplacedSponsorLogos({
      client: client as never,
      gameId: 'game-1',
      before: [prize(1, 'u/old.webp')],
      after: [],
    });
    expect(remove).not.toHaveBeenCalled();
  });

  it('keeps the logo when the check fails, and never throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    containsMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const { client, remove } = requestClient();
    await expect(
      removeReplacedSponsorLogos({
        client: client as never,
        gameId: 'game-1',
        before: [prize(1, 'u/old.webp')],
        after: [],
      }),
    ).resolves.toBeUndefined();
    expect(remove).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('does nothing when no logo was replaced', async () => {
    const { client, remove } = requestClient();
    await removeReplacedSponsorLogos({
      client: client as never,
      gameId: 'game-1',
      before: [prize(1, 'u/a.webp')],
      after: [prize(1, 'u/a.webp')],
    });
    expect(containsMock).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
});
