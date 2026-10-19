/**
 * Type A — the big screen's prize-giving poller (#2298). It asks the step
 * route and refreshes the page only when the page shows something else. Next
 * 16's refresh returns at once and lands later or never; one that has not put
 * the step on screen after CEREMONY_LAND_MS is followed by a reload that
 * carries the step already shown.
 * Quiet offline and while hidden; after six quiet hours it asks once a
 * minute, and every two seconds again after a change.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import {
  CeremonyPoller,
  CEREMONY_POLL_MS,
  CEREMONY_SLOW_AFTER_MS,
  CEREMONY_SLOW_POLL_MS,
  CEREMONY_LAND_MS,
} from './CeremonyPoller';

// Next 16's router.refresh() queues the work and returns at once; the new
// page arrives later (a rerender with the new step) or never.
const refresh = vi.fn();
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const reloadPage = vi.fn();
vi.mock('./reloadPage', () => ({
  PLAYED_PARAM: 'vist',
  reloadPage: (played: number | null) => reloadPage(played),
}));

let online = true;
vi.mock('@/hooks/useOnline', () => ({
  useOnline: () => online,
}));

const fetchMock = vi.fn();

function response(status: number, step: number | null = null, finished = true) {
  return { ok: status >= 200 && status < 300, status, json: async () => ({ step, finished }) };
}

function answer(status: number, step: number | null = null, finished = true) {
  fetchMock.mockResolvedValue(response(status, step, finished));
}

const NOW = Date.parse('2026-10-18T20:00:00Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  online = true;
  refresh.mockClear();
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

  it('a refresh that lands late, inside the window: one refresh, no reload', async () => {
    answer(200, 3);
    const { rerender } = render(<CeremonyPoller token="tok-1" step={2} />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(refresh).toHaveBeenCalledTimes(1);

    // The new page arrives 1.2 s later.
    await act(() => vi.advanceTimersByTimeAsync(1200));
    rerender(<CeremonyPoller token="tok-1" step={3} />);
    await act(() => vi.advanceTimersByTimeAsync(CEREMONY_LAND_MS + CEREMONY_POLL_MS * 2));

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(reloadPage).not.toHaveBeenCalled();
  });

  it('a refresh that never lands (dropped, staging #2298): one reload, carrying the step on screen', async () => {
    answer(200, 3);
    render(<CeremonyPoller token="tok-1" step={2} />);
    await act(() => vi.advanceTimersByTimeAsync(CEREMONY_LAND_MS - 1));
    expect(reloadPage).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(CEREMONY_POLL_MS * 3));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(reloadPage).toHaveBeenCalledTimes(1);
    // The page reloads with ?vist=2: cards up to step 2 stay still.
    expect(reloadPage).toHaveBeenCalledWith(2);
  });

  it('after a reload with ?vist=3, a step back below it reloads with the lower mark, so the next reveal animates again', async () => {
    window.history.replaceState(null, '', '/spectate/tok-1/tv?vist=3');
    answer(200, 0);
    render(<CeremonyPoller token="tok-1" step={3} />);
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(refresh).not.toHaveBeenCalled();
    expect(reloadPage).toHaveBeenCalledWith(0);
    window.history.replaceState(null, '', '/');
  });

  it('closed (null) after a step counts as a change', async () => {
    answer(200, null);
    render(<CeremonyPoller token="tok-1" step={4} />);
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('one 404 is a blink; two in a row (the live link was turned off) refresh the page', async () => {
    answer(404);
    render(<CeremonyPoller token="tok-1" step={null} />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(refresh).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(CEREMONY_POLL_MS));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('a 404 between good answers counts from zero again', async () => {
    fetchMock
      .mockResolvedValueOnce(response(404))
      .mockResolvedValueOnce(response(200, null))
      .mockResolvedValueOnce(response(404))
      .mockResolvedValue(response(200, null));
    render(<CeremonyPoller token="tok-1" step={null} />);
    await act(() => vi.advanceTimersByTimeAsync(CEREMONY_POLL_MS * 4));

    expect(refresh).not.toHaveBeenCalled();
  });

  it('a reopened game (no longer finished): refresh, so the TV leaves «Ferdig spilt»', async () => {
    answer(200, null, false);
    render(<CeremonyPoller token="tok-1" step={null} />);
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(refresh).toHaveBeenCalledTimes(1);
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

  it('after six quiet hours it asks once a minute, not every two seconds', async () => {
    answer(200, 1);
    render(<CeremonyPoller token="tok-1" step={1} />);
    await act(() => vi.advanceTimersByTimeAsync(CEREMONY_SLOW_AFTER_MS));
    const before = fetchMock.mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(CEREMONY_SLOW_POLL_MS * 3));

    const asked = fetchMock.mock.calls.length - before;
    expect(asked).toBeGreaterThanOrEqual(2);
    expect(asked).toBeLessThanOrEqual(4);
  });

  it('a change after the quiet hours brings it back to every two seconds', async () => {
    answer(200, 1);
    const { rerender } = render(<CeremonyPoller token="tok-1" step={1} />);
    await act(() => vi.advanceTimersByTimeAsync(CEREMONY_SLOW_AFTER_MS + CEREMONY_SLOW_POLL_MS));

    // The organiser starts again: the page now shows step 2.
    answer(200, 2);
    rerender(<CeremonyPoller token="tok-1" step={2} />);
    const before = fetchMock.mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(CEREMONY_POLL_MS * 5));

    expect(fetchMock.mock.calls.length - before).toBeGreaterThanOrEqual(5);
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
