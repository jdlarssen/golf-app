import { vi } from 'vitest';
import type { ConflictRecord, LocalScore, SyncQueueItem } from '../db';

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
  /** Drop-in for the real `localDb`; every method is a spy. */
  localDb: ReturnType<typeof buildLocalDb>;
  /** Same key shape as the real `scoreKey`. */
  scoreKey: (gameId: string, userId: string, holeNumber: number) => string;
  /** Empty every table and re-install the spy implementations. */
  reset: () => void;
}

function buildLocalDb(
  scores: Map<string, LocalScore>,
  syncQueue: Map<string, SyncQueueItem>,
  conflicts: Map<string, ConflictRecord>,
) {
  return {
    scores: {
      get: vi.fn(async (id: string) => scores.get(id)),
      bulkGet: vi.fn(async (ids: string[]) => ids.map((id) => scores.get(id))),
      put: vi.fn(async (row: LocalScore) => {
        scores.set(row.id, row);
      }),
      update: vi.fn(async (id: string, patch: Partial<LocalScore>) => {
        const row = scores.get(id);
        if (row) scores.set(id, { ...row, ...patch });
      }),
    },
    syncQueue: {
      get: vi.fn(async (id: string) => syncQueue.get(id)),
      orderBy: vi.fn(() => ({ toArray: async () => [...syncQueue.values()] })),
      put: vi.fn(async (item: SyncQueueItem) => {
        syncQueue.set(item.id, item);
      }),
      update: vi.fn(async (id: string, patch: Partial<SyncQueueItem>) => {
        const item = syncQueue.get(id);
        if (item) syncQueue.set(id, { ...item, ...patch });
      }),
      delete: vi.fn(async (id: string) => {
        syncQueue.delete(id);
      }),
    },
    conflicts: {
      get: vi.fn(async (id: string) => conflicts.get(id)),
      put: vi.fn(async (row: ConflictRecord) => {
        conflicts.set(row.id, row);
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
  const localDb = buildLocalDb(scores, syncQueue, conflicts);

  // A test file that runs vi.clearAllMocks()/resetAllMocks() between cases can
  // strip the implementations off these spies, so reset() re-installs them from
  // a freshly-built set rather than assuming they survived.
  function reset() {
    scores.clear();
    syncQueue.clear();
    conflicts.clear();
    const fresh = buildLocalDb(scores, syncQueue, conflicts);
    for (const table of ['scores', 'syncQueue', 'conflicts'] as const) {
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
    localDb,
    scoreKey: (gameId, userId, holeNumber) =>
      `${gameId}:${userId}:${holeNumber}`,
    reset,
  };
}
