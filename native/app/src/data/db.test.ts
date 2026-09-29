// Native N3 (#1825): skjema-migrasjonen 1 → 2.
//
// Den farligste raden i hele datalaget er den som ALT ligger på en spillers
// telefon fra N2. Migrasjonen er additiv med vilje, og denne suiten rigger en
// ekte v1-formet base (samme `MIGRATION_V1` koden selv bruker) og sjekker at
// scoren overlever løftet.
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter jest.resetModules() (se harness.ts) */
import { useFreshModules } from '../test/harness';

type Db = typeof import('./db');
type SqliteMock = typeof import('../test/sqliteMock');

const GAME = 'game-1';
const ME = 'user-me';

describe('lokalt skjema', () => {
  useFreshModules();

  it('åpner en fersk base rett på v3', async () => {
    const { getCacheEntry, getDb, putCacheEntry } = require('./db') as Db;
    const db = await getDb();

    expect(
      await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;'),
    ).toEqual({ user_version: 3 });

    await putCacheEntry(db, {
      key: 'game:1',
      payload: '{"hei":true}',
      fetchedAt: '2026-08-30T10:00:00.000Z',
    });
    expect(await getCacheEntry(db, 'game:1')).toEqual({
      key: 'game:1',
      payload: '{"hei":true}',
      fetchedAt: '2026-08-30T10:00:00.000Z',
    });
  });

  it('løfter en v1-base til v3 med N2-dataene i behold', async () => {
    const { DATABASE_NAME, MIGRATION_V1 } = require('./db') as Db;
    const { openDatabaseAsync } = require('../test/sqliteMock') as SqliteMock;

    // En telefon som alt kjørte N2: v1-skjema, user_version = 1, ett tastet slag.
    const existing = await openDatabaseAsync(DATABASE_NAME);
    await existing.execAsync(MIGRATION_V1);
    await existing.execAsync('PRAGMA user_version = 1;');
    await existing.runAsync(
      `INSERT INTO scores
         (id, game_id, user_id, hole_number, strokes, putts, entered_by, client_updated_at, server_updated_at)
       VALUES ($id, $game_id, $user_id, 7, 5, 2, $entered_by, $client_updated_at, NULL);`,
      {
        $id: `${GAME}:${ME}:7`,
        $game_id: GAME,
        $user_id: ME,
        $entered_by: ME,
        $client_updated_at: '2026-08-30T09:00:00.000Z',
      },
    );

    const { getCacheEntry, getDb, listScoresForGame, putCacheEntry } =
      require('./db') as Db;
    const db = await getDb();

    expect(
      await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;'),
    ).toEqual({ user_version: 3 });

    // Slaget står, uendret.
    expect(await listScoresForGame(db, GAME)).toEqual([
      {
        id: `${GAME}:${ME}:7`,
        gameId: GAME,
        userId: ME,
        holeNumber: 7,
        strokes: 5,
        putts: 2,
        enteredBy: ME,
        clientUpdatedAt: '2026-08-30T09:00:00.000Z',
        serverUpdatedAt: null,
      },
    ]);

    // …og den nye tabellen er på plass.
    await putCacheEntry(db, {
      key: `game:${GAME}`,
      payload: '{"game":{}}',
      fetchedAt: '2026-08-30T10:00:00.000Z',
    });
    expect(await getCacheEntry(db, `game:${GAME}`)).toMatchObject({
      payload: '{"game":{}}',
    });
  });

  // #2256: en telefon som alt har appen, står på v2 med hjem-lista og spill i
  // cachen. Løftet til v3 legger bare til `device_settings`.
  it('løfter en v2-base til v3 med cachen i behold', async () => {
    const { DATABASE_NAME, MIGRATION_V1, MIGRATION_V2 } = require('./db') as Db;
    const { openDatabaseAsync } = require('../test/sqliteMock') as SqliteMock;

    const existing = await openDatabaseAsync(DATABASE_NAME);
    await existing.execAsync(MIGRATION_V1);
    await existing.execAsync(MIGRATION_V2);
    await existing.execAsync('PRAGMA user_version = 2;');
    await existing.runAsync(
      `INSERT INTO cache_entries (key, payload, fetched_at)
       VALUES ('home', '{"cards":[]}', '2026-09-29T10:00:00.000Z');`,
    );

    const { getCacheEntry, getDb, getDeviceSetting, putDeviceSetting } =
      require('./db') as Db;
    const db = await getDb();

    expect(
      await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;'),
    ).toEqual({ user_version: 3 });
    expect(await getCacheEntry(db, 'home')).toMatchObject({ payload: '{"cards":[]}' });

    expect(await getDeviceSetting(db, 'theme')).toBeUndefined();
    await putDeviceSetting(db, 'theme', 'dark');
    expect(await getDeviceSetting(db, 'theme')).toBe('dark');
  });

  it('erstatter en innstilling i stedet for å legge på en ny rad', async () => {
    const { getDb, getDeviceSetting, putDeviceSetting } = require('./db') as Db;
    const db = await getDb();

    await putDeviceSetting(db, 'theme', 'dark');
    await putDeviceSetting(db, 'theme', 'light');

    expect(await getDeviceSetting(db, 'theme')).toBe('light');
    expect(
      await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM device_settings;'),
    ).toEqual({ n: 1 });
  });

  it('erstatter en cache-nøkkel i stedet for å legge på en ny rad', async () => {
    const { getCacheEntry, getDb, putCacheEntry } = require('./db') as Db;
    const db = await getDb();

    await putCacheEntry(db, {
      key: 'home',
      payload: 'først',
      fetchedAt: '2026-08-30T10:00:00.000Z',
    });
    await putCacheEntry(db, {
      key: 'home',
      payload: 'sist',
      fetchedAt: '2026-08-30T10:05:00.000Z',
    });

    expect(await getCacheEntry(db, 'home')).toEqual({
      key: 'home',
      payload: 'sist',
      fetchedAt: '2026-08-30T10:05:00.000Z',
    });
    expect(
      await db.getFirstAsync<{ n: number }>(
        'SELECT COUNT(*) AS n FROM cache_entries;',
      ),
    ).toEqual({ n: 1 });
  });

  it('gir undefined for en nøkkel som aldri er skrevet', async () => {
    const { getCacheEntry, getDb } = require('./db') as Db;
    expect(await getCacheEntry(await getDb(), 'finnes-ikke')).toBeUndefined();
  });
});

// Native N6d (#1876): wipe-primitiven bak konto-sletting (og #1877s utlogging).
describe('wipeLocalData', () => {
  useFreshModules();

  /** Tabell-lista slik BASEN kjenner den — ikke en kopi skrevet av her. */
  async function tableNames(db: Awaited<ReturnType<Db['getDb']>>) {
    const rows = await db.getAllAsync<{ name: string }>(
      `SELECT name FROM sqlite_master
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name;`,
    );
    return rows.map((row) => row.name);
  }

  async function countRows(
    db: Awaited<ReturnType<Db['getDb']>>,
    tables: string[],
  ) {
    const counts: Record<string, number> = {};
    for (const table of tables) {
      // Navnet kommer fra sqlite_master, aldri fra brukerdata; PRAGMA-lignende
      // identifikatorer kan uansett ikke bindes som parameter.
      const row = await db.getFirstAsync<{ n: number }>(
        `SELECT COUNT(*) AS n FROM "${table}";`,
      );
      counts[table] = row?.n ?? 0;
    }
    return counts;
  }

  it('etterlater ingen rad fra kontoen, men lar telefonens innstillinger stå', async () => {
    const {
      getDb,
      putCacheEntry,
      putConflict,
      putDeviceSetting,
      putQueueItem,
      putScore,
      wipeLocalData,
    } = require('./db') as Db;
    const db = await getDb();

    await putScore(db, {
      id: `${GAME}:${ME}:1`,
      gameId: GAME,
      userId: ME,
      holeNumber: 1,
      strokes: 4,
      putts: 2,
      enteredBy: ME,
      clientUpdatedAt: '2026-09-01T09:00:00.000Z',
      serverUpdatedAt: null,
    });
    await putQueueItem(db, {
      id: 'kø-1',
      scoreId: `${GAME}:${ME}:1`,
      attemptCount: 0,
      lastError: null,
      createdAt: '2026-09-01T09:00:01.000Z',
      abandonedAt: null,
    });
    await putConflict(db, {
      id: 'konflikt-1',
      gameId: GAME,
      userId: ME,
      holeNumber: 1,
      localStrokes: 4,
      serverStrokes: 5,
      resolvedAt: '2026-09-01T09:00:02.000Z',
      forOwnScore: true,
    });
    await putCacheEntry(db, {
      key: `game:${GAME}`,
      payload: '{"game":{}}',
      fetchedAt: '2026-09-01T09:00:03.000Z',
    });
    await putDeviceSetting(db, 'theme', 'dark');

    const tables = await tableNames(db);

    // Forhåndsbetingelsen ER halve testen: er en tabell tom alt før wipe-en,
    // beviser «tom etterpå» ingenting om den. Den eksplisitte fasiten her er
    // med vilje — legges det til en femte tabell, feiler denne linja først, og
    // neste forfatter må både seede den OG ta stilling til om `wipeLocalData`
    // skal tømme den.
    expect(await countRows(db, tables)).toEqual({
      cache_entries: 1,
      conflicts: 1,
      device_settings: 1,
      scores: 1,
      sync_queue: 1,
    });

    await wipeLocalData();

    // Fasiten leses ut av basen: en tabell wipe-en ikke rører blir rød her,
    // uten at noen må huske å utvide en liste i testen. Det ene unntaket står
    // navngitt: `device_settings` hører til telefonen, ikke kontoen (#2256),
    // så temaet overlever utlogging og sletting.
    const SURVIVES_WIPE: Record<string, number> = { device_settings: 1 };
    expect(await countRows(db, tables)).toEqual(
      Object.fromEntries(tables.map((table) => [table, SURVIVES_WIPE[table] ?? 0])),
    );
  });

  it('lar skjemaet stå, så neste innlogging skriver rett videre', async () => {
    const { getCacheEntry, getDb, putCacheEntry, wipeLocalData } =
      require('./db') as Db;
    const db = await getDb();

    await putCacheEntry(db, {
      key: 'home',
      payload: 'før',
      fetchedAt: '2026-09-01T09:00:00.000Z',
    });
    await wipeLocalData();

    // Ingen ny migrasjonsrunde, ingen død forbindelse: samme `getDb()` svarer.
    expect(
      await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;'),
    ).toEqual({ user_version: 3 });
    expect(await getCacheEntry(db, 'home')).toBeUndefined();

    await putCacheEntry(db, {
      key: 'home',
      payload: 'etter',
      fetchedAt: '2026-09-01T09:05:00.000Z',
    });
    expect(await getCacheEntry(db, 'home')).toMatchObject({
      payload: 'etter',
    });
  });
});

describe('deleteConflict', () => {
  useFreshModules();

  it('fjerner bare det avviste varselet', async () => {
    const { getDb, putConflict, deleteConflict, listConflictsForGame } = require('./db') as Db;
    const db = await getDb();
    const base = {
      gameId: GAME,
      userId: ME,
      localStrokes: 4,
      serverStrokes: 5,
      resolvedAt: '2026-09-01T09:00:02.000Z',
      forOwnScore: true,
    };
    await putConflict(db, { ...base, id: 'konflikt-1', holeNumber: 1 });
    await putConflict(db, { ...base, id: 'konflikt-2', holeNumber: 2 });

    await deleteConflict(db, 'konflikt-1');

    expect((await listConflictsForGame(db, GAME)).map((c) => c.id)).toEqual(['konflikt-2']);
  });
});
