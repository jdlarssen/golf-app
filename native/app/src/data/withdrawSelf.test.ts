// native/app/src/data/withdrawSelf.test.ts
// Native #1917: selv-frafallet sett fra appen.
//
// Suiten har ett tyngdepunkt: **at et svar aldri blir til noe annet enn det det
// var.** Frafallet tar spilleren ut av resultatene, og spilleren handler på det
// appen sier — så en 409 som leses som «det gikk fint» får noen til å tro de er
// ute av en runde de fortsatt står i. Derfor er hver status-gren låst, og begge
// verbene testet hver for seg: POST og DELETE er MOTSATTE handlinger på samme
// sti, og en kopiert verb-streng ville angret et frafall i stedet for å gjøre
// det.
//
// Det som IKKE testes her: vakt-rekkefølgen som sådan (den er `webApi.ts` sin,
// og `account.test.ts` låser den for den første ruta) og hvilke setninger kodene
// betyr (`rosterCopy.test.ts`). Denne fila kjenner bare koder.
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

const WITHDRAW_URL = `${BASE_URL}/api/games/${GAME_ID}/withdraw-self`;

type WithdrawSelf = typeof import('./withdrawSelf');

function api(): WithdrawSelf {
  return require('./withdrawSelf') as WithdrawSelf;
}

describe('selv-frafall', () => {
  useWebRoute();

  describe('withdrawSelf', () => {
    it('trekker med POST og Bearer-token, uten kropp og uten query', async () => {
      respondWith(200, { ok: true, kept: true });

      expect(await api().withdrawSelf(GAME_ID)).toEqual({ ok: true });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      // Eksakt URL: runden identifiseres av STIEN, spilleren av tokenet. Sender
      // appen aldri en id, finnes det ingen id å forveksle med en annens.
      expect(mockFetch.mock.calls[0][0]).toBe(WITHDRAW_URL);
      const init = requestInit();
      expect(init.method).toBe('POST');
      expect((init.headers as Record<string, string>).Authorization).toBe(
        `Bearer ${TOKEN}`,
      );
      expect(init.body).toBeUndefined();
    });

    it('er trukket selv om svaret ikke sa noe om raden', async () => {
      // Appen leser ikke `kept`: kallstedet henter bundelen på nytt, og den er
      // fasiten for hva skjermen viser. Et felt appen tolket selv ville vært en
      // andre sannhet om samme tilstand.
      respondWith(200, {});

      expect(await api().withdrawSelf(GAME_ID)).toEqual({ ok: true });
    });

    it.each([
      [401, 'unauthorized'],
      [403, 'not_registered'],
      [404, 'not_found'],
      [409, 'game_locked'],
      [500, 'withdraw_failed'],
    ])('oversetter %i til %s', async (status, reason) => {
      respondWith(status, { error: reason });

      expect(await api().withdrawSelf(GAME_ID)).toEqual({ ok: false, reason });
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

      expect(await api().withdrawSelf(GAME_ID)).toEqual({
        ok: false,
        reason: 'game_locked',
      });
    });

    it('trekker ikke uten nett', async () => {
      mockNetwork.online = false;

      expect(await api().withdrawSelf(GAME_ID)).toEqual({
        ok: false,
        reason: 'offline',
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('sier ifra når server-adressen mangler i bygget', async () => {
      delete process.env.EXPO_PUBLIC_WEB_BASE_URL;

      expect(await api().withdrawSelf(GAME_ID)).toEqual({
        ok: false,
        reason: 'no-web-base-url',
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('sender ikke et kall uten sesjon', async () => {
      auth().getSession.mockResolvedValue({ data: { session: null } });

      expect(await api().withdrawSelf(GAME_ID)).toEqual({
        ok: false,
        reason: 'unauthorized',
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('svarer network når kallet aldri kom fram', async () => {
      mockFetch.mockRejectedValue(new Error('Network request failed'));
      jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(await api().withdrawSelf(GAME_ID)).toEqual({
        ok: false,
        reason: 'network',
      });
    });
  });

  describe('undoSelfWithdraw', () => {
    it('angrer med DELETE på samme sti — verbet bærer handlingen', async () => {
      respondWith(200, { ok: true, kept: true });

      expect(await api().undoSelfWithdraw(GAME_ID)).toEqual({ ok: true });

      expect(mockFetch.mock.calls[0][0]).toBe(WITHDRAW_URL);
      const init = requestInit();
      expect(init.method).toBe('DELETE');
      expect(init.body).toBeUndefined();
    });

    it.each([
      [401, 'unauthorized'],
      [403, 'not_registered'],
      [404, 'not_found'],
      [409, 'game_locked'],
      [500, 'withdraw_failed'],
    ])('oversetter %i til %s', async (status, reason) => {
      respondWith(status, { error: reason });

      expect(await api().undoSelfWithdraw(GAME_ID)).toEqual({
        ok: false,
        reason,
      });
    });

    it('angrer ikke uten nett', async () => {
      mockNetwork.online = false;

      expect(await api().undoSelfWithdraw(GAME_ID)).toEqual({
        ok: false,
        reason: 'offline',
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('sender ikke et kall uten sesjon', async () => {
      auth().getSession.mockResolvedValue({ data: { session: null } });

      expect(await api().undoSelfWithdraw(GAME_ID)).toEqual({
        ok: false,
        reason: 'unauthorized',
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
