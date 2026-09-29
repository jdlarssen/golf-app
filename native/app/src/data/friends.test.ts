// #2256: vennene i appen, hentet og endret gjennom `/api/friends/*`. Type A.
//
// Vakt-rekkefølgen (nett, adresse, token) er `webApi.test.ts` sin. Her låses
// det denne fila eier: hvilken sti og kropp hver handling sender, at ingen id
// for kalleren følger med, og at svaret alltid blir en kode appen kjenner.
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

type Friends = typeof import('./friends');

function friends(): Friends {
  return require('./friends') as Friends;
}

const LIST = {
  friends: [{ id: 'kari', name: 'Kari' }],
  incoming: [{ requestId: 'req-1', id: 'ola', name: 'Ola' }],
  outgoing: [],
  suggestions: [{ id: 'per', name: 'Per' }],
  friendCode: 'KODE123',
};

describe('fetchFriends', () => {
  useWebRoute();

  it('henter lista med GET og gir den videre', async () => {
    respondWith(200, LIST);

    expect(await friends().fetchFriends()).toEqual({ ok: true, data: LIST });
    expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/friends`);
    expect(requestInit().method).toBe('GET');
  });

  it('tåler et svar der en liste mangler eller er noe annet', async () => {
    respondWith(200, { friends: 'nei', incoming: [{ requestId: 'r', id: 'x', name: 'X' }, 'søppel'] });

    expect(await friends().fetchFriends()).toEqual({
      ok: true,
      data: {
        friends: [],
        incoming: [{ requestId: 'r', id: 'x', name: 'X' }],
        outgoing: [],
        suggestions: [],
        friendCode: null,
      },
    });
  });

  it.each([
    [401, 'unauthorized'],
    [500, 'load_failed'],
  ] as const)('svarer %i som «%s»', async (status, reason) => {
    respondWith(status, {});
    expect(await friends().fetchFriends()).toEqual({ ok: false, reason });
  });

  it('stopper uten nett før noe sendes', async () => {
    mockNetwork.online = false;
    expect(await friends().fetchFriends()).toEqual({ ok: false, reason: 'offline' });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('vennehandlingene', () => {
  useWebRoute();

  it.each([
    ['sendFriendRequest', ['per'], '/api/friends/request', { addresseeId: 'per' }],
    ['addFriendByEmail', ['kari@example.com'], '/api/friends/by-email', { email: 'kari@example.com' }],
    ['respondToFriendRequest', ['req-1', true], '/api/friends/respond', { requestId: 'req-1', accept: true }],
    ['removeFriend', ['kari'], '/api/friends/remove', { otherId: 'kari' }],
  ] as const)('%s sender bare feltverdiene til %s', async (fn, args, path, body) => {
    respondWith(200, { status: 'requested' });

    const call = friends()[fn] as (...a: unknown[]) => Promise<unknown>;
    expect(await call(...args)).toEqual({ ok: true, status: 'requested' });
    expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}${path}`);
    expect(requestInit().method).toBe('POST');
    // Ingen id for kalleren: hvem som handler, er tokenets sak.
    expect(JSON.parse(String(requestInit().body))).toEqual(body);
  });

  it('gjør en ukjent kode fra ruta til «error»', async () => {
    respondWith(200, { status: 'noe_nytt' });
    expect(await friends().removeFriend('kari')).toEqual({ ok: true, status: 'error' });
  });

  it.each([
    [401, { ok: false, reason: 'unauthorized' }],
    [500, { ok: true, status: 'error' }],
  ] as const)('svarer %i som %o', async (status, expected) => {
    respondWith(status, { status: 'error' });
    expect(await friends().sendFriendRequest('per')).toEqual(expected);
  });

  it('gir invitasjonens egen kode, og «unknown» for en kode den ikke kjenner', async () => {
    respondWith(200, { status: 'quota' });
    expect(await friends().inviteFriend('ny@example.com')).toEqual({ ok: true, status: 'quota' });
    expect(JSON.parse(String(requestInit().body))).toEqual({ email: 'ny@example.com' });

    respondWith(200, { status: 'noe_nytt' });
    expect(await friends().inviteFriend('ny@example.com')).toEqual({ ok: true, status: 'unknown' });
  });
});
