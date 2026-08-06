import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Dexie mock ────────────────────────────────────────────────────────────────
// Same pattern as writeScore.test.ts: mock the whole `./db` module with tiny
// in-memory Maps so real IndexedDB is never touched. drainQueue reads scores,
// mutates scores/conflicts and deletes from syncQueue — all mirrored here.

type FakeScore = {
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

type FakeQueueItem = {
  id: string;
  scoreId: string;
  attemptCount: number;
  lastError: string | null;
  createdAt: string;
  abandonedAt?: string;
};

let fakeScores: Map<string, FakeScore>;
let fakeQueue: Map<string, FakeQueueItem>;
let fakeConflicts: Map<string, unknown>;

const mockDb = {
  scores: {
    get: vi.fn(async (id: string) => fakeScores.get(id)),
    put: vi.fn(async (row: FakeScore) => {
      fakeScores.set(row.id, row);
    }),
    update: vi.fn(async (id: string, patch: Partial<FakeScore>) => {
      const row = fakeScores.get(id);
      if (row) fakeScores.set(id, { ...row, ...patch });
    }),
  },
  syncQueue: {
    orderBy: vi.fn(() => ({
      toArray: async () => [...fakeQueue.values()],
    })),
    put: vi.fn(async (item: FakeQueueItem) => {
      fakeQueue.set(item.id, item);
    }),
    update: vi.fn(async (id: string, patch: Partial<FakeQueueItem>) => {
      const item = fakeQueue.get(id);
      if (item) fakeQueue.set(id, { ...item, ...patch });
    }),
    delete: vi.fn(async (id: string) => {
      fakeQueue.delete(id);
    }),
  },
  conflicts: {
    put: vi.fn(async (row: { id: string }) => {
      fakeConflicts.set(row.id, row);
    }),
  },
  // Variadisk som Dexie: (mode, ...tables, fn) — kjør bare callbacken.
  transaction: vi.fn(async (...args: unknown[]) => {
    const fn = args[args.length - 1] as () => Promise<void>;
    return fn();
  }),
};

vi.mock('./db', () => ({
  localDb: mockDb,
  scoreKey: (g: string, u: string, h: number) => `${g}#${u}#${h}`,
}));

// Kontrollerbar RPC: hver test setter sin egen implementasjon.
const rpcMock = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/lib/supabase/client', () => ({
  getBrowserClient: () => ({ rpc: rpcMock }),
}));

const ID = 'g1#u1#5';

function seedScore(strokes: number, clientUpdatedAt: string): FakeScore {
  const row: FakeScore = {
    id: ID,
    gameId: 'g1',
    userId: 'u1',
    holeNumber: 5,
    strokes,
    putts: null,
    enteredBy: 'u1',
    clientUpdatedAt,
    serverUpdatedAt: null,
  };
  fakeScores.set(ID, row);
  fakeQueue.set(ID, {
    id: ID,
    scoreId: ID,
    attemptCount: 0,
    lastError: null,
    createdAt: clientUpdatedAt,
  });
  return row;
}

/** Simulerer writeScore under in-flight RPC: ny verdi + re-put av kø-elementet. */
function burstEditDuringFlight(strokes: number, clientUpdatedAt: string) {
  const row = fakeScores.get(ID)!;
  fakeScores.set(ID, { ...row, strokes, clientUpdatedAt });
  fakeQueue.set(ID, {
    id: ID,
    scoreId: ID,
    attemptCount: 0,
    lastError: null,
    createdAt: clientUpdatedAt,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  fakeScores = new Map();
  fakeQueue = new Map();
  fakeConflicts = new Map();
});

// #1457: burst-tasting på samme felt mens forrige synk er underveis mistet
// sluttverdien — dequeue-en slettet kø-elementet ubetinget, også når
// writeScore hadde re-putt det for en NYERE verdi under RPC-kallet.
describe('drainQueue — burst-redigering under in-flight RPC (#1457)', () => {
  it('beholder kø-elementet når raden ble redigert under opplastingen; neste drain tar sluttverdien', async () => {
    seedScore(2, '2026-08-06T10:00:00.000Z');

    rpcMock.mockImplementationOnce(async () => {
      // Spilleren tapper videre MENS RPC-en er i lufta.
      burstEditDuringFlight(6, '2026-08-06T10:00:00.500Z');
      return {
        data: [{ was_applied: true, updated_at: '2026-08-06T10:00:01.000Z' }],
        error: null,
      };
    });

    const { drainQueue } = await import('./syncWorker');
    await drainQueue();

    // Sluttverdien (6) er IKKE lastet opp ennå — kø-elementet må overleve.
    expect(fakeQueue.has(ID)).toBe(true);
    expect(fakeScores.get(ID)!.strokes).toBe(6);

    // Neste drain (rolig felt) laster opp sluttverdien og tømmer køen.
    rpcMock.mockResolvedValueOnce({
      data: [{ was_applied: true, updated_at: '2026-08-06T10:00:02.000Z' }],
      error: null,
    });
    await drainQueue();
    expect(fakeQueue.has(ID)).toBe(false);
    const uploaded = rpcMock.mock.calls.at(-1)?.[1] as { p_strokes: number };
    expect(uploaded.p_strokes).toBe(6);
  });

  it('server-wins overskriver IKKE en nyere lokal tasting gjort under RPC-en', async () => {
    seedScore(2, '2026-08-06T10:00:00.000Z');

    rpcMock.mockImplementationOnce(async () => {
      burstEditDuringFlight(6, '2026-08-06T10:00:00.500Z');
      // Serveren avviser T1-verdien fordi den har noe «nyere» enn T1 —
      // men den lokale raden er nå T1+500ms og skal stå urørt.
      return {
        data: [
          {
            was_applied: false,
            strokes: 4,
            putts: null,
            entered_by: 'u2',
            client_updated_at: '2026-08-06T10:00:00.250Z',
            updated_at: '2026-08-06T10:00:00.300Z',
          },
        ],
        error: null,
      };
    });

    const { drainQueue } = await import('./syncWorker');
    await drainQueue();

    expect(fakeScores.get(ID)!.strokes).toBe(6);
    expect(fakeScores.get(ID)!.clientUpdatedAt).toBe('2026-08-06T10:00:00.500Z');
    expect(fakeQueue.has(ID)).toBe(true);
  });

  it('kontroll: uten redigering under opplasting tømmes køen som før', async () => {
    seedScore(4, '2026-08-06T10:00:00.000Z');
    rpcMock.mockResolvedValueOnce({
      data: [{ was_applied: true, updated_at: '2026-08-06T10:00:01.000Z' }],
      error: null,
    });

    const { drainQueue } = await import('./syncWorker');
    const res = await drainQueue();

    expect(res.pushed).toBe(1);
    expect(fakeQueue.has(ID)).toBe(false);
    expect(fakeScores.get(ID)!.serverUpdatedAt).toBe('2026-08-06T10:00:01.000Z');
  });
});
