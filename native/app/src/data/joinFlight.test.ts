// native/app/src/data/joinFlight.test.ts
// #2750: spilleren velger flight selv, sett fra appen.
//
// Tyngdepunktet er at et svar aldri blir til noe annet enn det det var: en 409
// som leses som «det gikk fint» får spilleren til å tro hen står i en flight hen
// ikke står i. Vakt-rekkefølgen er `webApi.ts` sin, og setningene er
// `flightPicker.test.ts` sine. Denne fila kjenner bare koder.
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter jest.resetModules() (se harness.ts) */
import {
  BASE_URL,
  GAME_ID,
  TOKEN,
  mockFetch,
  mockNetwork,
  requestInit,
  respondWith,
  respondWithHtml,
  useWebRoute,
} from '../test/webRouteHarness';

jest.mock('../supabase', () => require('../test/supabaseMock'));

// Nett-bryteren bor i riggen og MÅ importeres statisk (se webRouteHarness.ts).
jest.mock('./syncTriggers', () => ({
  isDeviceOnline: () => mockNetwork.online,
}));

const FLIGHT_URL = `${BASE_URL}/api/games/${GAME_ID}/flight`;

type JoinFlight = typeof import('./joinFlight');

function api(): JoinFlight {
  return require('./joinFlight') as JoinFlight;
}

describe('joinFlight', () => {
  useWebRoute();

  it('sender POST med Bearer-token og bare tallet i kroppen', async () => {
    respondWith(200, { ok: true });

    expect(await api().joinFlight(GAME_ID, 2)).toEqual({ ok: true });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    // Spillet står i stien og spilleren i tokenet. Kroppen bærer bare tallet.
    expect(mockFetch.mock.calls[0][0]).toBe(FLIGHT_URL);
    const init = requestInit();
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(init.body as string)).toEqual({ flightNumber: 2 });
  });

  it.each<[number, unknown, string]>([
    [401, { error: 'unauthorized' }, 'unauthorized'],
    [403, { error: 'not_member' }, 'not_member'],
    [409, { error: 'game_not_scheduled' }, 'game_not_scheduled'],
    [409, { error: 'flight_full' }, 'flight_full'],
    [409, { error: 'flight_bound_to_team' }, 'flight_bound_to_team'],
    [409, { error: 'bad_flight' }, 'bad_flight'],
    [400, { error: 'bad_request' }, 'flight_failed'],
    [500, { error: 'flight_failed' }, 'flight_failed'],
    // En 409 appen ikke kjenner, er verken «ok» eller en av de andre.
    [409, { error: 'noe_nytt' }, 'flight_failed'],
    [409, {}, 'flight_failed'],
  ])('%i %j → %s', async (status, body, reason) => {
    respondWith(status, body);

    expect(await api().joinFlight(GAME_ID, 2)).toEqual({ ok: false, reason });
  });

  it('en 500 som er HTML: flight_failed, ikke en kastet feil', async () => {
    respondWithHtml(500);

    expect(await api().joinFlight(GAME_ID, 2)).toEqual({ ok: false, reason: 'flight_failed' });
  });

  it('uten nett: ingen kall, og ingenting legges i kø', async () => {
    mockNetwork.online = false;

    expect(await api().joinFlight(GAME_ID, 2)).toEqual({ ok: false, reason: 'offline' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('nettfeil underveis: network', async () => {
    // `webApi.ts` logger feilen; her er det koden som teller.
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockFetch.mockRejectedValueOnce(new TypeError('Network request failed'));

    expect(await api().joinFlight(GAME_ID, 2)).toEqual({ ok: false, reason: 'network' });
  });
});
