import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Dexie mock ────────────────────────────────────────────────────────────────
// Keeps a tiny in-memory store that mirrors the shape used by writeScore.
// We mock the whole `./db` module so the real IndexedDB is never touched.

type FakeRow = {
  id: string;
  gameId: string;
  userId: string;
  holeNumber: number;
  strokes: number | null;
  putts: number | null;
  enteredBy: string;
  clientUpdatedAt: string;
  serverUpdatedAt: string | null;
};

let fakeScores: Map<string, FakeRow>;
let fakeSyncQueue: Map<string, unknown>;

const mockScores = {
  get: vi.fn(async (id: string) => fakeScores.get(id)),
  put: vi.fn(async (row: FakeRow) => {
    fakeScores.set(row.id, row);
  }),
};
const mockSyncQueue = {
  put: vi.fn(async (item: unknown) => {
    fakeSyncQueue.set((item as { id: string }).id, item);
  }),
};
const mockTransaction = vi.fn(
  async (_mode: string, _t1: unknown, _t2: unknown, fn: () => Promise<void>) =>
    fn(),
);

vi.mock('./db', () => ({
  localDb: {
    scores: mockScores,
    syncQueue: mockSyncQueue,
    transaction: mockTransaction,
  },
  scoreKey: (gameId: string, userId: string, holeNumber: number) =>
    `${gameId}:${userId}:${holeNumber}`,
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('writeScore', () => {
  beforeEach(() => {
    fakeScores = new Map();
    fakeSyncQueue = new Map();
    vi.clearAllMocks();
    // Restore default implementations after clearAllMocks resets them.
    mockScores.get.mockImplementation(async (id: string) => fakeScores.get(id));
    mockScores.put.mockImplementation(async (row: FakeRow) => {
      fakeScores.set(row.id, row);
    });
    mockSyncQueue.put.mockImplementation(async (item: unknown) => {
      fakeSyncQueue.set((item as { id: string }).id, item);
    });
    mockTransaction.mockImplementation(
      async (
        _mode: string,
        _t1: unknown,
        _t2: unknown,
        fn: () => Promise<void>,
      ) => fn(),
    );
  });

  it('writes a score and returns a row with a clientUpdatedAt timestamp', async () => {
    const { writeScore } = await import('./writeScore');
    const before = new Date().toISOString();
    const result = await writeScore({
      gameId: 'g1',
      userId: 'u1',
      holeNumber: 3,
      strokes: 5,
      enteredBy: 'u1',
    });
    const after = new Date().toISOString();
    expect(result.clientUpdatedAt >= before).toBe(true);
    expect(result.clientUpdatedAt <= after).toBe(true);
    expect(result.strokes).toBe(5);
    expect(result.id).toBe('g1:u1:3');
  });

  it('bumps clientUpdatedAt by 1 ms when a stored row has the same timestamp', async () => {
    const { writeScore } = await import('./writeScore');
    const frozenTs = '2026-06-17T12:00:00.000Z';
    // Seed the store with an existing row at the frozen timestamp.
    const existingRow: FakeRow = {
      id: 'g1:u1:5',
      gameId: 'g1',
      userId: 'u1',
      holeNumber: 5,
      strokes: 4,
      putts: null,
      enteredBy: 'u1',
      clientUpdatedAt: frozenTs,
      serverUpdatedAt: null,
    };
    fakeScores.set('g1:u1:5', existingRow);

    const RealDate = globalThis.Date;
    // Use vitest's fake timer system to freeze wall-clock time to frozenTs.
    // `new Date()` (no args) now returns frozenTs; `new Date(string)` still
    // parses normally because vitest patches only the no-arg fast-path.
    vi.useFakeTimers({ now: new RealDate(frozenTs).getTime() });

    try {
      const result = await writeScore({
        gameId: 'g1',
        userId: 'u1',
        holeNumber: 5,
        strokes: 5,
        enteredBy: 'u1',
      });

      // The new clientUpdatedAt must be strictly greater than the stored one.
      expect(result.clientUpdatedAt > frozenTs).toBe(true);
      // It should be exactly 1 ms ahead.
      expect(new RealDate(result.clientUpdatedAt).getTime()).toBe(
        new RealDate(frozenTs).getTime() + 1,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('bumps clientUpdatedAt when the stored timestamp is newer than now', async () => {
    const { writeScore } = await import('./writeScore');
    const farFuture = '2099-01-01T00:00:00.000Z';
    fakeScores.set('g2:u2:1', {
      id: 'g2:u2:1',
      gameId: 'g2',
      userId: 'u2',
      holeNumber: 1,
      strokes: 3,
      putts: null,
      enteredBy: 'u2',
      clientUpdatedAt: farFuture,
      serverUpdatedAt: null,
    });

    const result = await writeScore({
      gameId: 'g2',
      userId: 'u2',
      holeNumber: 1,
      strokes: 4,
      enteredBy: 'u2',
    });

    // Must be strictly greater than the far-future stored timestamp.
    expect(result.clientUpdatedAt > farFuture).toBe(true);
    expect(new Date(result.clientUpdatedAt).getTime()).toBe(
      new Date(farFuture).getTime() + 1,
    );
  });

  it('does NOT bump when no prior row exists', async () => {
    const { writeScore } = await import('./writeScore');
    const before = new Date().toISOString();
    const result = await writeScore({
      gameId: 'g3',
      userId: 'u3',
      holeNumber: 7,
      strokes: null,
      enteredBy: 'admin',
    });
    const after = new Date().toISOString();
    // Should be a normal wall-clock timestamp — between before and after.
    expect(result.clientUpdatedAt >= before).toBe(true);
    expect(result.clientUpdatedAt <= after).toBe(true);
  });

  // ── Putts merge (#939) ──────────────────────────────────────────────────────
  // strokes and putts share one row. A write carrying only one field must
  // preserve the other from the existing row; an explicit null clears.
  describe('strokes/putts merge', () => {
    function seed(partial: Partial<FakeRow> & { id: string }) {
      fakeScores.set(partial.id, {
        gameId: 'g',
        userId: 'u',
        holeNumber: 1,
        strokes: null,
        putts: null,
        enteredBy: 'u',
        clientUpdatedAt: '2026-06-30T10:00:00.000Z',
        serverUpdatedAt: null,
        ...partial,
      });
    }

    it('writing strokes only preserves an existing putt count', async () => {
      const { writeScore } = await import('./writeScore');
      seed({ id: 'g:u:1', strokes: 5, putts: 2 });
      const result = await writeScore({
        gameId: 'g',
        userId: 'u',
        holeNumber: 1,
        strokes: 6,
        enteredBy: 'u',
      });
      expect(result.strokes).toBe(6);
      expect(result.putts).toBe(2); // preserved
    });

    it('writing putts only preserves an existing stroke count', async () => {
      const { writeScore } = await import('./writeScore');
      seed({ id: 'g:u:1', strokes: 5, putts: null });
      const result = await writeScore({
        gameId: 'g',
        userId: 'u',
        holeNumber: 1,
        putts: 2,
        enteredBy: 'u',
      });
      expect(result.strokes).toBe(5); // preserved
      expect(result.putts).toBe(2);
    });

    it('an explicit null clears the field; the omitted field is preserved', async () => {
      const { writeScore } = await import('./writeScore');
      seed({ id: 'g:u:1', strokes: 5, putts: 2 });
      // Clear strokes (onClear) — putts must survive.
      const result = await writeScore({
        gameId: 'g',
        userId: 'u',
        holeNumber: 1,
        strokes: null,
        enteredBy: 'u',
      });
      expect(result.strokes).toBeNull();
      expect(result.putts).toBe(2);
    });

    it('a brand-new row keeps putts null when only strokes are written', async () => {
      const { writeScore } = await import('./writeScore');
      const result = await writeScore({
        gameId: 'g',
        userId: 'u',
        holeNumber: 9,
        strokes: 4,
        enteredBy: 'u',
      });
      expect(result.strokes).toBe(4);
      expect(result.putts).toBeNull();
    });
  });
});
