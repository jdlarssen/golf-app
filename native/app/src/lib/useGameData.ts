// Native N3 (#1825): de to lesemønstrene alle spillerskjermene deler.
//
// Begge følger samme prinsipp: **skjermene leser lokalt, nettet jobber i
// bakgrunnen.** Bundelen tegnes fra `cache_entries` før refetchen svarer, og
// scorene kommer alltid fra SQLite — aldri rett fra PostgREST. Det er derfor
// hull-føring virker i flymodus midt i runden, og det er derfor et tapp vises
// før RPC-en har landet.
//
// Slagene hentes inn igjen fra serveren av `useScoreCatchUp` (egen fil), og
// «appen kom tilbake» bor i `useOnResume` (#2228).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { GameMode } from '../../../../lib/scoring/modes/types';
import { getDb, listScoresForGame, type LocalScore } from '../data/db';
import {
  loadGameBundle,
  forgetGameBundle,
  refreshGameBundle,
  type GameBundle,
} from '../data/gameBundle';
import { GameNotFoundError } from '../data/gameNotFound';
import { toRoster } from './roster';
import { foldLocalScores } from './teamPlay';
import { useOnResume } from './useOnResume';

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export interface GameBundleState {
  bundle: GameBundle | null;
  /** Satt når SISTE refetch feilet. Cachen kan fortsatt stå i `bundle`. */
  errorText: string | null;
  /**
   * SISTE refetch fikk svar, men spillet finnes ikke for spilleren (slettet,
   * eller skjult av RLS). Skiller «spillet er borte» fra en nettfeil (#1954 Del B).
   */
  notFound: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Spill-bundelen: cache med én gang, refetch i bakgrunnen og på nytt hver gang
 * skjermen får fokus, appen kommer i forgrunnen eller nettet er tilbake.
 *
 * Refetchen er det som fanger status-drift: blir spillet avsluttet, lagkortet
 * levert eller spilleren trukket mens skjermen ligger bak i stacken eller
 * telefonen ligger i lomma, oppdager vi det når spilleren kommer tilbake, ikke
 * først når en skriving avvises (#2219). Bare skjermen som har fokus lytter
 * (`useOnResume`, #2228), så skjermene bak i stacken henter ikke i kor.
 *
 * Et hullbytte gir ikke nytt fokus (`navigation.setParams`). Hullsiden kaller
 * derfor `refresh` selv når hullet byttes.
 */
/**
 * Hvor lenge én henting av spillet får holde på (#1954 Del B). Ingen ledd under
 * har en timeout: OkHttp på Android venter uten grense, postgrest prøver GET
 * på nytt, og øktfornyelsen venter med backoff. I ekte flymodus sto spillsiden
 * og lastet i over 18 s. Etter taket sier skjermen «Fikk ikke tak i spillet»,
 * og fokus, forgrunn eller «Prøv igjen» henter på nytt. Samme grep som
 * profilporten og AI-porten (`Promise.race` mot et tak).
 */
export const GAME_BUNDLE_TIMEOUT_MS = 12_000;

export function useGameBundle(gameId: string): GameBundleState {
  const [bundle, setBundle] = useState<GameBundle | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  // Et spill som er borte, skal ikke komme tilbake fra cachen fordi den lokale
  // lesingen ble ferdig etter svaret fra serveren.
  const gone = useRef(false);

  const refresh = useCallback(async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), GAME_BUNDLE_TIMEOUT_MS);
    });
    try {
      const result = await Promise.race([refreshGameBundle(gameId), timedOut]);
      if (result === 'timeout') {
        console.error('[gameBundle] hentingen ga opp etter', GAME_BUNDLE_TIMEOUT_MS, 'ms');
        setErrorText(`Ga opp etter ${GAME_BUNDLE_TIMEOUT_MS} ms`);
        setNotFound(false);
        return;
      }
      gone.current = false;
      setBundle(result);
      setErrorText(null);
      setNotFound(false);
    } catch (err: unknown) {
      setErrorText(messageOf(err));
      if (err instanceof GameNotFoundError) {
        // #1954 Del B: borte er borte, også når en eldre kopi ligger lagret.
        gone.current = true;
        setNotFound(true);
        setBundle(null);
        void forgetGameBundle(gameId).catch((forgetErr: unknown) => {
          console.error('[gameBundle] kunne ikke glemme spillet', forgetErr);
        });
      } else {
        setNotFound(false);
      }
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => {
    let cancelled = false;
    void loadGameBundle(gameId)
      .then((cached) => {
        if (cancelled || !cached || gone.current) return;
        setBundle((current) => current ?? cached);
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
  useOnResume(refresh);

  return { bundle, errorText, notFound, loading, refresh };
}

/**
 * Alle lokale scores for spillet, med valgfri polling.
 *
 * Pollingen er hull-sidens mekanisme (samme 1,5 s som Sync-laben): en drain
 * eller en realtime-merge skriver i SQLite fra utsiden av React, og et intervall
 * er en ærligere måte å fange det på enn å prøve å tre en abonnent gjennom hver
 * skriving.
 *
 * Feil (#2228): feiler FØRSTE lesing, kaster hooken feilen under render, og
 * skjermens feilgrense viser «Prøv igjen», som leser på nytt. Et tomt kort uten
 * feiltekst ville sett ut som om ingen hadde ført. Feiler en senere lesing
 * (`reload`, pollen), blir de siste radene stående og feilen logges: en dårlig
 * lesing skal ikke tømme skjermen. `reload()` avviser derfor aldri, og alle
 * `void reload()` er trygge.
 */
export function useLocalScores(
  gameId: string,
  pollMs?: number,
): {
  scores: LocalScore[];
  reload: () => Promise<void>;
  /**
   * SQLite er lest minst én gang. Før det er `scores` tom fordi den ikke er
   * lest, ikke fordi ingen har ført (#2385: hullsiden skal ikke tro at et
   * ferdig hull nettopp ble ferdig).
   */
  loaded: boolean;
} {
  const [scores, setScores] = useState<LocalScore[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Pakket inn, så også en kastet verdi som er falsy blir kastet videre.
  const [firstReadFailure, setFirstReadFailure] = useState<{ error: unknown } | null>(null);

  const reload = useCallback(async () => {
    try {
      const db = await getDb();
      setScores(await listScoresForGame(db, gameId));
      setLoaded(true);
    } catch (err: unknown) {
      console.error('[useLocalScores] lesing feilet', err);
    }
  }, [gameId]);

  // Førstelesningen skrives inn her og ikke via `reload`, slik at en skjerm som
  // rekker å bli borte før SQLite svarer, ikke setter state på en unmountet
  // komponent.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const db = await getDb();
        const rows = await listScoresForGame(db, gameId);
        if (!cancelled) {
          setScores(rows);
          setLoaded(true);
        }
      } catch (err: unknown) {
        if (!cancelled) setFirstReadFailure({ error: err });
      }
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

  if (firstReadFailure) throw firstReadFailure.error;

  return { scores, reload, loaded };
}

/**
 * Slagene slik laget eier dem (#2067). Sletter kapteinen kontoen midt i runden,
 * ligger hullene som alt er ført, igjen på den trukne kapteinen. Her legges de
 * på den nåværende eieren (`foldLocalScores`), så alt skjermen leser etterpå,
 * ser ett sett rader.
 *
 * Kall den rett etter `useLocalScores`, før noe annet leser slagene. Før
 * bundelen har landet vet vi ikke rosteret, og radene står som de er.
 */
export function useTeamScores(
  scores: LocalScore[],
  bundle: GameBundle | null,
): LocalScore[] {
  return useMemo(
    () =>
      bundle
        ? foldLocalScores(
            scores,
            toRoster(bundle.players),
            bundle.game.gameMode as GameMode,
          )
        : scores,
    [scores, bundle],
  );
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
