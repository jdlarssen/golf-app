// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * #2815: the card behind a cell in the season table, for the app. The HTTP
 * shape only: who may see the card is `leagueCardAccess` (tested in
 * lib/league/leagueCardAccess.test.ts). Here: no token is 401, a bad id or a
 * caller the gate refuses is 404, the 200 body is the server's card, and a
 * failed read is 500.
 */

const LEAGUE = '11111111-1111-4111-8111-111111111111';
const GAME = '22222222-2222-4222-8222-222222222222';
const PLAYER = '33333333-3333-4333-8333-333333333333';

let caller: string | null = 'mia';
const callerClient = { tag: 'caller-scoped' };
vi.mock('@/lib/api/appAuth', () => ({
  authenticatedUserId: async () => caller,
  callerScopedClient: () => callerClient,
}));
const leagueCardAccess = vi.fn();
const loadLeagueCard = vi.fn();
vi.mock('@/lib/league/leagueCardAccess', () => ({
  leagueCardAccess: (...args: unknown[]) => leagueCardAccess(...args),
  loadLeagueCard: (...args: unknown[]) => loadLeagueCard(...args),
}));

import { NextRequest } from 'next/server';
import { GET } from './route';

const CARD = {
  leagueId: LEAGUE,
  leagueName: 'Vinterliga',
  roundLabel: 'Runde 1',
  gameId: GAME,
  player: { userId: PLAYER, name: 'Anders Berg' },
  format: 'stroke',
  axis: 'net',
  playingHandicap: 2,
  value: 1,
  grid: {
    halves: [],
    totals: { played: 3, holeCount: 3, brutto: 14, netto: 12, points: null },
  },
};

const get = (ids: { id?: string; gameId?: string; userId?: string } = {}) =>
  GET(new NextRequest('https://tornygolf.no/api/liga/x'), {
    params: Promise.resolve({ id: ids.id ?? LEAGUE, gameId: ids.gameId ?? GAME, userId: ids.userId ?? PLAYER }),
  });

beforeEach(() => {
  caller = 'mia';
  leagueCardAccess.mockReset();
  loadLeagueCard.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/liga/[id]/kort/[gameId]/[userId]', () => {
  it('without a token → 401, before the gate', async () => {
    caller = null;
    const res = await get();
    expect({ status: res.status, body: await res.json(), gate: leagueCardAccess.mock.calls.length }).toEqual({
      status: 401,
      body: { error: 'unauthorized' },
      gate: 0,
    });
  });

  it.each([['id'], ['gameId'], ['userId']] as const)('a %s that is not a uuid → 404, before the gate', async (key) => {
    const res = await get({ [key]: 'nope' });
    expect({ status: res.status, gate: leagueCardAccess.mock.calls.length }).toEqual({ status: 404, gate: 0 });
  });

  it('a caller the gate refuses → 404, as if the card did not exist', async () => {
    leagueCardAccess.mockResolvedValue({ ok: false, reason: 'not_found' });
    const res = await get();
    expect({ status: res.status, body: await res.json(), loaded: loadLeagueCard.mock.calls.length }).toEqual({
      status: 404,
      body: { error: 'not_found' },
      loaded: 0,
    });
  });

  it('a counted card the table has no value for → 404', async () => {
    leagueCardAccess.mockResolvedValue({ ok: true });
    loadLeagueCard.mockResolvedValue(null);
    expect((await get()).status).toBe(404);
  });

  it('someone who may see the league gets the card, asked as the caller', async () => {
    const access = { ok: true, flight: { leagueId: LEAGUE } };
    leagueCardAccess.mockResolvedValue(access);
    loadLeagueCard.mockResolvedValue({ card: CARD, holes: [], teeGender: 'mens' });
    const res = await get();
    expect({ status: res.status, body: await res.json() }).toEqual({ status: 200, body: CARD });
    expect(leagueCardAccess).toHaveBeenCalledWith(callerClient, {
      callerId: 'mia',
      leagueId: LEAGUE,
      gameId: GAME,
      playerUserId: PLAYER,
    });
    expect(loadLeagueCard).toHaveBeenCalledWith(access);
  });

  it('a failed read → 500 load_failed, never 404', async () => {
    leagueCardAccess.mockRejectedValue(new Error('boom'));
    const res = await get();
    expect({ status: res.status, body: await res.json() }).toEqual({ status: 500, body: { error: 'load_failed' } });
  });
});
