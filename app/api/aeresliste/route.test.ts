// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAdminClientMock } from '@/lib/supabase/testing/adminClientMock';
import type { RareShotsAllTime } from '@/lib/stats/getRareShotsAllTime';

/**
 * Type A (#2894 PR 2): Æreslista-rutas port og transport.
 *
 * Adgangssjekken (`authenticatedUserId`) og lesingen av hvem som har sagt nei til «Del
 * sjeldne slag med alle» er de ekte; lesingen av slagene er stubbet (egen suite i
 * `lib/stats/getRareShotsAllTime.test.ts`). Poenget: bare riktig kaller slipper gjennom,
 * svaret har bare de åtte radnøklene, den som har sagt nei er borte, og en feil lekker
 * aldri en melding.
 */

const USER = 'spiller';
const TOKEN = 'token-spiller';

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
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));

const shotsMock = vi.fn<() => Promise<RareShotsAllTime>>();
vi.mock('@/lib/stats/getRareShotsAllTime', () => ({ getRareShotsAllTime: () => shotsMock() }));

import { NextRequest } from 'next/server';
import { GET } from './route';

function request(token?: string) {
  const headers: Record<string, string> = {};
  if (token !== undefined) headers.authorization = token;
  return new NextRequest('http://localhost/api/aeresliste', { headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
  optOutRows = [];
  optOutError = null;
  shotsMock.mockResolvedValue({
    moments: [
      { kind: 'albatross', userId: 'u-anne', hole: 12, courseName: 'Holtsmark', playedOn: '2024-08-17' },
      { kind: 'hole_in_one', userId: USER, hole: 3, courseName: 'Bogstad', playedOn: '2026-09-21' },
    ],
    names: [
      ['u-anne', 'Anne Berg'],
      [USER, 'Kari Nordmann'],
    ],
    nicknames: [],
  });
});

describe('porten', () => {
  it('uten Authorization-header: 401, ingenting leses', async () => {
    const res = await GET(request());

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' });
    expect(shotsMock).not.toHaveBeenCalled();
    expect(fake.ops.filter((op) => op.table === 'notification_preferences')).toEqual([]);
  });

  it('med et token GoTrue avviser: 401, ingenting leses', async () => {
    const res = await GET(request('Bearer utgatt-token'));

    expect(res.status).toBe(401);
    expect(shotsMock).not.toHaveBeenCalled();
  });
});

describe('GET — svaret', () => {
  it('200 med slagene nyeste først, kallerens eget merket', async () => {
    const res = await GET(request(`Bearer ${TOKEN}`));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rows.map((r: { name: string; kind: string; isViewer: boolean }) => [r.name, r.kind, r.isViewer])).toEqual([
      ['Kari N.', 'hole_in_one', true],
      ['Anne B.', 'albatross', false],
    ]);
  });

  it('sender bare de åtte radnøklene: ingen id-er, spill, slag eller tee', async () => {
    const body = await (await GET(request(`Bearer ${TOKEN}`))).json();

    for (const row of body.rows) {
      expect(Object.keys(row).sort()).toEqual(['courseName', 'hole', 'initials', 'isViewer', 'key', 'kind', 'name', 'playedOn']);
    }
    expect(Object.keys(body)).toEqual(['rows']);
    const raw = JSON.stringify(body);
    expect(raw).not.toContain('u-anne');
    expect(raw).not.toContain(USER);
  });

  it('en spiller som har sagt nei, står ikke på lista', async () => {
    optOutRows = [{ user_id: 'u-anne' }];

    const body = await (await GET(request(`Bearer ${TOKEN}`))).json();

    expect(body.rows.map((r: { name: string }) => r.name)).toEqual(['Kari N.']);
    const read = fake.ops.find((op) => op.table === 'notification_preferences');
    expect(read?.filters).toEqual([{ op: 'eq', column: 'share_rare_shots', value: false }]);
  });

  it('har kalleren selv sagt nei, ser heller ikke kalleren sitt eget slag', async () => {
    optOutRows = [{ user_id: USER }];

    const body = await (await GET(request(`Bearer ${TOKEN}`))).json();

    expect(body.rows.map((r: { name: string }) => r.name)).toEqual(['Anne B.']);
  });
});

describe('feil under panseret', () => {
  it('feiler lesingen av valget: 500 med fast kode, ingen liste med noen som har sagt nei', async () => {
    optOutError = { message: 'permission denied' };
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await GET(request(`Bearer ${TOKEN}`));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'load_failed' });
    expect(errorSpy).toHaveBeenCalledWith('[api/aeresliste] load failed', expect.any(Error));
    errorSpy.mockRestore();
  });

  it('feiler lesingen av slagene: 500 med fast kode, og logges', async () => {
    shotsMock.mockRejectedValue(new Error('rare shots scores: page 1 failed: boom'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await GET(request(`Bearer ${TOKEN}`));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'load_failed' });
    errorSpy.mockRestore();
  });
});
