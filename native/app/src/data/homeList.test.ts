// native/app/src/data/homeList.test.ts
// Native #1877: sesjonsvakten på hjem-cachen.
//
// Hullet vakten dekker: `HOME_CACHE_KEY` er global, uten `userId` i seg. En
// refetch som var i lufta da spilleren logget ut, kan lande etter at
// utloggingen tømte basen — og da ville forrige brukers kort ligget klare til
// den neste som logger inn på telefonen (#819-klassen). Derfor er «uten sesjon
// skrives det ikke» like viktig å låse som selve rundturen.
//
// Cachen leses fra den EKTE sqlite-mocken, ikke fra en spion på
// `putCacheEntry`: det er raden på disken som lekker, og det er raden testen
// skal se på.
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter jest.resetModules() (se harness.ts) */
import { useFreshModules } from '../test/harness';

jest.mock('../supabase', () => require('../test/supabaseMock'));

const ME = 'user-me';

type Mocks = typeof import('../test/supabaseMock');
type Db = typeof import('./db');
type Home = typeof import('./homeList');

function mocks(): Mocks {
  return require('../test/supabaseMock') as Mocks;
}

function home(): Home {
  return require('./homeList') as Home;
}

function db(): Db {
  return require('./db') as Db;
}

/** Én rad i formen `game_players`-spørringen faktisk gir. */
const ROW = {
  game_id: 'game-1',
  submitted_at: null,
  withdrawn_at: null,
  approved_at: null,
  games: {
    id: 'game-1',
    name: 'Torsdagsrunden',
    status: 'active',
    created_at: '2026-08-30T08:00:00.000Z',
    scheduled_tee_off_at: '2026-08-30T14:00:00.000Z',
    require_peer_approval: false,
    courses: { name: 'Losby' },
  },
};

function routeOneList(): void {
  const { queryStub, routeFrom } = mocks();
  routeFrom({ game_players: [queryStub({ data: [ROW], error: null })] });
}

/** Cache-raden slik den ligger på enheten, eller `undefined`. */
async function cacheRow() {
  const { getCacheEntry, getDb } = db();
  return getCacheEntry(await getDb(), home().HOME_CACHE_KEY);
}

describe('refreshHomeCards', () => {
  useFreshModules();

  it('skriver lista til cachen når det finnes en sesjon', async () => {
    mocks().currentDeviceUserId.mockResolvedValue(ME);
    routeOneList();

    const list = await home().refreshHomeCards(ME);

    expect(list.cards).toHaveLength(1);
    expect(list.cards[0]).toMatchObject({ gameId: 'game-1', courseName: 'Losby' });

    const row = await cacheRow();
    expect(row).toBeDefined();
    expect(JSON.parse(row!.payload)).toEqual(list);
    // Og den leses tilbake gjennom appens egen vei, ikke bare som rå rad.
    expect(await home().loadHomeCards()).toEqual(list);
  });

  it('lar cache-raden være i fred når sesjonen er borte', async () => {
    // Forrige brukers rad, akkurat slik den ville ligget igjen i vinduet
    // mellom utlogging og at refetchen lander.
    const { getDb, putCacheEntry } = db();
    await putCacheEntry(await getDb(), {
      key: home().HOME_CACHE_KEY,
      payload: '{"cards":[],"fetchedAt":"2026-08-29T00:00:00.000Z"}',
      fetchedAt: '2026-08-29T00:00:00.000Z',
    });

    mocks().currentDeviceUserId.mockResolvedValue(null);
    routeOneList();

    const list = await home().refreshHomeCards(ME);

    // Kalleren får lista si — det er bare sporet på disken vi ikke legger igjen.
    expect(list.cards).toHaveLength(1);

    expect(await cacheRow()).toEqual({
      key: home().HOME_CACHE_KEY,
      payload: '{"cards":[],"fetchedAt":"2026-08-29T00:00:00.000Z"}',
      fetchedAt: '2026-08-29T00:00:00.000Z',
    });
  });

  it('skriver ingen ny rad når sesjonen er borte og cachen er tom', async () => {
    mocks().currentDeviceUserId.mockResolvedValue(null);
    routeOneList();

    await home().refreshHomeCards(ME);

    expect(await cacheRow()).toBeUndefined();
    expect(await home().loadHomeCards()).toBeUndefined();
  });

  it('lar cachen være når en ANNEN bruker rakk å logge inn imens', async () => {
    // Det verre tilfellet, og grunnen til at vakten sammenligner id-er i stedet
    // for å nøye seg med «finnes det en sesjon?». `fetch` i React Native har
    // ingen tidsavbrudd, så A sin refetch kan henge lenge: A logger ut, B
    // logger inn, og FØRST DA lander svaret. Det finnes en sesjon — den er bare
    // ikke A sin. En null-sjekk ville sluppet A sine spillnavn rett inn på B
    // sitt hjem.
    mocks().currentDeviceUserId.mockResolvedValue('user-someone-else');
    routeOneList();

    const list = await home().refreshHomeCards(ME);

    expect(list.cards).toHaveLength(1);
    expect(await cacheRow()).toBeUndefined();
  });
});
