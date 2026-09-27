// native/app/src/data/startGame.test.ts
// Native N6b (#1855), #2215: «Start runden nå», sett fra appen.
//
// Siden #2215 går starten via `POST /api/games/{id}/start`. Reglene kjernen
// håndhever — tee-rating, ufullstendige lag, frysingen av banehandicap,
// rotasjons-slotene — er testet i `lib/games/startScheduledGame.test.ts`, og
// varslene og de avledede spillene i ruta sin test. Det som testes her er
// OVERSETTELSEN: hva appen gjør med hvert svar ruta kan gi.
//
// Tyngdepunktet er vinner-semantikken (#502). `alreadyRunning: true` betyr at
// cron-sweepen, nettsiden eller E1-fallbacken rakk status-flippen først —
// runden ER i gang, og det er suksess. Leses den som en feil, får arrangøren en
// feilmelding om en runde som nettopp startet.
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter jest.resetModules() (se harness.ts) */
import {
  BASE_URL,
  GAME_ID,
  TOKEN,
  auth,
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

const START_URL = `${BASE_URL}/api/games/${GAME_ID}/start`;

type Mocks = typeof import('../test/supabaseMock');

function mocks(): Mocks {
  return require('../test/supabaseMock') as Mocks;
}

function startRoundNow(gameId: string) {
  return (require('./startGame') as typeof import('./startGame')).startRoundNow(
    gameId,
  );
}

describe('startRoundNow', () => {
  useWebRoute();

  beforeEach(() => {
    // En tom plan kaster på enhver spørring: appen skal ikke skrive selv.
    mocks().routeFrom({});
  });

  it('starter med POST …/start, Bearer og uten kropp', async () => {
    respondWith(200, { alreadyRunning: false });

    expect(await startRoundNow(GAME_ID)).toEqual({ ok: true, alreadyRunning: false });

    expect(mockFetch).toHaveBeenCalledWith(START_URL, expect.objectContaining({ method: 'POST' }));
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const init = requestInit();
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(init.body).toBeUndefined();
  });

  it('melder suksess også når en ANNEN aktør vant flippen (#502)', async () => {
    // Cron-sweepen på tee-off, nettsidens knapp eller E1-fallbacken kom først.
    // Runden er i gang — nøyaktig det arrangøren ba om. Ingen feil.
    respondWith(200, { alreadyRunning: true });

    expect(await startRoundNow(GAME_ID)).toEqual({ ok: true, alreadyRunning: true });
  });

  it('er startet selv om svaret ikke sa hvilken vei det gikk', async () => {
    respondWith(200, {});

    expect(await startRoundNow(GAME_ID)).toEqual({ ok: true, alreadyRunning: false });
  });

  it('nekter uten nett, og sender ingenting', async () => {
    mockNetwork.online = false;

    expect(await startRoundNow(GAME_ID)).toEqual({ ok: false, reason: 'offline' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sier ifra når server-adressen mangler i bygget', async () => {
    delete process.env.EXPO_PUBLIC_WEB_BASE_URL;

    expect(await startRoundNow(GAME_ID)).toEqual({ ok: false, reason: 'no-web-base-url' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sender ikke et kall uten sesjon', async () => {
    auth().getSession.mockResolvedValue({ data: { session: null } });

    expect(await startRoundNow(GAME_ID)).toEqual({ ok: false, reason: 'unauthorized' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('svarer network når kallet aldri kom fram', async () => {
    mockFetch.mockRejectedValue(new Error('Network request failed'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(await startRoundNow(GAME_ID)).toEqual({ ok: false, reason: 'network' });
  });

  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'not_found'],
    [500, 'start_failed'],
    [502, 'start_failed'],
  ])('oversetter %i til %s', async (status, reason) => {
    respondWith(status, { error: 'whatever' });

    expect(await startRoundNow(GAME_ID)).toEqual({ ok: false, reason });
  });

  it('sender kjernens avslagskode videre fra en 409', async () => {
    respondWith(409, { error: 'unassigned_teams' });

    expect(await startRoundNow(GAME_ID)).toEqual({ ok: false, reason: 'unassigned_teams' });
  });

  it('ventende spillere: avslaget bærer ingen liste (#2207)', async () => {
    respondWith(409, { error: 'pending_players' });

    expect(await startRoundNow(GAME_ID)).toEqual({ ok: false, reason: 'pending_players' });
  });

  it('bærer rotasjons-formatet og antallet videre til meldingen (#969)', async () => {
    respondWith(409, {
      error: 'rotation_player_count',
      rotationMode: 'wolf',
      rotationActiveCount: 2,
    });

    expect(await startRoundNow(GAME_ID)).toEqual({
      ok: false,
      reason: 'rotation_player_count',
      rotationMode: 'wolf',
      rotationActiveCount: 2,
    });
  });

  it('slipper rotasjons-felter som ikke er lesbare, i stedet for å gjette', async () => {
    // Et format vi ikke kjenner og et antall som ikke er et tall: da står den
    // generelle setningen igjen, ikke en gjettet wolf-setning.
    respondWith(409, {
      error: 'rotation_player_count',
      rotationMode: 'ukjent_format',
      rotationActiveCount: '2',
    });

    expect(await startRoundNow(GAME_ID)).toEqual({
      ok: false,
      reason: 'rotation_player_count',
    });
  });

  it.each([
    [{ error: 'noe_nytt' }],
    [{}],
  ])('gjør en 409 med ukjent error (%j) til start_failed', async (body) => {
    respondWith(409, body);

    expect(await startRoundNow(GAME_ID)).toEqual({ ok: false, reason: 'start_failed' });
  });
});
