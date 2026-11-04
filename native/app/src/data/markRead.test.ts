// #2201 PR 2: det du åpner i appen, er lest, som på webben. Type A mot den
// mockede Supabase-grensen: kvitteringen (`steps`) er spørringen som går ut.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { NOT_WAITING_FILTER, READ_ON_VISIT, type VisitSurface } from '../../../../lib/notifications/readOnVisit';
import { markNotificationIdsRead, markNotificationRead, markVisitRead } from './markRead';

jest.mock('../supabase', () => require('../test/supabaseMock'));

type Mocks = typeof import('../test/supabaseMock');
function mocks(): Mocks {
  return require('../test/supabaseMock') as Mocks;
}

const ENTITY = '0f8e6c1a-2b3d-4e5f-8a9b-0c1d2e3f4a5b';
const NOTE = '5f0c1b2a-3d4e-4f60-8a71-92b3c4d5e6f7';

let errorSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => errorSpy.mockRestore());

describe('markVisitRead', () => {
  it.each<{ surface: VisitSurface; key: string | null }>([
    { surface: 'gameHome', key: 'game_id' },
    { surface: 'gameHole', key: 'game_id' },
    { surface: 'gameApprove', key: 'game_id' },
    { surface: 'gameLeaderboard', key: 'game_id' },
    { surface: 'gameSubmit', key: 'game_id' },
    { surface: 'friends', key: null },
  ])('$surface: samme UPDATE som webben, nøkkel $key', async ({ surface, key }) => {
    const { queryStub, routeFrom } = mocks();
    const stub = queryStub({ data: null, error: null });
    routeFrom({ notifications: [stub] });

    await markVisitRead(surface, key ? ENTITY : undefined);

    // Bare egne rader: RLS (`notifications_update_own`) legger på
    // `user_id = auth.uid()`, så appens klient trenger ikke filteret selv.
    expect(stub.steps).toEqual([
      { method: 'update', args: [{ read_at: expect.any(String) }] },
      { method: 'is', args: ['read_at', null] },
      { method: 'in', args: ['kind', [...READ_ON_VISIT[surface].kinds]] },
      { method: 'or', args: [NOT_WAITING_FILTER] },
      ...(key ? [{ method: 'eq', args: [`payload->>${key}`, ENTITY] }] : []),
    ]);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('en flate med nøkkel uten id skriver ingenting og logger', async () => {
    const { supabase } = mocks();
    await markVisitRead('gameHome');
    expect(supabase.from).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('en DB-feil logges og kastes aldri', async () => {
    const { queryStub, routeFrom } = mocks();
    routeFrom({ notifications: [queryStub({ data: null, error: { message: 'nede' } })] });
    await expect(markVisitRead('gameHome', ENTITY)).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('en kastet feil (ingen nett) logges og kastes aldri', async () => {
    const { supabase } = mocks();
    supabase.from.mockImplementation(() => {
      throw new Error('ingen nett');
    });
    await expect(markVisitRead('friends')).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe('markNotificationRead', () => {
  it('merker akkurat den ene raden, bare om den er ulest', async () => {
    const { queryStub, routeFrom } = mocks();
    const stub = queryStub({ data: null, error: null });
    routeFrom({ notifications: [stub] });

    await markNotificationRead(NOTE);

    expect(stub.steps).toEqual([
      { method: 'update', args: [{ read_at: expect.any(String) }] },
      { method: 'eq', args: ['id', NOTE] },
      { method: 'is', args: ['read_at', null] },
      // #2759: et trykk på en push tar ikke en sak som venter ut av innboksen.
      { method: 'or', args: [NOT_WAITING_FILTER] },
    ]);
  });

  it('en DB-feil logges og kastes aldri', async () => {
    const { queryStub, routeFrom } = mocks();
    routeFrom({ notifications: [queryStub({ data: null, error: { message: 'nede' } })] });
    await expect(markNotificationRead(NOTE)).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe('markNotificationIdsRead', () => {
  it('merker radene i skiver på 100, og bare de uleste', async () => {
    const { queryStub, routeFrom, stepArgs } = mocks();
    const first = queryStub({ data: null, error: null });
    const second = queryStub({ data: null, error: null });
    routeFrom({ notifications: [first, second] });
    const ids = Array.from({ length: 150 }, (_, i) => `n-${i}`);

    await markNotificationIdsRead(ids);

    expect((stepArgs(first, 'in')[0]?.[1] as string[]).length).toBe(100);
    expect((stepArgs(second, 'in')[0]?.[1] as string[]).length).toBe(50);
    expect(stepArgs(first, 'is')).toEqual([['read_at', null]]);
  });

  it('en tom liste skriver ingenting', async () => {
    const { supabase } = mocks();
    await markNotificationIdsRead([]);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('en DB-feil logges og stopper resten, og kastes aldri', async () => {
    const { queryStub, routeFrom } = mocks();
    routeFrom({ notifications: [queryStub({ data: null, error: { message: 'nede' } })] });
    await expect(markNotificationIdsRead(Array.from({ length: 150 }, (_, i) => `n-${i}`))).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
  });
});
