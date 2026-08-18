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
