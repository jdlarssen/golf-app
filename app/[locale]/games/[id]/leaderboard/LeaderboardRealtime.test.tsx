import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

type Configure = (ch: { on: (...a: unknown[]) => unknown }) => unknown;
const subscribeRealtimeChannel =
  vi.fn<(topic: string, configure: Configure) => () => void>(() => vi.fn());
const refresh = vi.fn();

vi.mock('@/lib/sync/realtimeChannel', () => ({
  subscribeRealtimeChannel: (topic: string, configure: Configure) =>
    subscribeRealtimeChannel(topic, configure),
}));

// Mirror the partial mock the format-view tests use (useRouter only) — the
// component must work without a useParams export so it doesn't break them.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

import { LeaderboardRealtime } from './LeaderboardRealtime';

describe('LeaderboardRealtime', () => {
  beforeEach(() => {
    subscribeRealtimeChannel.mockClear();
    refresh.mockClear();
    window.history.pushState({}, '', '/no/games/game-from-route/leaderboard');
  });

  it('subscribes to scores INSERT + UPDATE (#745) and skips when inactive', () => {
    // Default (chrome mount): no gameId prop → reads it from the URL, subscribes.
    const { unmount } = render(<LeaderboardRealtime />);
    expect(subscribeRealtimeChannel).toHaveBeenCalledTimes(1);
    const [topic, configure] = subscribeRealtimeChannel.mock.calls[0]!;
    expect(topic).toBe('leaderboard-live:game-from-route');

    // The channel config registers scores-INSERT and scores-UPDATE handlers,
    // both routing through the same debounced router.refresh.
    vi.useFakeTimers();
    const registrations: { event?: string; table?: string; filter?: string; handler: () => void }[] = [];
    const fakeChannel = {
      on: (...args: unknown[]) => {
        const opts = args[1] as Record<string, string>;
        const handler = args[2] as () => void;
        registrations.push({ ...opts, handler });
        return fakeChannel;
      },
    };
    configure(fakeChannel);
    expect(registrations).toHaveLength(2);

    const insertReg = registrations.find((r) => r.event === 'INSERT')!;
    const updateReg = registrations.find((r) => r.event === 'UPDATE')!;
    expect(insertReg.table).toBe('scores');
    expect(insertReg.filter).toBe('game_id=eq.game-from-route');
    expect(updateReg.table).toBe('scores');
    expect(updateReg.filter).toBe('game_id=eq.game-from-route');

    // INSERT triggers a debounced refresh.
    insertReg.handler();
    vi.advanceTimersByTime(300);
    expect(refresh).toHaveBeenCalledTimes(1);

    // UPDATE also triggers (debounced, collapses with INSERT burst).
    refresh.mockClear();
    updateReg.handler();
    vi.advanceTimersByTime(300);
    expect(refresh).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
    unmount();

    // Finished game (active=false): never opens a websocket.
    subscribeRealtimeChannel.mockClear();
    render(<LeaderboardRealtime gameId="g-finished" active={false} />);
    expect(subscribeRealtimeChannel).not.toHaveBeenCalled();
  });
});
