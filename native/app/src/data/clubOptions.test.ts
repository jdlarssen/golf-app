// #2753: klienten for klubbvalget. Regelen bor på serveren; her låses at et
// gyldig svar kommer fram, og at alt annet kaster (veiviseren skjuler da flisen).
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter jest.resetModules() (se harness.ts) */
import { BASE_URL, mockFetch, mockNetwork, respondWith, useWebRoute } from '../test/webRouteHarness';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('./syncTriggers', () => ({
  isDeviceOnline: () => mockNetwork.online,
}));

const clubOptions = () => require('./clubOptions') as typeof import('./clubOptions');

describe('fetchClubOptions', () => {
  useWebRoute();

  it('henter klubbvalget fra ruta', async () => {
    const body = {
      canCreateClubGame: true,
      clubs: [{ id: 'c1', name: 'Byneset GK', role: 'admin', memberCount: 2 }],
      membersByClub: { c1: [] },
    };
    respondWith(200, body);

    await expect(clubOptions().fetchClubOptions()).resolves.toEqual(body);
    expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/games/club-options`);
  });

  it.each([401, 500])('kaster på %i', async (status) => {
    respondWith(status, { error: 'x' });
    await expect(clubOptions().fetchClubOptions()).rejects.toThrow();
  });

  it('kaster på et svar uten feltene', async () => {
    respondWith(200, { clubs: [] });
    await expect(clubOptions().fetchClubOptions()).rejects.toThrow('uventet svar');
  });
});
