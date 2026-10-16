// #2580: `writeTeeShot` er inngangen for hvert trykk på «Hvem sitt utslag ble
// brukt?». Type A: raden og køen i én transaksjon, og stempelet strengt økende
// per rad (#2211), som webbens lib/sync/writeTeeShot.test.ts.
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter jest.resetModules() (se harness.ts) */
import { useFreshModules } from '../test/harness';

const GAME = 'game-1';
const ME = 'user-me';
const FROZEN = '2026-10-15T10:00:00.000Z';
const ARGS = { gameId: GAME, teamNumber: 1, holeNumber: 7, teeShotBy: 'marte', enteredBy: ME };

type Db = typeof import('./db');
type Write = typeof import('./writeTeeShot');

describe('writeTeeShot', () => {
  useFreshModules();

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date(FROZEN) });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('skriver raden og kø-elementet sammen, aldri via slagene', async () => {
    const { writeTeeShot } = require('./writeTeeShot') as Write;
    const { getDb, getTeeShot, listQueue, listTeeShotQueue, teeShotKey } = require('./db') as Db;

    const row = await writeTeeShot(ARGS);
    const db = await getDb();
    const id = teeShotKey(GAME, 1, 7);

    expect(row).toEqual({
      id,
      gameId: GAME,
      teamNumber: 1,
      holeNumber: 7,
      teeShotBy: 'marte',
      enteredBy: ME,
      clientUpdatedAt: FROZEN,
      serverUpdatedAt: null,
    });
    expect(await getTeeShot(db, id)).toEqual(row);
    expect(await listTeeShotQueue(db)).toEqual([
      { id, teeShotId: id, attemptCount: 0, lastError: null, createdAt: FROZEN, abandonedAt: null },
    ]);
    expect(await listQueue(db)).toEqual([]);
  });

  it('et nytt trykk i samme millisekund får 1 ms mer og erstatter kø-elementet', async () => {
    const { writeTeeShot } = require('./writeTeeShot') as Write;
    const { getDb, listTeeShotQueue } = require('./db') as Db;

    await writeTeeShot(ARGS);
    const second = await writeTeeShot({ ...ARGS, teeShotBy: 'per' });

    expect(second.clientUpdatedAt).toBe('2026-10-15T10:00:00.001Z');
    expect(await listTeeShotQueue(await getDb())).toEqual([
      expect.objectContaining({ createdAt: '2026-10-15T10:00:00.001Z' }),
    ]);
  });

  it('går forbi et lagret stempel i serverens format (+00:00), sammenlignet som øyeblikk', async () => {
    const { writeTeeShot } = require('./writeTeeShot') as Write;
    const { getDb, putTeeShot, teeShotKey } = require('./db') as Db;
    const id = teeShotKey(GAME, 1, 7);
    await putTeeShot(await getDb(), {
      ...ARGS,
      id,
      clientUpdatedAt: '2026-10-15T10:00:00.000+00:00',
      serverUpdatedAt: '2026-10-15T10:00:01.000+00:00',
    });

    expect((await writeTeeShot(ARGS)).clientUpdatedAt).toBe('2026-10-15T10:00:00.001Z');
  });

  it('tømming skriver null og står i køen', async () => {
    const { writeTeeShot } = require('./writeTeeShot') as Write;
    const { getDb, getTeeShot, listTeeShotQueue, teeShotKey } = require('./db') as Db;

    await writeTeeShot(ARGS);
    await writeTeeShot({ ...ARGS, teeShotBy: null });

    const db = await getDb();
    expect((await getTeeShot(db, teeShotKey(GAME, 1, 7)))?.teeShotBy).toBeNull();
    expect(await listTeeShotQueue(db)).toHaveLength(1);
  });
});
