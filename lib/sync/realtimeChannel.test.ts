import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need control over the mocked browser client BEFORE the helper imports it,
// so the mock is declared at module scope and supabaseClient is rebuilt per test.
let mockSupabase: ReturnType<typeof makeMockSupabase>;

vi.mock('@/lib/supabase/client', () => ({
  getBrowserClient: () => mockSupabase,
}));

type MockChannel = {
  topic: string;
  onSpy: ReturnType<typeof vi.fn<(...args: unknown[]) => void>>;
  subscribeSpy: ReturnType<typeof vi.fn<() => void>>;
  on: (...args: unknown[]) => MockChannel;
  subscribe: () => MockChannel;
};

function makeMockSupabase() {
  const channels: MockChannel[] = [];
  const setAuthSpy = vi.fn();
  const session = { access_token: 'jwt' };

  function channel(topic: string): MockChannel {
    const realtimeTopic = `realtime:${topic}`;
    const existing = channels.find((c) => c.topic === realtimeTopic);
    if (existing) return existing;
    const ch: MockChannel = {
      topic: realtimeTopic,
      onSpy: vi.fn<(...args: unknown[]) => void>(),
      subscribeSpy: vi.fn<() => void>(),
      on(...args) {
        this.onSpy(...args);
        return this;
      },
      subscribe() {
        this.subscribeSpy();
        return this;
      },
    };
    channels.push(ch);
    return ch;
  }

  async function removeChannel(target: MockChannel) {
    const idx = channels.findIndex((c) => c === target);
    if (idx >= 0) channels.splice(idx, 1);
    return 'ok' as const;
  }

  return {
    channels,
    setAuthSpy,
    auth: {
      getSession: async () => ({ data: { session } }),
    },
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
  mockSupabase = makeMockSupabase();
});

describe('subscribeRealtimeChannel', () => {
  it('creates one channel, calls setAuth, runs configure, calls subscribe', async () => {
    const { subscribeRealtimeChannel } = await import('./realtimeChannel');
    const configure = vi.fn((ch: MockChannel) =>
      ch.on('postgres_changes', { event: 'INSERT' }, () => {}),
    );

    const cleanup = subscribeRealtimeChannel(
      'scores:game-A',
      configure as never,
    );
    await flushPromises();

    expect(mockSupabase.setAuthSpy).toHaveBeenCalledWith('jwt');
    expect(mockSupabase.channels).toHaveLength(1);
    expect(configure).toHaveBeenCalledTimes(1);
    expect(mockSupabase.channels[0].subscribeSpy).toHaveBeenCalledTimes(1);
    expect(mockSupabase.channels[0].onSpy).toHaveBeenCalledTimes(1);

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
    // Cleanup synchronously, before getSession() resolves.
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
});
