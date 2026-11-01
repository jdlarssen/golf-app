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

  it('venter på en åpen transaksjon i stedet for å feile med «database is locked» (#1954 A4)', async () => {
    // Hjem henter lista mens en drain eller en slag-seed står i `withTxn` på
    // en egen forbindelse. Cache-skrivingen må stå i samme kø.
    mocks().currentDeviceUserId.mockResolvedValue(ME);
    routeOneList();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const openTxn = db().withTxn(() => gate);

    const refreshing = home().refreshHomeCards(ME);
    await new Promise((resolve) => setTimeout(resolve, 20));
    release();

    await expect(refreshing).resolves.toMatchObject({ cards: [{ gameId: 'game-1' }] });
    await openTxn;
    expect(await cacheRow()).toBeDefined();
  });
});

// #2254: startboden trenger mer fra samme spørring — formatet, segmentet,
// avslutningstiden, plassen og flighten — og brutto for forrige runde.
describe('startboden (#2254)', () => {
  useFreshModules();

  /** Et avsluttet spill i formen spørringen gir, med egen plass lagret. */
  function finishedRow(id: string, endedAt: string | null, createdAt: string) {
    return {
      game_id: id,
      submitted_at: '2026-09-01T12:00:00.000Z',
      withdrawn_at: null,
      approved_at: null,
      result_summary: { kind: 'placement', rank: 2, fieldSize: 8, isTeam: false },
      flight_number: 1,
      games: {
        id,
        name: `Runde ${id}`,
        status: 'finished',
        game_mode: 'stableford',
        hole_segment: 'full',
        created_at: createdAt,
        ended_at: endedAt,
        scheduled_tee_off_at: null,
        require_peer_approval: false,
        courses: { name: 'Losby' },
      },
    };
  }

  it('tar med format, segment, avslutningstid, plass og flight på kortet', async () => {
    const { queryStub, routeFrom } = mocks();
    const active = {
      ...ROW,
      result_summary: null,
      flight_number: 2,
      games: { ...ROW.games, game_mode: 'texas_scramble', hole_segment: 'full', ended_at: null },
    };
    routeFrom({ game_players: [queryStub({ data: [active], error: null })] });

    const list = await home().fetchHomeCards(ME);

    expect(list.version).toBe(4);
    expect(list.lastRound).toBeNull();
    expect(list.cards[0]).toMatchObject({
      gameMode: 'texas_scramble',
      holeSegment: 'full',
      endedAt: null,
      resultSummary: null,
      flightNumber: 2,
    });
  });

  it('henter brutto for forrige runde, og bare for den', async () => {
    const { queryStub, routeFrom, stepArgs } = mocks();
    const gamesStub = queryStub({
      data: [{ id: 'new', source_game_id: null, game_mode: 'stableford' }],
      error: null,
    });
    const scoresStub = queryStub({
      data: [
        { game_id: 'new', strokes: 5 },
        { game_id: 'new', strokes: 4 },
      ],
      error: null,
    });
    routeFrom({
      game_players: [
        queryStub({
          data: [
            finishedRow('old', '2026-09-20T15:00:00.000Z', '2026-09-25T08:00:00.000Z'),
            finishedRow('new', '2026-09-27T15:00:00.000Z', '2026-09-01T08:00:00.000Z'),
          ],
          error: null,
        }),
        queryStub({ data: [{ game_id: 'new', course_handicap: 3 }], error: null }),
      ],
      games: [gamesStub],
      scores: [scoresStub],
    });

    const list = await home().fetchHomeCards(ME);

    // Forrige runde er den som ble avsluttet sist, ikke den som ble laget sist.
    expect(list.lastRound).toEqual({ gameId: 'new', brutto: 9, netto: 6, teamBall: false });
    expect(stepArgs(gamesStub, 'in')).toEqual([['id', ['new']]]);
    expect(list.cards.find((c) => c.gameId === 'new')?.resultSummary).toEqual({
      kind: 'placement',
      rank: 2,
      fieldSize: 8,
      isTeam: false,
    });
  });

  it('lar forrige runde stå uten brutto når hentingen av slagene feiler', async () => {
    const { queryStub, routeFrom } = mocks();
    mocks().currentDeviceUserId.mockResolvedValue(ME);
    routeFrom({
      game_players: [
        queryStub({
          data: [finishedRow('new', '2026-09-27T15:00:00.000Z', '2026-09-01T08:00:00.000Z')],
          error: null,
        }),
      ],
      games: [queryStub({ data: null, error: { message: 'nettet falt' } })],
    });

    const list = await home().refreshHomeCards(ME);

    expect(list.cards).toHaveLength(1);
    expect(list.lastRound).toBeNull();
    // Lista havner likevel i cachen.
    expect(await home().loadHomeCards()).toEqual(list);
  });

  it('leser en cache uten riktig versjon som «ingen cache»', async () => {
    const { getDb, putCacheEntry } = db();
    const write = async (payload: string) =>
      putCacheEntry(await getDb(), {
        key: home().HOME_CACHE_KEY,
        payload,
        fetchedAt: '2026-09-28T00:00:00.000Z',
      });

    // Formen appen skrev før #2254: ingen versjon, ingen nye felt på kortene.
    await write(JSON.stringify({ cards: [ROW], fetchedAt: '2026-09-28T00:00:00.000Z' }));
    expect(await home().loadHomeCards()).toBeUndefined();

    await write(JSON.stringify({ version: 1, cards: [], lastRound: null, fetchedAt: 'x' }));
    expect(await home().loadHomeCards()).toBeUndefined();

    await write('{ødelagt');
    expect(await home().loadHomeCards()).toBeUndefined();
  });
});

describe('en avsluttet cup (#2214)', () => {
  useFreshModules();

  /** En cup-kamp i formen spørringen gir, med cupens status embeddet. */
  function cupRow(id: string, status: string, endedAt: string | null) {
    return {
      game_id: id,
      submitted_at: null,
      withdrawn_at: null,
      approved_at: null,
      result_summary: null,
      flight_number: null,
      games: {
        id,
        name: `Kamp ${id}`,
        status,
        game_mode: 'singles_matchplay',
        hole_segment: 'full',
        created_at: '2026-09-01T08:00:00.000Z',
        ended_at: endedAt,
        scheduled_tee_off_at: '2026-09-02T08:00:00.000Z',
        require_peer_approval: false,
        courses: { name: 'Losby' },
        tournament: { status: 'finished' },
      },
    };
  }

  it('dropper en planlagt kamp i en avsluttet cup, og lar den ferdige stå', async () => {
    const { queryStub, routeFrom } = mocks();
    routeFrom({
      game_players: [
        queryStub({
          data: [
            cupRow('aldri-spilt', 'scheduled', null),
            cupRow('spilt', 'finished', '2026-09-01T15:00:00.000Z'),
          ],
          error: null,
        }),
      ],
    });

    const list = await home().fetchHomeCards(ME);

    expect(list.cards.map((c) => c.gameId)).toEqual(['spilt']);
  });
});

describe('splitHomeCards', () => {
  const card = (
    gameId: string,
    status: string,
    createdAt: string,
    endedAt: string | null = null,
  ) => ({
    gameId,
    name: gameId,
    status,
    courseName: null,
    scheduledTeeOffAt: null,
    createdAt,
    state: null,
    gameMode: 'stableford',
    holeSegment: 'full',
    endedAt,
    resultSummary: null,
    flightNumber: null,
    leagueRoundId: null,
  });

  it('sorterer avsluttede på avslutningstid, nyest først, og faller tilbake på opprettet', () => {
    const { splitHomeCards } = require('./homeList') as Home;
    const { finished } = splitHomeCards([
      card('laget-sist', 'finished', '2026-09-26T08:00:00.000Z', '2026-09-10T15:00:00.000Z'),
      card('spilt-sist', 'finished', '2026-09-01T08:00:00.000Z', '2026-09-27T15:00:00.000Z'),
      card('uten-slutt', 'finished', '2026-09-20T08:00:00.000Z', null),
    ]);
    expect(finished.map((c) => c.gameId)).toEqual(['spilt-sist', 'uten-slutt', 'laget-sist']);
  });

  // #2752: én runde, ett kort, som på nettet (#1449).
  describe('en delt cup-dag', () => {
    const half = (gameId: string, holeSegment: string, overrides: Record<string, unknown> = {}) => ({
      ...card(gameId, 'active', '2026-11-01T07:00:00.000Z'),
      holeSegment,
      scheduledTeeOffAt: '2026-11-01T09:00:00.000Z',
      tournamentId: 'cup-1',
      cupName: 'Klubbmesterskapet',
      withdrawn: false,
      state: 'continue' as const,
      ...overrides,
    });

    it('står som ett kort: første halvdel, med cupens navn og andre halvdel på seg', () => {
      const { active } = home().splitHomeCards([half('back', 'back9'), half('front', 'front9')]);

      expect(active).toHaveLength(1);
      expect(active[0]).toMatchObject({
        gameId: 'front',
        pairedGameId: 'back',
        name: 'Klubbmesterskapet',
        holeSegment: 'front9',
      });
    });

    it('står i planlagt til en av halvdelene har startet', () => {
      const scheduled = { status: 'scheduled', state: null };
      const before = home().splitHomeCards([half('front', 'front9', scheduled), half('back', 'back9', scheduled)]);
      expect(before.scheduled.map((c) => c.gameId)).toEqual(['front']);
      expect(before.active).toEqual([]);

      const started = home().splitHomeCards([half('front', 'front9'), half('back', 'back9', scheduled)]);
      expect(started.active.map((c) => c.gameId)).toEqual(['front']);
      expect(started.scheduled).toEqual([]);
    });

    it('kortet er levert først når begge halvdelene er det', () => {
      const { active } = home().splitHomeCards([
        half('front', 'front9', { state: 'submitted' }),
        half('back', 'back9', { state: 'continue' }),
      ]);
      expect(active[0].state).toBe('continue');
    });

    it.each([
      ['du er trukket fra en av halvdelene', { withdrawn: true }],
      ['halvdelene er fra to ulike cuper', { tournamentId: 'cup-2' }],
      ['halvdelene spilles to ulike dager', { scheduledTeeOffAt: '2026-11-02T09:00:00.000Z' }],
    ])('står som to kort når %s', (_label, overrides) => {
      const { active } = home().splitHomeCards([
        half('front', 'front9'),
        half('back', 'back9', overrides),
      ]);
      expect(active.map((c) => c.gameId).sort()).toEqual(['back', 'front']);
      expect(active[0].pairedGameId).toBeUndefined();
    });

    // Hermes mangler ICU-tidssonene (`homeDates.ts`). En feil her ville tatt ned
    // hele Hjem for alle som spiller en cup, med grønne tester i Node.
    it('spør ikke om Oslo-tid: Hermes kaster på tidssoner', () => {
      const real = Intl.DateTimeFormat;
      const spy = jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(((
        locale: string,
        options?: Intl.DateTimeFormatOptions,
      ) => {
        if (options?.timeZone) throw new RangeError('Incorrect timeZone information provided');
        return new real(locale, options);
      }) as never);
      try {
        const { active } = home().splitHomeCards([half('front', 'front9'), half('back', 'back9')]);
        expect(active.map((c) => c.pairedGameId)).toEqual(['back']);
      } finally {
        spy.mockRestore();
      }
    });

    it('et vanlig spill og en halvdel uten motstykke står som før', () => {
      const { active } = home().splitHomeCards([
        card('plain', 'active', '2026-11-01T07:00:00.000Z'),
        half('alone', 'back9'),
      ]);
      expect(active.map((c) => c.gameId)).toEqual(['plain', 'alone']);
    });
  });

  it('holder grensen på fem avsluttede', () => {
    const { splitHomeCards } = require('./homeList') as Home;
    const many = Array.from({ length: 7 }, (_, i) =>
      card(`g${i}`, 'finished', '2026-09-01T08:00:00.000Z', `2026-09-0${i + 1}T15:00:00.000Z`),
    );
    expect(splitHomeCards(many).finished.map((c) => c.gameId)).toEqual([
      'g6',
      'g5',
      'g4',
      'g3',
      'g2',
    ]);
  });
});
