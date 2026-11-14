// #2259 PR 2: Topplista hentet fra webben. Type A.
//
// Vakt-rekkefølgen (nett, adresse, token) er `webApi.test.ts` sin. Her låses det
// denne fila eier: stien, at et svar uten riktig form aldri blir et brett, og at
// hvert utfall er en kode skjermen kjenner.
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter jest.resetModules() (se harness.ts) */
import { BASE_URL, mockFetch, mockNetwork, requestInit, respondWith, useWebRoute } from '../test/webRouteHarness';

jest.mock('../supabase', () => require('../test/supabaseMock'));

// Nett-bryteren bor i riggen og MÅ importeres statisk (se webRouteHarness.ts).
jest.mock('./syncTriggers', () => ({
  isDeviceOnline: () => mockNetwork.online,
}));

type Aeresbrett = typeof import('./aeresbrett');

function aeresbrett(): Aeresbrett {
  return require('./aeresbrett') as Aeresbrett;
}

const ROW = { place: 1, name: 'Marte L.', initials: 'ML', count: 6, isViewer: false };
const VIEW = {
  seasonYear: 2026,
  seasonOver: false,
  boards: {
    wins: { rows: [ROW], me: null, leader: ROW },
    birdies: { rows: [ROW], me: { place: 2, count: 3, toTop5: null } },
    rounds: { rows: [ROW], me: null },
  },
};

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('fetchAeresbrett', () => {
  useWebRoute();

  it('reads the view from GET /api/aeresbrett', async () => {
    respondWith(200, VIEW);

    expect(await aeresbrett().fetchAeresbrett()).toEqual({ ok: true, view: VIEW });
    expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/aeresbrett`);
    expect(requestInit().method).toBe('GET');
  });

  it('keeps an empty season (no year) and a failed birdie read (null) as they are', async () => {
    const empty = {
      seasonYear: null,
      seasonOver: false,
      boards: {
        wins: { rows: [], me: null, leader: null },
        birdies: null,
        rounds: { rows: [], me: null },
      },
    };
    respondWith(200, empty);

    expect(await aeresbrett().fetchAeresbrett()).toEqual({ ok: true, view: empty });
  });

  it('treats a 200 without the three boards as a failure, never as a board', async () => {
    respondWith(200, { seasonYear: 2026, seasonOver: false });

    expect(await aeresbrett().fetchAeresbrett()).toEqual({ ok: false, reason: 'failed' });
  });

  it('treats a row without a place or a count as a failure', async () => {
    respondWith(200, {
      ...VIEW,
      boards: { ...VIEW.boards, wins: { rows: [{ name: 'Marte L.' }], me: null, leader: null } },
    });

    expect(await aeresbrett().fetchAeresbrett()).toEqual({ ok: false, reason: 'failed' });
  });

  it('maps a server error to «failed» and logs it', async () => {
    respondWith(500, { error: 'load_failed' });

    expect(await aeresbrett().fetchAeresbrett()).toEqual({ ok: false, reason: 'failed' });
    expect(console.error).toHaveBeenCalled();
  });

  it('maps 401 to «failed»: the app has no sign-in to offer here', async () => {
    respondWith(401, { error: 'unauthorized' });

    expect(await aeresbrett().fetchAeresbrett()).toEqual({ ok: false, reason: 'failed' });
  });

  it('says «offline» without a network, and sends nothing', async () => {
    mockNetwork.online = false;

    expect(await aeresbrett().fetchAeresbrett()).toEqual({ ok: false, reason: 'offline' });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
