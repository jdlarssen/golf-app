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
      // #2759: en sak som venter, står til den er gjort.
      { method: 'or', args: [NOT_WAITING_FILTER] },
      ...(key ? [{ method: 'eq', args: [`payload->>${key}`, ENTITY] }] : []),
    ]);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it.each<VisitSurface>(['gameApprove', 'gameHole', 'gameFinish', 'league', 'leagueRoundStart', 'leagueMarker'])(
    '#2759: %s har bare saker som venter, og skriver ingenting',
    async (surface) => {
      const { supabase } = mocks();
      await markVisitRead(surface, ENTITY);
      expect(supabase.from).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    },
  );

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
      // #2759: et push-trykk tar ikke ut en sak som venter.
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
  it('merker radene bak raden, bare uleste, og aldri en sak som venter', async () => {
    const { queryStub, routeFrom } = mocks();
    const stub = queryStub({ data: null, error: null });
    routeFrom({ notifications: [stub] });

    await markNotificationIdsRead([NOTE]);

    expect(stub.steps).toEqual([
      { method: 'update', args: [{ read_at: expect.any(String) }] },
      { method: 'in', args: ['id', [NOTE]] },
      { method: 'is', args: ['read_at', null] },
      { method: 'or', args: [NOT_WAITING_FILTER] },
    ]);
  });

  it('250 rader går i tre skiver, for id-ene står i adressen', async () => {
    const { queryStub, routeFrom } = mocks();
    const stubs = [0, 1, 2].map(() => queryStub({ data: null, error: null }));
    routeFrom({ notifications: stubs });
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);

    await markNotificationIdsRead(ids);

    const sizes = stubs.map((stub) => (stub.steps.find((step) => step.method === 'in')!.args[1] as string[]).length);
    expect(sizes).toEqual([100, 100, 50]);
  });

  it('en feil stopper resten, logges og kastes aldri', async () => {
    const { queryStub, routeFrom, supabase } = mocks();
    routeFrom({ notifications: [queryStub({ data: null, error: { message: 'nede' } })] });
    await expect(markNotificationIdsRead(Array.from({ length: 150 }, (_, i) => `id-${i}`))).resolves.toBeUndefined();
    expect(supabase.from).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalled();
  });
});
