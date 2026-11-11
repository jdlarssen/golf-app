// native/app/src/lib/useRoundSyncState.ts
// #2348: hva runden på skjermen har i køene, for lagringsbrikka på hullsiden.
//
// Leser bare. Begge køene (`sync_queue` og `tee_shot_queue`) leses hvert
// `POLL_MS`, sekvensielt på én forbindelse, som SyncBanner gjør. Regelen for
// hva som venter og hva som ikke ble lagret, er den delte
// (`lib/sync/roundSyncState.ts`). Klokka tikker hvert sekund mens noe venter,
// så brikka blir gul når et slag har ventet i `SETTLE_MS` uten ny lesing.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { roundSyncState, type RoundSyncState } from '../../../../lib/sync/roundSyncState';
import { getDb, listQueue, listTeeShotQueue, type LocalScore, type SyncQueueItem, type TeeShotQueueItem } from '../data/db';
import { isNetworkFailureMessage } from '../data/timedFetch';

/** Samme takt som hullsidens SQLite-lesing og SyncBanner. */
const POLL_MS = 1500;
const TICK_MS = 1000;

type Queues = { scores: SyncQueueItem[]; teeShots: TeeShotQueueItem[] };

async function readQueues(): Promise<Queues> {
  const db = await getDb();
  // Sekvensielt: én forbindelse, én setning om gangen.
  const scores = await listQueue(db);
  const teeShots = await listTeeShotQueue(db);
  return { scores, teeShots };
}

export function useRoundSyncState(
  gameId: string,
  localScores: readonly LocalScore[],
): {
  state: RoundSyncState;
  /** Hull med minst ett lokalt slag i dette spillet. */
  scoredHoles: ReadonlySet<number>;
  /** Les køene på nytt med en gang (etter «Prøv å sende nå»). */
  reload: () => Promise<void>;
} {
  const [queues, setQueues] = useState<Queues>({ scores: [], teeShots: [] });
  const [nowMs, setNowMs] = useState(() => Date.now());

  const reload = useCallback(async () => {
    try {
      const next = await readQueues();
      setQueues(next);
      setNowMs(Date.now());
    } catch {
      // En base som ikke svarer skal ikke velte skjermen; neste runde prøver igjen.
    }
  }, []);

  // Førstelesningen skrives inn her og ikke via `reload`, samme grep som
  // SyncBanner: en skjerm som er borte før SQLite svarer, får ingen state.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const next = await readQueues();
        if (cancelled) return;
        setQueues(next);
        setNowMs(Date.now());
      } catch {
        // Som i `reload`.
      }
    };
    void tick();
    const interval = setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [gameId]);

  const state = useMemo(
    () =>
      roundSyncState({
        scoreItems: queues.scores,
        teeShotItems: queues.teeShots,
        gameId,
        nowMs,
        isNetworkError: isNetworkFailureMessage,
      }),
    [queues, gameId, nowMs],
  );

  // Klokka trengs bare mens noe venter og ennå ikke har satt seg.
  const waiting = state.pendingScoreCount + state.pendingTeeShotCount > 0 && !state.settled;
  useEffect(() => {
    if (!waiting) return;
    const interval = setInterval(() => setNowMs(Date.now()), TICK_MS);
    return () => clearInterval(interval);
  }, [waiting]);

  const scoredHoles = useMemo(
    () =>
      new Set(
        localScores
          .filter((score) => score.gameId === gameId && score.strokes != null)
          .map((score) => score.holeNumber),
      ),
    [localScores, gameId],
  );

  return { state, scoredHoles, reload };
}
