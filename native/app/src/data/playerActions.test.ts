// Native N3 (#1825), #2215: godkjenn og avvis, sett fra appen.
//
// Siden #2215 går begge via scorekort-ruta. Reglene (hvem som får vurdere
// kortet, 0-rads-oppløsningen, kuttet av grunnen, sentinelen for «ingen grunn»)
// bor i `lib/games/reviewScorecardCore.ts` og rutas port, og testes der. Det som
// testes her er OVERSETTELSEN: at hvert svar ruta kan gi blir den koden skjermen
// skal vise, og aldri noe annet. En 422 som leses som «godkjent» sender
// spilleren videre i troen på at kortet er i orden.
//
// `routeFrom({})` i hver test er en påstand i seg selv: en tom plan kaster på
// enhver spørring, så en test som går grønt beviser at appen ikke skrev noe
// selv ved siden av ruta.
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

const MATE = 'user-mate';
const REVIEW_URL = `${BASE_URL}/api/games/${GAME_ID}/scorecards/${MATE}`;

type Mocks = typeof import('../test/supabaseMock');
type Actions = typeof import('./playerActions');

function mocks(): Mocks {
  return require('../test/supabaseMock') as Mocks;
}

function actions(): Actions {
  return require('./playerActions') as Actions;
}

/** Kroppen kallet ble sendt med, lest tilbake fra JSON. */
function sentBody(): unknown {
  return JSON.parse(String(requestInit().body));
}

describe('playerActions via scorekort-ruta (#2215)', () => {
  useWebRoute();

  beforeEach(() => {
    mocks().routeFrom({});
  });

  describe('approveScorecard', () => {
    it('godkjenner med POST …/scorecards/<uid>, Bearer og { decision: approve }', async () => {
      respondWith(200, { alreadyDone: false });

      expect(await actions().approveScorecard(GAME_ID, MATE)).toEqual({
        ok: true,
        alreadyDone: false,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        REVIEW_URL,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: `Bearer ${TOKEN}` }),
          body: JSON.stringify({ decision: 'approve' }),
        }),
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('bærer alreadyDone videre når kortet alt var godkjent', async () => {
      respondWith(200, { alreadyDone: true });

      expect(await actions().approveScorecard(GAME_ID, MATE)).toEqual({
        ok: true,
        alreadyDone: true,
      });
    });

    it('er godkjent selv om svaret ikke sa hvilken vei det gikk', async () => {
      // 200 er kvitteringen; `alreadyDone` er informasjon.
      respondWith(200, {});

      expect(await actions().approveScorecard(GAME_ID, MATE)).toEqual({
        ok: true,
        alreadyDone: false,
      });
    });

    it('koder spill- og spiller-id-en i stien', async () => {
      respondWith(200, { alreadyDone: false });

      await actions().approveScorecard('game/1', 'user?2');

      expect(mockFetch.mock.calls[0][0]).toBe(
        `${BASE_URL}/api/games/game%2F1/scorecards/user%3F2`,
      );
    });
  });

  describe('rejectScorecard', () => {
    it('sender { decision: reject, reason } med grunnen som den ble skrevet', async () => {
      respondWith(200, { alreadyDone: false });

      expect(await actions().rejectScorecard(GAME_ID, MATE, '  Hull 7 mangler  ')).toEqual(
        { ok: true, alreadyDone: false },
      );

      expect(mockFetch.mock.calls[0][0]).toBe(REVIEW_URL);
      expect(requestInit().method).toBe('POST');
      // Trimming, kutt og sentinel er kjernens (én regel, ett hjem) — appen
      // sender råteksten.
      expect(sentBody()).toEqual({ decision: 'reject', reason: '  Hull 7 mangler  ' });
    });

    it('sender ingen reason når ingen grunn er oppgitt', async () => {
      respondWith(200, { alreadyDone: false });

      await actions().rejectScorecard(GAME_ID, MATE);

      expect(sentBody()).toEqual({ decision: 'reject' });
    });
  });

  // Hver rad i svar-tabellen (kontrakten D2) låst til sin kode, for begge
  // handlingene: de deler oversettelsen, og en regresjon i én av dem skal ikke
  // gjemme seg bak at den andre er testet.
  describe.each([
    ['approveScorecard', () => actions().approveScorecard(GAME_ID, MATE)],
    ['rejectScorecard', () => actions().rejectScorecard(GAME_ID, MATE, 'E2E')],
  ] as const)('%s — svar-tabellen', (_name, act) => {
    it.each<[number, Record<string, unknown>, string]>([
      [401, { error: 'unauthorized' }, 'no-session'],
      [404, { error: 'not_found' }, 'not-active'],
      [409, { error: 'not_active' }, 'not-active'],
      [403, { error: 'forbidden' }, 'no-rows'],
      [422, { error: 'not_pending' }, 'no-rows'],
      [400, { error: 'bad_request' }, 'db'],
      [500, { error: 'review_failed' }, 'db'],
      // En kode vi ikke kjenner på en status som bærer koder: fail-closed.
      [409, { error: 'noe_nytt' }, 'db'],
      [422, { error: 'noe_nytt' }, 'db'],
      [418, {}, 'db'],
    ])('oversetter %i %j til %s, uten melding', async (status, body, reason) => {
      respondWith(status, body);

      // `toEqual` og ikke `toMatchObject`: `db` skal aldri bære serverens tekst.
      expect(await act()).toEqual({ ok: false, reason });
    });

    it('stopper uten nett før fetch', async () => {
      mockNetwork.online = false;

      expect(await act()).toEqual({ ok: false, reason: 'offline' });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('sier ifra når server-adressen mangler i bygget', async () => {
      delete process.env.EXPO_PUBLIC_WEB_BASE_URL;

      expect(await act()).toEqual({ ok: false, reason: 'no-web-base-url' });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('leser en manglende sesjon som no-session, uten å sende noe', async () => {
      auth().getSession.mockResolvedValue({ data: { session: null } });

      expect(await act()).toEqual({ ok: false, reason: 'no-session' });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('leser et kall som aldri kom fram som db', async () => {
      mockFetch.mockRejectedValue(new Error('Network request failed'));
      jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(await act()).toEqual({ ok: false, reason: 'db' });
    });
  });
});
