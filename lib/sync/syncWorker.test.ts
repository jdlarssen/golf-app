import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeDb } from './testing/fakeDb';
import { REFUSED_REPLY_FIXTURE } from './testing/refusedReplyFixture';
import { REFUSED_WRITE_ERROR } from './classifyError';
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
// #2211: a locked refusal reads the server's row before it settles —
// `from('scores').select(…).eq(…).eq(…).eq(…).maybeSingle()`.
const maybeSingleMock = vi.fn<() => Promise<unknown>>();
const eqMock = vi.fn();
const fromMock = vi.fn((table: string) => {
  void table;
  const chain = {
    select: () => chain,
    eq: (column: string, value: unknown) => {
      eqMock(column, value);
      return chain;
    },
    maybeSingle: maybeSingleMock,
  };
  return chain;
});
vi.mock('@/lib/supabase/client', () => ({
  getBrowserClient: () => ({
    rpc: rpcMock,
    from: fromMock,
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

// #1959: kaster eier-vaktens wipe ved eierbytte, ligger forrige brukers kø
// fortsatt i basen. drainQueue har flere kallere enn motoren (banneret, hull-
// siden, service worker), så sperren må sitte i drainen selv.
describe('drainQueue — sperret etter feilet eierbytte-wipe (#1959)', () => {
  it('gjør null RPC-kall og lar køen stå mens sperren er på', async () => {
    seedScore(4, '2026-09-16T10:00:00.000Z');
    const block = await import('./ownerWipeBlock');
    block.setOwnerWipeBlocked(true);

    const { drainQueue } = await import('./syncWorker');
    const res = await drainQueue();

    expect(rpcMock).not.toHaveBeenCalled();
    expect(res.pushed).toBe(0);
    expect(fake.syncQueue.has(ID)).toBe(true);
    expect(fake.syncQueue.get(ID)!.attemptCount).toBe(0);
  });

  it('drainer som vanlig når sperren er løftet', async () => {
    seedScore(4, '2026-09-16T10:00:00.000Z');
    rpcMock.mockResolvedValueOnce({
      data: [{ was_applied: true, updated_at: '2026-09-16T10:00:01.000Z' }],
      error: null,
    });
    const block = await import('./ownerWipeBlock');
    block.setOwnerWipeBlocked(false);

    const { drainQueue } = await import('./syncWorker');
    expect((await drainQueue()).pushed).toBe(1);
  });
});

// #2211: a write the server refuses because the card is locked (submitted,
// withdrawn, round over) used to vanish: the all-NULL reply read as 'equal',
// the item was dequeued as kept-local, and the phone kept its number for good.
const FINISHED_GAME_GUARD =
  'On a finished game only putts may be changed (scores back-fill guard, #1290)';
const RLS_INSERT_ERROR =
  'new row violates row-level security policy for table "scores"';

/** The row the server actually has — what the settle reads back. */
const SERVER_ROW = {
  strokes: 5,
  putts: 2,
  entered_by: 'mate',
  client_updated_at: '2026-09-25T09:59:00+00:00',
  updated_at: '2026-09-25T09:59:00.5+00:00',
};

function setAttempts(attemptCount: number) {
  fake.syncQueue.set(ID, { ...fake.syncQueue.get(ID)!, attemptCount });
}

describe('drainQueue — låst kort-avslag (#2211)', () => {
  it('NULL-svaret setter telefonen tilbake til serverens tall og karantenerer', async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { user: { id: 'me' } } },
      error: null,
    });
    seedScore(4, '2026-09-25T10:00:00.000Z', { userId: 'mate', enteredBy: 'me' });
    rpcMock.mockResolvedValueOnce({ data: REFUSED_REPLY_FIXTURE, error: null });
    maybeSingleMock.mockResolvedValueOnce({ data: SERVER_ROW, error: null });

    const { drainQueue } = await import('./syncWorker');
    const res = await drainQueue();

    expect(fromMock).toHaveBeenCalledWith('scores');
    expect(eqMock.mock.calls).toEqual([
      ['game_id', 'g1'],
      ['user_id', 'mate'],
      ['hole_number', 5],
    ]);
    expect(fake.scores.get(ID)).toMatchObject({
      strokes: 5,
      putts: 2,
      enteredBy: 'mate',
      clientUpdatedAt: SERVER_ROW.client_updated_at,
      serverUpdatedAt: SERVER_ROW.updated_at,
    });
    expect(fake.syncQueue.get(ID)).toMatchObject({
      attemptCount: 1,
      lastError: REFUSED_WRITE_ERROR,
      abandonedAt: expect.any(String),
    });
    expect(fake.conflicts.size).toBe(0);
    expect(res.abandoned).toBe(1);
  });

  it('0148-feilen på femte forsøk gir samme oppgjør og karantene', async () => {
    seedScore(4, '2026-09-25T10:00:00.000Z');
    setAttempts(4);
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: FINISHED_GAME_GUARD },
    });
    maybeSingleMock.mockResolvedValueOnce({ data: SERVER_ROW, error: null });

    const { drainQueue } = await import('./syncWorker');
    await drainQueue();

    expect(fake.scores.get(ID)!.strokes).toBe(5);
    expect(fake.syncQueue.get(ID)).toMatchObject({
      attemptCount: 5,
      lastError: FINISHED_GAME_GUARD,
      abandonedAt: expect.any(String),
    });
  });

  it('feiler serverlesingen, står elementet til neste drain og raden er urørt', async () => {
    seedScore(4, '2026-09-25T10:00:00.000Z');
    rpcMock.mockResolvedValueOnce({ data: REFUSED_REPLY_FIXTURE, error: null });
    maybeSingleMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'TypeError: Failed to fetch' },
    });

    const { drainQueue } = await import('./syncWorker');
    const res = await drainQueue();

    expect(fake.scores.get(ID)!.strokes).toBe(4);
    const item = fake.syncQueue.get(ID)!;
    expect(item).toMatchObject({ attemptCount: 1, lastError: REFUSED_WRITE_ERROR });
    expect(item.abandonedAt).toBeUndefined();
    expect(res.errored).toBe(1);
  });

  it('avslått førstegangsslag: den lokale raden slettes og elementet karanteneres', async () => {
    seedScore(4, '2026-09-25T10:00:00.000Z');
    setAttempts(4);
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: RLS_INSERT_ERROR } });
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: null });

    const { drainQueue } = await import('./syncWorker');
    await drainQueue();

    expect(fake.scores.has(ID)).toBe(false);
    expect(fake.syncQueue.get(ID)).toMatchObject({
      lastError: RLS_INSERT_ERROR,
      abandonedAt: expect.any(String),
    });
  });

  it('uten sesjon karanteneres ingenting: en tapt sesjon ser ut som et låst kort', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null }, error: null });
    seedScore(4, '2026-09-25T10:00:00.000Z');
    setAttempts(4);
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: RLS_INSERT_ERROR } });

    const { drainQueue } = await import('./syncWorker');
    const res = await drainQueue();

    expect(fake.scores.get(ID)!.strokes).toBe(4);
    const item = fake.syncQueue.get(ID)!;
    expect(item).toMatchObject({ attemptCount: 5, lastError: RLS_INSERT_ERROR });
    expect(item.abandonedAt).toBeUndefined();
    expect(maybeSingleMock).not.toHaveBeenCalled();
    expect(res.errored).toBe(1);
  });

  it('tapt svar sendt på nytt (samme øyeblikk i serverformat) er ikke et avslag', async () => {
    seedScore(4, '2026-09-25T10:00:00.123Z');
    rpcMock.mockResolvedValueOnce({
      data: [
        {
          was_applied: false,
          strokes: 4,
          putts: null,
          entered_by: 'u1',
          client_updated_at: '2026-09-25T10:00:00.123+00:00',
          updated_at: '2026-09-25T10:00:01+00:00',
        },
      ],
      error: null,
    });

    const { drainQueue } = await import('./syncWorker');
    await drainQueue();

    expect(fake.syncQueue.has(ID)).toBe(false);
    expect(fake.scores.get(ID)).toMatchObject({
      strokes: 4,
      clientUpdatedAt: '2026-09-25T10:00:00.123Z',
    });
    expect(maybeSingleMock).not.toHaveBeenCalled();
  });
});

describe('drainQueue — kall under en pågående drain (#2211)', () => {
  it('gir én ny kjøring som sender elementet som kom i køen imens', async () => {
    seedScore(4, '2026-09-25T10:00:00.000Z');
    const LATER = 'g1:u1:6';
    const { drainQueue } = await import('./syncWorker');

    rpcMock.mockImplementationOnce(async () => {
      // Hole 6 is typed while hole 5 is in the air; HoleClient then calls
      // drainQueue, which finds the first drain still running.
      fake.scores.set(LATER, {
        ...fake.scores.get(ID)!,
        id: LATER,
        holeNumber: 6,
        strokes: 3,
        clientUpdatedAt: '2026-09-25T10:00:01.000Z',
      });
      fake.syncQueue.set(LATER, {
        id: LATER,
        scoreId: LATER,
        attemptCount: 0,
        lastError: null,
        createdAt: '2026-09-25T10:00:01.000Z',
      });
      await drainQueue();
      return {
        data: [{ was_applied: true, updated_at: '2026-09-25T10:00:02.000Z' }],
        error: null,
      };
    });
    rpcMock.mockResolvedValueOnce({
      data: [{ was_applied: true, updated_at: '2026-09-25T10:00:03.000Z' }],
      error: null,
    });

    await drainQueue();

    await vi.waitFor(() => expect(fake.syncQueue.size).toBe(0));
    expect(rpcMock).toHaveBeenCalledTimes(2);
    const second = rpcMock.mock.calls[1]?.[1] as { p_hole_number: number };
    expect(second.p_hole_number).toBe(6);
  });
});
