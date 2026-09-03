// native/app/src/data/webApi.test.ts
// Native #1891 + #1906: den ene veien appen har til en autentisert rute.
//
// Fila hadde ingen egen suite så lenge den bare hadde én form: `account.test.ts`
// låste vakt-rekkefølgen for slette-ruta, og `remind.test.ts` for purringen.
// #1906 ga kallet en KROPP, og da ble det to former å holde fra hverandre —
// derfor denne.
//
// To ting testes, og bare de to:
//
//  1. **At tillegget er additivt.** Uten `body` skal kallet se ut på nettet
//     nøyaktig som før: ingen `Content-Type`, ingen kropp. Slettingen (#1876)
//     og purringen (#1889) sender fortsatt ingenting, og en regresjon her
//     ville truffet en rute ingen rørte.
//  2. **At vakt-rekkefølgen står.** Nett → adresse → token, i den rekkefølgen,
//     og ingen av dem sender et kall. Rekkefølgen er kontrakten (se
//     fil-kommentaren i `webApi.ts`), så hver gren testes med de SENERE
//     forutsetningene også brutt — ellers ville en test bestått uansett
//     hvilken av dem som svarte først.
//
// Det som IKKE testes her: hva statusene betyr. Det er hver kallers eget
// vokabular (`AccountDeleteFailure`, `ReminderFailure`, `ProfileSaveFailure`),
// og det bor i deres suiter.
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
const PATH = '/api/profile';
const ROUTE_URL = `${BASE_URL}${PATH}`;
const TOKEN = 'access-token-abc';

type Mocks = typeof import('../test/supabaseMock');
type WebApi = typeof import('./webApi');

const mockFetch = jest.fn();

function webApi(): WebApi {
  return require('./webApi') as WebApi;
}

function auth(): Mocks['supabase']['auth'] {
  return (require('../test/supabaseMock') as Mocks).supabase.auth;
}

function respondWith(status: number, body: unknown): void {
  mockFetch.mockResolvedValue({
    status,
    json: async () => body,
  } as unknown as Response);
}

function requestInit(): RequestInit {
  return mockFetch.mock.calls[0][1] as RequestInit;
}

function headers(): Record<string, string> {
  return requestInit().headers as Record<string, string>;
}

// Hva denne fila dekker, og hva den bevisst IKKE gjør:
//
// De enkelte vakt-UTFALLENE (offline, manglende adresse, ingen sesjon) er alt
// låst i `account.test.ts` og `remind.test.ts` — gjennom hver sin kaller. Å
// gjenta dem her ville vært en tredje kopi, og test-disiplinen kaller det ved
// navn. Det som IKKE finnes noe annet sted er REKKEFØLGEN: en kaller ser bare
// hvilken kode som kom ut, og kan ikke skille «stoppet på nett» fra «stoppet på
// adressen» når begge er brutt. Testene under bryter derfor SENERE
// forutsetninger også, og beviser at den første vakten vinner — den
// rekkefølgen er det modulen selv kaller kontrakten.
//
// Resten er kroppen, som er det denne slicen faktisk la til.
describe('callWebRoute', () => {
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

  describe('med kropp', () => {
    it('sender feltene som JSON og merker dem som JSON', async () => {
      respondWith(200, { ok: true });

      const call = await webApi().callWebRoute(PATH, 'PUT', {
        name: 'Kari Nordmann',
        hcpPlus: false,
      });

      expect(call).toEqual({ ok: true, status: 200, body: { ok: true } });
      expect(mockFetch.mock.calls[0][0]).toBe(ROUTE_URL);
      const init = requestInit();
      expect(init.method).toBe('PUT');
      expect(init.body).toBe('{"name":"Kari Nordmann","hcpPlus":false}');
      expect(headers()['Content-Type']).toBe('application/json');
      expect(headers().Authorization).toBe(`Bearer ${TOKEN}`);
    });

    it('sender en tom kropp som en tom kropp, ikke som ingen kropp', async () => {
      // `{}` er en kropp. Faller den ut fordi vakten spør på sannhet i stedet
      // for på `undefined`, får ruta et PUT uten `Content-Type` og svarer noe
      // annet enn den ville gjort.
      respondWith(200, {});

      await webApi().callWebRoute(PATH, 'PUT', {});

      expect(requestInit().body).toBe('{}');
      expect(headers()['Content-Type']).toBe('application/json');
    });
  });

  describe('uten kropp', () => {
    it.each(['GET', 'POST'] as const)(
      'sender %s nøyaktig som før: ingen kropp, ingen Content-Type',
      async (method) => {
        // Regresjonsporten for #1876 og #1889. De to kallerne sender ingenting,
        // og et `Content-Type` på et kroppsløst kall er en annen forespørsel
        // enn den de har levd med.
        respondWith(200, {});

        await webApi().callWebRoute('/api/account/delete', method);

        const init = requestInit();
        expect(init.method).toBe(method);
        expect(init.body).toBeUndefined();
        expect(headers()['Content-Type']).toBeUndefined();
        expect(headers().Accept).toBe('application/json');
      },
    );
  });

  describe('vakt-rekkefølgen', () => {
    it('stopper på nett FØR den ser på adressen', async () => {
      // Begge er brutt. Svarer den `no-web-base-url`, har rekkefølgen snudd.
      mockNetwork.online = false;
      delete process.env.EXPO_PUBLIC_WEB_BASE_URL;

      expect(await webApi().callWebRoute(PATH, 'PUT', { name: 'Kari' })).toEqual({
        ok: false,
        reason: 'offline',
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('stopper på adressen FØR den henter tokenet', async () => {
      delete process.env.EXPO_PUBLIC_WEB_BASE_URL;
      auth().getSession.mockResolvedValue({ data: { session: null } });

      expect(await webApi().callWebRoute(PATH, 'PUT', { name: 'Kari' })).toEqual({
        ok: false,
        reason: 'no-web-base-url',
      });
      expect(auth().getSession).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('sender ikke et kall vi vet blir avvist', async () => {
      auth().getSession.mockResolvedValue({ data: { session: null } });

      expect(await webApi().callWebRoute(PATH, 'PUT', { name: 'Kari' })).toEqual({
        ok: false,
        reason: 'unauthorized',
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('leser et kast fra getSession som «ingen sesjon»', async () => {
      auth().getSession.mockRejectedValue(new Error('storage utilgjengelig'));

      expect(await webApi().callWebRoute(PATH, 'PUT', { name: 'Kari' })).toEqual({
        ok: false,
        reason: 'unauthorized',
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

});
