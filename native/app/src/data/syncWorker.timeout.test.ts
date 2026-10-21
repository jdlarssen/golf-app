// native/app/src/data/syncWorker.timeout.test.ts
// #1954 D2: køen med et nett som henger, gjennom den EKTE supabase-klienten.
//
// `syncWorker.test.ts` mocker klienten, og der svarer en RPC alltid. Feilen
// dette fanger, finnes bare under klienten: `drainQueue` holder `inFlight`-
// låsen mens den venter på hver `upsert_score_if_newer`, og uten tidstak svarte
// en hengende forespørsel aldri. Da sto låsen for alltid, hver ny drain ble
// avvist, og «Lever scorekort» sto på «Synker slag …».
//
// Derfor bare `fetch` byttes her, ikke `../supabase`: taket, supabase-js sin
// oversetting av feilen og drainen kjører som på telefonen.
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter jest.resetModules() (se harness.ts) */
import { useFreshModules } from '../test/harness';
import { REQUEST_TIMEOUT_MS } from './timedFetch';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest'),
);

const GAME = 'game-1';
const ME = 'user-me';
const FROZEN = '2026-10-21T10:00:00.000Z';

type Db = typeof import('./db');
type Worker = typeof import('./syncWorker');

describe('drainQueue med et nett som henger (#1954 D2)', () => {
  useFreshModules();
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };
  let underlying: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date(FROZEN) });
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://staging.example';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    underlying = jest.fn(() => new Promise(() => {}));
    global.fetch = underlying as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
    jest.useRealTimers();
  });

  async function typeStroke(strokes: number, holeNumber: number): Promise<void> {
    const { writeScore } = require('./writeScore') as typeof import('./writeScore');
    await writeScore({ gameId: GAME, userId: ME, holeNumber, strokes, enteredBy: ME });
  }

  /** Serveren lagrer det som kommer, og svarer som `upsert_score_if_newer`. */
  function serverApplies(): void {
    underlying.mockImplementation(async (_url: string, init: RequestInit) => {
      const args = JSON.parse(String(init.body)) as Record<string, unknown>;
      const row = {
        game_id: args.p_game_id,
        user_id: args.p_user_id,
        hole_number: args.p_hole_number,
        strokes: args.p_strokes,
        putts: args.p_putts,
        entered_by: args.p_entered_by,
        client_updated_at: args.p_client_updated_at,
        updated_at: '2026-10-21T10:00:09.000Z',
        was_applied: true,
      };
      return new Response(JSON.stringify([row]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
  }

  it('slipper låsen etter taket, og neste drain sender slagene', async () => {
    await typeStroke(4, 1);
    await typeStroke(5, 2);
    const { drainQueue } = require('./syncWorker') as Worker;

    let first: Awaited<ReturnType<Worker['drainQueue']>> | null = null;
    void drainQueue('hull').then((r) => {
      first = r;
    });
    for (let i = 0; i < 50 && underlying.mock.calls.length === 0; i++) {
      await jest.advanceTimersByTimeAsync(0);
    }
    expect(underlying).toHaveBeenCalledTimes(1);

    // Én drain er bundet til ett tak, ikke til antall slag × tak: den stopper
    // ved første nettfeil og prøver ikke hull 2 mot det samme døde nettet.
    await jest.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    expect(first).toEqual({ pushed: 0, rejected: 0, errored: 1, abandoned: 0 });
    expect(underlying).toHaveBeenCalledTimes(1);

    const { getDb, listQueue } = require('./db') as Db;
    const db = await getDb();
    const queued = await listQueue(db);
    expect(queued).toHaveLength(2);
    // Ingen av dem i karantene: et slag forsvinner aldri fordi nettet var dårlig.
    expect(queued.every((item) => item.abandonedAt === null)).toBe(true);

    // Nettet er tilbake. Låsen er sluppet, så neste drain kjører og sender begge.
    serverApplies();
    const second = await drainQueue('nett tilbake');
    expect(second).toEqual({ pushed: 2, rejected: 0, errored: 0, abandoned: 0 });
    expect(await listQueue(db)).toHaveLength(0);
  });
});
