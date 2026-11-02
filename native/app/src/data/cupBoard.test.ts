// #2752: klienten for tavla til en ferdig kamp. Ruta avgjør hvem som får se; her
// låses stien, at en status blir en kode, og at radene blir appens egne fasonger.
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter nettet er satt */
import { BASE_URL, mockFetch, mockNetwork, respondWith, useWebRoute } from '../test/webRouteHarness';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('./syncTriggers', () => ({
  isDeviceOnline: () => mockNetwork.online,
}));
const mockToBundle = jest.fn((game: unknown, players: unknown, related: unknown) => ({ game, players, ...(related as object) }));
jest.mock('./gameBundle', () => ({
  toBundle: (game: unknown, players: unknown, related: unknown) => mockToBundle(game, players, related),
}));

const api = () => require('./cupBoard') as typeof import('./cupBoard');

describe('data/cupBoard', () => {
  useWebRoute();

  it('gjør radene til en bundel og slag, og spør rett rute', async () => {
    respondWith(200, {
      game: { id: 'g' },
      players: [{ user_id: 'a' }],
      scores: [{ user_id: 'a', hole_number: 3, strokes: 4 }],
    });

    const result = await api().fetchCupMatchBoard('c', 'g');

    expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/cup/c/matches/g/board`);
    expect(mockToBundle).toHaveBeenCalledWith({ id: 'g' }, [{ user_id: 'a' }], {
      segmentSibling: null,
      sourceGameName: null,
    });
    expect(result).toMatchObject({
      ok: true,
      scores: [{ id: 'g:a:3', gameId: 'g', userId: 'a', holeNumber: 3, strokes: 4, putts: null }],
    });
  });

  it.each([
    [401, 'unauthorized'],
    [404, 'not_found'],
    [500, 'load_failed'],
  ])('status %i blir %s', async (status, reason) => {
    respondWith(status, { error: 'x' });
    await expect(api().fetchCupMatchBoard('c', 'g')).resolves.toEqual({ ok: false, reason });
  });

  it('en 200 uten rader er ikke noe å tegne', async () => {
    respondWith(200, { game: { id: 'g' } });
    await expect(api().fetchCupMatchBoard('c', 'g')).resolves.toEqual({ ok: false, reason: 'load_failed' });
  });

  it('uten nett går ingenting ut', async () => {
    mockNetwork.online = false;
    await expect(api().fetchCupMatchBoard('c', 'g')).resolves.toEqual({ ok: false, reason: 'offline' });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
