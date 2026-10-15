import { vi } from 'vitest';
import type {
  ConflictRecord,
  LocalScore,
  LocalTeeShot,
  SyncQueueItem,
  TeeShotQueueItem,
} from '../db';

/**
 * In-memory stand-in for the Dexie database, for unit tests that exercise the
 * sync modules without touching real IndexedDB.
 *
 * `syncWorker.test.ts` and `writeScore.test.ts` each grew their own copy of
 * this; the third copy the #1611 merge tests would have needed is what made it
 * shared instead (CLAUDE.md test discipline: copy-pasted mock setup means it
 * belongs in a helper).
 *
 * Usage — the factory call has to be a top-level `const` so the hoisted
 * `vi.mock` factory (which runs lazily, on first import of `./db`) can close
 * over it:
 *
 * ```ts
 * const fake = createFakeDb();
 * vi.mock('./db', () => ({ localDb: fake.localDb, scoreKey: fake.scoreKey }));
 * beforeEach(() => fake.reset());
 * ```
 */
export interface FakeDb {
  /** Live view of the stored rows — assert against these. */
  scores: Map<string, LocalScore>;
  syncQueue: Map<string, SyncQueueItem>;
  conflicts: Map<string, ConflictRecord>;
  /** #2580: the tee-shot tables (Dexie version 3). */
  teeShots: Map<string, LocalTeeShot>;
  teeShotQueue: Map<string, TeeShotQueueItem>;
  /** Drop-in for the real `localDb`; every method is a spy. */
  localDb: ReturnType<typeof buildLocalDb>;
  /** Same key shape as the real `scoreKey`. */
  scoreKey: (gameId: string, userId: string, holeNumber: number) => string;
  /** Same key shape as the real `teeShotKey`. */
  teeShotKey: (gameId: string, teamNumber: number, holeNumber: number) => string;
  /** Empty every table and re-install the spy implementations. */
  reset: () => void;
}

/** A keyed table with the Dexie methods the sync modules call. */
function tableOf<T extends { id: string }>(rows: Map<string, T>) {
  return {
    get: vi.fn(async (id: string) => rows.get(id)),
    bulkGet: vi.fn(async (ids: string[]) => ids.map((id) => rows.get(id))),
    orderBy: vi.fn(() => ({ toArray: async () => [...rows.values()] })),
    toArray: vi.fn(async () => [...rows.values()]),
    put: vi.fn(async (row: T) => {
      rows.set(row.id, row);
    }),
    bulkPut: vi.fn(async (items: T[]) => {
      for (const row of items) rows.set(row.id, row);
    }),
    update: vi.fn(async (id: string, patch: Partial<T>) => {
      const row = rows.get(id);
      if (row) rows.set(id, { ...row, ...patch });
    }),
    delete: vi.fn(async (id: string) => {
      rows.delete(id);
    }),
    bulkDelete: vi.fn(async (ids: string[]) => {
      for (const id of ids) rows.delete(id);
    }),
  };
}

function buildLocalDb(
  scores: Map<string, LocalScore>,
  syncQueue: Map<string, SyncQueueItem>,
  conflicts: Map<string, ConflictRecord>,
  teeShots: Map<string, LocalTeeShot>,
  teeShotQueue: Map<string, TeeShotQueueItem>,
) {
  return {
    teeShots: tableOf(teeShots),
    teeShotQueue: tableOf(teeShotQueue),
    scores: {
      get: vi.fn(async (id: string) => scores.get(id)),
      bulkGet: vi.fn(async (ids: string[]) => ids.map((id) => scores.get(id))),
      put: vi.fn(async (row: LocalScore) => {
        scores.set(row.id, row);
      }),
      bulkPut: vi.fn(async (rows: LocalScore[]) => {
        for (const row of rows) scores.set(row.id, row);
      }),
      update: vi.fn(async (id: string, patch: Partial<LocalScore>) => {
        const row = scores.get(id);
        if (row) scores.set(id, { ...row, ...patch });
      }),
      delete: vi.fn(async (id: string) => {
        scores.delete(id);
      }),
      bulkDelete: vi.fn(async (ids: string[]) => {
        for (const id of ids) scores.delete(id);
      }),
    },
    syncQueue: {
      get: vi.fn(async (id: string) => syncQueue.get(id)),
      orderBy: vi.fn(() => ({ toArray: async () => [...syncQueue.values()] })),
      put: vi.fn(async (item: SyncQueueItem) => {
        syncQueue.set(item.id, item);
      }),
      bulkPut: vi.fn(async (items: SyncQueueItem[]) => {
        for (const item of items) syncQueue.set(item.id, item);
      }),
      update: vi.fn(async (id: string, patch: Partial<SyncQueueItem>) => {
        const item = syncQueue.get(id);
        if (item) syncQueue.set(id, { ...item, ...patch });
      }),
      delete: vi.fn(async (id: string) => {
        syncQueue.delete(id);
      }),
      bulkDelete: vi.fn(async (ids: string[]) => {
        for (const id of ids) syncQueue.delete(id);
      }),
    },
    conflicts: {
      get: vi.fn(async (id: string) => conflicts.get(id)),
      put: vi.fn(async (row: ConflictRecord) => {
        conflicts.set(row.id, row);
      }),
      bulkPut: vi.fn(async (rows: ConflictRecord[]) => {
        for (const row of rows) conflicts.set(row.id, row);
      }),
      bulkDelete: vi.fn(async (ids: string[]) => {
        for (const id of ids) conflicts.delete(id);
      }),
    },
    // Dexie's signature is variadic — (mode, ...tables, fn). The fake has no
    // isolation to model, so it just runs the callback and returns its value.
    transaction: vi.fn(async (...args: unknown[]) => {
      const fn = args[args.length - 1] as () => Promise<unknown>;
      return fn();
    }),
  };
}

export function createFakeDb(): FakeDb {
  const scores = new Map<string, LocalScore>();
  const syncQueue = new Map<string, SyncQueueItem>();
  const conflicts = new Map<string, ConflictRecord>();
  const teeShots = new Map<string, LocalTeeShot>();
  const teeShotQueue = new Map<string, TeeShotQueueItem>();
  const localDb = buildLocalDb(scores, syncQueue, conflicts, teeShots, teeShotQueue);

  // A test file that runs vi.clearAllMocks()/resetAllMocks() between cases can
  // strip the implementations off these spies, so reset() re-installs them from
  // a freshly-built set rather than assuming they survived.
  function reset() {
    scores.clear();
    syncQueue.clear();
    conflicts.clear();
    teeShots.clear();
    teeShotQueue.clear();
    const fresh = buildLocalDb(scores, syncQueue, conflicts, teeShots, teeShotQueue);
    for (const table of ['scores', 'syncQueue', 'conflicts', 'teeShots', 'teeShotQueue'] as const) {
      for (const [name, spy] of Object.entries(fresh[table])) {
        (localDb[table] as Record<string, ReturnType<typeof vi.fn>>)[
          name
        ].mockImplementation(spy.getMockImplementation()!);
      }
    }
    localDb.transaction.mockImplementation(
      fresh.transaction.getMockImplementation()!,
    );
  }

  return {
    scores,
    syncQueue,
    conflicts,
    teeShots,
    teeShotQueue,
    localDb,
    scoreKey: (gameId, userId, holeNumber) =>
      `${gameId}:${userId}:${holeNumber}`,
    teeShotKey: (gameId, teamNumber, holeNumber) =>
      `${gameId}:${teamNumber}:${holeNumber}`,
    reset,
  };
}
