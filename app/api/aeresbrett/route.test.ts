// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAdminClientMock } from '@/lib/supabase/testing/adminClientMock';
import { osloParts } from '@/lib/format/teeOff';
import type { ClubStatsAggregate } from '@/lib/stats/getFinishedGameWins';
import type { SeasonStrokes } from '@/lib/stats/getSeasonStrokes';

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

// #2894: the one real read left in the route is who said no to «Del sjeldne slag med alle».
let optOutRows: Array<{ user_id: string }> = [];
let optOutError: { message: string } | null = null;
const fake = createAdminClientMock({
  tokens: { [TOKEN]: USER },
  respond: (op) => {
    if (op.kind === 'select' && op.table === 'notification_preferences') {
      return optOutError ? { error: optOutError } : { data: optOutRows };
    }
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
const strokesMock = vi.fn<(opts: { seasonYear: number }) => Promise<SeasonStrokes>>();
vi.mock('@/lib/stats/getSeasonStrokes', () => ({
  getSeasonStrokes: (opts: { seasonYear: number }) => strokesMock(opts),
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
  optOutRows = [];
  optOutError = null;
  seasonWinsMock.mockResolvedValue({ season: OSLO_YEAR, wins: aggregate() });
  strokesMock.mockResolvedValue({
    birdies: [
      ['u-anne', 3],
      [USER, 5],
    ],
    moments: [
      { kind: 'eagle', userId: 'u-anne', hole: 7, courseName: 'Bogstad', playedOn: '2026-06-12' },
      { kind: 'hole_in_one', userId: USER, hole: 3, courseName: 'Holtsmark', playedOn: '2026-08-02' },
    ],
  });
});

describe('porten', () => {
  it('uten Authorization-header: 401, ingenting leses', async () => {
    const res = await GET(request());

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' });
    expect(seasonWinsMock).not.toHaveBeenCalled();
    expect(strokesMock).not.toHaveBeenCalled();
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
    expect(strokesMock).toHaveBeenCalledWith({ seasonYear: OSLO_YEAR });
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

  it('sender «Sjeldne slag» med navn, hull, bane og dato, og aldri id-er, spill eller slag', async () => {
    const body = await (await GET(request(`Bearer ${TOKEN}`))).json();

    expect(body.moments).toEqual([
      { kind: 'hole_in_one', name: 'Kari N.', initials: 'KN', isViewer: true, hole: 3, courseName: 'Holtsmark', playedOn: '2026-08-02' },
      { kind: 'eagle', name: 'Anne B.', initials: 'AB', isViewer: false, hole: 7, courseName: 'Bogstad', playedOn: '2026-06-12' },
    ]);
    for (const m of body.moments) {
      expect(Object.keys(m).sort()).toEqual(['courseName', 'hole', 'initials', 'isViewer', 'kind', 'name', 'playedOn']);
    }
    expect(JSON.stringify(body.moments)).not.toContain('u-anne');
  });

  it('en tom sesong (ingen ferdige runder i år eller i fjor): 200 med tomme brett og uten birdie-lesing', async () => {
    seasonWinsMock.mockResolvedValue({ season: null, wins: aggregate({ hasGames: false, winnerCounts: [], participationCounts: [] }) });

    const res = await GET(request(`Bearer ${TOKEN}`));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.seasonYear).toBeNull();
    expect(body.boards.wins).toEqual({ rows: [], me: null, leader: null });
    expect(body.boards.birdies).toEqual({ rows: [], me: null });
    expect(body.moments).toEqual([]);
    expect(strokesMock).not.toHaveBeenCalled();
  });

  it('en sesong fra i fjor er avsluttet', async () => {
    seasonWinsMock.mockResolvedValue({ season: OSLO_YEAR - 1, wins: aggregate() });

    const body = await (await GET(request(`Bearer ${TOKEN}`))).json();

    expect(body.seasonOver).toBe(true);
  });
});

describe('«Del sjeldne slag med alle» (#2894)', () => {
  it('leser bare dem som har sagt nei, med service-rollen', async () => {
    await GET(request(`Bearer ${TOKEN}`));

    const reads = fake.ops.filter((op) => op.table === 'notification_preferences');
    expect(reads).toHaveLength(1);
    expect(reads[0]).toMatchObject({ kind: 'select', columns: 'user_id' });
    expect(reads[0].filters).toEqual([{ op: 'eq', column: 'share_rare_shots', value: false }]);
  });

  it('en spiller som har sagt nei, står ikke i «Sjeldne slag», men står på brettene', async () => {
    optOutRows = [{ user_id: 'u-anne' }];

    const body = await (await GET(request(`Bearer ${TOKEN}`))).json();

    expect(body.moments.map((m: { name: string }) => m.name)).toEqual(['Kari N.']);
    expect(body.boards.birdies.rows.map((r: { name: string }) => r.name)).toContain('Anne B.');
    expect(body.boards.wins.rows.map((r: { name: string }) => r.name)).toContain('Anne B.');
  });

  it('har kalleren selv sagt nei, ser heller ikke kalleren sitt eget slag', async () => {
    optOutRows = [{ user_id: USER }];

    const body = await (await GET(request(`Bearer ${TOKEN}`))).json();

    expect(body.moments.map((m: { name: string }) => m.name)).toEqual(['Anne B.']);
  });

  it('feiler lesingen av valget: moments null (kortet sier fra), birdies og brettene står', async () => {
    optOutError = { message: 'permission denied' };
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await GET(request(`Bearer ${TOKEN}`));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.moments).toBeNull();
    expect(body.boards.birdies.rows).toHaveLength(2);
    expect(errorSpy).toHaveBeenCalledWith('[api/aeresbrett] rare shot opt-outs failed', expect.any(Error));
    errorSpy.mockRestore();
  });
});

describe('feil under panseret', () => {
  it('feiler lesingen av slagene: 200 med birdies og moments null, de to andre fanene står', async () => {
    strokesMock.mockRejectedValue(new Error('season strokes scores: page 1 failed: boom'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await GET(request(`Bearer ${TOKEN}`));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.boards.birdies).toBeNull();
    expect(body.moments).toBeNull();
    expect(body.boards.wins.rows).toHaveLength(2);
    expect(body.boards.rounds.rows).toHaveLength(2);
    expect(errorSpy).toHaveBeenCalledWith('[api/aeresbrett] strokes failed', expect.any(Error));
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
