// #2265 PR 2: Kavalkaden hentet fra webben. Type A.
//
// Vakt-rekkefølgen (nett, adresse, token) er `webApi.test.ts` sin. Her låses
// det denne fila eier: stiene, kroppen ved deling, og at hvert svar blir en kode
// appen kjenner, eller ingen dør.
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter jest.resetModules() (se harness.ts) */
import {
  BASE_URL,
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

type Kavalkade = typeof import('./kavalkade');

function kavalkade(): Kavalkade {
  return require('./kavalkade') as Kavalkade;
}

const FACTS = { year: 2026, rounds: 14, soloRounds: 12, teamRounds: 2 };

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('fetchKavalkadeStatus', () => {
  useWebRoute();

  it('reads the four fields from GET /api/kavalkade/status', async () => {
    respondWith(200, { year: 2026, slot: 'teaser', canOpen: false, hasRound: true });

    expect(await kavalkade().fetchKavalkadeStatus()).toEqual({
      year: 2026,
      slot: 'teaser',
      canOpen: false,
      hasRound: true,
    });
    expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/kavalkade/status`);
    expect(requestInit().method).toBe('GET');
  });

  it('reads an unknown slot as none, and anything but true as false', async () => {
    respondWith(200, { year: 2026, slot: 'banner', canOpen: 'yes', hasRound: 1 });

    expect(await kavalkade().fetchKavalkadeStatus()).toEqual({
      year: 2026,
      slot: null,
      canOpen: false,
      hasRound: false,
    });
  });

  it('gives no door offline, on an error or on a body without a year', async () => {
    mockNetwork.online = false;
    expect(await kavalkade().fetchKavalkadeStatus()).toBeNull();
    expect(console.error).not.toHaveBeenCalled();

    mockNetwork.online = true;
    respondWith(500, { error: 'status_failed' });
    expect(await kavalkade().fetchKavalkadeStatus()).toBeNull();

    respondWith(200, {});
    expect(await kavalkade().fetchKavalkadeStatus()).toBeNull();
  });
});

describe('fetchKavalkade', () => {
  useWebRoute();

  it('passes the three answers through from GET /api/kavalkade/{year}', async () => {
    respondWith(200, { status: 'closed', opensAt: '2026-12-23T23:00:00.000Z' });
    expect(await kavalkade().fetchKavalkade(2026)).toEqual({
      ok: true,
      view: { status: 'closed', opensAt: '2026-12-23T23:00:00.000Z' },
    });
    expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/kavalkade/2026`);

    respondWith(200, { status: 'preview', facts: FACTS });
    expect(await kavalkade().fetchKavalkade(2026)).toEqual({ ok: true, view: { status: 'preview', facts: FACTS } });

    respondWith(200, { status: 'ready', facts: FACTS, narrative: 'Et år med jevn fremgang.', generatedAt: 'x' });
    expect(await kavalkade().fetchKavalkade(2026)).toEqual({
      ok: true,
      view: { status: 'ready', facts: FACTS, narrative: 'Et år med jevn fremgang.' },
    });

    respondWith(200, { status: 'ready', facts: FACTS, narrative: null });
    expect(await kavalkade().fetchKavalkade(2026)).toEqual({
      ok: true,
      view: { status: 'ready', facts: FACTS, narrative: null },
    });
  });

  it('says offline offline, and failed for an error, a broken body or a lost call', async () => {
    mockNetwork.online = false;
    expect(await kavalkade().fetchKavalkade(2026)).toEqual({ ok: false, reason: 'offline' });

    mockNetwork.online = true;
    respondWith(500, { error: 'load_failed' });
    expect(await kavalkade().fetchKavalkade(2026)).toEqual({ ok: false, reason: 'failed' });

    respondWith(200, { status: 'ready' });
    expect(await kavalkade().fetchKavalkade(2026)).toEqual({ ok: false, reason: 'failed' });

    mockFetch.mockRejectedValueOnce(new TypeError('Network request failed'));
    expect(await kavalkade().fetchKavalkade(2026)).toEqual({ ok: false, reason: 'failed' });
  });
});

describe('logKavalkadeShare', () => {
  useWebRoute();

  it('posts the card kind to /api/kavalkade/{year}/share, and no id', async () => {
    respondWith(200, { ok: true });

    await kavalkade().logKavalkadeShare(2026, 'best-round');
    expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/kavalkade/2026/share`);
    expect(requestInit().method).toBe('POST');
    expect(JSON.parse(String(requestInit().body))).toEqual({ cardKind: 'best-round' });
    expect(console.error).not.toHaveBeenCalled();
  });

  it('logs a count that failed, and never throws', async () => {
    respondWith(500, { error: 'db_error' });
    await expect(kavalkade().logKavalkadeShare(2026, 'year')).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith('[kavalkade] delingen ble ikke telt', 'year', 500);
  });
});
