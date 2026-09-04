// native/app/src/data/localOwner.test.ts
// Native #1942: eier-vakten ved innlogging.
//
// Tyngdepunktet er ÉN historie, fortalt mot ekte sqlite og ekte drain: A taster
// et slag uten dekning, logger ut «likevel», B logger inn på samme telefon.
// Beviset er negativt — ingen `upsert_score_if_newer` med A sin `p_user_id`
// under B — og det kan bare gis når køen, drainen og vakten spiller sammen.
// En drain-mock ville bare bevist at mocken er enig med seg selv.
//
// Resten er kjernen alene: de tre utfallene, og at et kast fra wipen lar
// stempelet stå på forrige eier så neste oppstart prøver igjen.
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter jest.resetModules() (se harness.ts) */
import { useFreshModules } from '../test/harness';

jest.mock('../supabase', () => require('../test/supabaseMock'));
// Pakkens egen jest-mock: et lager i minnet som `jest.resetModules()` bygger
// på nytt per test, så hvert stempel starter blankt.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest'),
);

const GAME = 'game-1';
const USER_A = 'user-a';
const USER_B = 'user-b';

type Mocks = typeof import('../test/supabaseMock');
type Db = typeof import('./db');
type Owner = typeof import('./localOwner');
type Storage = typeof import('@react-native-async-storage/async-storage').default;

function mocks(): Mocks {
  return require('../test/supabaseMock') as Mocks;
}

function db(): Db {
  return require('./db') as Db;
}

function owner(): Owner {
  return require('./localOwner') as Owner;
}

function storage(): Storage {
  return (require('@react-native-async-storage/async-storage') as { default: Storage })
    .default;
}

/** Ett tastet slag: score-rad + kø-rad, i én transaksjon (som på enheten). */
async function typeStroke(userId: string, strokes: number): Promise<void> {
  const { writeScore } = require('./writeScore') as typeof import('./writeScore');
  await writeScore({ gameId: GAME, userId, holeNumber: 1, strokes, enteredBy: userId });
}

async function queueLength(): Promise<number> {
  const { getDb, listQueue } = db();
  return (await listQueue(await getDb())).length;
}

describe('detectOwnerChange', () => {
  const { detectOwnerChange } = require('./localOwner') as Owner;

  it.each([
    [null, USER_A, 'first'],
    ['', USER_A, 'first'],
    [USER_A, USER_A, 'same'],
    [USER_B, USER_A, 'switched'],
  ] as const)('lagret «%s», innlogget «%s» → %s', (stored, userId, expected) => {
    expect(detectOwnerChange(stored, userId)).toBe(expected);
  });
});

describe('ensureLocalDataOwnerOnDevice', () => {
  useFreshModules();

  beforeEach(() => {
    mocks().currentDeviceUserId.mockResolvedValue(USER_A);
  });

  it('stempler eieren ved første innlogging uten å røre basen', async () => {
    // Første oppstart etter oppdateringen: basen kan være full av brukerens
    // egne, ferdig synkede rader. De skal overleve.
    const { getDb, putScore, getScore, scoreKey } = db();
    await putScore(await getDb(), {
      id: scoreKey(GAME, USER_A, 1),
      gameId: GAME,
      userId: USER_A,
      holeNumber: 1,
      strokes: 4,
      putts: 2,
      enteredBy: USER_A,
      clientUpdatedAt: '2026-09-04T09:00:00.000Z',
      serverUpdatedAt: '2026-09-04T09:00:09.000Z',
    });

    expect(await owner().ensureLocalDataOwnerOnDevice(USER_A)).toBe('first');

    expect(await getScore(await getDb(), scoreKey(GAME, USER_A, 1))).toMatchObject({
      strokes: 4,
    });
    expect(await storage().getItem(owner().LOCAL_DATA_OWNER_KEY)).toBe(USER_A);
  });

  it('gjør ingenting når samme bruker logger inn igjen', async () => {
    const { supabase } = mocks();
    supabase.rpc.mockResolvedValue({
      data: null,
      error: { message: 'Network request failed' },
    });
    await owner().ensureLocalDataOwnerOnDevice(USER_A);
    await typeStroke(USER_A, 4);

    expect(await owner().ensureLocalDataOwnerOnDevice(USER_A)).toBe('same');

    // Det uleverte slaget ligger der til drainen får dekning.
    expect(await queueLength()).toBe(1);
  });

  it('tømmer A sine rester før B sin første drain — og drainen ringer aldri for A', async () => {
    const { supabase, currentDeviceUserId } = mocks();
    const { logOut } = require('./logout') as typeof import('./logout');
    const { drainQueue } = require('./syncWorker') as typeof import('./syncWorker');

    // A: uten dekning, ett slag i køen, «Logg ut likevel».
    await owner().ensureLocalDataOwnerOnDevice(USER_A);
    supabase.auth.signOut.mockResolvedValue({ error: null });
    supabase.rpc.mockResolvedValue({
      data: null,
      error: { message: 'Network request failed' },
    });
    await typeStroke(USER_A, 4);
    expect(await logOut({ keepUnsent: true })).toEqual({ ok: true });
    expect(await queueLength()).toBe(1);

    // B logger inn på samme telefon. Fra nå er hvert RPC-kall B sitt.
    supabase.rpc.mockClear();
    currentDeviceUserId.mockResolvedValue(USER_B);

    expect(await owner().ensureLocalDataOwnerOnDevice(USER_B)).toBe('switched');

    // Basen er tom FØR første drain …
    expect(await queueLength()).toBe(0);
    const { getDb, getScore, scoreKey } = db();
    expect(await getScore(await getDb(), scoreKey(GAME, USER_A, 1))).toBeUndefined();
    expect(await storage().getItem(owner().LOCAL_DATA_OWNER_KEY)).toBe(USER_B);

    // … og drainen har ingenting å sende: ikke ett kall med A sin id under B.
    await drainQueue('oppstart');
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});

describe('ensureLocalDataOwner', () => {
  it('lar stempelet stå på forrige eier når wipen kaster', async () => {
    const { ensureLocalDataOwner } = owner();
    let stored: string | null = USER_A;
    const store = {
      getStoredOwnerId: async () => stored,
      setStoredOwnerId: async (userId: string) => {
        stored = userId;
      },
      clear: jest.fn(async () => {
        throw new Error('disken svarte ikke');
      }),
    };

    await expect(ensureLocalDataOwner(USER_B, store)).rejects.toThrow('disken svarte ikke');

    // Ikke stemplet over: neste oppstart ser fortsatt A og prøver wipen igjen.
    // Motsatt rekkefølge ville skrevet B over A sine rester for godt.
    expect(store.clear).toHaveBeenCalledTimes(1);
    expect(stored).toBe(USER_A);
  });
});
