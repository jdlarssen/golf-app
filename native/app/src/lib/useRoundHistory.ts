// #2265: Rundedagboka og statistikken bak den leser samme runde-liste
// (`fetchRoundHistory`), hver gang skjermen åpnes. Ingen cache: uten nett står
// feillinja med «Prøv igjen».
//
// Poengene i dagboka (`useDiaryPoints`) regnes én runde om gangen, nyeste
// først, så de øverste radene får tallet sitt først. En runde som alt ligger
// komplett på telefonen, regnes uten nett (`fetchRoundPoints`).
import { useCallback, useEffect, useState } from 'react';
import { fetchRoundHistory } from '../data/roundHistory';
import { fetchRoundPoints } from '../data/roundPoints';
import { countsPoints } from './lastRound';
import type { HistoryRound } from './roundHistory';

export type RoundHistoryLoad =
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'ready'; rounds: HistoryRound[] };

export function useRoundHistory(userId: string): {
  load: RoundHistoryLoad;
  retry: () => void;
} {
  const [load, setLoad] = useState<RoundHistoryLoad>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchRoundHistory(userId).then(
      (rounds) => {
        if (!cancelled) setLoad({ state: 'ready', rounds });
      },
      (err: unknown) => {
        console.error('[RoundHistory] runde-lista feilet', err);
        if (!cancelled) setLoad({ state: 'failed' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [userId, attempt]);

  const retry = useCallback(() => {
    setLoad({ state: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  return { load, retry };
}

/**
 * Poengene dine per spill i formatene der tavla viser poeng. Et spill mangler
 * i kartet til det er regnet; `null` betyr at tavla ikke ga poeng.
 */
export function useDiaryPoints(
  rounds: readonly HistoryRound[] | null,
  userId: string,
): ReadonlyMap<string, number | null> {
  const [points, setPoints] = useState<ReadonlyMap<string, number | null>>(new Map());

  useEffect(() => {
    if (!rounds) return;
    let cancelled = false;
    const wanted = rounds.filter((round) => countsPoints(round.gameMode));
    void (async () => {
      for (const round of wanted) {
        const value = await fetchRoundPoints(round.gameId, round.gameMode, userId);
        if (cancelled) return;
        setPoints((prev) => new Map(prev).set(round.gameId, value));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rounds, userId]);

  return points;
}
