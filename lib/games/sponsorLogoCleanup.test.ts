import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PostgrestClient } from '@supabase/postgrest-js';
import type { GamePrize } from './prizes';

// The service client is faked with the REAL postgrest-js query builder and a
// mocked fetch, so the test sees the URL the library actually builds (an array
// passed to `.contains()` becomes a Postgres array literal, `cs.{…}`, which is
// invalid for a jsonb column; review of the first version of this file).
const fetchMock = vi.fn();
const removeMock = vi.fn(async (..._args: unknown[]) => ({ data: [], error: null }));
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => {
    const rest = new PostgrestClient('http://db.test/rest/v1', {
      fetch: (...args: Parameters<typeof fetch>) => fetchMock(...args),
    });
    return {
      from: (table: string) => rest.from(table),
      storage: { from: (bucket: string) => ({ bucket, remove: removeMock }) },
    };
  },
}));

import {
  removeReplacedSponsorLogos,
  removeUnusedSponsorLogos,
  replacedSponsorLogoPaths,
} from './sponsorLogoCleanup';

function prize(position: number, sponsorLogoPath: string | null): GamePrize {
  return { category: 'placement', position, description: 'Premie', sponsor: null, sponsorLogoPath };
}

function rows(data: unknown[], status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** The decoded query string of the n-th reference check. */
function checkQuery(n = 0): string {
  const url = new URL(String(fetchMock.mock.calls[n]![0]));
  return decodeURIComponent(url.search);
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockImplementation(async () => rows([]));
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

describe('removeUnusedSponsorLogos (audit 20.11, p11)', () => {
  it('asks for other games with a jsonb containment filter, not an array literal', async () => {
    await removeUnusedSponsorLogos({ gameId: 'game-1', ownerIds: ['u'], paths: ['u/old.webp'] });

    const q = checkQuery();
    expect(q).toContain('prizes=cs.[{"sponsorLogoPath":"u/old.webp"}]');
    expect(q).toContain('id=neq.game-1');
    expect(q).not.toContain('object Object');
    expect(removeMock).toHaveBeenCalledWith(['u/old.webp']);
  });

  it('keeps a logo another game still shows (a weekly repeat copies the prizes)', async () => {
    fetchMock.mockImplementation(async () => rows([{ id: 'game-0' }]));
    await removeUnusedSponsorLogos({ gameId: 'game-1', ownerIds: ['u'], paths: ['u/old.webp'] });
    expect(removeMock).not.toHaveBeenCalled();
  });

  it('keeps the logo when the check fails, and never throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockImplementation(async () =>
      rows({ message: 'boom' } as unknown as unknown[], 400),
    );
    await expect(
      removeUnusedSponsorLogos({ gameId: 'game-1', ownerIds: ['u'], paths: ['u/old.webp'] }),
    ).resolves.toBeUndefined();
    expect(removeMock).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('checks each path and removes only the unused ones', async () => {
    fetchMock.mockImplementation(async (input: unknown) =>
      String(input).includes('shared') ? rows([{ id: 'game-0' }]) : rows([]),
    );
    await removeUnusedSponsorLogos({ gameId: 'game-1', ownerIds: ['u'], paths: ['u/shared.webp', 'u/own.webp'] });
    expect(removeMock).toHaveBeenCalledWith(['u/own.webp']);
  });
});

describe('removeUnusedSponsorLogos — only the game\'s own folders (re-review)', () => {
  it('skips a path outside the owners\' folders and logs it, without asking the database', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    await removeUnusedSponsorLogos({
      gameId: 'game-1',
      ownerIds: ['creator-1', 'actor-1'],
      paths: ['someone-else/x.webp', 'creator-1/../someone-else/x.webp', '/creator-1/x.webp'],
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(removeMock).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      '[sponsorLogoCleanup] path outside the game\'s folders, kept',
      expect.objectContaining({ gameId: 'game-1' }),
    );
    consoleError.mockRestore();
  });

  it('removes files in the creator\'s and the actor\'s folders', async () => {
    await removeUnusedSponsorLogos({
      gameId: 'game-1',
      ownerIds: ['creator-1', 'actor-1', null],
      paths: ['creator-1/a.webp', 'actor-1/b.webp', 'other/c.webp'],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(removeMock).toHaveBeenCalledWith(['creator-1/a.webp', 'actor-1/b.webp']);
  });
});

describe('removeReplacedSponsorLogos (audit 20.11, p11)', () => {
  it('removes a replaced logo no other game uses', async () => {
    await removeReplacedSponsorLogos({
      gameId: 'game-1',
      ownerIds: ['u'],
      before: [prize(1, 'u/old.webp')],
      after: [prize(1, 'u/new.webp')],
    });
    expect(removeMock).toHaveBeenCalledWith(['u/old.webp']);
  });

  it('does nothing when no logo was replaced', async () => {
    await removeReplacedSponsorLogos({
      gameId: 'game-1',
      ownerIds: ['u'],
      before: [prize(1, 'u/a.webp')],
      after: [prize(1, 'u/a.webp')],
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(removeMock).not.toHaveBeenCalled();
  });
});
