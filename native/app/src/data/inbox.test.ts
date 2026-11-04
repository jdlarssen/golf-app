// #2759: innboksen i appen, hentet fra `/api/inbox`. Type A.
//
// Vakt-rekkefølgen (nett, adresse, token) er `webApi.test.ts` sin. Her låses det
// denne fila eier: hvilken sti og kropp som går ut, at svaret alltid blir en kode
// appen kjenner, og at en feil aldri blir en tom innboks (#1392).
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter jest.resetModules() (se harness.ts) */
import { NOT_WAITING_FILTER } from '../../../../lib/notifications/readOnVisit';
import {
  BASE_URL,
  mockFetch,
  mockNetwork,
  requestInit,
  respondWith,
  useWebRoute,
} from '../test/webRouteHarness';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('./syncTriggers', () => ({
  isDeviceOnline: () => mockNetwork.online,
}));

type Inbox = typeof import('./inbox');
type Mocks = typeof import('../test/supabaseMock');

function inbox(): Inbox {
  return require('./inbox') as Inbox;
}
function mocks(): Mocks {
  return require('../test/supabaseMock') as Mocks;
}

const ENTRY = {
  key: 'n1',
  title: 'Kristian vil bli med',
  subtitle: 'Onsdagsgolfen',
  subtitleIsFreeText: false,
  quote: null,
  body: null,
  cta: null,
  avatar: { kind: 'people', initials: ['KH'], more: 0 },
  placeLabel: null,
  destination: '/admin/games/g/signups',
  actionKey: 'decide',
  unread: true,
  unreadIds: [],
  friend: false,
  decidable: true,
};
const BOARD = {
  actionCount: 1,
  hasUnread: false,
  unreadCount: 4,
  sections: { action: [ENTRY], today: [], earlier: [] },
};

describe('loadInbox', () => {
  useWebRoute();

  it('henter tavla med GET og gir den videre', async () => {
    respondWith(200, BOARD);
    expect(await inbox().loadInbox()).toEqual({ ok: true, data: BOARD });
    expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/inbox`);
    expect(requestInit().method).toBe('GET');
  });

  it('en rad uten det skjermen trenger, hoppes over, og resten står', async () => {
    respondWith(200, { ...BOARD, sections: { action: [ENTRY, { key: 'x' }, 'søppel'], today: 'nei' } });
    const result = await inbox().loadInbox();
    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.data.sections).toEqual({ action: [ENTRY], today: [], earlier: [] });
    }
  });

  it('uten nett stopper det ved offline', async () => {
    mockNetwork.online = false;
    expect(await inbox().loadInbox()).toEqual({ ok: false, reason: 'offline' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('401 er unauthorized', async () => {
    respondWith(401, { error: 'unauthorized' });
    expect(await inbox().loadInbox()).toEqual({ ok: false, reason: 'unauthorized' });
  });

  it.each([
    ['500', 500, { error: 'load_failed' }],
    ['200 uten seksjoner', 200, { actionCount: 0 }],
  ])('%s er en feil, aldri en tom innboks (#1392)', async (_label, status, body) => {
    respondWith(status, body);
    expect(await inbox().loadInbox()).toEqual({ ok: false, reason: 'load_failed' });
  });
});

describe('fetchInboxUnreadCount', () => {
  useWebRoute();

  it('gir tallet fra serveren', async () => {
    respondWith(200, BOARD);
    expect(await inbox().fetchInboxUnreadCount()).toBe(4);
  });

  it('en feil gir null, så det forrige tallet står', async () => {
    respondWith(500, {});
    expect(await inbox().fetchInboxUnreadCount()).toBeNull();
  });
});

describe('decideRegistration', () => {
  useWebRoute();

  it('stien bærer varselets id, kroppen bare svaret', async () => {
    respondWith(200, { outcome: 'approved', gameName: 'G', teamName: null, name: 'Kristian' });
    expect(await inbox().decideRegistration('n1', 'approve')).toEqual({
      ok: true,
      outcome: 'approved',
      gameName: 'G',
      teamName: null,
      name: 'Kristian',
    });
    expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/inbox/n1/decide`);
    expect(requestInit().method).toBe('POST');
    expect(JSON.parse(requestInit().body as string)).toEqual({ decision: 'approve' });
  });

  it.each([
    [401, 'unauthorized', 'unauthorized'],
    [403, 'forbidden', 'forbidden'],
    [409, 'not_pending', 'not_pending'],
    [409, 'request_not_found', 'request_not_found'],
    [409, 'game_not_found', 'game_not_found'],
    [409, 'game_locked', 'game_locked'],
    [409, 'no_team_slot', 'no_team_slot'],
    [409, 'en_ny_kode', 'failed'],
    [404, 'not_found', 'failed'],
    [400, 'not_decidable', 'failed'],
    [500, 'failed', 'failed'],
  ])('%i %s blir %s', async (status, error, reason) => {
    respondWith(status, { error });
    expect(await inbox().decideRegistration('n1', 'reject')).toEqual({ ok: false, reason });
  });

  it('uten nett går kallet ikke ut', async () => {
    mockNetwork.online = false;
    expect(await inbox().decideRegistration('n1', 'approve')).toEqual({ ok: false, reason: 'offline' });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('markAllRead', () => {
  useWebRoute();

  it('alt ulest som ikke venter (eierens svar 04.11)', async () => {
    const { queryStub, routeFrom } = mocks();
    const stub = queryStub({ data: null, error: null });
    routeFrom({ notifications: [stub] });

    expect(await inbox().markAllRead()).toBe(true);
    expect(stub.steps).toEqual([
      { method: 'update', args: [{ read_at: expect.any(String) }] },
      { method: 'is', args: ['read_at', null] },
      { method: 'or', args: [NOT_WAITING_FILTER] },
    ]);
  });

  it('en feil gir false, så skjermen sier fra', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { queryStub, routeFrom } = mocks();
    routeFrom({ notifications: [queryStub({ data: null, error: { message: 'nede' } })] });
    expect(await inbox().markAllRead()).toBe(false);
    errorSpy.mockRestore();
  });
});

describe('clearReadRows', () => {
  useWebRoute();

  it('arkiverer det som er lest, og rører ikke noe annet', async () => {
    const { queryStub, routeFrom } = mocks();
    const stub = queryStub({ data: null, error: null });
    routeFrom({ notifications: [stub] });

    expect(await inbox().clearReadRows()).toBe(true);
    expect(stub.steps).toEqual([
      { method: 'update', args: [{ archived_at: expect.any(String) }] },
      { method: 'not', args: ['read_at', 'is', null] },
      { method: 'is', args: ['archived_at', null] },
    ]);
  });

  it('en kastet feil gir false og kastes aldri', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { supabase } = mocks();
    supabase.from.mockImplementation(() => {
      throw new Error('ingen nett');
    });
    await expect(inbox().clearReadRows()).resolves.toBe(false);
    errorSpy.mockRestore();
  });
});

describe('filterInboxSection', () => {
  useWebRoute();

  const venn = { ...ENTRY, key: 'venn', friend: true } as never;
  const annet = { ...ENTRY, key: 'annet', friend: false } as never;

  it('«Alle» viser alt', () => {
    expect(inbox().filterInboxSection([venn, annet], 'today', 'all')).toEqual([venn, annet]);
  });

  it('«Krever handling» viser bare den seksjonen', () => {
    expect(inbox().filterInboxSection([annet], 'action', 'action')).toEqual([annet]);
    expect(inbox().filterInboxSection([annet], 'today', 'action')).toEqual([]);
    expect(inbox().filterInboxSection([annet], 'earlier', 'action')).toEqual([]);
  });

  it('«Venner» viser vennene i hver seksjon', () => {
    expect(inbox().filterInboxSection([venn, annet], 'action', 'friends')).toEqual([venn]);
    expect(inbox().filterInboxSection([venn, annet], 'earlier', 'friends')).toEqual([venn]);
  });
});
