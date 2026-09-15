'use client';

// Bingo Bango Bongo-radene for spillet (#1716 — ren flytting ut av
// `HoleClient`): initialiseres fra server-prop, merger inn realtime-endringer
// — speiler wolf-mønstret i `useWolfHole`.
// Parent remounter HoleClient via `key={holeNumber}` ved hull-bytte, så vi
// trenger ikke useEffect-sync mot prop-endringer på samme hull.

import { useEffect, useState } from 'react';
import {
  mergeCategory,
  type BingoBangoBongoCategoryKey,
} from '@/lib/bbb/mergeBingoBangoBongoCategory';
import { subscribeBingoBangoBongo } from '@/lib/bbb/subscribeBingoBangoBongo';
import type { BingoBangoBongoHoleInput } from '@/lib/scoring/modes/types';

/**
 * Erstatt hullets rad (om den finnes) og hold lista sortert på hull-nummer.
 * Riktig for realtime: `payload.new` er hele den committede raden, med
 * flight-kameratenes samtidige kategorier allerede flettet inn av databasen.
 */
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
  /**
   * Fletter egen lagret kategori inn i hullets rad (#1950). Bare den ene
   * kategorien endres, så en flight-kamerats kategori som kom inn via realtime
   * blir stående selv om kanalen er nede når vårt eget ekko skulle kommet.
   */
  onSaved: (key: BingoBangoBongoCategoryKey, userId: string | null) => void;
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
    onSaved: (key, userId) =>
      setHoles((prev) => mergeCategory(prev, currentHole, key, userId)),
  };
}
