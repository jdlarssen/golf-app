import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPacer } from './pacer';

/**
 * Type A per docs/test-discipline.md — pure rate-limiting logic (#2227).
 *
 * The clock is injected: `now` and `sleep` run on vitest's fake timers, so a
 * test can fire 30 callers at once and read off exactly when each one was let
 * through without waiting in real time.
 */
function fakeClockPacer(maxStarts: number, windowMs: number) {
  return createPacer({
    maxStarts,
    windowMs,
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  });
}

beforeEach(() => {
  vi.useFakeTimers({ now: 0 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createPacer', () => {
  it('lets at most maxStarts through per window, in call order', async () => {
    const pacer = fakeClockPacer(8, 1000);
    const started: { index: number; at: number }[] = [];

    const all = Array.from({ length: 30 }, (_, index) =>
      pacer.acquire().then(() => started.push({ index, at: Date.now() })),
    );
    await vi.runAllTimersAsync();
    await Promise.all(all);

    expect(started.map((s) => s.index)).toEqual(
      Array.from({ length: 30 }, (_, i) => i),
    );
    for (const s of started) {
      const inWindow = started.filter((o) => o.at > s.at - 1000 && o.at <= s.at);
      expect(inWindow.length).toBeLessThanOrEqual(8);
    }
    // 8 + 8 + 8 + 6: each wave starts the moment the previous one leaves the window.
    expect(started.map((s) => s.at)).toEqual([
      ...Array(8).fill(0),
      ...Array(8).fill(1000),
      ...Array(8).fill(2000),
      ...Array(6).fill(3000),
    ]);
  });

  it('pauseFor holds back every waiting and new caller', async () => {
    const pacer = fakeClockPacer(8, 1000);
    const started: number[] = [];
    const track = () => pacer.acquire().then(() => started.push(Date.now()));

    const first = Array.from({ length: 10 }, track);
    // Let the first eight through; the last two wait for t=1000.
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toEqual(Array(8).fill(0));

    pacer.pauseFor(2000);
    const later = track();
    await vi.runAllTimersAsync();
    await Promise.all([...first, later]);

    expect(started).toEqual([...Array(8).fill(0), 2000, 2000, 2000]);
  });
});
