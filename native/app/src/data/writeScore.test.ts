// Native N3 (#1825): `writeScore` er inngangen for HVERT slag spilleren taster.
// De tre reglene den hviler på (merge, strengt økende tidsstempel, score + kø i
// én transaksjon) var uten testdekning gjennom hele N2 — her er de låst.
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter jest.resetModules() (se harness.ts) */
import { useFreshModules } from '../test/harness';

const GAME = 'game-1';
const ME = 'user-me';
const FROZEN = '2026-08-30T10:00:00.000Z';

describe('writeScore', () => {
  useFreshModules();

  beforeEach(() => {
    // Frossen klokke: to tastinger deler millisekund med vilje, for det er
    // nettopp da regelen om strengt økende tidsstempler har en jobb å gjøre.
    jest.useFakeTimers({ now: new Date(FROZEN) });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('beholder et utelatt felt og nuller et eksplisitt null', async () => {
    const { writeScore } = require('./writeScore') as typeof import('./writeScore');
    const { getDb, getScore, scoreKey } = require('./db') as typeof import('./db');

    await writeScore({
      gameId: GAME,
      userId: ME,
      holeNumber: 1,
      strokes: 4,
      putts: 2,
      enteredBy: ME,
    });

    // Putte-tasting uten slag: slaget skal overleve.
    const afterPutts = await writeScore({
      gameId: GAME,
      userId: ME,
      holeNumber: 1,
      putts: 3,
      enteredBy: ME,
    });
    expect(afterPutts.strokes).toBe(4);
    expect(afterPutts.putts).toBe(3);

    // Eksplisitt null er «nullstill», ikke «la stå».
    const afterClear = await writeScore({
      gameId: GAME,
      userId: ME,
      holeNumber: 1,
      strokes: null,
      enteredBy: ME,
    });
    expect(afterClear.strokes).toBeNull();
    expect(afterClear.putts).toBe(3);

    const db = await getDb();
    const stored = await getScore(db, scoreKey(GAME, ME, 1));
    expect(stored).toMatchObject({
      strokes: null,
      putts: 3,
      enteredBy: ME,
      serverUpdatedAt: null,
    });
  });

  it('gir strengt økende clientUpdatedAt selv når klokka står stille', async () => {
    const { writeScore } = require('./writeScore') as typeof import('./writeScore');

    const first = await writeScore({
      gameId: GAME,
      userId: ME,
      holeNumber: 2,
      strokes: 3,
      enteredBy: ME,
    });
    const second = await writeScore({
      gameId: GAME,
      userId: ME,
      holeNumber: 2,
      strokes: 4,
      enteredBy: ME,
    });
    const third = await writeScore({
      gameId: GAME,
      userId: ME,
      holeNumber: 2,
      strokes: 5,
      enteredBy: ME,
    });

    expect(first.clientUpdatedAt).toBe(FROZEN);
    expect(second.clientUpdatedAt).toBe('2026-08-30T10:00:00.001Z');
    expect(third.clientUpdatedAt).toBe('2026-08-30T10:00:00.002Z');
    // Serveren applyer bare på strict `>`; uten bumpen ville trykk nr. 2 blitt
    // avvist og den ELDRE server-raden skrevet tilbake over spillerens tall.
    expect(second.clientUpdatedAt > first.clientUpdatedAt).toBe(true);
    expect(third.clientUpdatedAt > second.clientUpdatedAt).toBe(true);
  });

  it('bruker veggklokka når tiden faktisk har gått', async () => {
    const { writeScore } = require('./writeScore') as typeof import('./writeScore');

    const first = await writeScore({
      gameId: GAME,
      userId: ME,
      holeNumber: 3,
      strokes: 3,
      enteredBy: ME,
    });
    jest.setSystemTime(new Date('2026-08-30T10:05:00.000Z'));
    const second = await writeScore({
      gameId: GAME,
      userId: ME,
      holeNumber: 3,
      strokes: 4,
      enteredBy: ME,
    });

    expect(first.clientUpdatedAt).toBe(FROZEN);
    expect(second.clientUpdatedAt).toBe('2026-08-30T10:05:00.000Z');
  });

  it('erstatter kø-elementet for hullet i stedet for å legge på et nytt', async () => {
    const { writeScore } = require('./writeScore') as typeof import('./writeScore');
    const { getDb, listQueue, scoreKey } = require('./db') as typeof import('./db');

    for (const strokes of [3, 4, 5]) {
      await writeScore({
        gameId: GAME,
        userId: ME,
        holeNumber: 4,
        strokes,
        enteredBy: ME,
      });
    }

    const queue = await listQueue(await getDb());
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      id: scoreKey(GAME, ME, 4),
      scoreId: scoreKey(GAME, ME, 4),
      attemptCount: 0,
      abandonedAt: null,
    });
    // createdAt = clientUpdatedAt gir køen samme rekkefølge som tastingene.
    expect(queue[0]!.createdAt).toBe('2026-08-30T10:00:00.002Z');
  });

  it('skriver score og kø-rad atomisk — feiler kø-skrivingen, finnes ingen score', async () => {
    const { writeScore } = require('./writeScore') as typeof import('./writeScore');
    const { getDb, getScore, scoreKey } = require('./db') as typeof import('./db');

    const db = await getDb();
    // Riv kø-tabellen: INSERT-en inne i transaksjonen kaster, og hele
    // transaksjonen skal rulles tilbake. En score uten kø-element ville vært et
    // slag som aldri når serveren.
    await db.execAsync('DROP TABLE sync_queue;');

    await expect(
      writeScore({
        gameId: GAME,
        userId: ME,
        holeNumber: 5,
        strokes: 4,
        enteredBy: ME,
      }),
    ).rejects.toThrow(/sync_queue/);

    expect(await getScore(db, scoreKey(GAME, ME, 5))).toBeUndefined();
  });
});
