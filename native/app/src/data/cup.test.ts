// #2752: klienten for cup-rommet. Selve vurderingene gjør ruta; her låses at
// statusene blir koder, og at et svar uten cup ikke tegnes.
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter jest.resetModules() (se harness.ts) */
import { BASE_URL, mockFetch, mockNetwork, respondWith, useWebRoute } from '../test/webRouteHarness';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('./syncTriggers', () => ({
  isDeviceOnline: () => mockNetwork.online,
}));

const cup = () => require('./cup') as typeof import('./cup');

describe('data/cup', () => {
  useWebRoute();

  it('henter cupene dine', async () => {
    const cups = [{ id: 'a', name: 'Cup a', status: 'active', progress: { played: 1, total: 2 } }];
    respondWith(200, { cups });

    await expect(cup().fetchMyCups()).resolves.toEqual({ ok: true, cups });
    expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/cup`);
  });

  it('henter ett cup-rom, med id-en i stien', async () => {
    const view = { id: 'a b', matches: [] };
    respondWith(200, view);

    await expect(cup().fetchCup('a b')).resolves.toEqual({ ok: true, view });
    expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/cup/a%20b`);
  });

  it.each([
    [401, 'unauthorized'],
    [404, 'not_found'],
    [500, 'load_failed'],
  ])('%i blir %s', async (status, reason) => {
    respondWith(status, { error: 'x' });

    await expect(cup().fetchCup('a')).resolves.toEqual({ ok: false, reason });
  });

  it('en 200 uten cup er ikke en cup', async () => {
    respondWith(200, {});
    await expect(cup().fetchCup('a')).resolves.toEqual({ ok: false, reason: 'load_failed' });
    respondWith(200, {});
    await expect(cup().fetchMyCups()).resolves.toEqual({ ok: false, reason: 'load_failed' });
  });

  it('uten nett går ingen kall, og grunnen er offline', async () => {
    mockNetwork.online = false;

    await expect(cup().fetchCup('a')).resolves.toEqual({ ok: false, reason: 'offline' });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
