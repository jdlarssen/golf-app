import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeDb } from './testing/fakeDb';
import type { LocalScore } from './db';
import type { ServerScoreRow } from './mergeServerScore';

const fake = createFakeDb();

vi.mock('./db', () => ({
  localDb: fake.localDb,
  scoreKey: fake.scoreKey,
}));

const ME = 'me';
const MATE = 'mate';
const ID = `g1:${ME}:7`;

const T0 = '2026-08-18T10:00:00.000Z';
const T1 = '2026-08-18T10:00:05.000Z';

/** A row already in Dexie — by default one I typed for myself at T0. */
function seedLocal(overrides: Partial<LocalScore> = {}) {
  const userId = overrides.userId ?? ME;
  const row: LocalScore = {
    id: `g1:${userId}:7`,
    gameId: 'g1',
    userId,
    holeNumber: 7,
    strokes: 5,
    putts: null,
    enteredBy: overrides.enteredBy ?? userId,
    clientUpdatedAt: T0,
    serverUpdatedAt: null,
    ...overrides,
  };
  fake.scores.set(row.id, row);
  return row;
}

/** A queue item still waiting to be uploaded for that row. */
function seedQueueItem(scoreId = ID, abandonedAt?: string) {
  fake.syncQueue.set(scoreId, {
    id: scoreId,
    scoreId,
    attemptCount: 0,
    lastError: null,
    createdAt: T0,
    ...(abandonedAt ? { abandonedAt } : {}),
  });
}

/** A row arriving from the server — by default the mate's 4 at T1. */
function incoming(overrides: Partial<ServerScoreRow> = {}): ServerScoreRow {
  return {
    gameId: 'g1',
    userId: ME,
    holeNumber: 7,
    strokes: 4,
    putts: null,
    enteredBy: MATE,
    clientUpdatedAt: T1,
    serverUpdatedAt: '2026-08-18T10:00:05.500Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
});

// #1611: the conflict notice used to be written only by the drain, so it only
// ever fired offline. These are the two online cases that stayed silent.
describe('mergeServerScore — the notice now fires online too (#1611)', () => {
  it('pre-emption: an incoming row that beats the drain still writes the notice', async () => {
    seedLocal({ strokes: 5 });
    seedQueueItem();

    const { mergeServerScore } = await import('./mergeServerScore');
    const outcome = await mergeServerScore(incoming({ strokes: 4 }), ME);

    expect(outcome).toBe('applied-with-conflict');
    expect(fake.conflicts.get(ID)).toMatchObject({
      gameId: 'g1',
      userId: ME,
      holeNumber: 7,
      localStrokes: 5,
      serverStrokes: 4,
      forOwnScore: true,
    });
    expect(fake.scores.get(ID)).toMatchObject({ strokes: 4, clientUpdatedAt: T1 });
    // The queued value lost LWW — leaving it would push a stale number back up.
    expect(fake.syncQueue.has(ID)).toBe(false);
  });

  it('already synced, then overwritten from another phone: notice', async () => {
    seedLocal({ strokes: 5, serverUpdatedAt: '2026-08-18T10:00:00.500Z' });

    const { mergeServerScore } = await import('./mergeServerScore');
    const outcome = await mergeServerScore(incoming({ strokes: 4 }), ME);

    expect(outcome).toBe('applied-with-conflict');
    expect(fake.conflicts.get(ID)).toMatchObject({ localStrokes: 5, serverStrokes: 4 });
    expect(fake.scores.get(ID)).toMatchObject({ strokes: 4 });
  });

  it('a number I kept for a flight-mate is flagged as not-own-score', async () => {
    seedLocal({ userId: MATE, enteredBy: ME, strokes: 5 });

    const { mergeServerScore } = await import('./mergeServerScore');
    await mergeServerScore(incoming({ userId: MATE, strokes: 4 }), ME);

    expect(fake.conflicts.get(`g1:${MATE}:7`)).toMatchObject({
      userId: MATE,
      localStrokes: 5,
      serverStrokes: 4,
      forOwnScore: false,
    });
  });

  it('clears a quarantined queue item too', async () => {
    seedLocal({ strokes: 5 });
    seedQueueItem(ID, '2026-08-18T09:00:00.000Z');

    const { mergeServerScore } = await import('./mergeServerScore');
    await mergeServerScore(incoming({ strokes: 4 }), ME);

    expect(fake.syncQueue.has(ID)).toBe(false);
  });
});

describe('mergeServerScore — cases that must stay silent', () => {
  it('an older-or-equal row (the echo of my own write) touches nothing', async () => {
    seedLocal({ strokes: 5 });
    seedQueueItem();

    const { mergeServerScore } = await import('./mergeServerScore');
    const outcome = await mergeServerScore(
      incoming({ strokes: 9, clientUpdatedAt: T0 }),
      ME,
    );

    expect(outcome).toBe('kept-local');
    expect(fake.scores.get(ID)).toMatchObject({ strokes: 5, clientUpdatedAt: T0 });
    expect(fake.conflicts.size).toBe(0);
    expect(fake.syncQueue.has(ID)).toBe(true);
  });

  it('no local row: store it, no notice', async () => {
    const { mergeServerScore } = await import('./mergeServerScore');
    const outcome = await mergeServerScore(incoming({ strokes: 4 }), ME);

    expect(outcome).toBe('applied');
    expect(fake.scores.get(ID)).toMatchObject({ strokes: 4, enteredBy: MATE });
    expect(fake.conflicts.size).toBe(0);
  });

  it('a row someone else typed here is overwritten silently', async () => {
    seedLocal({ enteredBy: MATE, strokes: 5 });

    const { mergeServerScore } = await import('./mergeServerScore');
    const outcome = await mergeServerScore(incoming({ strokes: 4 }), ME);

    expect(outcome).toBe('applied');
    expect(fake.scores.get(ID)).toMatchObject({ strokes: 4 });
    expect(fake.conflicts.size).toBe(0);
  });

  it('same strokes, new putts: overwrite without a notice', async () => {
    seedLocal({ strokes: 5, putts: null });

    const { mergeServerScore } = await import('./mergeServerScore');
    const outcome = await mergeServerScore(incoming({ strokes: 5, putts: 2 }), ME);

    expect(outcome).toBe('applied');
    expect(fake.scores.get(ID)).toMatchObject({ strokes: 5, putts: 2 });
    expect(fake.conflicts.size).toBe(0);
  });

  it('coalesces a missing putts field to null (#939 pre-migration rows)', async () => {
    const { mergeServerScore } = await import('./mergeServerScore');
    await mergeServerScore(
      incoming({ putts: undefined as unknown as null }),
      ME,
    );

    expect(fake.scores.get(ID)).toMatchObject({ putts: null });
  });

  it('runs the whole decision inside one Dexie transaction', async () => {
    seedLocal({ strokes: 5 });

    const { mergeServerScore } = await import('./mergeServerScore');
    await mergeServerScore(incoming({ strokes: 4 }), ME);

    expect(fake.localDb.transaction).toHaveBeenCalledTimes(1);
  });
});

// #2227: catch-up merges a whole game (≈2 700 rows at 150 players) at once. One
// transaction for the batch, the same rule per row as mergeServerScore.
describe('mergeServerScores', () => {
  const at = (hole: number) => `g1:${ME}:${hole}`;

  it('judges each row by the same rule, all inside one transaction', async () => {
    seedLocal({ id: at(7), holeNumber: 7, clientUpdatedAt: T1 }); // newer than incoming
    seedLocal({ id: at(8), holeNumber: 8, strokes: 5 }); // typed here at T0

    const { mergeServerScores } = await import('./mergeServerScore');
    const outcomes = await mergeServerScores(
      [
        incoming({ holeNumber: 7, clientUpdatedAt: T0 }),
        incoming({ holeNumber: 8, strokes: 4 }),
        incoming({ holeNumber: 9 }),
      ],
      ME,
    );

    expect(outcomes).toEqual(['kept-local', 'applied-with-conflict', 'applied']);
    expect(fake.localDb.transaction).toHaveBeenCalledTimes(1);
    expect([...fake.conflicts.keys()]).toEqual([at(8)]);
    expect(fake.scores.get(at(9))?.strokes).toBe(4);
  });

  it('drops queue items only for the rows it applied', async () => {
    seedLocal({ id: at(7), holeNumber: 7, clientUpdatedAt: T1 });
    seedLocal({ id: at(8), holeNumber: 8 });
    seedQueueItem(at(7));
    seedQueueItem(at(8));

    const { mergeServerScores } = await import('./mergeServerScore');
    await mergeServerScores(
      [incoming({ holeNumber: 7, clientUpdatedAt: T0 }), incoming({ holeNumber: 8 })],
      ME,
    );

    expect([...fake.syncQueue.keys()]).toEqual([at(7)]);
  });

  it('opens no transaction for an empty batch', async () => {
    const { mergeServerScores } = await import('./mergeServerScore');
    expect(await mergeServerScores([], ME)).toEqual([]);
    expect(fake.localDb.transaction).not.toHaveBeenCalled();
  });
});

// Audit 20.11 (p18): last-write-wins compared the two stamps as strings. The
// local stamp comes from toISOString() (`…Z`); the server echoes timestamptz
// as `…+00:00` with trailing zeros trimmed. As text those disagree with the
// instants they name, so the verdict must compare instants (resolveConflict).
describe('mergeServerScore — stamps compared as instants (p18)', () => {
  it('the same instant in server form is the echo: kept, no rewrite', async () => {
    seedLocal({ clientUpdatedAt: '2026-11-20T10:00:01.52+00:00' });

    const { mergeServerScore } = await import('./mergeServerScore');
    const outcome = await mergeServerScore(
      incoming({ clientUpdatedAt: '2026-11-20T10:00:01.520Z', strokes: 4 }),
      ME,
    );

    expect(outcome).toBe('kept-local');
    expect(fake.scores.get(ID)!.strokes).toBe(5);
  });

  it('an OLDER server row in another offset never overwrites a newer local one', async () => {
    seedLocal({ clientUpdatedAt: '2026-11-20T10:30:00.000Z', strokes: 5 });
    seedQueueItem();

    const { mergeServerScore } = await import('./mergeServerScore');
    // 11:15+01:00 is 10:15Z — fifteen minutes older than the local row.
    const outcome = await mergeServerScore(
      incoming({ clientUpdatedAt: '2026-11-20T11:15:00+01:00', strokes: 4 }),
      ME,
    );

    expect(outcome).toBe('kept-local');
    expect(fake.scores.get(ID)!.strokes).toBe(5);
    expect(fake.syncQueue.has(ID)).toBe(true);
  });
});
