import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Audit 2026-11-20: a broken or hand-typed link to a cup or a league (an id
 * that is not a UUID) is «ikke funnet». Before, the id reached Postgres, which
 * answered 22P02, and the page showed the error screen.
 *
 * Each page must stop before its first read, so the data loaders here fail
 * the test if they are reached.
 */

class NotFound extends Error {}
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  notFound: () => {
    throw new NotFound('NEXT_NOT_FOUND');
  },
}));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: vi.fn(),
}));
const reached = vi.fn();
vi.mock('@/lib/cup/getCupSnapshot', () => ({
  getCupSnapshot: (...a: unknown[]) => reached('getCupSnapshot', ...a),
}));
vi.mock('@/lib/league/getLigaSnapshot', () => ({
  getLigaSnapshot: (...a: unknown[]) => reached('getLigaSnapshot', ...a),
}));
vi.mock('@/lib/league/markerReviewAccess', () => ({
  markerReviewAccess: (...a: unknown[]) => reached('markerReviewAccess', ...a),
}));
vi.mock('@/lib/auth/userId', () => ({
  getProxyVerifiedUserId: async () => 'viewer-1',
}));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => Object.assign((k: string) => k, { has: () => true }),
  getLocale: async () => 'no',
}));

const BAD = 'not-a-uuid';
const UUID = '6f1c2a3b-4d5e-4f60-8a71-92b3c4d5e6f7';

// Each page has its own Params type; the test only needs to call it.
type PageModule = { default: (props: never) => unknown };

const pages: Array<[string, () => Promise<PageModule>, Record<string, string>]> = [
  ['/cup/[id]', () => import('./page') as Promise<PageModule>, { id: BAD }],
  ['/cup/[id]/resultater', () => import('./resultater/page'), { id: BAD }],
  ['/cup/[id]/trekk', () => import('./trekk/page'), { id: BAD }],
  ['/liga/[id]', () => import('../../liga/[id]/page'), { id: BAD }],
  ['/liga/[id]/meld-av', () => import('../../liga/[id]/meld-av/page'), { id: BAD }],
  [
    '/liga/[id]/runde/[roundId]/spill (bad round)',
    () => import('../../liga/[id]/runde/[roundId]/spill/page'),
    { id: UUID, roundId: BAD },
  ],
  [
    '/liga/[id]/godkjenn/[gameId]/[userId] (bad game)',
    () => import('../../liga/[id]/godkjenn/[gameId]/[userId]/page'),
    { id: UUID, gameId: BAD, userId: UUID },
  ],
];

beforeEach(() => {
  reached.mockReset();
});

describe('a link with an id that is not a UUID is «not found»', () => {
  it.each(pages)('%s', async (_route, load, params) => {
    const page = await load();
    await expect(
      Promise.resolve().then(() =>
        page.default({ params: Promise.resolve(params), searchParams: Promise.resolve({}) } as never),
      ),
    ).rejects.toBeInstanceOf(NotFound);
    expect(reached).not.toHaveBeenCalled();
  });
});
