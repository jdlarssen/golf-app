// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

/**
 * #2661: the marker picker for the app, the HTTP shape only. The candidates
 * are `loadMarkerChoice` (the rule is `markerCandidates`); here: 401 without a
 * token, 404 for someone not playing the game, 400 for a malformed `alsoFor`,
 * `required: false` outside a simulator league and the list inside one.
 */

const GAME = '22222222-2222-4222-8222-222222222222';
const MATE = '33333333-3333-4333-8333-333333333333';

let caller: string | null = 'anders';
vi.mock('@/lib/api/appAuth', () => ({ authenticatedUserId: async () => caller }));
let admin: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => admin }));
const loadMarkerChoice = vi.fn();
vi.mock('@/lib/league/setFlightMarkerCore', () => ({
  loadMarkerChoice: (...args: unknown[]) => loadMarkerChoice(...args),
}));

import { NextRequest } from 'next/server';
import { GET } from './route';

const get = (query = '') =>
  GET(new NextRequest(`https://tornygolf.no/api/games/${GAME}/marker-options${query}`), {
    params: Promise.resolve({ id: GAME }),
  });

beforeEach(() => {
  caller = 'anders';
  loadMarkerChoice.mockReset();
  admin = buildSupabaseMock([{ data: { user_id: 'anders' } }]);
});

describe('GET /api/games/[id]/marker-options', () => {
  it('without a token → 401', async () => {
    caller = null;
    expect((await get()).status).toBe(401);
  });

  it('someone not playing the game → 404, and no names are read', async () => {
    admin = buildSupabaseMock([{ data: null }]);
    const res = await get();
    expect({ status: res.status, read: loadMarkerChoice.mock.calls.length }).toEqual({ status: 404, read: 0 });
  });

  it('a malformed alsoFor → 400', async () => {
    expect((await get('?alsoFor=nope')).status).toBe(400);
  });

  it('outside a simulator league → required: false', async () => {
    loadMarkerChoice.mockResolvedValue(null);
    const res = await get();
    expect(await res.json()).toEqual({ required: false });
  });

  it('in a simulator league → the candidates, without the cards in the delivery', async () => {
    loadMarkerChoice.mockResolvedValue({ flight: {}, options: [{ userId: 'mia', name: 'Mia' }] });
    const res = await get(`?alsoFor=${MATE}`);
    expect({ status: res.status, body: await res.json() }).toEqual({
      status: 200,
      body: { required: true, options: [{ userId: 'mia', name: 'Mia' }] },
    });
    expect(loadMarkerChoice).toHaveBeenCalledWith(GAME, 'anders', ['anders', MATE]);
  });
});
