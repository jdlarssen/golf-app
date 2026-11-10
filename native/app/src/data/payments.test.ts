// native/app/src/data/payments.test.ts
// #2749 PR C: «Hvem har betalt?» sett fra appen (Type A). Tyngdepunktet er at et
// svar aldri blir til noe annet enn det var: hver status har sin kode, og et
// uleselig 200-svar på lista er en feil, ikke et kort med «NaN».
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter jest.resetModules() (se harness.ts) */
import {
  BASE_URL,
  GAME_ID,
  TOKEN,
  mockFetch,
  mockNetwork,
  requestInit,
  respondWith,
  respondWithHtml,
  useWebRoute,
} from '../test/webRouteHarness';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('./syncTriggers', () => ({
  isDeviceOnline: () => mockNetwork.online,
}));

const URL = `${BASE_URL}/api/games/${GAME_ID}/payments`;
type Payments = typeof import('./payments');
const payments = () => require('./payments') as Payments;

const OVERVIEW = {
  entryFeeKr: 200,
  gameName: 'Lørdagsrunden',
  paidCount: 2,
  totalCount: 4,
  remindable: 2,
  players: [
    { userId: 'me', name: 'Sofie Aas', isGuest: false, withdrawn: false, paid: true },
    { userId: 'jonas', name: null, isGuest: true, withdrawn: false, paid: false },
  ],
};

describe('betaling', () => {
  useWebRoute();

  it('fetchPayments leser lista og tallene, med GET og Bearer-token', async () => {
    respondWith(200, OVERVIEW);

    expect(await payments().fetchPayments(GAME_ID)).toEqual({ ok: true, overview: OVERVIEW });
    expect(mockFetch.mock.calls[0][0]).toBe(URL);
    const init = requestInit();
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it.each([
    ['et tall som ikke er et tall', { ...OVERVIEW, paidCount: 'to' }],
    ['spillerne mangler', { ...OVERVIEW, players: undefined }],
    ['en spiller uten paid', { ...OVERVIEW, players: [{ userId: 'x', name: 'X' }] }],
  ])('fetchPayments: %s gir payments_failed', async (_name, body) => {
    respondWith(200, body);
    expect(await payments().fetchPayments(GAME_ID)).toEqual({ ok: false, reason: 'payments_failed' });
  });

  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'not_found'],
    [409, 'no_fee'],
    [500, 'payments_failed'],
    [400, 'payments_failed'],
  ])('status %i blir %s', async (status, reason) => {
    respondWith(status, { error: 'x' });
    expect(await payments().fetchPayments(GAME_ID)).toEqual({ ok: false, reason });
    expect(await payments().setPaid(GAME_ID, 'jonas', true)).toEqual({ ok: false, reason });
    expect(await payments().remindUnpaid(GAME_ID)).toEqual({ ok: false, reason });
  });

  it('en HTML-side foran appen blir ikke et svar', async () => {
    respondWithHtml(502);
    expect(await payments().fetchPayments(GAME_ID)).toEqual({ ok: false, reason: 'payments_failed' });
  });

  it('setPaid sender PUT med { paid } til spillerens sti', async () => {
    respondWith(200, { paid: false });

    expect(await payments().setPaid(GAME_ID, 'jonas', false)).toEqual({ ok: true });
    expect(mockFetch.mock.calls[0][0]).toBe(`${URL}/jonas`);
    const init = requestInit();
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ paid: false });
  });

  it('remindUnpaid sender POST og leser antallet; et manglende antall er 0, ikke en feil', async () => {
    respondWith(200, { reminded: 2 });
    expect(await payments().remindUnpaid(GAME_ID)).toEqual({ ok: true, reminded: 2 });
    expect(mockFetch.mock.calls[0][0]).toBe(`${URL}/remind`);
    expect(requestInit().method).toBe('POST');

    respondWith(200, {});
    expect(await payments().remindUnpaid(GAME_ID)).toEqual({ ok: true, reminded: 0 });
  });

  it('uten nett går ingenting ut', async () => {
    mockNetwork.online = false;
    expect(await payments().setPaid(GAME_ID, 'jonas', true)).toEqual({ ok: false, reason: 'offline' });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
