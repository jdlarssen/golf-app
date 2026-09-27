// Native N3 (#1825): drain-utfallene. Rekkefølgen rundt `upsert_score_if_newer`
// er speilet kode (avgjørelsene selv kommer fra `lib/sync/`), og speil er
// nettopp det som stille kan gå ut av takt — derfor er hvert utfall låst her:
// applied, server-wins, edited-mid-flight (#1457), retry og abandon (#668),
// oppgjøret av et låst avslag og den nye kjøringen etter en pågående drain
// (#2211).
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter jest.resetModules() (se harness.ts) */
import { waitFor } from '@testing-library/react-native';
import { useFreshModules } from '../test/harness';
import { REFUSED_WRITE_ERROR } from '../../../../lib/sync/classifyError';
import { REFUSED_REPLY_FIXTURE } from '../../../../lib/sync/testing/refusedReplyFixture';

jest.mock('../supabase', () => require('../test/supabaseMock'));

const GAME = 'game-1';
const ME = 'user-me';
const MATE = 'user-mate';
const FROZEN = '2026-08-30T10:00:00.000Z';
const SERVER_TIME = '2026-08-30T10:00:09.000Z';

type Mocks = typeof import('../test/supabaseMock');
type Db = typeof import('./db');

function mocks(): Mocks {
  return require('../test/supabaseMock') as Mocks;
}

/** Svaret RPC-en gir når den faktisk skrev raden. */
function appliedRow(overrides: Record<string, unknown> = {}) {
  return {
    data: [
      {
        game_id: GAME,
        user_id: ME,
        hole_number: 1,
        strokes: 4,
        putts: null,
        entered_by: ME,
        client_updated_at: FROZEN,
        updated_at: SERVER_TIME,
        was_applied: true,
        ...overrides,
      },
    ],
    error: null,
  };
}

async function typeStroke(strokes: number, holeNumber = 1): Promise<void> {
  const { writeScore } = require('./writeScore') as typeof import('./writeScore');
  await writeScore({
    gameId: GAME,
    userId: ME,
    holeNumber,
    strokes,
    enteredBy: ME,
  });
}

describe('drainQueue', () => {
  useFreshModules();

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date(FROZEN) });
    mocks().currentDeviceUserId.mockResolvedValue(ME);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('lander raden og tar den ut av køen når serveren applyer', async () => {
    const { supabase } = mocks();
    supabase.rpc.mockResolvedValue(appliedRow());
    await typeStroke(4);

    const { drainQueue } = require('./syncWorker') as typeof import('./syncWorker');
    const result = await drainQueue('test');

    expect(result).toEqual({ pushed: 1, rejected: 0, errored: 0, abandoned: 0 });
    const { getDb, getScore, listQueue, scoreKey } = require('./db') as Db;
    const db = await getDb();
    expect(await getScore(db, scoreKey(GAME, ME, 1))).toMatchObject({
      strokes: 4,
      serverUpdatedAt: SERVER_TIME,
    });
    expect(await listQueue(db)).toHaveLength(0);
    // Hele raden går med i RPC-en — putts rir på samme LWW-rad (#939).
    expect(supabase.rpc).toHaveBeenCalledWith('upsert_score_if_newer', {
      p_game_id: GAME,
      p_user_id: ME,
      p_hole_number: 1,
      p_strokes: 4,
      p_entered_by: ME,
      p_client_updated_at: FROZEN,
      p_putts: null,
    });
  });

  it('lar server-raden vinne og bokfører et konfliktvarsel', async () => {
    const { supabase } = mocks();
    await typeStroke(4);
    // Serveren har en NYERE rad: RPC-en avviser opplastingen, og LWW sier at
    // server-verdien skal skrives over den lokale.
    supabase.rpc.mockResolvedValue(
      appliedRow({
        was_applied: false,
        strokes: 6,
        putts: 2,
        entered_by: MATE,
        client_updated_at: '2026-08-30T10:00:05.000Z',
      }),
    );

    const { drainQueue } = require('./syncWorker') as typeof import('./syncWorker');
    const result = await drainQueue('test');

    expect(result).toEqual({ pushed: 0, rejected: 1, errored: 0, abandoned: 0 });
    const { getDb, getScore, listConflictsForGame, listQueue, scoreKey } =
      require('./db') as Db;
    const db = await getDb();
    expect(await getScore(db, scoreKey(GAME, ME, 1))).toMatchObject({
      strokes: 6,
      putts: 2,
      enteredBy: MATE,
      clientUpdatedAt: '2026-08-30T10:00:05.000Z',
      serverUpdatedAt: SERVER_TIME,
    });
    // Tallet som ble overskrevet var tastet på DENNE enheten → varsel (#1611).
    const conflicts = await listConflictsForGame(db, GAME);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      localStrokes: 4,
      serverStrokes: 6,
      forOwnScore: true,
    });
    expect(await listQueue(db)).toHaveLength(0);
  });

  it('rører ingenting når spilleren taster videre mens RPC-en er i lufta (#1457)', async () => {
    const { supabase } = mocks();
    await typeStroke(4);
    supabase.rpc.mockImplementation(async () => {
      // Trykket som kommer mens kallet står ute: writeScore re-putter kø-
      // elementet for den NYERE verdien.
      await typeStroke(7);
      return appliedRow();
    });

    const { drainQueue } = require('./syncWorker') as typeof import('./syncWorker');
    const result = await drainQueue('test');

    expect(result).toEqual({ pushed: 0, rejected: 0, errored: 0, abandoned: 0 });
    const { getDb, getScore, listQueue, scoreKey } = require('./db') as Db;
    const db = await getDb();
    // Sluttverdien står, uten server-stempel, og elementet venter på neste drain.
    expect(await getScore(db, scoreKey(GAME, ME, 1))).toMatchObject({
      strokes: 7,
      serverUpdatedAt: null,
    });
    expect(await listQueue(db)).toHaveLength(1);
  });

  it('teller opp forsøket og lar elementet stå ved en transient feil', async () => {
    const { supabase } = mocks();
    supabase.rpc.mockResolvedValue({
      data: null,
      error: { message: 'Network request failed' },
    });
    await typeStroke(4);

    const { drainQueue } = require('./syncWorker') as typeof import('./syncWorker');
    const result = await drainQueue('test');

    expect(result).toEqual({ pushed: 0, rejected: 0, errored: 1, abandoned: 0 });
    const { getDb, listQueue } = require('./db') as Db;
    const queue = await listQueue(await getDb());
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      attemptCount: 1,
      lastError: 'Network request failed',
      abandonedAt: null,
    });
  });

  it('setter et permanent feilende element i karantene og hopper over det siden (#668)', async () => {
    const { supabase } = mocks();
    await typeStroke(4);

    const { getDb, listQueue, putQueueItem, scoreKey } = require('./db') as Db;
    const db = await getDb();
    const id = scoreKey(GAME, ME, 1);
    // Fire forsøk er alt brukt; det femte er det som tipper over taket.
    await putQueueItem(db, {
      id,
      scoreId: id,
      attemptCount: 4,
      lastError: 'permission denied for table scores',
      createdAt: FROZEN,
    });
    supabase.rpc.mockResolvedValue({
      data: null,
      error: { message: 'permission denied for table scores' },
    });

    const { drainQueue } = require('./syncWorker') as typeof import('./syncWorker');
    expect(await drainQueue('test')).toEqual({
      pushed: 0,
      rejected: 0,
      errored: 0,
      abandoned: 1,
    });

    const afterAbandon = await listQueue(db);
    expect(afterAbandon).toHaveLength(1);
    expect(afterAbandon[0]!.abandonedAt).not.toBeNull();
    expect(afterAbandon[0]!.attemptCount).toBe(5);

    // Neste drain skal ikke røre den i det hele tatt — raden blir stående som
    // spor av feilen, men den går aldri inn i retry-løkka igjen.
    expect(await drainQueue('test')).toEqual({
      pushed: 0,
      rejected: 0,
      errored: 0,
      abandoned: 0,
    });
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });

  it('rydder bort et kø-element uten score-rad', async () => {
    const { supabase } = mocks();
    const { getDb, listQueue, putQueueItem } = require('./db') as Db;
    const db = await getDb();
    await putQueueItem(db, {
      id: 'foreldreløs',
      scoreId: 'foreldreløs',
      attemptCount: 0,
      lastError: null,
      createdAt: FROZEN,
    });

    const { drainQueue } = require('./syncWorker') as typeof import('./syncWorker');
    await drainQueue('test');

    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(await listQueue(db)).toHaveLength(0);
  });

  // #2211: et kort som er levert, trukket eller i en avsluttet runde er låst
  // på serveren. Avslaget kom før som en NULL-rad uten feil, ble lest som
  // 'equal' og tatt ut av køen, og telefonen beholdt tallet for godt.
  describe('låst kort-avslag (#2211)', () => {
    const FINISHED_GAME_GUARD =
      'On a finished game only putts may be changed (scores back-fill guard, #1290)';
    const SERVER_ROW = {
      strokes: 5,
      putts: 2,
      entered_by: MATE,
      client_updated_at: '2026-08-30T09:59:00+00:00',
      updated_at: '2026-08-30T09:59:00.5+00:00',
    };

    async function lastAttemptOf(attemptCount: number): Promise<void> {
      const { getDb, putQueueItem, scoreKey } = require('./db') as Db;
      const id = scoreKey(GAME, ME, 1);
      await putQueueItem(await getDb(), {
        id,
        scoreId: id,
        attemptCount,
        lastError: null,
        createdAt: FROZEN,
      });
    }

    it('NULL-svaret setter telefonen tilbake til serverens tall og karantenerer', async () => {
      const { supabase, queryStub, routeFrom, stepArgs } = mocks();
      await typeStroke(4);
      supabase.rpc.mockResolvedValue({ data: REFUSED_REPLY_FIXTURE, error: null });
      const read = queryStub({ data: SERVER_ROW, error: null });
      routeFrom({ scores: [read] });

      const { drainQueue } = require('./syncWorker') as typeof import('./syncWorker');
      const result = await drainQueue('test');

      expect(result).toEqual({ pushed: 0, rejected: 0, errored: 0, abandoned: 1 });
      expect(stepArgs(read, 'eq')).toEqual([
        ['game_id', GAME],
        ['user_id', ME],
        ['hole_number', 1],
      ]);
      const { getDb, getScore, listConflictsForGame, listQueue, scoreKey } =
        require('./db') as Db;
      const db = await getDb();
      expect(await getScore(db, scoreKey(GAME, ME, 1))).toMatchObject({
        strokes: 5,
        putts: 2,
        enteredBy: MATE,
        clientUpdatedAt: SERVER_ROW.client_updated_at,
        serverUpdatedAt: SERVER_ROW.updated_at,
      });
      const queue = await listQueue(db);
      expect(queue[0]).toMatchObject({
        attemptCount: 1,
        lastError: REFUSED_WRITE_ERROR,
      });
      expect(queue[0]!.abandonedAt).not.toBeNull();
      expect(await listConflictsForGame(db, GAME)).toHaveLength(0);
    });

    it('0148-feilen på femte forsøk gir samme oppgjør og karantene', async () => {
      const { supabase, queryStub, routeFrom } = mocks();
      await typeStroke(4);
      await lastAttemptOf(4);
      supabase.rpc.mockResolvedValue({
        data: null,
        error: { message: FINISHED_GAME_GUARD, code: '42501' },
      });
      routeFrom({ scores: [queryStub({ data: SERVER_ROW, error: null })] });

      const { drainQueue } = require('./syncWorker') as typeof import('./syncWorker');
      await drainQueue('test');

      const { getDb, getScore, listQueue, scoreKey } = require('./db') as Db;
      const db = await getDb();
      expect((await getScore(db, scoreKey(GAME, ME, 1)))!.strokes).toBe(5);
      const queue = await listQueue(db);
      expect(queue[0]).toMatchObject({ attemptCount: 5, lastError: FINISHED_GAME_GUARD });
      expect(queue[0]!.abandonedAt).not.toBeNull();
    });

    it('uten sesjon karanteneres ingenting: en tapt sesjon ser ut som et låst kort', async () => {
      const { supabase } = mocks();
      mocks().currentDeviceUserId.mockResolvedValue(null);
      await typeStroke(4);
      await lastAttemptOf(4);
      supabase.rpc.mockResolvedValue({
        data: null,
        error: {
          message: 'new row violates row-level security policy for table "scores"',
          code: '42501',
        },
      });

      const { drainQueue } = require('./syncWorker') as typeof import('./syncWorker');
      const result = await drainQueue('test');

      expect(result).toEqual({ pushed: 0, rejected: 0, errored: 1, abandoned: 0 });
      expect(supabase.from).not.toHaveBeenCalled();
      const { getDb, getScore, listQueue, scoreKey } = require('./db') as Db;
      const db = await getDb();
      expect((await getScore(db, scoreKey(GAME, ME, 1)))!.strokes).toBe(4);
      const queue = await listQueue(db);
      expect(queue[0]).toMatchObject({ attemptCount: 5, abandonedAt: null });
    });

    it('tapt svar sendt på nytt (samme øyeblikk i serverformat) er ikke et avslag', async () => {
      const { supabase } = mocks();
      await typeStroke(4);
      supabase.rpc.mockResolvedValue(
        appliedRow({
          was_applied: false,
          client_updated_at: '2026-08-30T10:00:00+00:00',
        }),
      );

      const { drainQueue } = require('./syncWorker') as typeof import('./syncWorker');
      const result = await drainQueue('test');

      expect(result).toEqual({ pushed: 0, rejected: 0, errored: 0, abandoned: 0 });
      expect(supabase.from).not.toHaveBeenCalled();
      const { getDb, getScore, listQueue, scoreKey } = require('./db') as Db;
      const db = await getDb();
      expect(await listQueue(db)).toHaveLength(0);
      expect(await getScore(db, scoreKey(GAME, ME, 1))).toMatchObject({
        strokes: 4,
        clientUpdatedAt: FROZEN,
      });
    });
  });

  it('et kall under en pågående drain gir én ny kjøring (#2211)', async () => {
    const { supabase } = mocks();
    await typeStroke(4, 1);
    const { drainQueue } = require('./syncWorker') as typeof import('./syncWorker');
    supabase.rpc
      .mockImplementationOnce(async () => {
        // Hull 2 tastes mens hull 1 står ute; hullskjermen kaller så
        // drainQueue, som finner den første drainen i gang.
        await typeStroke(3, 2);
        await drainQueue('hull');
        return appliedRow();
      })
      .mockResolvedValueOnce(appliedRow({ hole_number: 2, strokes: 3 }));

    await drainQueue('test');

    const { getDb, listQueue } = require('./db') as Db;
    const db = await getDb();
    await waitFor(async () => expect(await listQueue(db)).toHaveLength(0));
    expect(supabase.rpc).toHaveBeenCalledTimes(2);
    expect(supabase.rpc.mock.calls[1]![1]).toMatchObject({ p_hole_number: 2 });
  });
});
