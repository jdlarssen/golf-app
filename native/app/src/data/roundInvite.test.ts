// native/app/src/data/roundInvite.test.ts
// #2748: svarene fra ruta, sett fra appen (Type A). Reglene er på serveren. Her testes
// oversettelsen, at kroppen bare har det ruta leser, og at ingenting sendes uten nett.
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter mockene */
import {
  BASE_URL,
  TOKEN,
  mockFetch,
  mockNetwork,
  requestInit,
  respondWith,
  useWebRoute,
} from '../test/webRouteHarness';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('./syncTriggers', () => ({
  isDeviceOnline: () => mockNetwork.online,
}));

const SHORT_ID = 'abcd2345';
const VIEW = {
  offer: 'join',
  round: {
    name: 'Lørdagsrunden',
    modeLabel: 'Stableford',
    courseName: 'Larvik GK',
    teeName: 'Gul',
    teeOffAt: null,
    entryFeeKr: 150,
  },
  playerCount: 7,
  signupPath: `/signup/${SHORT_ID}`,
};

function invite(): typeof import('./roundInvite') {
  return require('./roundInvite') as typeof import('./roundInvite');
}

describe('fetchRoundInvite', () => {
  useWebRoute();

  it('spør stien med tokenet', async () => {
    respondWith(200, VIEW);
    expect(await invite().fetchRoundInvite(SHORT_ID)).toEqual({ ok: true, view: VIEW });
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE_URL}/api/pamelding/${SHORT_ID}`,
      expect.objectContaining({ method: 'GET' }),
    );
    expect((requestInit().headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it.each([
    [401, {}, 'unauthorized'],
    [404, { error: 'game_not_found' }, 'not_found'],
    [500, { error: 'load_failed' }, 'load_failed'],
    [200, { ...VIEW, offer: 'noe_nytt' }, 'load_failed'],
    [200, { ...VIEW, round: undefined }, 'load_failed'],
    [200, { ...VIEW, round: null }, 'load_failed'],
    [200, { ...VIEW, round: 'x' }, 'load_failed'],
    [200, { ...VIEW, round: {} }, 'load_failed'],
    [200, { ...VIEW, playerCount: undefined }, 'load_failed'],
    [200, { ...VIEW, offer: 'in_game' }, 'load_failed'],
  ])('oversetter %i %j til %s', async (status, body, reason) => {
    respondWith(status, body);
    expect(await invite().fetchRoundInvite(SHORT_ID)).toEqual({ ok: false, reason });
  });

  it('sender ingenting uten nett', async () => {
    mockNetwork.online = false;
    expect(await invite().fetchRoundInvite(SHORT_ID)).toEqual({ ok: false, reason: 'offline' });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('joinRound og requestToJoin', () => {
  useWebRoute();

  it('«Meld meg på» sender hensikten og kilden, og ingen identitet', async () => {
    respondWith(200, { status: 'joined', gameId: 'g1' });
    expect(await invite().joinRound(SHORT_ID, 'plakat')).toEqual({
      ok: true,
      status: 'joined',
      gameId: 'g1',
    });
    expect(JSON.parse(String(requestInit().body))).toEqual({ intent: 'join', src: 'plakat' });
  });

  it('uten kilde står den ikke i kroppen', async () => {
    respondWith(200, { status: 'joined', gameId: 'g1' });
    await invite().joinRound(SHORT_ID, null);
    expect(JSON.parse(String(requestInit().body))).toEqual({ intent: 'join' });
  });

  it('«Be om å bli med» sender hilsenen', async () => {
    respondWith(200, { status: 'requested' });
    expect(await invite().requestToJoin(SHORT_ID, 'Plass?')).toEqual({
      ok: true,
      status: 'requested',
    });
    expect(JSON.parse(String(requestInit().body))).toEqual({ intent: 'request', message: 'Plass?' });
  });

  it('uten hilsen står den ikke i kroppen', async () => {
    respondWith(200, { status: 'requested' });
    await invite().requestToJoin(SHORT_ID, null);
    expect(JSON.parse(String(requestInit().body))).toEqual({ intent: 'request' });
  });

  it('svaret forteller hva som gjelder, ikke hva du ba om', async () => {
    respondWith(200, { status: 'requested' });
    expect(await invite().joinRound(SHORT_ID, null)).toEqual({ ok: true, status: 'requested' });
  });

  it.each([
    [400, 'message_too_long'],
    [409, 'game_locked'],
    [409, 'signup_closed'],
    [409, 'game_full'],
    [409, 'wrong_mode'],
    [409, 'use_web'],
    [409, 'profile_incomplete'],
    [429, 'rate_limited'],
  ])('%i %s er koden sin', async (status, error) => {
    respondWith(status, { error });
    expect(await invite().joinRound(SHORT_ID, null)).toEqual({ ok: false, reason: error });
  });

  it.each([
    [401, {}, 'unauthorized'],
    [404, { error: 'game_not_found' }, 'not_found'],
    [500, { error: 'db_error' }, 'db_error'],
    [409, { error: 'noe_nytt' }, 'db_error'],
    [409, { error: 'constructor' }, 'db_error'],
    [400, { error: 'bad_request' }, 'db_error'],
    [200, { status: 'joined' }, 'db_error'],
    [200, { status: 'noe_nytt' }, 'db_error'],
  ])('oversetter %i %j til %s', async (status, body, reason) => {
    respondWith(status, body);
    expect(await invite().joinRound(SHORT_ID, null)).toEqual({ ok: false, reason });
  });

  it('sender ingenting uten nett', async () => {
    mockNetwork.online = false;
    expect(await invite().joinRound(SHORT_ID, null)).toEqual({ ok: false, reason: 'offline' });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
