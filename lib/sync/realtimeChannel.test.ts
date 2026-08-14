import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need control over the mocked browser client BEFORE the helper imports it,
// so the mock is declared at module scope and supabaseClient is rebuilt per test.
let mockSupabase: ReturnType<typeof makeMockSupabase>;

vi.mock('@/lib/supabase/client', () => ({
  getBrowserClient: () => mockSupabase,
}));

type StatusCallback = (status: string) => void;

type MockChannel = {
  topic: string;
  onSpy: ReturnType<typeof vi.fn<(...args: unknown[]) => void>>;
  subscribeSpy: ReturnType<typeof vi.fn<() => void>>;
  /** Status callback the helper handed to `.subscribe()`, if any. */
  status: StatusCallback | null;
  on: (...args: unknown[]) => MockChannel;
  subscribe: (callback?: StatusCallback) => MockChannel;
};

function makeMockSupabase() {
  const channels: MockChannel[] = [];
  /**
   * Ordered trace of lifecycle calls — lets a test assert that the replacement
   * channel is subscribed BEFORE the old one is removed (removing the last
   * channel would take the socket down with it), and that auth is primed
   * before a channel exists at all.
   */
  const trace: string[] = [];
  /** One-shot gate armed by `holdNextSetAuth()`; see below. */
  let pendingGate: Promise<void> | null = null;
  const setAuthSpy = vi.fn(async (...args: unknown[]) => {
    trace.push(`setAuth:${args.length}`);
    const gate = pendingGate;
    pendingGate = null;
    if (gate) await gate;
  });

  /**
   * Arms a one-shot gate: the NEXT `setAuth()` call suspends until the
   * returned `release()` runs. Lets a test hold a rebuild inside its own
   * await window — the interval where the old channel is still the current
   * one — and poke that old channel while the replacement is suspended.
   */
  function holdNextSetAuth(): () => void {
    let release!: () => void;
    pendingGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    return release;
  }

  function channel(topic: string): MockChannel {
    const realtimeTopic = `realtime:${topic}`;
    const existing = channels.find((c) => c.topic === realtimeTopic);
    if (existing) return existing;
    const ch: MockChannel = {
      topic: realtimeTopic,
      onSpy: vi.fn<(...args: unknown[]) => void>(),
      subscribeSpy: vi.fn<() => void>(),
      status: null,
      on(...args) {
        this.onSpy(...args);
        return this;
      },
      subscribe(callback) {
        this.subscribeSpy();
        this.status = callback ?? null;
        trace.push(`subscribe:${this.topic}`);
        return this;
      },
    };
    channels.push(ch);
    trace.push(`create:${realtimeTopic}`);
    return ch;
  }

  async function removeChannel(target: MockChannel) {
    const idx = channels.findIndex((c) => c === target);
    if (idx >= 0) channels.splice(idx, 1);
    trace.push(`remove:${target.topic}`);
    // The real client fires CLOSED at the end of a leave round-trip.
    target.status?.('CLOSED');
    return 'ok' as const;
  }

  return {
    channels,
    setAuthSpy,
    holdNextSetAuth,
    trace,
    realtime: {
      setAuth: setAuthSpy,
      getChannels: () => channels,
    },
    channel,
    removeChannel,
  };
}

async function flushPromises() {
  await new Promise((r) => setTimeout(r, 0));
}

/** Same, but under fake timers: yields the microtask queue without a real wait. */
async function flushFake() {
  await vi.advanceTimersByTimeAsync(0);
}

/** Emits `status` on the only live channel, N times in a row. */
function emit(status: string, times = 1) {
  for (let i = 0; i < times; i++) {
    mockSupabase.channels[mockSupabase.channels.length - 1]!.status?.(status);
  }
}

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    value,
    configurable: true,
  });
}

/**
 * Adapter so tests can pass a MockChannel-typed callback to the helper, which
 * requires `(channel: RealtimeChannel) => RealtimeChannel`. The `as never` is
 * test-only — we control the mock so the structural mismatch doesn't matter.
 */
function configureBind(
  fn: (ch: MockChannel) => MockChannel,
): (ch: unknown) => unknown {
  return fn as never;
}

beforeEach(() => {
  // The helper keeps a module-global subscription counter; reset it so topic
  // assertions don't depend on how many tests ran before.
  vi.resetModules();
  mockSupabase = makeMockSupabase();
  setOnline(true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('subscribeRealtimeChannel', () => {
  it('creates one channel, runs configure, subscribes with a status callback', async () => {
    const { subscribeRealtimeChannel } = await import('./realtimeChannel');
    const configure = vi.fn((ch: MockChannel) =>
      ch.on('postgres_changes', { event: 'INSERT' }, () => {}),
    );

    const cleanup = subscribeRealtimeChannel(
      'scores:game-A',
      configure as never,
    );
    await flushPromises();

    // #1366: auth is primed with a NO-ARG setAuth before the channel exists —
    // subscribe() snapshots the join payload synchronously, so a channel built
    // before priming joins without an access_token. An argument would set
    // _manuallySetToken and disable the library's own token upkeep.
    expect(mockSupabase.setAuthSpy).toHaveBeenCalledTimes(1);
    expect(mockSupabase.setAuthSpy).toHaveBeenCalledWith();
    expect(mockSupabase.trace[0]).toBe('setAuth:0');
    expect(mockSupabase.trace[1]).toMatch(/^create:realtime:scores:game-A#/);
    expect(mockSupabase.channels).toHaveLength(1);
    expect(configure).toHaveBeenCalledTimes(1);
    expect(mockSupabase.channels[0].subscribeSpy).toHaveBeenCalledTimes(1);
    expect(mockSupabase.channels[0].onSpy).toHaveBeenCalledTimes(1);
    expect(typeof mockSupabase.channels[0].status).toBe('function');

    cleanup();
    await flushPromises();
    expect(mockSupabase.channels).toHaveLength(0);
  });

  it('cleans up if cleanup runs before async setup completes', async () => {
    const { subscribeRealtimeChannel } = await import('./realtimeChannel');

    const cleanup = subscribeRealtimeChannel(
      'scores:game-A',
      configureBind((ch) =>
        ch.on('postgres_changes', {}, () => {}),
      ) as never,
    );
    // Cleanup synchronously, before the no-arg setAuth() resolves.
    cleanup();
    await flushPromises();

    expect(mockSupabase.channels).toHaveLength(0);
  });

  it('does not collide when two subscriptions share the same logical topic', async () => {
    const { subscribeRealtimeChannel } = await import('./realtimeChannel');

    const bind = configureBind((ch) =>
      ch.on('postgres_changes', {}, () => {}),
    ) as never;
    const cleanupA = subscribeRealtimeChannel('scores:game-A', bind);
    await flushPromises();
    // Pretend the cleanup queues but hasn't completed — simulate by NOT
    // running cleanupA, just kick off a second subscription as if the
    // unmount/remount raced. Both must end up as distinct channels.
    const cleanupB = subscribeRealtimeChannel('scores:game-A', bind);
    await flushPromises();

    expect(mockSupabase.channels).toHaveLength(2);
    const topics = mockSupabase.channels.map((c) => c.topic);
    expect(new Set(topics).size).toBe(2);
    // Both share the same logical prefix (the caller-supplied topic).
    expect(topics.every((t) => t.startsWith('realtime:scores:game-A'))).toBe(
      true,
    );

    cleanupA();
    cleanupB();
    await flushPromises();
    expect(mockSupabase.channels).toHaveLength(0);
  });

  it('handles rapid mount → unmount → mount without leaking the first channel', async () => {
    const { subscribeRealtimeChannel } = await import('./realtimeChannel');

    const bind = configureBind((ch) =>
      ch.on('postgres_changes', {}, () => {}),
    ) as never;
    const cleanup1 = subscribeRealtimeChannel('scores:game-A', bind);
    await flushPromises();
    expect(mockSupabase.channels).toHaveLength(1);

    cleanup1();
    await flushPromises();
    expect(mockSupabase.channels).toHaveLength(0);

    const cleanup2 = subscribeRealtimeChannel('scores:game-A', bind);
    await flushPromises();
    expect(mockSupabase.channels).toHaveLength(1);

    cleanup2();
    await flushPromises();
    expect(mockSupabase.channels).toHaveLength(0);
  });

  describe('resubscribe on channel failure (#1366)', () => {
    const bind = configureBind((ch) =>
      ch.on('postgres_changes', {}, () => {}),
    ) as never;

    it('rebuilds only after 3 consecutive failures, subscribing the new channel before removing the old', async () => {
      vi.useFakeTimers();
      const { subscribeRealtimeChannel } = await import('./realtimeChannel');
      const cleanup = subscribeRealtimeChannel('scores:game-A', bind);
      await flushFake();
      const first = mockSupabase.channels[0]!;

      // Two failures are phoenix' business — its own rejoin loop is running.
      emit('CHANNEL_ERROR', 2);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(mockSupabase.channels).toEqual([first]);

      // The third tips it over; the rebuild waits out the first backoff step.
      emit('CHANNEL_ERROR');
      await vi.advanceTimersByTimeAsync(1_999);
      expect(mockSupabase.channels).toEqual([first]);

      await vi.advanceTimersByTimeAsync(1);
      expect(mockSupabase.channels).toHaveLength(1);
      const second = mockSupabase.channels[0]!;
      expect(second).not.toBe(first);
      expect(second.topic).not.toBe(first.topic);
      expect(second.subscribeSpy).toHaveBeenCalledTimes(1);
      // Order matters: removing the last channel disconnects the socket.
      expect(mockSupabase.trace.slice(-3)).toEqual([
        `create:${second.topic}`,
        `subscribe:${second.topic}`,
        `remove:${first.topic}`,
      ]);
      // TIMED_OUT counts the same way — next rebuild uses the 5s step.
      emit('TIMED_OUT', 3);
      await vi.advanceTimersByTimeAsync(4_999);
      expect(mockSupabase.channels).toEqual([second]);
      await vi.advanceTimersByTimeAsync(1);
      expect(mockSupabase.channels[0]).not.toBe(second);

      cleanup();
      await flushFake();
      expect(mockSupabase.channels).toHaveLength(0);
    });

    it('gives the rebuilt channel a full failure budget, even though the old one keeps erroring', async () => {
      vi.useFakeTimers();
      const { subscribeRealtimeChannel } = await import('./realtimeChannel');
      const cleanup = subscribeRealtimeChannel('scores:game-A', bind);
      await flushFake();
      const first = mockSupabase.channels[0]!;

      emit('CHANNEL_ERROR', 3); // tips over → rebuild scheduled in 2s
      // Phoenix keeps hammering the doomed channel throughout the backoff
      // window; those errors belong to the OLD generation.
      await vi.advanceTimersByTimeAsync(1_000);
      first.status?.('CHANNEL_ERROR');
      first.status?.('CHANNEL_ERROR');
      first.status?.('CHANNEL_ERROR');

      await vi.advanceTimersByTimeAsync(1_000);
      const second = mockSupabase.channels[0]!;
      expect(second).not.toBe(first);

      // The replacement starts at zero: two errors must not trigger anything.
      emit('CHANNEL_ERROR', 2);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(mockSupabase.channels).toEqual([second]);

      // The OLD channel's status callback stays wired until its own leave
      // round-trip is fully done — phoenix can still invoke it after the
      // swap. Those statuses belong to a channel that is no longer
      // `channelRef`, so the identity check in `handleStatus` must drop
      // them; without it they'd land on the shared counters and tip the
      // healthy replacement into an unwarranted rebuild.
      first.status?.('CHANNEL_ERROR');
      first.status?.('CHANNEL_ERROR');
      first.status?.('CHANNEL_ERROR');
      await vi.advanceTimersByTimeAsync(60_000);
      expect(mockSupabase.channels).toEqual([second]);

      cleanup();
      await flushFake();
      expect(mockSupabase.channels).toHaveLength(0);
    });

    it('ignores the old channel’s errors while the replacement is suspended in setAuth', async () => {
      vi.useFakeTimers();
      const { subscribeRealtimeChannel } = await import('./realtimeChannel');
      const cleanup = subscribeRealtimeChannel('scores:game-A', bind);
      await flushFake();
      const first = mockSupabase.channels[0]!;

      // Tip the first channel over: a rebuild is armed 2s out, and the
      // failure budget is now spent.
      emit('CHANNEL_ERROR', 3);
      // Hold that rebuild inside its own setAuth() await.
      const releaseSetAuth = mockSupabase.holdNextSetAuth();
      await vi.advanceTimersByTimeAsync(2_000);
      // The timer fired and openChannel is suspended — no replacement yet.
      expect(mockSupabase.channels).toEqual([first]);

      // Phoenix keeps hammering the doomed channel. This is the dangerous
      // window: the swap happens AFTER the await, so `first` is still the
      // current channel (its statuses pass the identity check), its budget
      // is already spent, and the timer that got us here nulled itself — so
      // nothing may arm a second, orphaned rebuild here. The in-flight
      // rebuild is already producing the replacement these errors ask for.
      first.status?.('CHANNEL_ERROR');
      first.status?.('CHANNEL_ERROR');
      first.status?.('CHANNEL_ERROR');
      first.status?.('CHANNEL_ERROR');

      releaseSetAuth();
      await flushFake();
      const second = mockSupabase.channels[0]!;
      expect(second).not.toBe(first);

      // The replacement is healthy and silent. Nothing armed during the
      // await window may outlive the swap — wait out the entire backoff
      // ladder and then some.
      await vi.advanceTimersByTimeAsync(120_000);
      expect(mockSupabase.channels).toEqual([second]);
      expect(
        mockSupabase.trace.filter((t) => t.startsWith('create:')),
      ).toHaveLength(2);

      cleanup();
      await flushFake();
      expect(mockSupabase.channels).toHaveLength(0);
    });

    it('never rebuilds on CLOSED, and SUBSCRIBED resets the failure count', async () => {
      vi.useFakeTimers();
      const { subscribeRealtimeChannel } = await import('./realtimeChannel');
      const cleanup = subscribeRealtimeChannel('scores:game-A', bind);
      await flushFake();
      const first = mockSupabase.channels[0]!;

      // CLOSED is fired by our own teardown — rebuilding would spawn a zombie.
      emit('CLOSED', 5);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(mockSupabase.channels).toEqual([first]);

      // A blip that recovers must not carry over toward the threshold.
      emit('CHANNEL_ERROR', 2);
      emit('SUBSCRIBED');
      emit('CHANNEL_ERROR', 2);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(mockSupabase.channels).toEqual([first]);

      cleanup();
      await flushFake();
      expect(mockSupabase.channels).toHaveLength(0);
    });

    it('cleanup during backoff cancels the rebuild instead of leaking a channel', async () => {
      vi.useFakeTimers();
      const { subscribeRealtimeChannel } = await import('./realtimeChannel');
      const cleanup = subscribeRealtimeChannel('scores:game-A', bind);
      await flushFake();

      emit('CHANNEL_ERROR', 3);
      // Unmount lands mid-backoff.
      cleanup();
      await vi.advanceTimersByTimeAsync(60_000);

      expect(mockSupabase.channels).toHaveLength(0);
      expect(mockSupabase.trace.filter((t) => t.startsWith('create:'))).toHaveLength(1);
    });

    it('parks retries while offline and resumes on the online event', async () => {
      vi.useFakeTimers();
      const { subscribeRealtimeChannel } = await import('./realtimeChannel');
      const cleanup = subscribeRealtimeChannel('scores:game-A', bind);
      await flushFake();
      const first = mockSupabase.channels[0]!;

      setOnline(false);
      emit('CHANNEL_ERROR', 5);
      await vi.advanceTimersByTimeAsync(60_000);
      // Offline guarantees the rebuild would fail too — no backoff steps burned.
      expect(mockSupabase.channels).toEqual([first]);

      setOnline(true);
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(2_000);
      expect(mockSupabase.channels).toHaveLength(1);
      const second = mockSupabase.channels[0]!;
      expect(second).not.toBe(first);

      // Parked again, but phoenix recovers on its own this time. SUBSCRIBED
      // must lift the park, or the next wifi flap tears down a healthy channel.
      setOnline(false);
      emit('CHANNEL_ERROR', 3);
      setOnline(true);
      emit('SUBSCRIBED');
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(60_000);
      expect(mockSupabase.channels).toEqual([second]);

      cleanup();
      await flushFake();
      expect(mockSupabase.channels).toHaveLength(0);
      // Cleanup unhooks the listener: a later online event does nothing.
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(60_000);
      expect(mockSupabase.channels).toHaveLength(0);
    });
  });
});

describe('onPostgresChange', () => {
  it('forwards opts + handler til channel.on med «postgres_changes»-event-navnet', async () => {
    const { onPostgresChange } = await import('./realtimeChannel');
    const channel = mockSupabase.channel('test');
    const handler = vi.fn();

    onPostgresChange<{ read_at: string | null }>(
      channel as never,
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: 'user_id=eq.abc',
      },
      handler,
    );

    expect(channel.onSpy).toHaveBeenCalledTimes(1);
    const [eventName, opts, fwdHandler] = channel.onSpy.mock.calls[0];
    expect(eventName).toBe('postgres_changes');
    expect(opts).toEqual({
      event: 'INSERT',
      schema: 'public',
      table: 'notifications',
      filter: 'user_id=eq.abc',
    });
    // Handler videreformidles uendret (caller's typing trer i kraft når
    // Supabase invoker den med payload).
    expect(fwdHandler).toBe(handler);
  });

  it('returnerer samme channel-instans (for chaining)', async () => {
    const { onPostgresChange } = await import('./realtimeChannel');
    const channel = mockSupabase.channel('test');

    const result = onPostgresChange(
      channel as never,
      { event: 'UPDATE', schema: 'public', table: 'games' },
      () => {},
    );

    // Channel returneres uendret — wrapper er en pass-through, ikke en
    // proxy. Lar caller .on()-chain flere subscriptions på samme kanal.
    expect(result).toBe(channel);
  });
});
