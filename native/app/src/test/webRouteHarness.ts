// Native #1960: felles rigg for app→server-rute-klientene.
//
// Hver klient som går gjennom `webApi.ts` (sletting, purring, lagkort,
// frafall, invitasjon, profil og `webApi` selv) testes med det samme oppsettet:
// en fetch-mock, en nett-bryter, en base-URL og en sesjon med token. Det sto
// kopiert i sju filer til #1960. En ny rute-klient henter det herfra.
//
// Fella: `jest.mock` løftes bare i fila den står i, så de to mock-kallene må
// fortsatt stå i hver testfil:
//
//   import { mockNetwork, useWebRoute } from '../test/webRouteHarness';
//   jest.mock('../supabase', () => require('../test/supabaseMock'));
//   jest.mock('./syncTriggers', () => ({
//     isDeviceOnline: () => mockNetwork.online,
//   }));
//
// `mockNetwork` må importeres statisk, ikke hentes med `require` inne i
// fabrikken. Etter `jest.resetModules()` ville `require` gitt en NY instans av
// denne fila, og testens `mockNetwork.online = false` ville ikke nådd fram.
// Sesjonen er motsatt: `auth()` henter supabase-mocken på kalltidspunktet,
// fordi det er den ferske instansen koden under test snakker med.
/* eslint-disable @typescript-eslint/no-require-imports -- supabase-mocken hentes per test, etter jest.resetModules() (se harness.ts) */
import { useFreshModules } from './harness';

type Mocks = typeof import('./supabaseMock');

export const BASE_URL = 'https://staging.example';
export const GAME_ID = 'game-1';
export const TOKEN = 'access-token-abc';

/**
 * Nett-status, styrt per test. `mock`-prefikset er jests egen regel for
 * variabler en `jest.mock`-fabrikk får lov å lukke over.
 */
export const mockNetwork = { online: true };

export const mockFetch = jest.fn();

/** Auth-stubbene koden under test bruker, altså instansen etter nullstillingen. */
export function auth(): Mocks['supabase']['auth'] {
  return (require('./supabaseMock') as Mocks).supabase.auth;
}

/** Neste svar fra ruta. `json()` speiler ekte `Response` — den kan kaste. */
export function respondWith(status: number, body: unknown): void {
  mockFetch.mockResolvedValue({
    status,
    json: async () => body,
  } as unknown as Response);
}

/** Argumentene ruta faktisk ble kalt med. */
export function requestInit(): RequestInit {
  return mockFetch.mock.calls[0][1] as RequestInit;
}

/**
 * Frisk modulgraf og en innlogget, tilkoblet enhet per test.
 *
 * Kall den øverst i en `describe`, i stedet for `useFreshModules()`. Den kaller
 * `useFreshModules()` selv, og først, fordi rekkefølgen bærer: `getSession`
 * må stubbes ETTER `jest.resetModules()`, ellers stubbes instansen fra før
 * nullstillingen og koden under test ser ingen sesjon.
 */
/* eslint-disable react-hooks/immutability -- `use` er jest-konvensjonen fra harness.ts (registrerer beforeEach/afterEach), ikke en React-hook; å bytte ut globalene per test er hele jobben */
export function useWebRoute(): void {
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
}
/* eslint-enable react-hooks/immutability */
