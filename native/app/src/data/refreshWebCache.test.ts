// native/app/src/data/refreshWebCache.test.ts
// #2215: cache-tømmingen etter en skriving fra appen. Løftet til kallerne er at
// den aldri kaster og aldri holder skjermen fast: skrivingen har alt skjedd.
// At kallerne kaller den (og bare etter `ok`), låses i deres egne suiter.
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter jest.resetModules() (se harness.ts) */
import {
  BASE_URL,
  GAME_ID,
  TOKEN,
  mockFetch,
  mockNetwork,
  requestInit,
  respondWith,
  useWebRoute,
} from '../test/webRouteHarness';

jest.mock('../supabase', () => require('../test/supabaseMock'));

// Nett-bryteren bor i riggen og MÅ importeres statisk (se webRouteHarness.ts).
jest.mock('./syncTriggers', () => ({
  isDeviceOnline: () => mockNetwork.online,
}));

type RefreshModule = typeof import('./refreshWebCache');

function load(): RefreshModule {
  return require('./refreshWebCache') as RefreshModule;
}

describe('refreshWebCache (#2215)', () => {
  useWebRoute();

  let errorSpy: jest.SpyInstance;
  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('sender POST …/refresh med Bearer og uten kropp', async () => {
    respondWith(200, {});

    await load().refreshWebCache(GAME_ID);

    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE_URL}/api/games/${GAME_ID}/refresh`,
      expect.objectContaining({ method: 'POST' }),
    );
    const init = requestInit();
    expect(init.headers).toEqual(
      expect.objectContaining({ Authorization: `Bearer ${TOKEN}` }),
    );
    expect(init.body).toBeUndefined();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('logger et avslag, men kaster ikke', async () => {
    respondWith(403, { error: 'forbidden' });

    await expect(load().refreshWebCache(GAME_ID)).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('logger uten nett, og sender ingenting', async () => {
    mockNetwork.online = false;

    await expect(load().refreshWebCache(GAME_ID)).resolves.toBeUndefined();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('slutter å vente når nettsiden henger, så skjermen ikke står fast', async () => {
    jest.useFakeTimers();
    try {
      mockFetch.mockReturnValue(new Promise(() => {}));
      const { refreshWebCache, REFRESH_TIMEOUT_MS } = load();

      let settled = false;
      const pending = refreshWebCache(GAME_ID).then(() => {
        settled = true;
      });

      await jest.advanceTimersByTimeAsync(REFRESH_TIMEOUT_MS - 1);
      expect(settled).toBe(false);

      await jest.advanceTimersByTimeAsync(1);
      await pending;
      expect(settled).toBe(true);
      expect(errorSpy).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
