// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAdminClientMock } from '@/lib/supabase/testing/adminClientMock';
import { osloParts } from '@/lib/format/teeOff';
import type { ClubStatsAggregate } from '@/lib/stats/getFinishedGameWins';

/**
 * Type A (#2259): Æresbrett-rutas port og transport.
 *
 * Adgangssjekken (`authenticatedUserId`) er den ekte. De to tellelesingene er
 * stubbet: utregningen har egne suiter (`lib/stats/*.test.ts`). Her er poenget at
 * ruta slipper bare riktig kaller gjennom, sender bare de fem radnøklene, merker
 * kallerens egen rad, og aldri lekker en feilmelding.
 */

const OSLO_YEAR = osloParts(new Date()).year;
const USER = 'spiller';
const TOKEN = 'token-spiller';

const fake = createAdminClientMock({
  tokens: { [TOKEN]: USER },
  respond: (op) => {
    throw new Error(`uventet spørring: ${op.kind} ${op.table}`);
  },
});

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => fake.client,
}));

const seasonWinsMock = vi.fn<() => Promise<{ season: number | null; wins: ClubStatsAggregate }>>();
vi.mock('@/lib/stats/getFinishedGameWins', () => ({
  getCurrentSeasonWins: () => seasonWinsMock(),
}));
const birdiesMock = vi.fn<(opts: { seasonYear: number }) => Promise<Array<[string, number]>>>();
vi.mock('@/lib/stats/getSeasonBirdies', () => ({
  getSeasonBirdies: (opts: { seasonYear: number }) => birdiesMock(opts),
}));

import { NextRequest } from 'next/server';
import { GET } from './route';

function request(token?: string) {
  const headers: Record<string, string> = {};
  if (token !== undefined) headers.authorization = token;
  return new NextRequest('http://localhost/api/aeresbrett', { headers });
}

const aggregate = (over: Partial<ClubStatsAggregate> = {}): ClubStatsAggregate => ({
  hasGames: true,
  winnerCounts: [
    ['u-anne', 4],
    [USER, 2],
  ],
  participationCounts: [
    ['u-anne', 9],
    [USER, 7],
  ],
  userNames: [
    ['u-anne', 'Anne Berg'],
    [USER, 'Kari Nordmann'],
  ],
  userNicknames: [],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
  seasonWinsMock.mockResolvedValue({ season: OSLO_YEAR, wins: aggregate() });
  birdiesMock.mockResolvedValue([
    ['u-anne', 3],
    [USER, 5],
  ]);
});

describe('porten', () => {
  it('uten Authorization-header: 401, ingenting leses', async () => {
    const res = await GET(request());

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' });
    expect(seasonWinsMock).not.toHaveBeenCalled();
    expect(birdiesMock).not.toHaveBeenCalled();
  });

  it('med et token GoTrue avviser: 401, ingenting leses', async () => {
    const res = await GET(request('Bearer utgatt-token'));

    expect(res.status).toBe(401);
    expect(seasonWinsMock).not.toHaveBeenCalled();
  });
});

describe('GET — svaret', () => {
  it('200 med tre brett, og kallerens egen rad merket', async () => {
    const res = await GET(request(`Bearer ${TOKEN}`));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.seasonYear).toBe(OSLO_YEAR);
    expect(body.boards.wins.rows.map((r: { name: string; isViewer: boolean }) => [r.name, r.isViewer])).toEqual([
      ['Anne B.', false],
      ['Kari N.', true],
    ]);
    expect(body.boards.wins.leader.name).toBe('Anne B.');
    expect(body.boards.wins.me).toEqual({ place: 2, count: 2, toTop5: null });
    // Birdier: kalleren (5) leder foran Anne (3), så det finnes en egen leder-plass 1 i lista.
    expect(body.boards.birdies.rows[0]).toMatchObject({ name: 'Kari N.', place: 1, isViewer: true });
    expect(body.boards.rounds.rows[0]).toMatchObject({ name: 'Anne B.', count: 9 });
    expect(birdiesMock).toHaveBeenCalledWith({ seasonYear: OSLO_YEAR });
  });

  it('sender bare de fem radnøklene: ingen id-er, spill, datoer eller slag', async () => {
    const body = await (await GET(request(`Bearer ${TOKEN}`))).json();

    for (const board of [body.boards.wins, body.boards.birdies, body.boards.rounds]) {
      for (const row of board.rows) {
        expect(Object.keys(row).sort()).toEqual(['count', 'initials', 'isViewer', 'name', 'place']);
      }
    }
    const raw = JSON.stringify(body);
    expect(raw).not.toContain('u-anne');
    expect(raw).not.toContain(USER);
  });

  it('en tom sesong (ingen ferdige runder i år eller i fjor): 200 med tomme brett og uten birdie-lesing', async () => {
    seasonWinsMock.mockResolvedValue({ season: null, wins: aggregate({ hasGames: false, winnerCounts: [], participationCounts: [] }) });

    const res = await GET(request(`Bearer ${TOKEN}`));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.seasonYear).toBeNull();
    expect(body.boards.wins).toEqual({ rows: [], me: null, leader: null });
    expect(body.boards.birdies).toEqual({ rows: [], me: null });
    expect(birdiesMock).not.toHaveBeenCalled();
  });

  it('en sesong fra i fjor er avsluttet', async () => {
    seasonWinsMock.mockResolvedValue({ season: OSLO_YEAR - 1, wins: aggregate() });

    const body = await (await GET(request(`Bearer ${TOKEN}`))).json();

    expect(body.seasonOver).toBe(true);
  });
});

describe('feil under panseret', () => {
  it('feiler bare birdie-lesingen: 200 med birdies null, de andre fanene står', async () => {
    birdiesMock.mockRejectedValue(new Error('season birdies scores: page 1 failed: boom'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await GET(request(`Bearer ${TOKEN}`));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.boards.birdies).toBeNull();
    expect(body.boards.wins.rows).toHaveLength(2);
    expect(errorSpy).toHaveBeenCalledWith('[api/aeresbrett] birdies failed', expect.any(Error));
    errorSpy.mockRestore();
  });

  it('feiler seierslesingen: 500 med en ugjennomsiktig kode, og logges', async () => {
    seasonWinsMock.mockRejectedValue(new Error('club stats games: page 1 failed: permission denied'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await GET(request(`Bearer ${TOKEN}`));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'load_failed' });
    expect(errorSpy).toHaveBeenCalledWith('[api/aeresbrett] load failed', expect.any(Error));
    errorSpy.mockRestore();
  });
});
