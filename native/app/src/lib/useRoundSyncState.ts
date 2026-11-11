// native/app/src/lib/useRoundSyncState.ts
// #2348: hva runden på skjermen har i køene, for lagringsbrikka på hullsiden.
//
// Leser bare. Begge køene (`sync_queue` og `tee_shot_queue`) leses hvert
// `POLL_MS`, sekvensielt på én forbindelse, som SyncBanner gjør. Regelen for
// hva som venter og hva som ikke ble lagret, er den delte
// (`lib/sync/roundSyncState.ts`). Klokka tikker hvert sekund mens noe venter,
// så brikka blir gul når et slag har ventet i `SETTLE_MS` uten ny lesing.
//
// Kroken står i hullskjermen over hullbyttet (`HoleView` monteres på nytt per
// hull), så det den sist leste, står gjennom et hullbytte. Før første lesing er
// `loaded` usann: da vet ingen om noe venter, og brikka skal ikke si noe.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { roundSyncState, type RoundSyncState } from '../../../../lib/sync/roundSyncState';
import { getDb, listQueue, listTeeShotQueue, type LocalScore, type SyncQueueItem, type TeeShotQueueItem } from '../data/db';
import { isNetworkFailureMessage } from '../data/timedFetch';

/** Samme takt som hullsidens SQLite-lesing og SyncBanner. */
const POLL_MS = 1500;
const TICK_MS = 1000;

type Queues = { scores: SyncQueueItem[]; teeShots: TeeShotQueueItem[] };

const EMPTY: Queues = { scores: [], teeShots: [] };

async function readQueues(): Promise<Queues> {
  const db = await getDb();
  // Sekvensielt: én forbindelse, én setning om gangen.
  const scores = await listQueue(db);
  const teeShots = await listTeeShotQueue(db);
  return { scores, teeShots };
}

/** Det i køene regelen leser. Lik signatur = ingen ny render. */
function signature({ scores, teeShots }: Queues): string {
  return JSON.stringify([...scores, ...teeShots]);
}

export function useRoundSyncState(
  gameId: string,
  localScores: readonly LocalScore[],
): {
  state: RoundSyncState;
  /** Køene er lest minst én gang for dette spillet. */
  loaded: boolean;
  /** Hull med minst ett lokalt slag i dette spillet. */
  scoredHoles: ReadonlySet<number>;
  /** Les køene på nytt med en gang (etter «Prøv å sende nå»). */
  reload: () => Promise<void>;
} {
  const [queues, setQueues] = useState<Queues>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  // Nytt spill i samme skjerm: forrige spills kø skal ikke stå igjen. Samme grep
  // som `useLocalScores`.
  const [shownFor, setShownFor] = useState(gameId);
  if (shownFor !== gameId) {
    setShownFor(gameId);
    setQueues(EMPTY);
    setLoaded(false);
  }

  // Siste lesing som ble vist. En lesing som er lik, gir ingen ny render: hele
  // hullsiden står under kroken. Spillet er med i nøkkelen, så et nytt spill
  // alltid skrives inn.
  const shown = useRef('');
  const apply = useCallback(
    (next: Queues) => {
      const sig = `${gameId}|${signature(next)}`;
      if (sig !== shown.current) {
        shown.current = sig;
        setQueues(next);
        setNowMs(Date.now());
      }
      setLoaded(true);
    },
    [gameId],
  );

  const reload = useCallback(async () => {
    try {
      apply(await readQueues());
    } catch {
      // En base som ikke svarer skal ikke velte skjermen; neste runde prøver igjen.
    }
  }, [apply]);

  // Førstelesningen skrives inn her og ikke via `reload`, samme grep som
  // SyncBanner: en skjerm som er borte før SQLite svarer, får ingen state.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const next = await readQueues();
        if (!cancelled) apply(next);
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
  }, [gameId, apply]);

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

  return { state, loaded, scoredHoles, reload };
}
