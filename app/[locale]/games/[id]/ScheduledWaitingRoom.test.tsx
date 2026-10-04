import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';

/**
 * Type C render test (one per component) for the waiting room (#2204).
 *
 * After tee-off the card must not keep saying «Starter snart» about a round
 * that is stuck. The page decides the block when it renders (E1), so a card
 * left open over tee-off asks the page again on the 30-second tick, and once
 * the page says the round is blocked, the card says so and stops asking.
 *
 * The router and the flight server action are the boundaries.
 */
const { router } = vi.hoisted(() => ({ router: { refresh: vi.fn() } }));
vi.mock('@/i18n/navigation', () => ({ useRouter: () => router }));
vi.mock('./flightJoinActions', () => ({ joinFlight: vi.fn() }));

import { ScheduledWaitingRoom } from './ScheduledWaitingRoom';

afterEach(() => {
  vi.useRealTimers();
  router.refresh.mockReset();
});

describe('ScheduledWaitingRoom', () => {
  it('after tee-off it asks the page again on the tick, and a blocked round shows the block instead of the countdown promise', () => {
    vi.useFakeTimers();
    const teeOffAt = new Date(Date.now() - 10 * 60_000).toISOString();
    const seen = () => ({
      countdownBody: screen.queryByTestId('waiting-room-countdown-body') !== null,
      blocked: screen.queryByTestId('waiting-room-blocked') !== null,
      refreshes: router.refresh.mock.calls.length,
    });

    const { rerender } = render(<ScheduledWaitingRoom gameId="game-1" teeOffAt={teeOffAt} />);
    const atMount = seen();
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    const afterTick = seen();
    rerender(
      <ScheduledWaitingRoom gameId="game-1" teeOffAt={teeOffAt} blockedReason="rotation_player_count" />,
    );
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    const blocked = seen();

    expect({ atMount, afterTick, blocked }).toEqual({
      atMount: { countdownBody: true, blocked: false, refreshes: 0 },
      afterTick: { countdownBody: true, blocked: false, refreshes: 1 },
      blocked: { countdownBody: false, blocked: true, refreshes: 1 },
    });
  });
});
