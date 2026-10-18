/**
 * Type A — the big screen's prize-giving poller (#2298). It asks the step
 * route every 2 s and refreshes the page only when the step changed or the
 * link is gone; it stays quiet offline and gives up 6 hours after the end.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { CeremonyPoller, CEREMONY_POLL_MS, CEREMONY_POLL_GIVE_UP_MS } from './CeremonyPoller';

const refresh = vi.fn();
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

let online = true;
vi.mock('@/hooks/useOnline', () => ({
  useOnline: () => online,
}));

const fetchMock = vi.fn();

function answer(status: number, step: number | null = null) {
  fetchMock.mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ step }),
  });
}

const NOW = Date.parse('2026-10-18T20:00:00Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  online = true;
  refresh.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const ENDED_AT = new Date(NOW - 60_000).toISOString();

describe('CeremonyPoller', () => {
  it('asks the step route for this token, without the HTTP cache', async () => {
    answer(200, 2);
    render(<CeremonyPoller token="tok-1" step={2} endedAt={ENDED_AT} />);
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(fetchMock).toHaveBeenCalledWith('/api/spectate/tok-1/seremoni', { cache: 'no-store' });
  });

  it('the same step: no refresh, tick after tick', async () => {
    answer(200, 2);
    render(<CeremonyPoller token="tok-1" step={2} endedAt={ENDED_AT} />);
    await act(() => vi.advanceTimersByTimeAsync(CEREMONY_POLL_MS * 3));

    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('a new step: one refresh, not one per tick while the page catches up', async () => {
    answer(200, 3);
    render(<CeremonyPoller token="tok-1" step={2} endedAt={ENDED_AT} />);
    await act(() => vi.advanceTimersByTimeAsync(CEREMONY_POLL_MS * 3));

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('closed (null) after a step counts as a change', async () => {
    answer(200, null);
    render(<CeremonyPoller token="tok-1" step={4} endedAt={ENDED_AT} />);
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('404 (the live link was turned off): refresh, so the page can say so', async () => {
    answer(404);
    render(<CeremonyPoller token="tok-1" step={null} endedAt={ENDED_AT} />);
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(refresh).toHaveBeenCalled();
  });

  it('a server error or a network blip changes nothing', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    answer(500);
    render(<CeremonyPoller token="tok-1" step={1} endedAt={ENDED_AT} />);
    await act(() => vi.advanceTimersByTimeAsync(CEREMONY_POLL_MS * 2));

    expect(refresh).not.toHaveBeenCalled();
  });

  it('offline: no request at all, and one at once when the network is back', async () => {
    online = false;
    answer(200, 1);
    const { rerender } = render(<CeremonyPoller token="tok-1" step={1} endedAt={ENDED_AT} />);
    await act(() => vi.advanceTimersByTimeAsync(CEREMONY_POLL_MS * 3));
    expect(fetchMock).not.toHaveBeenCalled();

    online = true;
    rerender(<CeremonyPoller token="tok-1" step={1} endedAt={ENDED_AT} />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up 6 hours after the game ended', async () => {
    answer(200, 1);
    const longAgo = new Date(NOW - CEREMONY_POLL_GIVE_UP_MS - 1000).toISOString();
    render(<CeremonyPoller token="tok-1" step={1} endedAt={longAgo} />);
    await act(() => vi.advanceTimersByTimeAsync(CEREMONY_POLL_MS * 5));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stops asking once the 6 hours run out while it stands on', async () => {
    answer(200, 1);
    const almost = new Date(NOW - CEREMONY_POLL_GIVE_UP_MS + CEREMONY_POLL_MS * 2).toISOString();
    render(<CeremonyPoller token="tok-1" step={1} endedAt={almost} />);
    await act(() => vi.advanceTimersByTimeAsync(CEREMONY_POLL_MS * 10));

    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it('a hidden tab does not ask; it asks again when shown', async () => {
    answer(200, 1);
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    render(<CeremonyPoller token="tok-1" step={1} endedAt={ENDED_AT} />);
    await act(() => vi.advanceTimersByTimeAsync(CEREMONY_POLL_MS * 3));
    expect(fetchMock).not.toHaveBeenCalled();

    visibility.mockReturnValue('visible');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    visibility.mockRestore();
  });

  it('renders nothing', () => {
    answer(200, 1);
    const { container } = render(<CeremonyPoller token="tok-1" step={1} endedAt={ENDED_AT} />);
    expect(container.firstChild).toBeNull();
  });
});
