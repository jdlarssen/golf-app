// Native N3 (#1825): de to lesemønstrene alle spillerskjermene deler.
//
// Begge følger samme prinsipp: **skjermene leser lokalt, nettet jobber i
// bakgrunnen.** Bundelen tegnes fra `cache_entries` før refetchen svarer, og
// scorene kommer alltid fra SQLite — aldri rett fra PostgREST. Det er derfor
// hull-føring virker i flymodus midt i runden, og det er derfor et tapp vises
// før RPC-en har landet.
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { getDb, listScoresForGame, type LocalScore } from '../data/db';
import {
  loadGameBundle,
  refreshGameBundle,
  type GameBundle,
} from '../data/gameBundle';

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export interface GameBundleState {
  bundle: GameBundle | null;
  /** Satt når SISTE refetch feilet. Cachen kan fortsatt stå i `bundle`. */
  errorText: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Spill-bundelen: cache med én gang, refetch i bakgrunnen og på nytt hver gang
 * skjermen får fokus.
 *
 * Fokus-refetchen er det som fanger status-drift: blir spillet avsluttet mens
 * skjermen ligger bak i stacken, oppdager vi det når spilleren kommer tilbake —
 * ikke først når en skriving avvises.
 */
export function useGameBundle(gameId: string): GameBundleState {
  const [bundle, setBundle] = useState<GameBundle | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setBundle(await refreshGameBundle(gameId));
      setErrorText(null);
    } catch (err: unknown) {
      setErrorText(messageOf(err));
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => {
    let cancelled = false;
    void loadGameBundle(gameId)
      .then((cached) => {
        if (cancelled || !cached) return;
        setBundle(cached);
        setLoading(false);
      })
      .catch(() => {
        // Ingen brukbar cache er ingen feil — refetchen svarer uansett.
      });
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  return { bundle, errorText, loading, refresh };
}

/**
 * Alle lokale scores for spillet, med valgfri polling.
 *
 * Pollingen er hull-sidens mekanisme (samme 1,5 s som Sync-laben): en drain
 * eller en realtime-merge skriver i SQLite fra utsiden av React, og et intervall
 * er en ærligere måte å fange det på enn å prøve å tre en abonnent gjennom hver
 * skriving.
 */
export function useLocalScores(
  gameId: string,
  pollMs?: number,
): { scores: LocalScore[]; reload: () => Promise<void> } {
  const [scores, setScores] = useState<LocalScore[]>([]);

  const reload = useCallback(async () => {
    const db = await getDb();
    setScores(await listScoresForGame(db, gameId));
  }, [gameId]);

  // Førstelesningen skrives inn her og ikke via `reload`, slik at en skjerm som
  // rekker å bli borte før SQLite svarer, ikke setter state på en unmountet
  // komponent.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const db = await getDb();
      const rows = await listScoresForGame(db, gameId);
      if (!cancelled) setScores(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  useEffect(() => {
    if (!pollMs) return;
    const interval = setInterval(() => {
      void reload();
    }, pollMs);
    return () => clearInterval(interval);
  }, [pollMs, reload]);

  return { scores, reload };
}

/** Hullene spilleren har slag på — grunnlaget for CTA-tilstanden. */
export function filledHolesFor(
  scores: readonly LocalScore[],
  userId: string,
): number[] {
  return scores
    .filter((row) => row.userId === userId && row.strokes != null)
    .map((row) => row.holeNumber);
}

/** Scorene til én spiller, slått opp på hullnummer. */
export function scoresByHoleFor(
  scores: readonly LocalScore[],
  userId: string,
): Map<number, LocalScore> {
  const byHole = new Map<number, LocalScore>();
  for (const row of scores) {
    if (row.userId === userId) byHole.set(row.holeNumber, row);
  }
  return byHole;
}
