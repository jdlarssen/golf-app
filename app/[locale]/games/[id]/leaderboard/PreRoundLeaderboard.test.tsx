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

import {
  FINISH_FOLLOW_UP_MS,
  FINISH_FOLLOW_UP_TRIES,
  PreRoundLeaderboardRealtime,
} from './PreRoundLeaderboard';

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

// Audit 2026-11-20: the finish flips the game row first, but the server
// expires its game cache only when the whole finish (round report, mails) is
// done. One refresh at the flip reads the cached «active» game, so a blind
// board would stay hidden. On a flip to finished the listener refreshes again
// until the view changes (it unmounts) or the follow-up runs out.
describe('PreRoundLeaderboardRealtime — finish follow-up', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    subscribeRealtimeChannel.mockClear();
    refresh.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it('keeps refreshing after a flip to finished, and stops when the view goes away', () => {
    const { unmount } = render(<PreRoundLeaderboardRealtime gameId="g1" />);
    gamesHandler()({ new: { id: 'g1', status: 'finished' } });
    expect(refresh).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(FINISH_FOLLOW_UP_MS * 3);
    expect(refresh).toHaveBeenCalledTimes(4);

    unmount();
    vi.advanceTimersByTime(FINISH_FOLLOW_UP_MS * 5);
    expect(refresh).toHaveBeenCalledTimes(4);
  });

  it('stops after the last try, and a second finished event starts no second loop', () => {
    render(<PreRoundLeaderboardRealtime gameId="g1" />);
    const handler = gamesHandler();
    handler({ new: { status: 'finished' } });
    handler({ new: { status: 'finished' } });
    vi.advanceTimersByTime(FINISH_FOLLOW_UP_MS * (FINISH_FOLLOW_UP_TRIES + 10));
    // Two immediate refreshes (one per event) plus one loop of tries.
    expect(refresh).toHaveBeenCalledTimes(2 + FINISH_FOLLOW_UP_TRIES);
  });

  it('an update that is not a finish refreshes once and starts no loop', () => {
    render(<PreRoundLeaderboardRealtime gameId="g1" />);
    gamesHandler()({ new: { status: 'active' } });
    vi.advanceTimersByTime(FINISH_FOLLOW_UP_MS * 5);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
