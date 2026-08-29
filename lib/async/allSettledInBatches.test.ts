import { describe, expect, it, vi } from 'vitest';
import { allSettledInBatches } from './allSettledInBatches';

/**
 * Type A per docs/test-discipline.md — pure concurrency logic (#1544).
 *
 * A deferred promise plus an in-flight counter: `tracker.maxInFlight` is the
 * observable proof that batches run sequentially, which is the whole point of
 * the helper (a burst of ~300 DB ops is what it exists to prevent).
 */
function makeTracker() {
  let inFlight = 0;
  let maxInFlight = 0;
  const startOrder: unknown[] = [];
  return {
    get maxInFlight() {
      return maxInFlight;
    },
    startOrder,
    /** Wraps a per-item function so concurrency is measured around it. */
    track<T, R>(fn: (item: T) => Promise<R>) {
      return async (item: T): Promise<R> => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        startOrder.push(item);
        try {
          // Yield twice so any sibling in the same batch gets to start before
          // this one settles — without it every call would look sequential.
          await Promise.resolve();
          await Promise.resolve();
          return await fn(item);
        } finally {
          inFlight -= 1;
        }
      };
    },
  };
}

describe('allSettledInBatches', () => {
  it('never calls fn for an empty list', async () => {
    const fn = vi.fn(async (n: number) => n);
    const results = await allSettledInBatches([], fn, 20);

    expect(results).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  it('runs a single item as one batch', async () => {
    const tracker = makeTracker();
    const results = await allSettledInBatches(
      ['a'],
      tracker.track(async (s: string) => s.toUpperCase()),
      20,
    );

    expect(results).toEqual([{ status: 'fulfilled', value: 'A' }]);
    expect(tracker.maxInFlight).toBe(1);
  });

  it('runs exactly batchSize items in one batch', async () => {
    const items = [1, 2, 3];
    const tracker = makeTracker();
    const results = await allSettledInBatches(
      items,
      tracker.track(async (n: number) => n * 2),
      3,
    );

    expect(results).toEqual([
      { status: 'fulfilled', value: 2 },
      { status: 'fulfilled', value: 4 },
      { status: 'fulfilled', value: 6 },
    ]);
    // All three overlapped → a single batch, not three sequential ones.
    expect(tracker.maxInFlight).toBe(3);
    expect(tracker.startOrder).toEqual([1, 2, 3]);
  });

  it('splits batchSize + 1 items into two sequential batches', async () => {
    const items = [1, 2, 3, 4];
    const tracker = makeTracker();
    const results = await allSettledInBatches(
      items,
      tracker.track(async (n: number) => n * 10),
      3,
    );

    expect(results.map((r) => (r.status === 'fulfilled' ? r.value : null))).toEqual([
      10, 20, 30, 40,
    ]);
    // Never more than one batch in flight: 3, then 1 — never 4.
    expect(tracker.maxInFlight).toBe(3);
    // The 4th item cannot start before the first three have settled.
    expect(tracker.startOrder).toEqual([1, 2, 3, 4]);
  });

  it('starts the next batch only after the previous one settles', async () => {
    const settled: number[] = [];
    const started: number[] = [];
    const results = await allSettledInBatches(
      [0, 1, 2, 3],
      async (n: number) => {
        started.push(n);
        // Item 0 resolves late, so a non-batched implementation would let
        // item 2 start before it finished.
        await new Promise((resolve) => setTimeout(resolve, n === 0 ? 5 : 0));
        settled.push(n);
        return n;
      },
      2,
    );

    expect(results).toHaveLength(4);
    // Both items of batch 1 settled before either item of batch 2 started.
    expect(settled.slice(0, 2).sort()).toEqual([0, 1]);
    expect(started).toEqual([0, 1, 2, 3]);
  });

  it('lets later batches run after a rejection, and keeps the rejection at its index', async () => {
    const boom = new Error('boom');
    const seen: number[] = [];
    const results = await allSettledInBatches(
      [0, 1, 2, 3],
      async (n: number) => {
        seen.push(n);
        if (n === 1) throw boom;
        return `ok-${n}`;
      },
      2,
    );

    // Batch 2 ran despite the batch-1 rejection.
    expect(seen).toEqual([0, 1, 2, 3]);
    expect(results).toEqual([
      { status: 'fulfilled', value: 'ok-0' },
      { status: 'rejected', reason: boom },
      { status: 'fulfilled', value: 'ok-2' },
      { status: 'fulfilled', value: 'ok-3' },
    ]);
  });

  it('preserves result order even when later items settle first', async () => {
    const results = await allSettledInBatches(
      [30, 20, 10, 0],
      async (delay: number) => {
        await new Promise((resolve) => setTimeout(resolve, delay));
        return delay;
      },
      4,
    );

    // result[i] belongs to items[i] — callers match recipients by position.
    expect(results).toEqual([
      { status: 'fulfilled', value: 30 },
      { status: 'fulfilled', value: 20 },
      { status: 'fulfilled', value: 10 },
      { status: 'fulfilled', value: 0 },
    ]);
  });

  it.each([
    ['zero', 0],
    ['negative', -1],
    ['fractional below one', 0.5],
    ['NaN', Number.NaN],
  ])('clamps a %s batch size to 1 instead of throwing', async (_label, batchSize) => {
    const tracker = makeTracker();
    const results = await allSettledInBatches(
      [1, 2, 3],
      tracker.track(async (n: number) => n),
      batchSize,
    );

    expect(results.map((r) => (r.status === 'fulfilled' ? r.value : null))).toEqual([
      1, 2, 3,
    ]);
    // Clamped to 1 → strictly one at a time, and no throw on a best-effort path.
    expect(tracker.maxInFlight).toBe(1);
  });

  it('floors a fractional batch size above one', async () => {
    const tracker = makeTracker();
    await allSettledInBatches(
      [1, 2, 3, 4],
      tracker.track(async (n: number) => n),
      1.5,
    );

    expect(tracker.maxInFlight).toBe(1);
  });

  it('contains a synchronous throw from fn as a rejected result', async () => {
    const boom = new Error('sync boom');
    const syncThrower = (n: number): Promise<number> => {
      if (n === 2) throw boom; // throws before returning a promise
      return Promise.resolve(n);
    };

    const results = await allSettledInBatches([1, 2, 3], syncThrower, 2);

    expect(results).toEqual([
      { status: 'fulfilled', value: 1 },
      { status: 'rejected', reason: boom },
      { status: 'fulfilled', value: 3 },
    ]);
  });

  it('batches in groups of 20 by default', async () => {
    const items = Array.from({ length: 41 }, (_, i) => i);
    const tracker = makeTracker();
    const results = await allSettledInBatches(
      items,
      tracker.track(async (n: number) => n),
    );

    expect(results).toHaveLength(41);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(tracker.maxInFlight).toBe(20);
  });
});
