/**
 * Type A — the big screen's prize-giving poller (#2298). It asks the step
 * route every 2 s and refreshes the page only when the step changed or the
 * link is gone; it stays quiet offline and gives up 6 hours after the page
 * was opened.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { CeremonyPoller, CEREMONY_POLL_MS, CEREMONY_POLL_GIVE_UP_MS } from './CeremonyPoller';

const refresh = vi.fn();
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const reloadPage = vi.fn();
vi.mock('./reloadPage', () => ({
  reloadPage: () => reloadPage(),
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
  reloadPage.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('CeremonyPoller', () => {
  it('asks the step route for this token, without the HTTP cache', async () => {
    answer(200, 2);
    render(<CeremonyPoller token="tok-1" step={2} />);
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(fetchMock).toHaveBeenCalledWith('/api/spectate/tok-1/seremoni', { cache: 'no-store' });
  });

  it('the same step: no refresh, tick after tick', async () => {
    answer(200, 2);
    render(<CeremonyPoller token="tok-1" step={2} />);
    await act(() => vi.advanceTimersByTimeAsync(CEREMONY_POLL_MS * 3));

    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('a new step: a refresh first, and no reload while it lands', async () => {
    answer(200, 3);
    const { rerender } = render(<CeremonyPoller token="tok-1" step={2} />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(refresh).toHaveBeenCalledTimes(1);

    // The refreshed page arrives with the new step.
    rerender(<CeremonyPoller token="tok-1" step={3} />);
    await act(() => vi.advanceTimersByTimeAsync(CEREMONY_POLL_MS * 3));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(reloadPage).not.toHaveBeenCalled();
  });

  it('a refresh that never lands: the page reloads, once (staging, #2298)', async () => {
    // On the PPR route a router.refresh() now and then never commits; the
    // screen stood still on the old step.
    answer(200, 3);
    render(<CeremonyPoller token="tok-1" step={2} />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(reloadPage).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(CEREMONY_POLL_MS));
    expect(reloadPage).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('closed (null) after a step counts as a change', async () => {
    answer(200, null);
    render(<CeremonyPoller token="tok-1" step={4} />);
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('404 (the live link was turned off): refresh, so the page can say so', async () => {
    answer(404);
    render(<CeremonyPoller token="tok-1" step={null} />);
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(refresh).toHaveBeenCalled();
  });

  it('a server error or a network blip changes nothing', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    answer(500);
    render(<CeremonyPoller token="tok-1" step={1} />);
    await act(() => vi.advanceTimersByTimeAsync(CEREMONY_POLL_MS * 2));

    expect(refresh).not.toHaveBeenCalled();
  });

  it('offline: no request at all, and one at once when the network is back', async () => {
    online = false;
    answer(200, 1);
    const { rerender } = render(<CeremonyPoller token="tok-1" step={1} />);
    await act(() => vi.advanceTimersByTimeAsync(CEREMONY_POLL_MS * 3));
    expect(fetchMock).not.toHaveBeenCalled();

    online = true;
    rerender(<CeremonyPoller token="tok-1" step={1} />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stops asking 6 hours after the page was opened (a TV left on overnight)', async () => {
    answer(200, 1);
    render(<CeremonyPoller token="tok-1" step={1} />);
    await act(() => vi.advanceTimersByTimeAsync(CEREMONY_POLL_GIVE_UP_MS - CEREMONY_POLL_MS));
    const before = fetchMock.mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(CEREMONY_POLL_MS * 10));

    expect(before).toBeGreaterThan(0);
    expect(fetchMock.mock.calls.length - before).toBeLessThanOrEqual(1);
  });

  it('a hidden tab does not ask; it asks again when shown', async () => {
    answer(200, 1);
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    render(<CeremonyPoller token="tok-1" step={1} />);
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
    const { container } = render(<CeremonyPoller token="tok-1" step={1} />);
    expect(container.firstChild).toBeNull();
  });
});
