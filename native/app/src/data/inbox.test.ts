// #2759: innboksen i appen. Type A.
//
// Vakt-rekkefølgen (nett, adresse, token) er `webApi.test.ts` sin. Her låses det
// denne fila eier: stien og kroppen, at et svar uten seksjoner aldri blir en tom
// innboks (#1392), og de direkte lesingene og skrivingene under RLS.
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter jest.resetModules() (se harness.ts) */
import { DOT_KINDS } from '../../../../lib/notifications/readOnVisit';
import {
  BASE_URL,
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

type Inbox = typeof import('./inbox');
type Mocks = typeof import('../test/supabaseMock');

const inbox = () => require('./inbox') as Inbox;
const mocks = () => require('../test/supabaseMock') as Mocks;

const ENTRY = {
  key: 'n1',
  title: 'Kristian vil bli med',
  subtitle: 'Onsdagsgolfen',
  subtitleIsFreeText: false,
  quote: null,
  body: null,
  cta: null,
  avatar: { kind: 'people', initials: ['KM'], more: 0 },
  placeLabel: null,
  destination: '/admin/games/g/signups',
  actionKey: 'decide',
  unread: true,
  unreadIds: ['n1'],
  friend: false,
  decidable: true,
};

describe('loadInbox', () => {
  useWebRoute();

  it('henter tavla med GET og gir den videre', async () => {
    const board = { actionCount: 1, hasUnread: true, sections: { action: [ENTRY], today: [], earlier: [] } };
    respondWith(200, board);
    await expect(inbox().loadInbox()).resolves.toEqual({ ok: true, board });
    expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/inbox`);
    expect(requestInit().method).toBe('GET');
  });

  it('en rad uten tittel utelates, og en ukjent skive blir konvolutten', async () => {
    respondWith(200, {
      actionCount: 0,
      hasUnread: true,
      sections: {
        action: [],
        today: [{ key: 'uten-tittel' }, { ...ENTRY, avatar: { kind: 'noe-nytt' } }],
        earlier: 'tull',
      },
    });
    const result = await inbox().loadInbox();
    if (!result.ok) throw new Error('forventet tavla');
    expect(result.board.sections.today).toHaveLength(1);
    expect(result.board.sections.today[0]?.avatar).toEqual({ kind: 'icon', icon: 'konvolutt' });
    expect(result.board.sections.earlier).toEqual([]);
  });

  it.each([
    [500, { error: 'load_failed' }, 'load_failed'],
    [200, {}, 'load_failed'],
    [401, { error: 'unauthorized' }, 'unauthorized'],
  ])('status %i med %j er `%s`, aldri en tom innboks', async (status, body, reason) => {
    respondWith(status, body);
    await expect(inbox().loadInbox()).resolves.toEqual({ ok: false, reason });
  });

  it('uten nett stopper den ved `offline`, uten kall', async () => {
    mockNetwork.online = false;
    await expect(inbox().loadInbox()).resolves.toEqual({ ok: false, reason: 'offline' });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('decideRequest', () => {
  useWebRoute();

  it('stien bærer varselet, og kroppen bare svaret', async () => {
    respondWith(200, { outcome: 'approved', gameName: 'Y', teamName: null, name: 'Kristian' });
    await expect(inbox().decideRequest('n1', 'approve')).resolves.toEqual({
      ok: true,
      outcome: 'approved',
      gameName: 'Y',
      teamName: null,
      name: 'Kristian',
    });
    expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/inbox/n1/decide`);
    expect(requestInit().method).toBe('POST');
    expect(JSON.parse(requestInit().body as string)).toEqual({ decision: 'approve' });
  });

  it.each([
    [403, { reason: 'forbidden' }, 'forbidden'],
    [409, { reason: 'game_locked' }, 'game_locked'],
    [404, { error: 'not_found' }, 'error'],
    [500, {}, 'error'],
  ])('status %i er `%s`-saken serveren sa', async (status, body, reason) => {
    respondWith(status, body);
    await expect(inbox().decideRequest('n1', 'reject')).resolves.toEqual({ ok: false, reason });
  });

  it('uten nett stopper den ved `offline`', async () => {
    mockNetwork.online = false;
    await expect(inbox().decideRequest('n1', 'approve')).resolves.toEqual({ ok: false, reason: 'offline' });
  });
});

describe('lesing og skriving under RLS', () => {
  useWebRoute();

  let errorSpy: jest.SpyInstance;
  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => errorSpy.mockRestore());

  it('tallet teller uleste av de samme typene som prikken, så nyheter teller ikke', async () => {
    const { queryStub, routeFrom, stepArgs } = mocks();
    const stub = queryStub({ data: null, error: null, count: 3 } as never);
    routeFrom({ notifications: [stub] });
    await expect(inbox().unreadCount()).resolves.toBe(3);
    expect(stepArgs(stub, 'is')).toEqual([['read_at', null]]);
    expect(stepArgs(stub, 'in')).toEqual([['kind', [...DOT_KINDS]]]);
    expect(DOT_KINDS).not.toContain('product_update');
  });

  it('en feilet telling er `null`, ikke null uleste', async () => {
    const { queryStub, routeFrom } = mocks();
    routeFrom({ notifications: [queryStub({ data: null, error: { message: 'nede' } })] });
    await expect(inbox().unreadCount()).resolves.toBeNull();
  });

  it('«Marker alt lest» merker bare uleste, og 0 rader er ingen feil', async () => {
    const { queryStub, routeFrom, stepArgs } = mocks();
    const stub = queryStub({ data: null, error: null });
    routeFrom({ notifications: [stub] });
    await expect(inbox().markAllRead()).resolves.toBe(true);
    expect(stepArgs(stub, 'update')[0]?.[0]).toHaveProperty('read_at');
    expect(stepArgs(stub, 'is')).toEqual([['read_at', null]]);
  });

  it('«Tøm leste» arkiverer bare leste, og sletter ingenting', async () => {
    const { queryStub, routeFrom, stepArgs } = mocks();
    const stub = queryStub({ data: null, error: null });
    routeFrom({ notifications: [stub] });
    await expect(inbox().clearRead()).resolves.toBe(true);
    expect(stepArgs(stub, 'update')[0]?.[0]).toHaveProperty('archived_at');
    expect(stepArgs(stub, 'not')).toEqual([['read_at', 'is', null]]);
    expect(stepArgs(stub, 'delete')).toEqual([]);
  });

  it.each(['markAllRead', 'clearRead'] as const)('%s er `false` ved feil, og kaster ikke', async (name) => {
    const { queryStub, routeFrom } = mocks();
    routeFrom({ notifications: [queryStub({ data: null, error: { message: 'nede' } })] });
    await expect(inbox()[name]()).resolves.toBe(false);
  });
});
