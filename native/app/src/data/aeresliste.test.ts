// #2894 PR 2: Æreslista hentet fra webben, og det lukkede banneret. Type A.
//
// Vakt-rekkefølgen (nett, adresse, token) er `webApi.test.ts` sin. Her låses det
// denne fila eier: stien, at et svar uten riktig form aldri blir en liste, at hvert
// utfall er en kode skjermen kjenner, og at et lukket banner huskes per slag.
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter jest.resetModules() (se harness.ts) */
import { BASE_URL, mockFetch, mockNetwork, requestInit, respondWith, useWebRoute } from '../test/webRouteHarness';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest'),
);

// Nett-bryteren bor i riggen og MÅ importeres statisk (se webRouteHarness.ts).
jest.mock('./syncTriggers', () => ({
  isDeviceOnline: () => mockNetwork.online,
}));

type Aeresliste = typeof import('./aeresliste');

function aeresliste(): Aeresliste {
  return require('./aeresliste') as Aeresliste;
}

const ROW = {
  kind: 'hole_in_one',
  name: 'Marte L.',
  initials: 'ML',
  isViewer: false,
  hole: 7,
  courseName: 'Bogstad',
  playedOn: '2026-09-21',
  key: 'a1b2c3d4e5f60718',
};
const VIEW = { rows: [ROW, { ...ROW, kind: 'albatross', courseName: null, key: 'ffff000011112222' }] };

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('fetchAeresliste', () => {
  useWebRoute();

  it('reads the list from GET /api/aeresliste', async () => {
    respondWith(200, VIEW);

    expect(await aeresliste().fetchAeresliste()).toEqual({ ok: true, view: VIEW });
    expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/aeresliste`);
    expect(requestInit().method).toBe('GET');
  });

  it('keeps an empty list as it is', async () => {
    respondWith(200, { rows: [] });

    expect(await aeresliste().fetchAeresliste()).toEqual({ ok: true, view: { rows: [] } });
  });

  it('treats an eagle, a bad date or a row without a key as a failure, never as half a list', async () => {
    for (const bad of [{ kind: 'eagle' }, { playedOn: '21. sep' }, { key: '' }, { key: undefined }]) {
      respondWith(200, { rows: [{ ...ROW, ...bad }] });
      expect(await aeresliste().fetchAeresliste()).toEqual({ ok: false, reason: 'failed' });
    }
  });

  it('treats a 200 without rows as a failure', async () => {
    respondWith(200, {});

    expect(await aeresliste().fetchAeresliste()).toEqual({ ok: false, reason: 'failed' });
  });

  it('maps a server error to «failed» and logs it', async () => {
    respondWith(500, { error: 'load_failed' });

    expect(await aeresliste().fetchAeresliste()).toEqual({ ok: false, reason: 'failed' });
    expect(console.error).toHaveBeenCalled();
  });

  it('maps 401 to «failed»: the app has no sign-in to offer here', async () => {
    respondWith(401, { error: 'unauthorized' });

    expect(await aeresliste().fetchAeresliste()).toEqual({ ok: false, reason: 'failed' });
  });

  it('says «offline» without a network, and sends nothing', async () => {
    mockNetwork.online = false;

    expect(await aeresliste().fetchAeresliste()).toEqual({ ok: false, reason: 'offline' });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('the closed banner', () => {
  it('remembers the key of the shot that was closed, and only the latest', async () => {
    const mod = aeresliste();
    expect(await mod.readClosedRareShot()).toBeNull();

    await mod.closeRareShot('a1b2c3d4e5f60718');
    expect(await mod.readClosedRareShot()).toBe('a1b2c3d4e5f60718');

    await mod.closeRareShot('ffff000011112222');
    expect(await mod.readClosedRareShot()).toBe('ffff000011112222');
  });
});
