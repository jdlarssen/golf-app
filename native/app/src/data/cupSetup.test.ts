// #2752: klienten for oppsettet og cup-lenka. Reglene er på serveren; her låses stiene,
// kroppene, og at en status blir en kode.
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter nettet er satt */
import { BASE_URL, mockFetch, mockNetwork, respondWith, useWebRoute } from '../test/webRouteHarness';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('./syncTriggers', () => ({
  isDeviceOnline: () => mockNetwork.online,
}));

const api = () => require('./cupSetup') as typeof import('./cupSetup');
const sent = () => {
  const [url, init] = mockFetch.mock.calls[0];
  return { url, method: init.method, body: init.body ? JSON.parse(init.body) : undefined };
};

const DETAILS = { name: 'Cup', team1Name: 'Nord', team2Name: 'Sør', winPoints: '', tiePoints: '' };
const PLAN = {
  courseId: 'bane',
  teeBoxId: 'tee',
  teeOffAt: null,
  presetId: 'singler',
  customSessions: null,
  strategy: 'random' as const,
  bestBallAllowancePct: null,
};

describe('data/cupSetup', () => {
  useWebRoute();

  it('en ny cup gir id-en, og en 200 uten id er en feil', async () => {
    respondWith(200, { id: 'ny' });
    await expect(api().createCup(DETAILS)).resolves.toEqual({ ok: true, id: 'ny' });
    expect(sent()).toEqual({ url: `${BASE_URL}/api/cup`, method: 'POST', body: DETAILS });

    respondWith(200, {});
    await expect(api().createCup(DETAILS)).resolves.toEqual({ ok: false, reason: 'cup_insert_failed' });
  });

  it('en regel som sier nei: koden fra ruta', async () => {
    respondWith(409, { error: 'cup_team_dup' });
    await expect(api().createCup(DETAILS)).resolves.toEqual({ ok: false, reason: 'cup_team_dup' });
  });

  it('planen og sidepoengene går til hver sin rute', async () => {
    respondWith(200, { ok: true });
    await expect(api().saveCupPlan('c', PLAN)).resolves.toEqual({ ok: true });
    expect(sent()).toEqual({ url: `${BASE_URL}/api/cup/c/plan`, method: 'PUT', body: PLAN });

    mockFetch.mockClear();
    respondWith(200, { ok: true });
    const awards = [{ kind: 'ctp' as const, holeNumber: 7, points: 1, winnerCount: 1 }];
    await api().saveCupSideAwards('c', awards);
    expect(sent()).toEqual({ url: `${BASE_URL}/api/cup/c/side-awards`, method: 'PUT', body: { awards } });
  });

  it('spillerlista: legg til og fjern', async () => {
    respondWith(200, { ok: true });
    await api().addCupParticipant('c', 'u');
    expect(sent()).toEqual({ url: `${BASE_URL}/api/cup/c/participants`, method: 'POST', body: { userId: 'u' } });

    mockFetch.mockClear();
    respondWith(200, { ok: true });
    await api().removeCupParticipant('c', 'u');
    expect(sent()).toMatchObject({ url: `${BASE_URL}/api/cup/c/participants/u`, method: 'DELETE' });
  });

  it('lesingene: en 200 uten det skjermen skal tegne, er ikke noe å tegne', async () => {
    const setup = { id: 'c', status: 'draft', sideAwards: [] };
    respondWith(200, setup);
    await expect(api().fetchCupSetup('c')).resolves.toEqual({ ok: true, view: setup });
    respondWith(200, { id: 'c' });
    await expect(api().fetchCupSetup('c')).resolves.toEqual({ ok: false, reason: 'load_failed' });

    const list = { id: 'c', participants: [], candidates: [] };
    respondWith(200, list);
    await expect(api().fetchCupParticipants('c')).resolves.toEqual({ ok: true, view: list });
    respondWith(200, { id: 'c' });
    await expect(api().fetchCupParticipants('c')).resolves.toEqual({ ok: false, reason: 'load_failed' });
  });

  it.each([
    [401, { error: 'unauthorized' }, 'unauthorized'],
    [403, { error: 'not_manager' }, 'not_manager'],
    [404, {}, 'not_found'],
    [500, {}, 'load_failed'],
  ])('status %i blir en kode', async (status, body, reason) => {
    respondWith(status, body);
    await expect(api().fetchCupParticipants('c')).resolves.toEqual({ ok: false, reason });
  });

  it('cup-lenka: les, meld på og meld av, på samme sti', async () => {
    const view = { decision: 'can_join', cup: { id: 'c' } };
    respondWith(200, view);
    await expect(api().fetchCupJoin('abcd2345')).resolves.toEqual({ ok: true, view });
    expect(sent().url).toBe(`${BASE_URL}/api/cup/join/abcd2345`);

    mockFetch.mockClear();
    respondWith(200, { status: 'joined' });
    await expect(api().joinCup('abcd2345')).resolves.toEqual({ ok: true, status: 'joined' });
    expect(sent().method).toBe('POST');

    mockFetch.mockClear();
    respondWith(200, { status: 'left' });
    await expect(api().leaveCup('abcd2345')).resolves.toEqual({ ok: true, status: 'left' });
    expect(sent().method).toBe('DELETE');
  });

  it('en 200 uten status er ikke en kvittering', async () => {
    respondWith(200, {});
    await expect(api().joinCup('abcd2345')).resolves.toEqual({ ok: false, reason: 'load_failed' });
  });

  it('uten nett går ingenting ut', async () => {
    mockNetwork.online = false;
    await expect(api().joinCup('abcd2345')).resolves.toEqual({ ok: false, reason: 'offline' });
    await expect(api().saveCupPlan('c', PLAN)).resolves.toEqual({ ok: false, reason: 'offline' });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
