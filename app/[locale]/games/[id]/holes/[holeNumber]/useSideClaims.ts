'use client';

// #2283 (part D2): what the flight has reported on this hole, kept fresh in the
// browser. The same model as the app's `useSideClaims` (and its wolf and BBB
// choices): server only, polled rather than subscribed, and the last good
// snapshot stays when a later read fails.
//
// The first snapshot comes from the server render (`sideContest.claims`), so
// the row paints with an answer. This hook keeps it fresh:
//
//  1. every `SIDE_CLAIMS_POLL_MS` while the page is visible, and not at all
//     while it is hidden (the interval is cleared, not just skipped);
//  2. at once when the page becomes visible again and when the network is back;
//  3. right after an own save, and each time the sheet opens, through `refresh()`
//     (a flight-mate may have written in between, and the flight key can change
//     mid-round, #2891);
//  4. at once on mount when the server read failed.
//
// Every read gets a sequence number when it goes out. `snapshotSeq` is the
// number of the read on screen (0 for the server's snapshot) and `startedSeq()`
// the number of the last read sent. The row and the sheet use them to hold a
// press until a read that started after its save has answered (the owner's
// choice B, 15.11): the server is the truth, but a press does not flicker back
// because one read failed. The rule is in `SideContestCard`/`GirContestCard` in
// the app; this hook gives the web card the same two numbers.
//
// The hole page remounts per hole (`key={holeNumber}`), so a snapshot never
// outlives its hole; each read still carries the hole it was sent for, and an
// answer for another hole than the one on screen counts as «not read».
import { useCallback, useEffect, useRef, useState } from 'react';
import { readHoleClaims, type GirClaim, type HoleClaimsNeed, type SideClaim } from '@/lib/games/sideClaims';
import { getBrowserClient } from '@/lib/supabase/client';
import type { SideContestClaimsSnapshot } from './holeClientProps';

/** The app's `CHOICES_POLL_MS` (native/app/src/lib/useChoices.ts): the same cadence on both. */
export const SIDE_CLAIMS_POLL_MS = 10_000;

export interface SideClaimsState {
  /** `undefined` = not read for this hole yet (or not a table the hole reports into). An empty list is an answer. */
  side: SideClaim[] | undefined;
  gir: GirClaim[] | undefined;
  /** No read has succeeded for this hole, and the last one failed. The row says «Fikk ikke hentet». */
  failed: boolean;
  /** Read now. Never rejects; a failure keeps the snapshot. */
  refresh: () => Promise<void>;
  /** The sequence number of the read on screen; 0 for the server's snapshot or before any success. */
  snapshotSeq: number;
  /** The sequence number of the last read that went out. */
  startedSeq: () => number;
}

interface Fetched {
  hole: number;
  seq: number;
  side: SideClaim[] | undefined;
  gir: GirClaim[] | undefined;
}

export function useSideClaims(
  gameId: string,
  holeNumber: number,
  /** Which tables the hole reports into (`claimsNeeded`). Both `false` = no reads, no timers. */
  need: HoleClaimsNeed,
  /** The server's snapshot (`HoleSideContestProps.claims`). Null or failed = read at once on mount. */
  initial: SideContestClaimsSnapshot | null,
  pollMs: number = SIDE_CLAIMS_POLL_MS,
): SideClaimsState {
  const [fetched, setFetched] = useState<Fetched | null>(() =>
    initial && !initial.failed ? { hole: holeNumber, seq: 0, side: initial.side, gir: initial.gir } : null,
  );
  const [failedHole, setFailedHole] = useState<number | null>(() => (initial?.failed ? holeNumber : null));
  const enabled = need.side || need.gir;

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // The newest read wins (#2094): a poll that went out before a save must not
  // land over the read the save triggered.
  const seq = useRef(0);
  const appliedSeq = useRef(0);
  const succeededHole = useRef<number | null>(initial && !initial.failed ? holeNumber : null);
  const mountedWithSnapshot = useRef(initial != null && !initial.failed);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const mySeq = ++seq.current;
    const hole = holeNumber;
    const result = await readHoleClaims(getBrowserClient(), {
      gameId,
      holeNumber: hole,
      need: { side: need.side, gir: need.gir },
    });
    if (!alive.current) return;
    if (!result.ok) {
      // The last snapshot for the hole stays. With none, the row says «Fikk ikke hentet».
      if (succeededHole.current !== hole) setFailedHole(hole);
      return;
    }
    if (mySeq <= appliedSeq.current) return;
    appliedSeq.current = mySeq;
    succeededHole.current = hole;
    setFetched({ hole, seq: mySeq, side: result.side, gir: result.gir });
    setFailedHole(null);
  }, [enabled, gameId, holeNumber, need.gir, need.side]);

  const startedSeq = useCallback(() => seq.current, []);

  useEffect(() => {
    if (!enabled) return;

    let interval: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (interval === null) interval = setInterval(() => void refresh(), pollMs);
    };
    const stop = () => {
      if (interval !== null) {
        clearInterval(interval);
        interval = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refresh();
        start();
      } else {
        stop();
      }
    };
    const onOnline = () => {
      if (document.visibilityState === 'visible') void refresh();
    };

    // The server's snapshot is as fresh as the page; a failed one is retried at once.
    if (!mountedWithSnapshot.current) void refresh();
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
    };
  }, [enabled, pollMs, refresh]);

  const current = fetched?.hole === holeNumber ? fetched : null;
  return {
    side: current?.side,
    gir: current?.gir,
    failed: current == null && failedHole === holeNumber,
    refresh,
    snapshotSeq: current?.seq ?? 0,
    startedSeq,
  };
}
