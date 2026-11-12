// native/app/src/data/terminliste.test.ts
// #2838: terminlista sett fra appen (Type A). Reglene (hvilke runder, knapp,
// seter) er testet i `lib/games/appTerminView.test.ts` og rutetesten. Her
// testes OVERSETTELSEN: hva appen gjør med hvert svar ruta kan gi, og at
// ingenting sendes uten nett.
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter jest.resetModules() (se harness.ts) */
import {
  BASE_URL,
  TOKEN,
  mockFetch,
  mockNetwork,
  requestInit,
  respondWith,
  respondWithHtml,
  useWebRoute,
} from '../test/webRouteHarness';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('./syncTriggers', () => ({
  isDeviceOnline: () => mockNetwork.online,
}));

function terminliste(): typeof import('./terminliste') {
  return require('./terminliste') as typeof import('./terminliste');
}

describe('fetchTerminliste', () => {
  useWebRoute();

  it('leser lista med GET og token, uten kropp og uten id', async () => {
    const view = { entries: [], pendingRequests: [] };
    respondWith(200, view);

    expect(await terminliste().fetchTerminliste()).toEqual({ ok: true, view });
    expect(mockFetch).toHaveBeenCalledWith(`${BASE_URL}/api/terminliste`, expect.objectContaining({ method: 'GET' }));
    expect((requestInit().headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(requestInit().body).toBeUndefined();
  });

  it.each([
    [401, 'unauthorized'],
    [500, 'load_failed'],
    [502, 'load_failed'],
  ])('oversetter %i til %s', async (status, reason) => {
    respondWith(status, { error: 'whatever' });
    expect(await terminliste().fetchTerminliste()).toEqual({ ok: false, reason });
  });

  it('en HTML-feilside foran appen er load_failed, ikke en krasj', async () => {
    respondWithHtml(502);
    expect(await terminliste().fetchTerminliste()).toEqual({ ok: false, reason: 'load_failed' });
  });

  it('en 200 uten lister er load_failed, ikke en tom liste', async () => {
    respondWith(200, { entries: 'tull' });
    expect(await terminliste().fetchTerminliste()).toEqual({ ok: false, reason: 'load_failed' });
  });

  it('uten nett: offline, og ingen kall', async () => {
    mockNetwork.online = false;
    expect(await terminliste().fetchTerminliste()).toEqual({ ok: false, reason: 'offline' });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
