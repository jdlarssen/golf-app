// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAdminClientMock } from '@/lib/supabase/testing/adminClientMock';
import type { KavalkadeView } from '@/lib/kavalkade/getOrCreateKavalkade';
import type { KavalkadeFacts } from '@/lib/kavalkade/buildKavalkadeFacts';

/**
 * Type A (#2265): kavalkade-rutas port og transport.
 *
 * Adgangssjekken (`authenticatedUserId`) er den ekte. `getOrCreateKavalkade`
 * er stubbet: de tre tilstandene, kappløpet og modellkallet har sin egen suite
 * (`lib/kavalkade/getOrCreateKavalkade.test.ts`). Her er poenget at ruta slipper
 * bare riktig år og riktig kaller gjennom, sender svaret uendret, og aldri
 * lekker en feilmelding.
 */

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
const getOrCreateMock = vi.fn<(userId: string) => Promise<KavalkadeView>>();
vi.mock('@/lib/kavalkade/getOrCreateKavalkade', () => ({
  getOrCreateKavalkade: (userId: string) => getOrCreateMock(userId),
}));

import { NextRequest } from 'next/server';
import { GET, maxDuration } from './route';

function request(year: string, token?: string) {
  const headers: Record<string, string> = {};
  if (token !== undefined) headers.authorization = token;
  return new NextRequest(`http://localhost/api/kavalkade/${year}`, { headers });
}

const ctx = (year: string) => ({ params: Promise.resolve({ year }) });

/** Ruta ser aldri inni fakta, så en markør er nok til å bevise at de går uendret. */
const FACTS = { year: 2026, marker: 'fakta-fra-kjernen' } as unknown as KavalkadeFacts;

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
});

describe('porten', () => {
  it('uten Authorization-header: 401, kavalkaden røres ikke', async () => {
    const res = await GET(request('2026'), ctx('2026'));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' });
    expect(fake.getUserCalls).toEqual([]);
    expect(getOrCreateMock).not.toHaveBeenCalled();
  });

  it('med et token GoTrue avviser: 401', async () => {
    const res = await GET(request('2026', 'Bearer utgatt-token'), ctx('2026'));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' });
    expect(getOrCreateMock).not.toHaveBeenCalled();
  });

  it.each(['2025', '2027', 'abc', '2026.5'])(
    'året %s finnes ikke: 404, kavalkaden røres ikke',
    async (year) => {
      const res = await GET(request(year, `Bearer ${TOKEN}`), ctx(year));

      expect(res.status).toBe(404);
      await expect(res.json()).resolves.toEqual({ error: 'not_found' });
      expect(getOrCreateMock).not.toHaveBeenCalled();
    },
  );
});

describe('GET — svaret', () => {
  it.each<[string, KavalkadeView]>([
    ['closed', { status: 'closed', opensAt: '2026-12-23T23:00:00.000Z' }],
    ['preview', { status: 'preview', facts: FACTS }],
    [
      'ready',
      {
        status: 'ready',
        facts: FACTS,
        narrative: 'Året ditt på banen.',
        generatedAt: '2026-12-24T08:00:00.000Z',
      },
    ],
    [
      'ready uten innledning',
      { status: 'ready', facts: FACTS, narrative: null, generatedAt: '2026-12-24T08:00:00.000Z' },
    ],
  ])('%s: 200 med kjernens svar uendret', async (_navn, view) => {
    getOrCreateMock.mockResolvedValue(view);

    const res = await GET(request('2026', `Bearer ${TOKEN}`), ctx('2026'));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(view);
    // Kalleren kommer fra tokenet.
    expect(getOrCreateMock).toHaveBeenCalledWith(USER);
  });

  it('gir førsteåpningen tid til å vente på modellen', () => {
    expect(maxDuration).toBe(60);
  });
});

describe('feil under panseret', () => {
  it('et kast blir 500 med en ugjennomsiktig kode, og logges', async () => {
    getOrCreateMock.mockRejectedValue(
      new Error('getOrCreateKavalkade: read failed: permission denied for table kavalkades'),
    );
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await GET(request('2026', `Bearer ${TOKEN}`), ctx('2026'));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'load_failed' });
    expect(errorSpy).toHaveBeenCalledWith(
      '[api/kavalkade/[year]] load failed',
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });
});
