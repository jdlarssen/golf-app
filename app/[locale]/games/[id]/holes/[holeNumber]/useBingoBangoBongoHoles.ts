'use client';

// Bingo Bango Bongo-radene for spillet (#1716 — ren flytting ut av
// `HoleClient`): initialiseres fra server-prop, merger inn realtime-endringer
// — speiler wolf-mønstret i `useWolfHole`.
// Parent remounter HoleClient via `key={holeNumber}` ved hull-bytte, så vi
// trenger ikke useEffect-sync mot prop-endringer på samme hull.

import { useEffect, useState } from 'react';
import { subscribeBingoBangoBongo } from '@/lib/bbb/subscribeBingoBangoBongo';
import type { BingoBangoBongoHoleInput } from '@/lib/scoring/modes/types';

/** Erstatt hullets rad (om den finnes) og hold lista sortert på hull-nummer. */
function upsertByHole(
  prev: BingoBangoBongoHoleInput[],
  row: BingoBangoBongoHoleInput,
): BingoBangoBongoHoleInput[] {
  const next = prev.filter((h) => h.holeNumber !== row.holeNumber);
  next.push(row);
  next.sort((a, b) => a.holeNumber - b.holeNumber);
  return next;
}

export type BingoBangoBongoState = {
  /** Lagret rad for gjeldende hull, eller null når hullet ikke er ført ennå. */
  savedHole: BingoBangoBongoHoleInput | null;
  /** Optimistisk merge etter lagring på egen device. */
  onSaved: (updated: BingoBangoBongoHoleInput) => void;
};

export function useBingoBangoBongoHoles(args: {
  gameId: string;
  isBBB: boolean;
  currentHole: number;
  initialHoles: BingoBangoBongoHoleInput[] | undefined;
}): BingoBangoBongoState {
  const { gameId, isBBB, currentHole, initialHoles } = args;
  const [holes, setHoles] = useState<BingoBangoBongoHoleInput[]>(
    initialHoles ?? [],
  );

  useEffect(() => {
    if (!isBBB) return;
    const unsubscribe = subscribeBingoBangoBongo(gameId, (change) => {
      setHoles((prev) =>
        upsertByHole(prev, {
          holeNumber: change.holeNumber,
          bingoUserId: change.bingoUserId,
          bangoUserId: change.bangoUserId,
          bongoUserId: change.bongoUserId,
        }),
      );
    });
    return unsubscribe;
  }, [isBBB, gameId]);

  return {
    savedHole: holes.find((h) => h.holeNumber === currentHole) ?? null,
    onSaved: (updated) => setHoles((prev) => upsertByHole(prev, updated)),
  };
}
