import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';

/**
 * Type C render test (one per component) for the scheduled game's start
 * listener (#2219).
 *
 * Every start path flips `games.status` first and expires the game cache
 * after (the start route and the admin button announce the start in between).
 * The realtime UPDATE can beat the expiry, and a single `router.refresh()`
 * then renders the cached «scheduled» page again — seen on staging. So the
 * listener keeps refreshing, with a short backoff, until the page renders the
 * active game and unmounts it, and it stops after a bounded number of tries.
 *
 * Realtime and the router are the boundaries; the channel plumbing itself is
 * `lib/sync/realtimeChannel`'s own test.
 */

const { router, channel } = vi.hoisted(() => ({
  router: { refresh: vi.fn() },
  channel: {
    configure: null as null | ((ch: unknown) => unknown),
    hooks: null as null | { onResubscribed?: () => void },
    unsubscribe: vi.fn(),
  },
}));

vi.mock('@/i18n/navigation', () => ({ useRouter: () => router }));
vi.mock('@/lib/sync/realtimeChannel', () => ({
  subscribeRealtimeChannel: vi.fn(
    (
      _topic: string,
      configure: (ch: unknown) => unknown,
      hooks: { onResubscribed?: () => void },
    ) => {
      channel.configure = configure;
      channel.hooks = hooks;
      return channel.unsubscribe;
    },
  ),
}));

import { subscribeRealtimeChannel } from '@/lib/sync/realtimeChannel';
import { GameStartListener } from './GameStartListener';

/** Run the component's `configure` against a fake channel and fire one UPDATE. */
function fireUpdate(row: { status?: string }) {
  let handler: ((payload: { new: unknown }) => void) | null = null;
  let filter: unknown = null;
  const fake = {
    on: (_event: string, f: unknown, h: (payload: { new: unknown }) => void) => {
      filter = f;
      handler = h;
      return fake;
    },
  };
  channel.configure!(fake);
  act(() => handler!({ new: row }));
  return filter;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GameStartListener', () => {
  it('refreshes when the game turns active, and keeps refreshing until the active page replaces it', () => {
    const { unmount } = render(<GameStartListener gameId="g1" />);
    expect(subscribeRealtimeChannel).toHaveBeenCalledWith(
      'game-status:g1',
      expect.any(Function),
      expect.any(Object),
    );

    // Another UPDATE on the game (a renamed game, a moved tee-off) is not a start.
    const filter = fireUpdate({ status: 'scheduled' });
    expect(filter).toEqual({
      event: 'UPDATE',
      schema: 'public',
      table: 'games',
      filter: 'id=eq.g1',
    });
    expect(router.refresh).not.toHaveBeenCalled();

    fireUpdate({ status: 'active' });
    expect(router.refresh).toHaveBeenCalledTimes(1);

    // The first refresh may still render the cached «scheduled» page. The page
    // is still here, so it asks again.
    act(() => vi.advanceTimersByTime(1_000));
    expect(router.refresh).toHaveBeenCalledTimes(2);
    act(() => vi.advanceTimersByTime(2_000));
    expect(router.refresh).toHaveBeenCalledTimes(3);

    // The active page has rendered: the listener is gone and stops asking.
    unmount();
    expect(channel.unsubscribe).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(60_000));
    expect(router.refresh).toHaveBeenCalledTimes(3);
  });
});
