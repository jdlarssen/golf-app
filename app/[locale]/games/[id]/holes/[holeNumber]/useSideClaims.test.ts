import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GirClaim, HoleClaimsRead, SideClaim } from '@/lib/games/sideClaims';
import type { SideContestClaimsSnapshot } from './holeClientProps';

// #2283 (part D2) — Type A: the browser hook that keeps the flight's reports
// fresh and hands the row its two sequence numbers. The read itself
// (`readHoleClaims`) has its own tests; here it is an answer the test controls.
// The imports are static: a dynamic `import()` hangs under fake timers.
const readMock = vi.fn<(...args: unknown[]) => Promise<HoleClaimsRead>>();

vi.mock('@/lib/games/sideClaims', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/games/sideClaims')>()),
  readHoleClaims: (...args: unknown[]) => readMock(...args),
}));
vi.mock('@/lib/supabase/client', () => ({ getBrowserClient: () => ({ fake: 'browser-client' }) }));

import { SIDE_CLAIMS_POLL_MS, useSideClaims } from './useSideClaims';

const GAME = 'g1';
const HOLE = 7;
const SIDE_NEED = { side: true, gir: false };

function claim(winnerUserId: string | null, enteredBy = 'u-me'): SideClaim {
  return { category: 'closest_to_pin', holeNumber: HOLE, winnerUserId, distanceM: null, enteredBy, updatedAt: 'x' };
}
function girClaim(userId: string, hit: boolean): GirClaim {
  return { holeNumber: HOLE, userId, hit, enteredBy: 'u-me', updatedAt: 'x' };
}
const okSide = (...claims: SideClaim[]): HoleClaimsRead => ({ ok: true, side: claims, gir: undefined });
const FAILED: HoleClaimsRead = { ok: false, error: new Error('timeout') };
const snapshot = (...claims: SideClaim[]): SideContestClaimsSnapshot => ({ failed: false, side: claims, gir: undefined });
const FAILED_SNAPSHOT: SideContestClaimsSnapshot = { failed: true, side: undefined, gir: undefined };

/** A read the test answers by hand, to put two reads in flight at once. */
function deferred() {
  let resolve!: (value: HoleClaimsRead) => void;
  const promise = new Promise<HoleClaimsRead>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

let visibility: 'visible' | 'hidden' = 'visible';
function setVisibility(next: 'visible' | 'hidden') {
  visibility = next;
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.useFakeTimers();
  readMock.mockReset();
  readMock.mockResolvedValue(okSide());
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
});

afterEach(() => {
  vi.useRealTimers();
});

const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

describe('useSideClaims', () => {
  it('paints the server snapshot at once, without a read, and polls from there', async () => {
    const { result } = renderHook(() => useSideClaims(GAME, HOLE, SIDE_NEED, snapshot(claim('u-tore'))));

    expect(result.current).toMatchObject({ side: [claim('u-tore')], failed: false, snapshotSeq: 0 });
    expect(result.current.startedSeq()).toBe(0);
    expect(readMock).not.toHaveBeenCalled();

    readMock.mockResolvedValue(okSide(claim('u-per')));
    await advance(SIDE_CLAIMS_POLL_MS);

    expect(readMock).toHaveBeenCalledTimes(1);
    expect(readMock).toHaveBeenCalledWith({ fake: 'browser-client' }, { gameId: GAME, holeNumber: HOLE, need: SIDE_NEED });
    expect(result.current).toMatchObject({ side: [claim('u-per')], snapshotSeq: 1 });
    expect(result.current.startedSeq()).toBe(1);

    await advance(SIDE_CLAIMS_POLL_MS);
    expect(readMock).toHaveBeenCalledTimes(2);
    expect(result.current.snapshotSeq).toBe(2);
  });

  it('polls as often as the app does', () => {
    expect(SIDE_CLAIMS_POLL_MS).toBe(10_000);
  });

  it('keeps the last good snapshot when a later read fails', async () => {
    const { result } = renderHook(() => useSideClaims(GAME, HOLE, SIDE_NEED, snapshot(claim('u-tore'))));
    readMock.mockResolvedValue(FAILED);

    await advance(SIDE_CLAIMS_POLL_MS);

    expect(readMock).toHaveBeenCalledTimes(1);
    expect(result.current).toMatchObject({ side: [claim('u-tore')], failed: false, snapshotSeq: 0 });
  });

  it('reads at once when the server read failed, says failed until one succeeds, and then clears it', async () => {
    const first = deferred();
    readMock.mockReturnValueOnce(first.promise);
    const { result } = renderHook(() => useSideClaims(GAME, HOLE, SIDE_NEED, FAILED_SNAPSHOT));

    expect(readMock).toHaveBeenCalledTimes(1);
    expect(result.current).toMatchObject({ side: undefined, failed: true });

    await act(async () => first.resolve(FAILED));
    expect(result.current).toMatchObject({ side: undefined, failed: true });

    readMock.mockResolvedValueOnce(okSide(claim(null)));
    await advance(SIDE_CLAIMS_POLL_MS);
    expect(result.current).toMatchObject({ side: [claim(null)], failed: false, snapshotSeq: 2 });
  });

  it('reads at once when it has no snapshot at all', async () => {
    readMock.mockResolvedValue(okSide(claim('u-tore')));
    const { result } = renderHook(() => useSideClaims(GAME, HOLE, SIDE_NEED, null));
    await advance(0);
    expect(readMock).toHaveBeenCalledTimes(1);
    expect(result.current).toMatchObject({ side: [claim('u-tore')], snapshotSeq: 1 });
  });

  it('stops polling while the page is hidden, and reads at once and resumes when it is visible', async () => {
    renderHook(() => useSideClaims(GAME, HOLE, SIDE_NEED, snapshot()));

    act(() => setVisibility('hidden'));
    await advance(SIDE_CLAIMS_POLL_MS * 5);
    expect(readMock).not.toHaveBeenCalled();

    await act(async () => setVisibility('visible'));
    expect(readMock).toHaveBeenCalledTimes(1);

    await advance(SIDE_CLAIMS_POLL_MS);
    expect(readMock).toHaveBeenCalledTimes(2);
  });

  it('reads when the network is back', async () => {
    renderHook(() => useSideClaims(GAME, HOLE, SIDE_NEED, snapshot()));
    await act(async () => void window.dispatchEvent(new Event('online')));
    expect(readMock).toHaveBeenCalledTimes(1);
  });

  it('numbers each read when it goes out, and the snapshot when it lands', async () => {
    const { result } = renderHook(() => useSideClaims(GAME, HOLE, SIDE_NEED, snapshot(claim('u-tore'))));
    const read = deferred();
    readMock.mockReturnValueOnce(read.promise);

    // What a card does after its own save: note the last read sent, then refresh.
    let refreshed!: Promise<void>;
    act(() => {
      refreshed = result.current.refresh();
    });
    expect(result.current.startedSeq()).toBe(1);
    expect(result.current.snapshotSeq).toBe(0);

    await act(async () => {
      read.resolve(okSide(claim('u-me')));
      await refreshed;
    });
    expect(result.current).toMatchObject({ side: [claim('u-me')], snapshotSeq: 1 });
  });

  it('drops an older read that answers after a newer one (#2094)', async () => {
    const { result } = renderHook(() => useSideClaims(GAME, HOLE, SIDE_NEED, snapshot()));
    const older = deferred();
    const newer = deferred();
    readMock.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);

    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current.refresh();
      second = result.current.refresh();
    });
    expect(result.current.startedSeq()).toBe(2);

    await act(async () => {
      newer.resolve(okSide(claim('u-me')));
      await second;
    });
    await act(async () => {
      older.resolve(okSide(claim('u-tore')));
      await first;
    });

    expect(result.current).toMatchObject({ side: [claim('u-me')], snapshotSeq: 2 });
  });

  it('refresh never rejects, also when the read fails', async () => {
    const { result } = renderHook(() => useSideClaims(GAME, HOLE, SIDE_NEED, snapshot()));
    readMock.mockResolvedValue(FAILED);
    await act(async () => {
      await expect(result.current.refresh()).resolves.toBeUndefined();
    });
  });

  it('asks only for the tables the hole needs and hands both back', async () => {
    readMock.mockResolvedValue({ ok: true, side: [claim('u-tore')], gir: [girClaim('u-me', true)] });
    const need = { side: true, gir: true };
    const { result } = renderHook(() => useSideClaims(GAME, HOLE, need, null));
    await advance(0);
    expect(readMock).toHaveBeenCalledWith(expect.anything(), { gameId: GAME, holeNumber: HOLE, need });
    expect(result.current).toMatchObject({ side: [claim('u-tore')], gir: [girClaim('u-me', true)] });
  });

  it('does not read or poll when the hole needs no table', async () => {
    const { result } = renderHook(() => useSideClaims(GAME, HOLE, { side: false, gir: false }, null));
    await advance(SIDE_CLAIMS_POLL_MS * 3);
    await act(async () => void (await result.current.refresh()));
    expect(readMock).not.toHaveBeenCalled();
  });

  it('stops for good on unmount: no timer, no listener, and a late answer is dropped', async () => {
    const { result, unmount } = renderHook(() => useSideClaims(GAME, HOLE, SIDE_NEED, snapshot()));
    const late = deferred();
    readMock.mockReturnValueOnce(late.promise);
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.refresh();
    });
    expect(readMock).toHaveBeenCalledTimes(1);

    unmount();
    expect(vi.getTimerCount()).toBe(0);

    await advance(SIDE_CLAIMS_POLL_MS * 3);
    await act(async () => void window.dispatchEvent(new Event('online')));
    act(() => setVisibility('visible'));
    expect(readMock).toHaveBeenCalledTimes(1);

    // The late answer lands in an unmounted hook: nothing to assert on it but that it does not throw.
    await act(async () => {
      late.resolve(okSide(claim('u-tore')));
      await pending;
    });
  });
});
