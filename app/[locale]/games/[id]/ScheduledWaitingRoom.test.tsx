import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * Type C render test (one per component) for the waiting room (#2204). A round
 * that is stuck after tee-off must not say «Starter snart» or promise a
 * notification. The page decides `blocked`; this checks the card listens.
 *
 * The flight server action is the boundary.
 */
vi.mock('./flightJoinActions', () => ({ joinFlight: vi.fn() }));

import { ScheduledWaitingRoom } from './ScheduledWaitingRoom';

describe('ScheduledWaitingRoom', () => {
  it('a blocked round after tee-off shows the block text instead of the countdown promise', () => {
    render(
      <ScheduledWaitingRoom
        gameId="game-1"
        teeOffAt={new Date(Date.now() - 10 * 60_000).toISOString()}
        blocked
      />,
    );

    expect({
      blocked: screen.queryByTestId('waiting-room-blocked') !== null,
      countdownBody: screen.queryByTestId('waiting-room-countdown-body'),
    }).toEqual({ blocked: true, countdownBody: null });
  });
});
