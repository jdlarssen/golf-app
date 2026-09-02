// native/app/src/data/remind.test.ts
// Native #1889: purringen sett fra appen.
//
// Suiten har ett tyngdepunkt: **at et svar aldri blir til noe annet enn det
// det var.** Purringen sender mail til ekte spillere, og arrangøren handler på
// det appen sier — så en 409 som leses som «det gikk fint», eller en uleselig
// 200 som viser knappen «Purr på dem som mangler (NaN)», er verre enn en ærlig
// feil. Derfor er hver status-gren låst, og de to fail-closed-avlesningene
// (`targets` som ikke er et tall, `reminded` som mangler) testet hver for seg —
// de peker MED VILJE i hver sin retning, og en kopiert avlesning ville brutt
// den ene.
//
// Det som IKKE testes her: vakt-rekkefølgen som sådan (den er `webApi.ts` sin,
// og `account.test.ts` låser den for den andre ruta) og hvilke setninger kodene
// betyr (skjermens copy). Denne fila kjenner bare koder.
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
const REMIND_URL = `${BASE_URL}/api/games/${GAME_ID}/remind`;
const TOKEN = 'access-token-abc';

type Mocks = typeof import('../test/supabaseMock');
type Remind = typeof import('./remind');

const mockFetch = jest.fn();

function remind(): Remind {
  return require('./remind') as Remind;
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

describe('purring', () => {
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

  describe('fetchReminderPreview', () => {
    it('leser antallet og «sist purret» fra ruta', async () => {
      respondWith(200, { targets: 2, lastRemindedAt: '2026-09-02T10:15:00.000Z' });

      expect(await remind().fetchReminderPreview(GAME_ID)).toEqual({
        ok: true,
        targets: 2,
        lastRemindedAt: '2026-09-02T10:15:00.000Z',
      });
    });

    it('spør med GET og Bearer-token, uten kropp og uten query', async () => {
      respondWith(200, { targets: 0, lastRemindedAt: null });

      await remind().fetchReminderPreview(GAME_ID);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      // Eksakt URL: spillet identifiseres av STIEN, brukeren av tokenet. Sender
      // appen aldri en id i en query, finnes det ingen id å forveksle med en
      // annens.
      expect(mockFetch.mock.calls[0][0]).toBe(REMIND_URL);
      const init = requestInit();
      expect(init.method).toBe('GET');
      expect((init.headers as Record<string, string>).Authorization).toBe(
        `Bearer ${TOKEN}`,
      );
      expect(init.body).toBeUndefined();
    });

    it('godtar 0 mål — det er et svar, ikke en feil', async () => {
      // 0 betyr «ingen er ferdige ennå». Skjermen viser da setningen i stedet
      // for knappen; å kalle det en feil ville skjult forklaringen.
      respondWith(200, { targets: 0, lastRemindedAt: null });

      expect(await remind().fetchReminderPreview(GAME_ID)).toEqual({
        ok: true,
        targets: 0,
        lastRemindedAt: null,
      });
    });

    it('leser et manglende «sist purret» som null, ikke som en feil', async () => {
      respondWith(200, { targets: 1 });

      expect(await remind().fetchReminderPreview(GAME_ID)).toEqual({
        ok: true,
        targets: 1,
        lastRemindedAt: null,
      });
    });

    it('nekter et uleselig antall i stedet for å gjette', async () => {
      // Fail-closed: uten et brukbart tall vet vi ikke hvem knappen ville
      // truffet, og «Purr på dem som mangler (NaN)» er verre enn en feil.
      respondWith(200, { targets: 'to', lastRemindedAt: null });

      expect(await remind().fetchReminderPreview(GAME_ID)).toEqual({
        ok: false,
        reason: 'remind_failed',
      });
    });

    it.each([
      [401, 'unauthorized'],
      [403, 'forbidden'],
      [404, 'not_found'],
      [409, 'not_active'],
      [500, 'remind_failed'],
    ])('oversetter %i til %s', async (status, reason) => {
      respondWith(status, { error: reason });

      expect(await remind().fetchReminderPreview(GAME_ID)).toEqual({
        ok: false,
        reason,
      });
    });

    it('holder på statusen selv når kroppen er uleselig', async () => {
      // En 409 fra et lag foran appen vår kan være HTML. Statusen er allerede
      // lest, så et uleselig svar skal ikke bli en ANNEN feil enn den sier.
      mockFetch.mockResolvedValue({
        status: 409,
        json: async () => {
          throw new SyntaxError('Unexpected token <');
        },
      } as unknown as Response);

      expect(await remind().fetchReminderPreview(GAME_ID)).toEqual({
        ok: false,
        reason: 'not_active',
      });
    });

    it('spør ikke uten nett', async () => {
      mockNetwork.online = false;

      expect(await remind().fetchReminderPreview(GAME_ID)).toEqual({
        ok: false,
        reason: 'offline',
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('sendReminder', () => {
    it('purrer med POST og svarer med antallet som ble purret', async () => {
      respondWith(200, { reminded: 3 });

      expect(await remind().sendReminder(GAME_ID)).toEqual({
        ok: true,
        reminded: 3,
      });
      expect(mockFetch.mock.calls[0][0]).toBe(REMIND_URL);
      const init = requestInit();
      expect(init.method).toBe('POST');
      expect((init.headers as Record<string, string>).Authorization).toBe(
        `Bearer ${TOKEN}`,
      );
      expect(init.body).toBeUndefined();
    });

    it('er purret selv om svaret ikke sa hvor mange', async () => {
      // 200 er kvitteringen; `reminded` er informasjon. Mail og push er
      // best-effort på serversiden, og et manglende tall skal ikke fortelle
      // arrangøren at purringen ikke gikk.
      respondWith(200, {});

      expect(await remind().sendReminder(GAME_ID)).toEqual({
        ok: true,
        reminded: 0,
      });
    });

    it.each([
      [401, 'unauthorized'],
      [403, 'forbidden'],
      [404, 'not_found'],
      [409, 'not_active'],
      [500, 'remind_failed'],
    ])('oversetter %i til %s', async (status, reason) => {
      respondWith(status, { error: reason });

      expect(await remind().sendReminder(GAME_ID)).toEqual({ ok: false, reason });
    });

    it('purrer ikke uten nett', async () => {
      mockNetwork.online = false;

      expect(await remind().sendReminder(GAME_ID)).toEqual({
        ok: false,
        reason: 'offline',
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('sier ifra når server-adressen mangler i bygget', async () => {
      delete process.env.EXPO_PUBLIC_WEB_BASE_URL;

      expect(await remind().sendReminder(GAME_ID)).toEqual({
        ok: false,
        reason: 'no-web-base-url',
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('sender ikke et kall uten sesjon', async () => {
      auth().getSession.mockResolvedValue({ data: { session: null } });

      expect(await remind().sendReminder(GAME_ID)).toEqual({
        ok: false,
        reason: 'unauthorized',
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('svarer network når kallet aldri kom fram', async () => {
      mockFetch.mockRejectedValue(new Error('Network request failed'));
      jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(await remind().sendReminder(GAME_ID)).toEqual({
        ok: false,
        reason: 'network',
      });
    });
  });
});
