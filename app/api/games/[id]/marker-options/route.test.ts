// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';
import type { LeagueFlight } from '@/lib/league/leagueFlight';

/**
 * #2661: the marker picker for the app, the HTTP shape. 401 without a token,
 * 404 for someone not playing the game, 400 for a malformed `alsoFor`,
 * `required: false` outside a simulator league and the list inside one.
 *
 * #2814: the list is read for real (`loadMarkerChoice` over the admin client),
 * so the route proves what the app gets: the flightmates first, then the rest
 * of the league, and no picker for a card a flightmate kept and marks.
 */

const GAME = '22222222-2222-4222-8222-222222222222';
const MATE = '33333333-3333-4333-8333-333333333333';

let caller: string | null = 'anders';
vi.mock('@/lib/api/appAuth', () => ({ authenticatedUserId: async () => caller }));
let admin: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => admin }));
vi.mock('@/lib/league/leagueFlight');

import { NextRequest } from 'next/server';
import { readSimulatorLeagueFlight } from '@/lib/league/leagueFlight';
import { GET } from './route';

const FLIGHT: LeagueFlight = {
  gameId: GAME,
  roundId: 'r1',
  roundLabel: 'Runde 1',
  leagueId: 'l1',
  leagueName: 'Vinterliga',
  isSimulator: true,
  leagueCreatorId: 'org',
};
const ME = { data: { user_id: 'anders' } };
const MEMBERS = {
  data: [
    { user_id: 'anders', users: { name: 'Anders', nickname: null } },
    { user_id: 'berit', users: { name: 'Berit', nickname: null } },
    { user_id: 'arne', users: { name: 'Arne', nickname: null } },
  ],
};
const row = (user_id: string, over: Record<string, unknown> = {}) => ({
  user_id,
  submitted_at: null,
  marker_user_id: null,
  rejection_reason: null,
  handed_over_at: null,
  withdrawn_at: null,
  ...over,
});

const get = (query = '') =>
  GET(new NextRequest(`https://tornygolf.no/api/games/${GAME}/marker-options${query}`), {
    params: Promise.resolve({ id: GAME }),
  });

beforeEach(() => {
  caller = 'anders';
  vi.mocked(readSimulatorLeagueFlight).mockResolvedValue(FLIGHT);
  admin = buildSupabaseMock([ME]);
});

describe('GET /api/games/[id]/marker-options', () => {
  it('without a token → 401', async () => {
    caller = null;
    expect((await get()).status).toBe(401);
  });

  it('someone not playing the game → 404, and no names are read', async () => {
    admin = buildSupabaseMock([{ data: null }]);
    const res = await get();
    expect({
      status: res.status,
      read: admin.__fromCalls.some((c) => c.table === 'league_players'),
    }).toEqual({ status: 404, read: false });
  });

  it('a malformed alsoFor → 400', async () => {
    expect((await get('?alsoFor=nope')).status).toBe(400);
  });

  it('outside a simulator league → required: false', async () => {
    vi.mocked(readSimulatorLeagueFlight).mockResolvedValue(null);
    const res = await get();
    expect(await res.json()).toEqual({ required: false });
  });

  it('the one who kept the flight\'s cards: the flightmate first, then the rest of the league', async () => {
    admin = buildSupabaseMock([ME, MEMBERS, { data: [row('anders'), row('berit')] }]);
    const res = await get(`?alsoFor=${MATE}`);
    expect({ status: res.status, body: await res.json() }).toEqual({
      status: 200,
      body: {
        required: true,
        options: [
          { userId: 'berit', name: 'Berit' },
          { userId: 'arne', name: 'Arne' },
        ],
      },
    });
  });

  it('a card a flightmate kept and marks → required: false', async () => {
    caller = 'berit';
    admin = buildSupabaseMock([
      { data: { user_id: 'berit' } },
      MEMBERS,
      {
        data: [
          row('anders', { submitted_at: '2026-11-10T18:00:00Z', marker_user_id: 'berit' }),
          row('berit', { marker_user_id: 'anders', handed_over_at: '2026-11-10T18:00:01Z' }),
        ],
      },
    ]);
    const res = await get();
    expect({ status: res.status, body: await res.json() }).toEqual({
      status: 200,
      body: { required: false, marker: { reason: 'handedOver', userId: 'anders', name: 'Anders' } },
    });
  });

  it('a card its marker sent back → no picker, and who it goes back to', async () => {
    admin = buildSupabaseMock([
      ME,
      MEMBERS,
      { data: [row('anders', { marker_user_id: 'arne', rejection_reason: 'hull 3' }), row('berit')] },
    ]);
    expect(await (await get()).json()).toEqual({
      required: false,
      marker: { reason: 'returned', userId: 'arne', name: 'Arne' },
    });
  });

  it('a delivered card → required: false', async () => {
    admin = buildSupabaseMock([ME, MEMBERS, { data: [row('anders', { submitted_at: '2026-11-10T18:00:00Z' })] }]);
    expect(await (await get()).json()).toEqual({ required: false });
  });
});
