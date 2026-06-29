/**
 * Type C — render test for SpectatePoller (#938).
 *
 * Verifies the one observable behavior that's worth a render test:
 * the poller sets up an interval when live=true and tears it down on unmount.
 * When live=false no interval is registered.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { SpectatePoller } from './SpectatePoller';

// next-intl navigation is not needed by SpectatePoller itself, but the
// import chain pulls in next/navigation — mock it to keep the test isolated.
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

// Use fake timers to control setInterval without waiting real time.
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('SpectatePoller', () => {
  it('renders nothing in the DOM', () => {
    const { container } = render(<SpectatePoller live={true} />);
    expect(container.firstChild).toBeNull();
  });

  it('does not schedule an interval when live=false', () => {
    const setIntervalSpy = vi.spyOn(global, 'setInterval');
    render(<SpectatePoller live={false} />);
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });

  it('schedules a 20s interval when live=true', () => {
    const setIntervalSpy = vi.spyOn(global, 'setInterval');
    render(<SpectatePoller live={true} />);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 20_000);
  });

  it('clears the interval on unmount', () => {
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    const { unmount } = render(<SpectatePoller live={true} />);
    act(() => unmount());
    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});
