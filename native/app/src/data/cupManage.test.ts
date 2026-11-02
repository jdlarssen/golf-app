// #2752: klienten for «Styr cupen», trekket og byttet. Reglene er på serveren; her
// låses stiene, kroppene, og at en status blir en kode.
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter nettet er satt */
import { BASE_URL, mockFetch, mockNetwork, respondWith, useWebRoute } from '../test/webRouteHarness';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('./syncTriggers', () => ({
  isDeviceOnline: () => mockNetwork.online,
}));

const api = () => require('./cupManage') as typeof import('./cupManage');
const sent = () => {
  const [url, init] = mockFetch.mock.calls[0];
  return { url, method: init.method, body: init.body ? JSON.parse(init.body) : undefined };
};

describe('data/cupManage', () => {
  useWebRoute();

  it('leser rommet, og en 200 uten spillere er ikke noe å tegne', async () => {
    const view = { id: 'c', players: [], matches: [], sideAwards: [], finish: {} };
    respondWith(200, view);
    await expect(api().fetchCupManage('c')).resolves.toEqual({ ok: true, view });
    expect(sent().url).toBe(`${BASE_URL}/api/cup/c/manage`);

    respondWith(200, { id: 'c' });
    await expect(api().fetchCupManage('c')).resolves.toEqual({ ok: false, reason: 'load_failed' });
  });

  it.each([
    [401, 'unauthorized'],
    [403, 'not_manager'],
    [404, 'not_found'],
    [500, 'load_failed'],
  ])('status %i blir %s', async (status, reason) => {
    respondWith(status, { error: status === 403 ? 'not_manager' : 'load_failed' });
    await expect(api().fetchCupManage('c')).resolves.toEqual({ ok: false, reason });
  });

  it('bekreftelsen: spillerens egen uten id, arrangørens med', async () => {
    const view = { cup: {}, player: {}, matches: [] };
    respondWith(200, view);
    await api().fetchCupWithdrawal('c');
    expect(sent().url).toBe(`${BASE_URL}/api/cup/c/withdrawal`);

    mockFetch.mockClear();
    respondWith(200, view);
    await api().fetchCupWithdrawal('c', 'u 1');
    expect(sent().url).toBe(`${BASE_URL}/api/cup/c/withdrawal?userId=u%201`);
  });

  it('arrangørens trekk sender spilleren og valgene, og sier om det ble delvis', async () => {
    respondWith(200, { ok: true, partial: true });
    await expect(
      api().withdrawCupPlayer('c', 'u', { playOnGameIds: ['g1'], offeredGameIds: ['g1', 'g2'] }),
    ).resolves.toEqual({ ok: true, partial: true });
    expect(sent()).toMatchObject({
      url: `${BASE_URL}/api/cup/c/withdraw`,
      method: 'POST',
      body: { userId: 'u', playOnGameIds: ['g1'], offeredGameIds: ['g1', 'g2'] },
    });
  });

  it('en 403 beholder koden fra ruta: en spiller som er byttet ut, er ikke «arrangør-feil»', async () => {
    respondWith(403, { error: 'not_participant' });
    await expect(api().withdrawSelfFromCup('c')).resolves.toEqual({ ok: false, reason: 'not_participant' });
  });

  it('en regel som sier nei: koden fra ruta', async () => {
    respondWith(409, { error: 'no_pending_matches' });
    await expect(api().withdrawSelfFromCup('c')).resolves.toEqual({ ok: false, reason: 'no_pending_matches' });
    expect(sent().url).toBe(`${BASE_URL}/api/cup/c/withdraw-self`);
  });

  it('angring, makkervalg og bytte går til hver sin rute', async () => {
    respondWith(200, { ok: true });
    await api().undoCupWithdrawal('c', 'u');
    expect(sent()).toMatchObject({ url: `${BASE_URL}/api/cup/c/withdraw/undo`, body: { userId: 'u' } });

    mockFetch.mockClear();
    respondWith(200, { ok: true });
    await api().setCupPlayOn('c', 'g', false);
    expect(sent()).toMatchObject({ url: `${BASE_URL}/api/cup/c/matches/g/play-on`, body: { playOn: false } });

    mockFetch.mockClear();
    respondWith(200, { ok: true });
    await api().swapCupPlayer('c', 'g', 'ut', 'inn');
    expect(sent()).toMatchObject({
      url: `${BASE_URL}/api/cup/c/matches/g/swap`,
      body: { outUserId: 'ut', inUserId: 'inn' },
    });
  });

  it('avslutningene går til hver sin rute, og et nytt forsøk er suksess', async () => {
    respondWith(200, { ok: true, alreadyFinished: true });
    await expect(api().finishCup('c', true)).resolves.toMatchObject({ ok: true, alreadyFinished: true });
    expect(sent()).toEqual({ url: `${BASE_URL}/api/cup/c/finish`, method: 'POST', body: { allowMissing: true } });

    mockFetch.mockClear();
    respondWith(200, { ok: true, alreadyFinished: false });
    await expect(api().finishCupMatch('c', 'g', false)).resolves.toEqual({ ok: true, partial: false });
    expect(sent()).toEqual({
      url: `${BASE_URL}/api/cup/c/matches/g/finish`,
      method: 'POST',
      body: { allowMissing: false },
    });
  });

  it('sidepoengene går til hver sin rute, og null er «ingen kvalifiserte»', async () => {
    respondWith(200, { ok: true });
    await api().registerSideAwardWinner('c', 'a', null);
    expect(sent()).toEqual({
      url: `${BASE_URL}/api/cup/c/side-awards/a/winner`,
      method: 'POST',
      body: { winnerUserId: null },
    });

    mockFetch.mockClear();
    respondWith(200, { ok: true });
    await api().registerGirCounts('c', 'a', 2, 0);
    expect(sent()).toEqual({
      url: `${BASE_URL}/api/cup/c/side-awards/a/gir`,
      method: 'POST',
      body: { team1Count: 2, team2Count: 0 },
    });
  });

  it('en regel som stopper avslutningen: koden fra ruta', async () => {
    respondWith(409, { error: 'side_awards_missing' });
    await expect(api().finishCup('c', false)).resolves.toEqual({ ok: false, reason: 'side_awards_missing' });
  });

  it('kandidatene', async () => {
    const view = { gameId: 'g', out: [], in: [], blocked: null };
    respondWith(200, view);
    await expect(api().fetchCupSwapCandidates('c', 'g')).resolves.toEqual({ ok: true, view });
    expect(sent().url).toBe(`${BASE_URL}/api/cup/c/matches/g/swap-candidates`);
  });

  it('uten nett går ingenting ut', async () => {
    mockNetwork.online = false;
    await expect(api().swapCupPlayer('c', 'g', 'ut', 'inn')).resolves.toEqual({ ok: false, reason: 'offline' });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
