/**
 * A sliding-window rate limiter for outgoing calls to a rate-limited API.
 *
 * `acquire()` resolves once the caller may start its call: fewer than
 * `maxStarts` calls have started in the last `windowMs`, and no pause is set.
 * Callers are let through strictly in the order they called `acquire()` — the
 * waits are serialised through one promise chain, so a later caller can never
 * overtake an earlier one.
 *
 * `pauseFor(ms)` holds back EVERY start (queued and future) until `now() + ms`.
 * It exists for the API's "slow down" answer (HTTP 429 with `retry-after`): one
 * rejected call pauses the whole queue instead of every caller retrying on its
 * own and turning a single 429 into a storm of them.
 *
 * Used by `lib/mail/send.ts` (#2227) to keep a burst of mail — "Resultatet er
 * klart" to a whole field, the monthly newsletter — under Resend's per-team
 * limit. The pacer only paces; it never times out or drops a caller.
 *
 * `now` and `sleep` are injectable for tests. The defaults look `Date` and
 * `setTimeout` up at call time, so vitest's fake timers take effect even for a
 * pacer created at module load.
 */
export type Pacer = {
  acquire(): Promise<void>;
  pauseFor(ms: number): void;
};

export type PacerOptions = {
  maxStarts: number;
  windowMs: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

export function createPacer({
  maxStarts,
  windowMs,
  now = () => Date.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}: PacerOptions): Pacer {
  // Start times inside the current window, oldest first.
  const starts: number[] = [];
  let pausedUntil = 0;
  let queue: Promise<void> = Promise.resolve();

  async function waitForTurn(): Promise<void> {
    for (;;) {
      const t = now();
      if (t < pausedUntil) {
        await sleep(pausedUntil - t);
        continue;
      }
      while (starts.length > 0 && starts[0]! <= t - windowMs) starts.shift();
      if (starts.length < maxStarts) {
        starts.push(t);
        return;
      }
      // The oldest start leaves the window at starts[0] + windowMs.
      await sleep(starts[0]! + windowMs - t);
    }
  }

  return {
    acquire() {
      const turn = queue.then(waitForTurn);
      // Keep the chain alive even if a turn ever rejects (an injected sleep
      // that throws), so one failure cannot wedge every later caller.
      queue = turn.catch(() => {});
      return turn;
    },
    pauseFor(ms) {
      pausedUntil = Math.max(pausedUntil, now() + ms);
    },
  };
}
