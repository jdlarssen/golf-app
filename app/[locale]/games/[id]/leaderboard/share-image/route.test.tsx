// @vitest-environment node
/**
 * Route test for the result-card gate (#2312). The card is read with the
 * service role, so this route IS the access check: the sharer comes from the
 * session only (never `?p=`), no session → 404, unfinished game → 404.
 *
 * Mocked at the boundaries only: proxy identity, the cached game read, the
 * admin client, next/og and fonts, plus the two DB readers. buildShareCardData
 * runs for real on the mocked mode result.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAdminClientMock } from '@/lib/supabase/testing/adminClientMock';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { getGameWithPlayers } from '@/lib/games/getGameWithPlayers';
import { buildModeResultForGame } from '@/lib/scoring/buildModeResultForGame';
import { computeSharerSideAwards } from '@/lib/games/computeSharerSideAwards';

vi.mock('@/lib/auth/userId', () => ({ getProxyVerifiedUserId: vi.fn() }));
vi.mock('@/lib/games/getGameWithPlayers', () => ({ getGameWithPlayers: vi.fn() }));
vi.mock('@/lib/scoring/buildModeResultForGame', () => ({ buildModeResultForGame: vi.fn() }));
vi.mock('@/lib/games/computeSharerSideAwards', () => ({ computeSharerSideAwards: vi.fn() }));
vi.mock('@/lib/og/fonts', () => ({
  loadFonts: async () => ({ fonts: [], hasFraunces: false, hasInter: false }),
}));
vi.mock('next/og', () => ({
  ImageResponse: class extends Response {
    constructor() {
      super('png', { status: 200 });
    }
  },
}));

const fake = createAdminClientMock({ respond: () => ({ data: null }) });
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));

import { GET } from './route';

const GAME_ID = 'game-1';

function mockGame(overrides: Record<string, unknown> = {}) {
  vi.mocked(getGameWithPlayers).mockResolvedValue({
    game: {
      id: GAME_ID,
      name: 'Fredagsrunden',
      status: 'finished',
      course_id: 'course-1',
      game_mode: 'solo_strokeplay',
      mode_config: {},
      hole_segment: null,
      source_game_id: null,
      side_tournament_enabled: false,
      ...overrides,
    },
    players: [
      { user_id: 'user-a', users: { name: 'Anna', nickname: null, is_guest: false } },
      { user_id: 'user-b', users: { name: 'Bjørn', nickname: null, is_guest: false } },
    ],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

function callRoute(query = '') {
  return GET(
    new Request(`https://tornygolf.no/no/games/${GAME_ID}/leaderboard/share-image${query}`),
    { params: Promise.resolve({ locale: 'no', id: GAME_ID }) },
  );
}

describe('share-image route gate (#2312)', () => {
  beforeEach(() => {
    vi.mocked(getProxyVerifiedUserId).mockReset();
    vi.mocked(getGameWithPlayers).mockReset();
    vi.mocked(buildModeResultForGame).mockReset().mockResolvedValue(null);
    vi.mocked(computeSharerSideAwards).mockReset().mockResolvedValue([]);
  });

  it('answers 404 without a session and never reads the game', async () => {
    vi.mocked(getProxyVerifiedUserId).mockResolvedValue(null);
    mockGame();

    const res = await callRoute();

    expect(res.status).toBe(404);
    expect(getGameWithPlayers).not.toHaveBeenCalled();
  });

  it('personalises for the signed-in user, ignoring ?p=', async () => {
    vi.mocked(getProxyVerifiedUserId).mockResolvedValue('user-a');
    mockGame();
    vi.mocked(buildModeResultForGame).mockResolvedValue({
      kind: 'solo_strokeplay',
      ranking: 'net_total',
      holes: [],
      players: [
        { userId: 'user-a', totalNetStrokes: 70, totalGrossStrokes: 74, holesPlayed: 18, netToPar: -2, rank: 1, tiedWith: [] },
        { userId: 'user-b', totalNetStrokes: 72, totalGrossStrokes: 76, holesPlayed: 18, netToPar: 0, rank: 2, tiedWith: [] },
      ],
    });

    const res = await callRoute('?p=user-b');

    expect(res.status).toBe(200);
    expect(computeSharerSideAwards).toHaveBeenCalledTimes(1);
    expect(vi.mocked(computeSharerSideAwards).mock.calls[0][2]).toBe('user-a');
  });

  it('answers 404 for a game that is not finished', async () => {
    vi.mocked(getProxyVerifiedUserId).mockResolvedValue('user-a');
    mockGame({ status: 'active' });

    const res = await callRoute();

    expect(res.status).toBe(404);
    expect(buildModeResultForGame).not.toHaveBeenCalled();
  });

  it('passes the hole segment and source game to the mode result (#2217)', async () => {
    vi.mocked(getProxyVerifiedUserId).mockResolvedValue('user-a');
    mockGame({ hole_segment: 'back9', source_game_id: 'host-game' });

    const res = await callRoute();

    expect(res.status).toBe(200);
    expect(vi.mocked(buildModeResultForGame).mock.calls[0][1]).toMatchObject({
      id: GAME_ID,
      hole_segment: 'back9',
      source_game_id: 'host-game',
    });
  });
});
