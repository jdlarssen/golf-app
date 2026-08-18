import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeDb } from './testing/fakeDb';
import type { LocalScore } from './db';

// ── Dexie mock ────────────────────────────────────────────────────────────────
// Shared in-memory fake (see lib/sync/testing/fakeDb.ts) — real IndexedDB is
// never touched. drainQueue reads scores, mutates scores/conflicts and deletes
// from syncQueue; every one of those is a spy on `fake.localDb`.
const fake = createFakeDb();

vi.mock('./db', () => ({
  localDb: fake.localDb,
  scoreKey: fake.scoreKey,
}));

// Kontrollerbar RPC: hver test setter sin egen implementasjon.
const rpcMock = vi.fn<(...args: unknown[]) => Promise<unknown>>();
// #1368: drainQueue slår opp innlogget bruker én gang per drain for å avgjøre
// om raden ble tastet på DENNE enheten.
const getSessionMock = vi.fn<() => Promise<unknown>>();
vi.mock('@/lib/supabase/client', () => ({
  getBrowserClient: () => ({
    rpc: rpcMock,
    auth: { getSession: getSessionMock },
  }),
}));

const ID = 'g1:u1:5';

function seedScore(
  strokes: number,
  clientUpdatedAt: string,
  overrides: Partial<Pick<LocalScore, 'userId' | 'enteredBy'>> = {},
): LocalScore {
  const userId = overrides.userId ?? 'u1';
  const row: LocalScore = {
    id: ID,
    gameId: 'g1',
    userId,
    holeNumber: 5,
    strokes,
    putts: null,
    enteredBy: overrides.enteredBy ?? userId,
    clientUpdatedAt,
    serverUpdatedAt: null,
  };
  fake.scores.set(ID, row);
  fake.syncQueue.set(ID, {
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
  const row = fake.scores.get(ID)!;
  fake.scores.set(ID, { ...row, strokes, clientUpdatedAt });
  fake.syncQueue.set(ID, {
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
  fake.reset();
  // Standard: 'u1' er innlogget på denne enheten.
  getSessionMock.mockResolvedValue({
    data: { session: { user: { id: 'u1' } } },
    error: null,
  });
});

/** Server-wins-svar: RPC-en avviste vår rad fordi serveren har en nyere. */
function serverWins(strokes: number, putts: number | null = null) {
  return {
    data: [
      {
        was_applied: false,
        strokes,
        putts,
        entered_by: 'u2',
        client_updated_at: '2026-08-14T10:00:05.000Z',
        updated_at: '2026-08-14T10:00:05.500Z',
      },
    ],
    error: null,
  };
}

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
    expect(fake.syncQueue.has(ID)).toBe(true);
    expect(fake.scores.get(ID)!.strokes).toBe(6);

    // Neste drain (rolig felt) laster opp sluttverdien og tømmer køen.
    rpcMock.mockResolvedValueOnce({
      data: [{ was_applied: true, updated_at: '2026-08-06T10:00:02.000Z' }],
      error: null,
    });
    await drainQueue();
    expect(fake.syncQueue.has(ID)).toBe(false);
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

    expect(fake.scores.get(ID)!.strokes).toBe(6);
    expect(fake.scores.get(ID)!.clientUpdatedAt).toBe('2026-08-06T10:00:00.500Z');
    expect(fake.syncQueue.has(ID)).toBe(true);
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
    expect(fake.syncQueue.has(ID)).toBe(false);
    expect(fake.scores.get(ID)!.serverUpdatedAt).toBe('2026-08-06T10:00:01.000Z');
  });
});

// #1368: konflikt-varselet (#688) skrev bare rader der enteredBy === userId —
// altså din egen score. Fører du for en medspiller (markør-rollen) har hver
// lokal rad enteredBy = deg og userId = medspilleren, så et tapt LWW-oppgjør
// overskrev tallet du tastet helt stille. Gaten er nå «tastet på DENNE
// enheten» (enteredBy === innlogget bruker).
describe('drainQueue — konflikt-varsel når du fører for andre (#1368)', () => {
  it('markør-rad som taper LWW gir konflikt-varsel merket som andres score', async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { user: { id: 'me' } } },
      error: null,
    });
    seedScore(5, '2026-08-14T10:00:00.000Z', {
      userId: 'mate',
      enteredBy: 'me',
    });
    rpcMock.mockResolvedValueOnce(serverWins(7));

    const { drainQueue } = await import('./syncWorker');
    await drainQueue();

    expect(fake.conflicts.get(ID)).toMatchObject({
      gameId: 'g1',
      userId: 'mate',
      holeNumber: 5,
      localStrokes: 5,
      serverStrokes: 7,
      forOwnScore: false,
    });
  });

  it('egen score som taper LWW varsler fortsatt (#688-regresjon)', async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { user: { id: 'me' } } },
      error: null,
    });
    seedScore(5, '2026-08-14T10:00:00.000Z', { userId: 'me', enteredBy: 'me' });
    rpcMock.mockResolvedValueOnce(serverWins(7));

    const { drainQueue } = await import('./syncWorker');
    await drainQueue();

    expect(fake.conflicts.get(ID)).toMatchObject({
      localStrokes: 5,
      serverStrokes: 7,
      forOwnScore: true,
    });
  });

  it('uten sesjon faller gaten tilbake til gammel proxy: egen score varsler', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null }, error: null });
    seedScore(5, '2026-08-14T10:00:00.000Z', { userId: 'u1', enteredBy: 'u1' });
    rpcMock.mockResolvedValueOnce(serverWins(7));

    const { drainQueue } = await import('./syncWorker');
    await drainQueue();

    expect(fake.conflicts.get(ID)).toMatchObject({ forOwnScore: true });
  });

  it('sesjons-oppslag som feiler kaster ikke, og markør-raden varsler ikke', async () => {
    getSessionMock.mockRejectedValue(new Error('offline'));
    seedScore(5, '2026-08-14T10:00:00.000Z', {
      userId: 'mate',
      enteredBy: 'me',
    });
    rpcMock.mockResolvedValueOnce(serverWins(7));

    const { drainQueue } = await import('./syncWorker');
    const res = await drainQueue();

    expect(res.rejected).toBe(1);
    expect(fake.conflicts.has(ID)).toBe(false);
  });

  it('like slag men ulike putts gir fortsatt ingen varsel', async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { user: { id: 'me' } } },
      error: null,
    });
    seedScore(5, '2026-08-14T10:00:00.000Z', {
      userId: 'mate',
      enteredBy: 'me',
    });
    rpcMock.mockResolvedValueOnce(serverWins(5, 2));

    const { drainQueue } = await import('./syncWorker');
    await drainQueue();

    expect(fake.conflicts.has(ID)).toBe(false);
  });
});
