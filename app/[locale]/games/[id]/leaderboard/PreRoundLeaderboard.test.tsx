import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';

type Configure = (ch: { on: (...a: unknown[]) => unknown }) => unknown;
const subscribeRealtimeChannel = vi.fn<(topic: string, configure: Configure) => () => void>(
  () => vi.fn(),
);
const refresh = vi.fn();

vi.mock('@/lib/sync/realtimeChannel', () => ({
  subscribeRealtimeChannel: (topic: string, configure: Configure) =>
    subscribeRealtimeChannel(topic, configure),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { FINISH_FOLLOW_UP_DELAYS_MS, PreRoundLeaderboardRealtime } from './PreRoundLeaderboard';
/** The games-UPDATE handler the component registers on its channel. */
function gamesHandler(): (payload: unknown) => void {
  const [, configure] = subscribeRealtimeChannel.mock.calls[0]!;
  let handler: ((payload: unknown) => void) | null = null;
  const channel = {
    on: (...args: unknown[]) => {
      const opts = args[1] as { table?: string };
      if (opts.table === 'games') handler = args[2] as (payload: unknown) => void;
      return channel;
    },
  };
  configure(channel);
  return handler!;
}

// Audit 2026-11-20: the finish flips the game row before its server action
// returns, and Next expires the game cache only when the action returns. The
// refresh at the flip can still read the cached «active» game, and no new event
// comes after the action. On a flip to finished the listener refreshes a few
// more times with backoff, and stops as soon as the view changes (unmount).
describe('PreRoundLeaderboardRealtime — finish follow-up', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    subscribeRealtimeChannel.mockClear();
    refresh.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it('backs off: at most five more refreshes, the last after a minute', () => {
    expect(FINISH_FOLLOW_UP_DELAYS_MS).toEqual([2_000, 4_000, 8_000, 16_000, 32_000]);
    render(<PreRoundLeaderboardRealtime gameId="g1" />);
    gamesHandler()({ new: { id: 'g1', status: 'finished' } });
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2_000);
    expect(refresh).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(4_000);
    expect(refresh).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(10 * 60_000);
    expect(refresh).toHaveBeenCalledTimes(6);
  });

  it('stops when the view goes away, and a second finished event starts no second chain', () => {
    const { unmount } = render(<PreRoundLeaderboardRealtime gameId="g1" />);
    const handler = gamesHandler();
    handler({ new: { status: 'finished' } });
    handler({ new: { status: 'finished' } });
    vi.advanceTimersByTime(2_000);
    // Two immediate refreshes (one per event) plus the first follow-up.
    expect(refresh).toHaveBeenCalledTimes(3);
    unmount();
    vi.advanceTimersByTime(10 * 60_000);
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it('an update that is not a finish refreshes once and starts no chain', () => {
    render(<PreRoundLeaderboardRealtime gameId="g1" />);
    gamesHandler()({ new: { status: 'active' } });
    vi.advanceTimersByTime(10 * 60_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
