// Native N3 (#1825): `mergeServerScore` er den ENESTE veien en server-verdi kan
// erstatte en lokal utenfor drainen (realtime, seed, opphenting). LWW-porten og
// ekko-dempingen er hele grunnen til at en spillers eget trykk ikke ser ut som
// en konflikt et halvsekund senere.
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter jest.resetModules() (se harness.ts) */
import { useFreshModules } from '../test/harness';
import type { ServerScoreRow } from './realtime';

jest.mock('../supabase', () => require('../test/supabaseMock'));

const GAME = 'game-1';
const ME = 'user-me';
const MATE = 'user-mate';
const FROZEN = '2026-08-30T10:00:00.000Z';
const NEWER = '2026-08-30T10:05:00.000Z';
const OLDER = '2026-08-29T10:00:00.000Z';
const SERVER_TIME = '2026-08-30T10:05:01.000Z';

type Db = typeof import('./db');

/** Server-rad slik den kommer inn fra realtime eller en seed. */
function incoming(overrides: Partial<ServerScoreRow> = {}): ServerScoreRow {
  return {
    gameId: GAME,
    userId: ME,
    holeNumber: 1,
    strokes: 6,
    putts: null,
    enteredBy: MATE,
    clientUpdatedAt: NEWER,
    serverUpdatedAt: SERVER_TIME,
    ...overrides,
  };
}

async function typeStroke(strokes: number, enteredBy = ME): Promise<void> {
  const { writeScore } = require('./writeScore') as typeof import('./writeScore');
  await writeScore({
    gameId: GAME,
    userId: ME,
    holeNumber: 1,
    strokes,
    enteredBy,
  });
}

describe('mergeServerScore', () => {
  useFreshModules();

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date(FROZEN) });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each([
    ['eldre', OLDER],
    ['likt (ekkoet av egen skriving)', FROZEN],
  ])(
    'dropper %s tidsstempel uten å lage konfliktvarsel',
    async (_label: string, clientUpdatedAt: string) => {
      await typeStroke(4);
      const { mergeServerScore } = require('./realtime') as typeof import('./realtime');

      const outcome = await mergeServerScore(
        incoming({ strokes: 9, clientUpdatedAt }),
        ME,
      );

      expect(outcome).toBe('kept-local');
      const { getDb, getScore, listConflictsForGame, scoreKey } = require('./db') as Db;
      const db = await getDb();
      expect(await getScore(db, scoreKey(GAME, ME, 1))).toMatchObject({
        strokes: 4,
        clientUpdatedAt: FROZEN,
      });
      expect(await listConflictsForGame(db, GAME)).toHaveLength(0);
    },
  );

  it('lar en nyere server-rad vinne og varsler når den overskriver et tall tastet her', async () => {
    await typeStroke(4);
    const { mergeServerScore } = require('./realtime') as typeof import('./realtime');

    const outcome = await mergeServerScore(incoming({ putts: 2 }), ME);

    expect(outcome).toBe('applied-with-conflict');
    const { getDb, getScore, listConflictsForGame, listQueue, scoreKey } =
      require('./db') as Db;
    const db = await getDb();
    expect(await getScore(db, scoreKey(GAME, ME, 1))).toMatchObject({
      strokes: 6,
      putts: 2,
      enteredBy: MATE,
      clientUpdatedAt: NEWER,
      serverUpdatedAt: SERVER_TIME,
    });
    expect(await listConflictsForGame(db, GAME)).toMatchObject([
      { localStrokes: 4, serverStrokes: 6, forOwnScore: true },
    ]);
    // Den ventende opplastingen gjaldt en verdi som nettopp tapte LWW — å la den
    // stå ville brent en RPC som uansett kommer tilbake som no-op.
    expect(await listQueue(db)).toHaveLength(0);
  });

  it('varsler ikke når tallet som overskrives ble tastet på en annen enhet', async () => {
    // Raden ligger lokalt fordi en flight-makker tastet den; da er det ikke
    // denne spillerens tall som forsvinner.
    await typeStroke(4, MATE);
    const { mergeServerScore } = require('./realtime') as typeof import('./realtime');

    const outcome = await mergeServerScore(incoming(), ME);

    expect(outcome).toBe('applied');
    const { getDb, listConflictsForGame } = require('./db') as Db;
    expect(await listConflictsForGame(await getDb(), GAME)).toHaveLength(0);
  });

  it('legger inn en rad som ikke finnes lokalt fra før', async () => {
    const { mergeServerScore } = require('./realtime') as typeof import('./realtime');

    const outcome = await mergeServerScore(incoming(), ME);

    expect(outcome).toBe('applied');
    const { getDb, getScore, listConflictsForGame, scoreKey } = require('./db') as Db;
    const db = await getDb();
    expect(await getScore(db, scoreKey(GAME, ME, 1))).toMatchObject({
      strokes: 6,
      enteredBy: MATE,
    });
    expect(await listConflictsForGame(db, GAME)).toHaveLength(0);
  });

  it('faller tilbake på egen-rad-regelen når sesjonen ikke kan leses', async () => {
    // currentUserId = null: uten sesjon kan vi ikke vite hvem «du» er, så
    // proxyen fra før #1368 gjelder — enteredBy === userId.
    await typeStroke(4);
    const { mergeServerScore } = require('./realtime') as typeof import('./realtime');

    const outcome = await mergeServerScore(incoming(), null);

    expect(outcome).toBe('applied-with-conflict');
    const { getDb, listConflictsForGame } = require('./db') as Db;
    expect(await listConflictsForGame(await getDb(), GAME)).toMatchObject([
      { forOwnScore: true },
    ]);
  });
});
