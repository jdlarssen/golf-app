'use client';

// Bingo Bango Bongo-radene for spillet (#1716 — ren flytting ut av
// `HoleClient`): initialiseres fra server-prop og holdes i takt med databasen.
// Parent remounter HoleClient via `key={holeNumber}` ved hull-bytte, så vi
// trenger ikke useEffect-sync mot prop-endringer på samme hull.
//
// #1950: a realtime payload is not applied as state. Supabase Realtime does not
// promise delivery order per subscriber, and on staging an older INSERT row
// arrived after the newer UPDATE and stayed on screen. Every event, save and
// catch-up instead schedules a debounced re-read, and the sequence guard in
// `reconcileBingoBangoBongoHoles` drops any answer that is older than what the
// screen already shows.

import { useEffect, useRef, useState } from 'react';
import type { BingoBangoBongoCategoryKey } from '@/lib/bbb/mergeBingoBangoBongoCategory';
import { readBingoBangoBongoHoles } from '@/lib/bbb/readBingoBangoBongoHoles';
import {
  applyBbbLocalSave,
  applyBbbRead,
  type BbbHolesState,
} from '@/lib/bbb/reconcileBingoBangoBongoHoles';
import { subscribeBingoBangoBongo } from '@/lib/bbb/subscribeBingoBangoBongo';
import type { BingoBangoBongoHoleInput } from '@/lib/scoring/modes/types';

/**
 * Collapses a burst of events (a flight-mate's INSERT and UPDATE, or several
 * players tapping at once) into one read. Same order of size as the
 * leaderboard's 300 ms refresh debounce.
 */
const READ_DEBOUNCE_MS = 200;

export type BingoBangoBongoState = {
  /** Lagret rad for gjeldende hull, eller null når hullet ikke er ført ennå. */
  savedHole: BingoBangoBongoHoleInput | null;
  /**
   * Fletter egen lagret kategori inn i hullets rad (#1950). Bare den ene
   * kategorien endres, så en flight-kamerats kategori blir stående, og en
   * ny lesing etter lagringen henter raden slik databasen har den.
   */
  onSaved: (key: BingoBangoBongoCategoryKey, userId: string | null) => void;
  /**
   * Leser raden på nytt uten å lagre (#2090): et trykk som ikke endrer noe
   * skriver ikke, men retter et gammelt bilde.
   */
  refresh: () => void;
};

export function useBingoBangoBongoHoles(args: {
  gameId: string;
  isBBB: boolean;
  currentHole: number;
  initialHoles: BingoBangoBongoHoleInput[] | undefined;
}): BingoBangoBongoState {
  const { gameId, isBBB, currentHole, initialHoles } = args;
  const [state, setState] = useState<BbbHolesState>(() => ({
    holes: initialHoles ?? [],
    appliedSeq: 0,
  }));
  // Issues the sequence numbers for reads and local saves. Shared by both so a
  // read issued before a save can never be applied after it.
  const seqRef = useRef(0);
  // Set while the subscription effect is live; a no-op before mount, after
  // unmount and when the game is not BBB.
  const scheduleReadRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!isBBB) return;
    let unmounted = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const read = async () => {
      timer = null;
      // Taken when the read goes out, not when it answers: the number has to
      // say which commits the snapshot can contain.
      const seq = ++seqRef.current;
      try {
        const rows = await readBingoBangoBongoHoles(gameId);
        if (unmounted) return;
        setState((s) => applyBbbRead(s, seq, rows));
      } catch (error) {
        if (unmounted) return;
        // Keep the last good rows; the next event, save or catch-up reads again.
        console.error('[bbb] reading holes failed', { gameId, error });
      }
    };

    const scheduleRead = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void read(), READ_DEBOUNCE_MS);
    };
    scheduleReadRef.current = scheduleRead;

    // The payload is only a change signal (see subscribeBingoBangoBongo). A
    // rejoin after an outage reads too: missed events are never replayed
    // (#2093).
    const unsubscribe = subscribeBingoBangoBongo(gameId, scheduleRead, {
      onResubscribed: scheduleRead,
    });
    // Anything committed between the server render and the subscription.
    scheduleRead();

    // Events missed while the tab slept or the network was gone (#1366
    // pattern from LeaderboardRealtime).
    const catchUp = () => {
      if (document.visibilityState !== 'visible') return;
      scheduleRead();
    };
    document.addEventListener('visibilitychange', catchUp);
    window.addEventListener('online', catchUp);

    return () => {
      unmounted = true;
      if (timer) clearTimeout(timer);
      scheduleReadRef.current = () => {};
      document.removeEventListener('visibilitychange', catchUp);
      window.removeEventListener('online', catchUp);
      unsubscribe();
    };
  }, [isBBB, gameId]);

  return {
    savedHole: state.holes.find((h) => h.holeNumber === currentHole) ?? null,
    onSaved: (key, userId) => {
      const seq = ++seqRef.current;
      setState((s) => applyBbbLocalSave(s, seq, currentHole, key, userId));
      scheduleReadRef.current();
    },
    refresh: () => scheduleReadRef.current(),
  };
}
