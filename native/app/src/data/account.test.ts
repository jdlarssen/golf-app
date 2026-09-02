// native/app/src/data/account.test.ts
// Native #1876: konto-slettingen sett fra appen.
//
// Suiten har ett tyngdepunkt: **rekkefølgen, og når den IKKE skal skje.**
//
// `deleteAccount` gjør tre ting etter hverandre — POST, wipe av lokal base,
// lokal signOut — og bare den første er reversibel. Wipes det på et svar som
// ikke var 200, mister en bruker som fortsatt HAR kontoen sin de lokale dataene
// sine; 401 er den farlige, for den betyr som oftest bare at tokenet gikk ut
// mens bekreftelsesskjermen sto åpen. Derfor er hver ikke-200-gren testet med
// negativt bevis (verken wipe eller signOut), og suksess-stien asserteres som
// REKKEFØLGE via en delt kall-logg — «begge ble kalt» ville vært grønt også med
// signOut først, og da hadde App.tsx rukket å bytte skjerm midt i wipen.
//
// Det som IKKE testes her: at wipen faktisk tømmer alle fire tabellene
// (`db.test.ts`, mot ekte sqlite) og hvilke setninger kodene betyr
// (`accountCopy.test.ts`, med copy-paritet mot webbens `messages/no.json`).
// Denne fila kjenner bare koder.
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter jest.resetModules() (se harness.ts) */
import { useFreshModules } from '../test/harness';

jest.mock('../supabase', () => require('../test/supabaseMock'));

// Nett-status styres per test. `mock`-prefikset er jests egen regel for
// variabler en `jest.mock`-fabrikk får lov å lukke over.
const mockNetwork = { online: true };
jest.mock('./syncTriggers', () => ({
  isDeviceOnline: () => mockNetwork.online,
}));

// Kall-loggen er hele rekkefølge-beviset. Wipen skriver seg inn her, og
// signOut-stubben under gjør det samme, så en snudd rekkefølge blir rød.
const mockCalls: string[] = [];
jest.mock('./db', () => ({
  wipeLocalData: jest.fn(async () => {
    mockCalls.push('wipe');
  }),
}));

const BASE_URL = 'https://staging.example';
const DELETE_URL = `${BASE_URL}/api/account/delete`;
const TOKEN = 'access-token-abc';

type Mocks = typeof import('../test/supabaseMock');
type Account = typeof import('./account');

const mockFetch = jest.fn();

function account(): Account {
  return require('./account') as Account;
}

function auth(): Mocks['supabase']['auth'] {
  return (require('../test/supabaseMock') as Mocks).supabase.auth;
}

function wipeLocalData(): jest.Mock {
  return (require('./db') as { wipeLocalData: jest.Mock }).wipeLocalData;
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

/** Verken lokal base eller sesjon er rørt. */
function expectNothingWiped(): void {
  expect(wipeLocalData()).not.toHaveBeenCalled();
  expect(auth().signOut).not.toHaveBeenCalled();
  expect(mockCalls).toEqual([]);
}

describe('konto-sletting', () => {
  useFreshModules();

  const originalFetch = global.fetch;

  beforeEach(() => {
    mockNetwork.online = true;
    mockCalls.length = 0;
    mockFetch.mockReset();
    global.fetch = mockFetch as unknown as typeof fetch;
    process.env.EXPO_PUBLIC_WEB_BASE_URL = BASE_URL;

    auth().getSession.mockResolvedValue({
      data: { session: { access_token: TOKEN } },
    });
    auth().signOut.mockImplementation(async () => {
      mockCalls.push('signOut');
      return { error: null };
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
    delete process.env.EXPO_PUBLIC_WEB_BASE_URL;
  });

  describe('deleteAccount', () => {
    it('wiper lokal base FØR den logger ut lokalt, ved 200', async () => {
      respondWith(200, { mode: 'anonymized' });

      expect(await account().deleteAccount()).toEqual({
        ok: true,
        mode: 'anonymized',
      });

      // Rekkefølgen, ikke bare tilstedeværelsen: signOut flipper App.tsx til
      // Login og unmounter skjermene, så den må komme sist.
      expect(mockCalls).toEqual(['wipe', 'signOut']);
      expect(auth().signOut).toHaveBeenCalledWith({ scope: 'local' });
    });

    it('sender Bearer-tokenet og INGEN kropp — id-en kommer fra tokenet', async () => {
      respondWith(200, { mode: 'hard' });

      await account().deleteAccount();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][0]).toBe(DELETE_URL);
      const init = requestInit();
      expect(init.method).toBe('POST');
      expect((init.headers as Record<string, string>).Authorization).toBe(
        `Bearer ${TOKEN}`,
      );
      // Ingen kropp = ingen userId å forveksle med en annens. Ruta leser den
      // heller ikke, men appen skal ikke sende en engang.
      expect(init.body).toBeUndefined();
      // URL-en over er sammenlignet eksakt, altså ingen query-parameter heller.
    });

    it('wiper ALDRI på 401 — tokenet kan bare ha gått ut', async () => {
      respondWith(401, { error: 'unauthorized' });

      expect(await account().deleteAccount()).toEqual({
        ok: false,
        reason: 'unauthorized',
      });
      expectNothingWiped();
    });

    it('gir blokk-koden videre ved 403, uten å wipe', async () => {
      respondWith(403, { error: 'active_engagements' });

      expect(await account().deleteAccount()).toEqual({
        ok: false,
        reason: 'active_engagements',
      });
      expectNothingWiped();
    });

    it('leser en ukjent 403-kode som delete_failed', async () => {
      respondWith(403, { error: 'noe_helt_annet' });

      expect(await account().deleteAccount()).toEqual({
        ok: false,
        reason: 'delete_failed',
      });
      expectNothingWiped();
    });

    it('wiper ikke på 500', async () => {
      respondWith(500, { error: 'delete_failed' });

      expect(await account().deleteAccount()).toEqual({
        ok: false,
        reason: 'delete_failed',
      });
      expectNothingWiped();
    });

    it('wiper ikke når kallet aldri kom fram', async () => {
      mockFetch.mockRejectedValue(new Error('Network request failed'));
      jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(await account().deleteAccount()).toEqual({
        ok: false,
        reason: 'network',
      });
      expectNothingWiped();
    });

    it('nekter uten nett, og kaller aldri ruta', async () => {
      mockNetwork.online = false;

      expect(await account().deleteAccount()).toEqual({
        ok: false,
        reason: 'offline',
      });
      expect(mockFetch).not.toHaveBeenCalled();
      expectNothingWiped();
    });

    it('sier ifra når server-adressen mangler i bygget', async () => {
      delete process.env.EXPO_PUBLIC_WEB_BASE_URL;

      expect(await account().deleteAccount()).toEqual({
        ok: false,
        reason: 'no-web-base-url',
      });
      expect(mockFetch).not.toHaveBeenCalled();
      expectNothingWiped();
    });

    it('sender ikke et kall uten sesjon', async () => {
      auth().getSession.mockResolvedValue({ data: { session: null } });

      expect(await account().deleteAccount()).toEqual({
        ok: false,
        reason: 'unauthorized',
      });
      expect(mockFetch).not.toHaveBeenCalled();
      expectNothingWiped();
    });

    it('er slettet selv om svaret ikke sa hvilken gren serveren tok', async () => {
      // 200 er kvitteringen. `mode` er informasjon, og en manglende verdi der
      // skal ikke fortelle spilleren at slettingen feilet.
      respondWith(200, {});

      expect(await account().deleteAccount()).toEqual({ ok: true, mode: null });
      expect(mockCalls).toEqual(['wipe', 'signOut']);
    });

    it('er slettet selv om den lokale utloggingen feiler', async () => {
      respondWith(200, { mode: 'hard' });
      auth().signOut.mockRejectedValue(new Error('storage borte'));
      jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(await account().deleteAccount()).toEqual({ ok: true, mode: 'hard' });
      expect(mockCalls).toEqual(['wipe']);
    });
  });

  describe('fetchDeleteStatus', () => {
    it('svarer «ikke blokkert» og henter aldri noe lokalt', async () => {
      respondWith(200, { blocked: null });

      expect(await account().fetchDeleteStatus()).toEqual({
        ok: true,
        blocked: null,
      });
      const init = requestInit();
      expect(init.method).toBe('GET');
      expect((init.headers as Record<string, string>).Authorization).toBe(
        `Bearer ${TOKEN}`,
      );
      expectNothingWiped();
    });

    it('gir blokk-koden videre', async () => {
      respondWith(200, { blocked: 'admin_account' });

      expect(await account().fetchDeleteStatus()).toEqual({
        ok: true,
        blocked: 'admin_account',
      });
    });

    it('leser en ukjent blokk-kode som status_failed, ikke som «ikke blokkert»', async () => {
      // Fail-closed: vet vi ikke om kontoen kan slettes, skal skjermen si det —
      // ikke vise slette-knappen.
      respondWith(200, { blocked: 'noe_nytt' });

      expect(await account().fetchDeleteStatus()).toEqual({
        ok: false,
        reason: 'status_failed',
      });
    });

    it('oversetter 401 til unauthorized', async () => {
      respondWith(401, { error: 'unauthorized' });

      expect(await account().fetchDeleteStatus()).toEqual({
        ok: false,
        reason: 'unauthorized',
      });
    });

    it('oversetter 500 til status_failed, også når kroppen er uleselig', async () => {
      mockFetch.mockResolvedValue({
        status: 500,
        json: async () => {
          throw new SyntaxError('Unexpected token <');
        },
      } as unknown as Response);

      expect(await account().fetchDeleteStatus()).toEqual({
        ok: false,
        reason: 'status_failed',
      });
    });

    it('spør ikke uten nett', async () => {
      mockNetwork.online = false;

      expect(await account().fetchDeleteStatus()).toEqual({
        ok: false,
        reason: 'offline',
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
