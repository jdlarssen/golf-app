/**
 * Type A — the big screen's prize-giving poller (#2298). It asks the step
 * route and refreshes the page only when the page shows something else; a
 * refresh that the router drops is followed by a reload, a slow one is not.
 * Quiet offline and while hidden; after six quiet hours it asks once a
 * minute, and every two seconds again after a change.
 */

import { Suspense, use, useEffect, useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import {
  CeremonyPoller,
  CEREMONY_POLL_MS,
  CEREMONY_SLOW_AFTER_MS,
  CEREMONY_SLOW_POLL_MS,
  CEREMONY_REFRESH_CEILING_MS,
} from './CeremonyPoller';

// What the router's refresh does; set per test. Called inside the poller's
// transition, so a state update here is part of it, as Next's is.
const refreshImpl: { current: () => void } = { current: () => {} };
const refresh = vi.fn(() => refreshImpl.current());
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

function response(status: number, step: number | null = null, finished = true) {
  return { ok: status >= 200 && status < 300, status, json: async () => ({ step, finished }) };
}

function answer(status: number, step: number | null = null, finished = true) {
  fetchMock.mockResolvedValue(response(status, step, finished));
}

/** Suspends until the promise settles — a refresh whose render is slow. */
function Wait({ p }: { p: Promise<void> }) {
  use(p);
  return null;
}

/**
 * The TV page in miniature: the poller with the step the page shows. A
 * refresh can land at once, land when `land` settles (the transition stays
 * pending meanwhile), or never land (Next drops the commit).
 */
function Page({ initial, to, land }: { initial: number | null; to: number | null; land: 'now' | 'never' | Promise<void> }) {
  const [step, setStep] = useState(initial);
  const [gate, setGate] = useState<Promise<void> | null>(null);
  useEffect(() => {
    refreshImpl.current = () => {
      if (land === 'never') return;
      if (land !== 'now') setGate(land);
      setStep(to);
    };
  }, [land, to]);
  return (
    <Suspense fallback={null}>
      {gate && <Wait p={gate} />}
      <CeremonyPoller token="tok-1" step={step} />
    </Suspense>
  );
}

const NOW = Date.parse('2026-10-18T20:00:00Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  online = true;
  refreshImpl.current = () => {};
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

  it('a new step: one refresh, and when it lands, no reload', async () => {
    answer(200, 3);
    render(<Page initial={2} to={3} land="now" />);
    await act(() => vi.advanceTimersByTimeAsync(CEREMONY_POLL_MS * 3));

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(reloadPage).not.toHaveBeenCalled();
  });

  it('a refresh the router drops (staging, #2298): the page reloads, once', async () => {
    // The transition ends with the old step still on screen.
    answer(200, 3);
    render(<Page initial={2} to={3} land="never" />);
    await act(() => vi.advanceTimersByTimeAsync(CEREMONY_POLL_MS * 3));

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });

  it('a slow refresh is waited for, not reloaded (no replayed reveal)', async () => {
    answer(200, 3);
    let release!: () => void;
    const slow = new Promise<void>((r) => (release = r));
    render(<Page initial={2} to={3} land={slow} />);
    await act(() => vi.advanceTimersByTimeAsync(CEREMONY_POLL_MS * 3));
    expect(reloadPage).not.toHaveBeenCalled();

    // The slow render finishes, and the page shows the new step.
    await act(async () => {
      release();
    });
    await act(() => vi.advanceTimersByTimeAsync(CEREMONY_POLL_MS * 2));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(reloadPage).not.toHaveBeenCalled();
  });

  it('a refresh that hangs past the ceiling: the page reloads', async () => {
    answer(200, 3);
    render(<Page initial={2} to={3} land={new Promise<void>(() => {})} />);
    await act(() => vi.advanceTimersByTimeAsync(CEREMONY_REFRESH_CEILING_MS + CEREMONY_POLL_MS * 2));

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(reloadPage).toHaveBeenCalledTimes(1);
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
