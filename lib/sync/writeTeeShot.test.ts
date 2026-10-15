import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { createFakeDb } from './testing/fakeDb';

// Type A (#2580): writeTeeShot, local first and then the queue, as writeScore.
// The module is imported once in beforeAll, before the clock is faked (#2292:
// a dynamic import() hangs under a fake clock), and only Date is faked.
const fake = createFakeDb();
vi.mock('./db', () => ({ localDb: fake.localDb, teeShotKey: fake.teeShotKey }));

let writeTeeShot: typeof import('./writeTeeShot').writeTeeShot;
beforeAll(async () => {
  ({ writeTeeShot } = await import('./writeTeeShot'));
});

const NOW = '2026-10-15T10:00:00.000Z';
const KEY = 'g1:1:7';
const ARGS = { gameId: 'g1', teamNumber: 1, holeNumber: 7, teeShotBy: 'marte', enteredBy: 'sigrid' };

beforeEach(() => {
  fake.reset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('writeTeeShot', () => {
  it('writes the row and its queue item together, in one rw transaction over both tables', async () => {
    const row = await writeTeeShot(ARGS);

    expect(fake.localDb.transaction).toHaveBeenCalledTimes(1);
    expect(fake.localDb.transaction.mock.calls[0]?.slice(0, 3)).toEqual(['rw', fake.localDb.teeShots, fake.localDb.teeShotQueue]);
    expect(fake.teeShots.get(KEY)).toEqual({
      id: KEY,
      gameId: 'g1',
      teamNumber: 1,
      holeNumber: 7,
      teeShotBy: 'marte',
      enteredBy: 'sigrid',
      clientUpdatedAt: NOW,
      serverUpdatedAt: null,
    });
    expect(fake.teeShotQueue.get(KEY)).toEqual({
      id: KEY,
      teeShotId: KEY,
      attemptCount: 0,
      lastError: null,
      createdAt: NOW,
    });
    expect(row).toEqual(fake.teeShots.get(KEY));
  });

  it('the first write takes the clock', async () => {
    expect((await writeTeeShot(ARGS)).clientUpdatedAt).toBe(NOW);
  });

  it('a second tap in the same millisecond is 1 ms later, so the RPC (strict >) applies it (#2211)', async () => {
    await writeTeeShot(ARGS);
    const second = await writeTeeShot({ ...ARGS, teeShotBy: 'per' });

    expect(second.clientUpdatedAt).toBe('2026-10-15T10:00:00.001Z');
    expect(fake.teeShots.get(KEY)?.teeShotBy).toBe('per');
  });

  it('a stored stamp ahead of the clock is passed by 1 ms, never reused', async () => {
    fake.teeShots.set(KEY, { ...ARGS, id: KEY, clientUpdatedAt: '2026-10-15T10:00:05.000Z', serverUpdatedAt: null });

    expect((await writeTeeShot(ARGS)).clientUpdatedAt).toBe('2026-10-15T10:00:05.001Z');
  });

  it('a stored stamp in the server format (+00:00) is compared as an instant, not as text (#2211)', async () => {
    // The same instant as NOW. As text, "…Z" sorts after "…+00:00", so a
    // text compare would take the clock (the same instant) and the RPC, which
    // applies only on strict >, would drop the write.
    fake.teeShots.set(KEY, { ...ARGS, id: KEY, clientUpdatedAt: '2026-10-15T10:00:00.000+00:00', serverUpdatedAt: '2026-10-15T10:00:01.000+00:00' });

    expect((await writeTeeShot(ARGS)).clientUpdatedAt).toBe('2026-10-15T10:00:00.001Z');
  });

  it('a stored stamp behind the clock gives way to the clock', async () => {
    fake.teeShots.set(KEY, { ...ARGS, id: KEY, clientUpdatedAt: '2026-10-15T09:00:00.000Z', serverUpdatedAt: null });

    expect((await writeTeeShot(ARGS)).clientUpdatedAt).toBe(NOW);
  });

  it('clearing the hole writes null and still queues it', async () => {
    await writeTeeShot(ARGS);
    await writeTeeShot({ ...ARGS, teeShotBy: null });

    expect(fake.teeShots.get(KEY)?.teeShotBy).toBeNull();
    expect(fake.teeShotQueue.get(KEY)?.createdAt).toBe('2026-10-15T10:00:00.001Z');
  });
});
