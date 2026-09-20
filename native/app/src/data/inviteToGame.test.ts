// native/app/src/data/inviteToGame.test.ts
// Native #1919: e-post-invitasjonen sett fra appen.
//
// Suiten har ett tyngdepunkt: **at en kode aldri blir til en annen kode.** 400
// og 409 bærer hver flere koder her, i motsetning til purringen og
// selv-frafallet, og forskjellen mellom «sjekk adressen» og «du kan bare
// invitere folk du har spilt med» er forskjellen på en setning arrangøren kan
// handle på og en som bare sier nei. Derfor er hver gren låst, og en ukjent kode
// bevist fail-closed.
//
// Det som IKKE testes her: vakt-rekkefølgen som sådan (den er `webApi.ts` sin,
// og `account.test.ts` låser den for den første ruta) og hvilke setninger kodene
// betyr (`rosterCopy.test.ts`). Denne fila kjenner bare koder.
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter jest.resetModules() (se harness.ts) */
import { useFreshModules } from '../test/harness';

jest.mock('../supabase', () => require('../test/supabaseMock'));

// Nett-status styres per test. `mock`-prefikset er jests egen regel for
// variabler en `jest.mock`-fabrikk får lov å lukke over.
const mockNetwork = { online: true };
jest.mock('./syncTriggers', () => ({
  isDeviceOnline: () => mockNetwork.online,
}));

const BASE_URL = 'https://staging.example';
const GAME_ID = 'game-1';
const INVITE_URL = `${BASE_URL}/api/games/${GAME_ID}/invite`;
const TOKEN = 'access-token-abc';
const EMAIL = 'ny@example.com';

type Mocks = typeof import('../test/supabaseMock');
type InviteToGame = typeof import('./inviteToGame');

const mockFetch = jest.fn();

function api(): InviteToGame {
  return require('./inviteToGame') as InviteToGame;
}

function auth(): Mocks['supabase']['auth'] {
  return (require('../test/supabaseMock') as Mocks).supabase.auth;
}

/** Neste svar fra ruta. `json()` speiler ekte `Response` — den kan kaste. */
function respondWith(status: number, body: unknown): void {
  mockFetch.mockResolvedValue({
    status,
    json: async () => body,
  } as unknown as Response);
}

/** Argumentene ruta faktisk ble kalt med. */
function requestInit(): RequestInit {
  return mockFetch.mock.calls[0][1] as RequestInit;
}

describe('inviteToGame', () => {
  useFreshModules();

  const originalFetch = global.fetch;

  beforeEach(() => {
    mockNetwork.online = true;
    mockFetch.mockReset();
    global.fetch = mockFetch as unknown as typeof fetch;
    process.env.EXPO_PUBLIC_WEB_BASE_URL = BASE_URL;

    auth().getSession.mockResolvedValue({
      data: { session: { access_token: TOKEN } },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
    delete process.env.EXPO_PUBLIC_WEB_BASE_URL;
  });

  it('sender POST med Bearer-token og BARE adressen i kroppen', async () => {
    respondWith(200, { status: 'sent' });

    expect(await api().inviteToGame(GAME_ID, EMAIL)).toEqual({
      ok: true,
      kind: 'sent',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    // Eksakt URL: runden identifiseres av STIEN, arrangøren av tokenet.
    expect(mockFetch.mock.calls[0][0]).toBe(INVITE_URL);
    const init = requestInit();
    expect(init.method).toBe('POST');
    expect(
      (init.headers as Record<string, string>).Authorization,
    ).toBe(`Bearer ${TOKEN}`);
    // Ingen bruker-id, ingen spill-id — kroppen bærer én verdi.
    expect(JSON.parse(String(init.body))).toEqual({ email: EMAIL });
  });

  it('200 { status: added } betyr at spilleren står i runden alt', async () => {
    respondWith(200, { status: 'added' });

    expect(await api().inviteToGame(GAME_ID, EMAIL)).toEqual({
      ok: true,
      kind: 'added',
    });
  });

  it('200 med en status vi ikke kjenner er fail-closed', async () => {
    // Wiren har driftet: da vet vi ikke om det ble sendt en mail eller lagt til
    // en spiller, og en gjettet kvittering er verre enn en feil.
    respondWith(200, { status: 'queued' });

    expect(await api().inviteToGame(GAME_ID, EMAIL)).toEqual({
      ok: false,
      reason: 'invite_failed',
    });
  });

  it.each([
    [400, 'invalid_email'],
    [400, 'disposable_email'],
    [409, 'game_locked'],
    [409, 'game_full'],
    [409, 'invite_not_allowed'],
  ])('%s leser koden %s fra kroppen', async (status, code) => {
    respondWith(status, { error: code });

    expect(await api().inviteToGame(GAME_ID, EMAIL)).toEqual({
      ok: false,
      reason: code,
    });
  });

  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'not_found'],
    [429, 'rate_limited'],
    [500, 'invite_failed'],
  ])('%s blir %s uten å lese kroppen', async (status, reason) => {
    // Kroppen bærer en annen kode med vilje: statusen alene avgjør her.
    respondWith(status, { error: 'noe-annet' });

    expect(await api().inviteToGame(GAME_ID, EMAIL)).toEqual({
      ok: false,
      reason,
    });
  });

  it.each([400, 409])(
    '%s med en kode vi ikke kjenner faller til invite_failed',
    async (status) => {
      // Fail-closed: en streng utenfra skal aldri nå `describeInviteFailure`,
      // som har en uttømmende switch uten `default`.
      respondWith(status, { error: 'plutselig_noe_nytt' });

      expect(await api().inviteToGame(GAME_ID, EMAIL)).toEqual({
        ok: false,
        reason: 'invite_failed',
      });
    },
  );

  it('uten nett stopper vi FØR fetch', async () => {
    mockNetwork.online = false;

    expect(await api().inviteToGame(GAME_ID, EMAIL)).toEqual({
      ok: false,
      reason: 'offline',
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('uten sesjon sendes ingen kall', async () => {
    auth().getSession.mockResolvedValue({ data: { session: null } });

    expect(await api().inviteToGame(GAME_ID, EMAIL)).toEqual({
      ok: false,
      reason: 'unauthorized',
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
