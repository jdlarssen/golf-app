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

  it('åpner en fersk base rett på v2', async () => {
    const { getCacheEntry, getDb, putCacheEntry } = require('./db') as Db;
    const db = await getDb();

    expect(
      await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;'),
    ).toEqual({ user_version: 2 });

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

  it('løfter en v1-base til v2 med N2-dataene i behold', async () => {
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
    ).toEqual({ user_version: 2 });

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
