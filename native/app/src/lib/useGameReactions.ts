// #2754: reaksjonene inn i tavla, og hvilken rad stripa står åpen for.
//
// Samme regler som webbens `ReactionsProvider`: optimistisk trykk, ny lesing
// 300 ms etter en hendelse, ny lesing etter brudd (#2093) og nyeste svar vinner
// (#2094). Tre ting er annerledes her:
//
//  1. **Et varsel kan gå tapt.** Målt på staging 04.11 mistet én lytter én av tre
//     nye reaksjoner, og årsaken er ikke kjent. Hendelser er derfor bare beskjed
//     om å lese: det leses også ved fokus, i forgrunnen, når nettet er tilbake,
//     når stripa åpnes og etter hver lagring.
//  2. **Uten nett sier appen fra.** Da feiler også lesingen som skulle rette opp
//     på nettet, så et feilet trykk rulles tilbake her. Da kan ingen kø eller
//     SQLite ta over: en feilet lesing tømmer ingenting.
//  3. **Reaksjoner kan aldri hindre noe annet.** Et format uten reaksjoner koster
//     ingen lesing og ingen kanal, og ingen feil her når tavla.
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { applyToggle, type ReactionSummary } from '../../../../lib/games/reactions/aggregate';
import type { ReactionEmoji } from '../../../../lib/games/reactions/palette';
import {
  fetchGameReactions,
  toggleReaction,
  type ReactionToggleResult,
} from '../data/reactions';
import { subscribeGameReactions } from '../data/realtime';
import { useOnResume } from './useOnResume';

/** Samme pust som nettet: en byge hendelser blir én lesing. */
const REFETCH_DELAY_MS = 300;

/** Raden stripa står åpen for. */
export interface ReactionTarget {
  userId: string;
  name: string;
}

export interface ReactionRowState {
  counts: Partial<Record<ReactionEmoji, number>>;
  mine: readonly ReactionEmoji[];
}

/** Hva stripa skal si: lagringen feilet, eller RLS sa nei. */
export type ReactionFailure = 'save' | 'denied';

export interface GameReactions {
  loaded: boolean;
  canReact: boolean;
  /** Til du har gitt din første reaksjon i spillet. */
  showHint: boolean;
  target: ReactionTarget | null;
  failure: ReactionFailure | null;
  getRow: (userId: string) => ReactionRowState;
  /** Åpner stripa for raden, flytter den, eller lukker den fra samme rad. */
  openFor: (target: ReactionTarget) => void;
  close: () => void;
  toggle: (userId: string, emoji: ReactionEmoji) => void;
}

const EMPTY_ROW: ReactionRowState = { counts: {}, mine: [] };

export function useGameReactions({
  gameId,
  userId,
  enabled,
  canReact,
}: {
  gameId: string;
  userId: string | null;
  enabled: boolean;
  canReact: boolean;
}): GameReactions {
  const [summary, setSummary] = useState<ReactionSummary>({});
  const [loaded, setLoaded] = useState(false);
  const [target, setTarget] = useState<ReactionTarget | null>(null);
  const [failure, setFailure] = useState<ReactionFailure | null>(null);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const seq = useRef(0);
  const appliedSeq = useRef(0);
  /** Lesinger som har landet. Et feilet trykk rulles bare tilbake hvis ingen har det. */
  const readsApplied = useRef(0);
  const inFlight = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled || userId === null) return;
    const mySeq = ++seq.current;
    try {
      const next = await fetchGameReactions(gameId, userId);
      // Under en skriving ser serveren ikke trykket ennå. Lagringen leser på nytt.
      if (!alive.current || mySeq <= appliedSeq.current || inFlight.current.size > 0) return;
      appliedSeq.current = mySeq;
      readsApplied.current += 1;
      setSummary(next);
      setLoaded(true);
    } catch {
      // Gammelt er bedre enn borte, og uten nett står tavla uten feilmelding.
    }
  }, [enabled, gameId, userId]);

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void refresh(), REFETCH_DELAY_MS);
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      void refresh();
      const stop = subscribeGameReactions(gameId, {
        onChange: schedule,
        onResubscribed: schedule,
      });
      return () => {
        if (timer.current) clearTimeout(timer.current);
        stop();
      };
    }, [enabled, gameId, refresh, schedule]),
  );
  useOnResume(refresh);

  const getRow = useCallback(
    (rowUserId: string): ReactionRowState => summary[rowUserId] ?? EMPTY_ROW,
    [summary],
  );

  const openFor = useCallback(
    (next: ReactionTarget) => {
      if (!canReact) return;
      setFailure(null);
      if (target?.userId === next.userId) {
        setTarget(null);
        return;
      }
      setTarget(next);
      void refresh();
    },
    [canReact, refresh, target],
  );

  const close = useCallback(() => {
    setTarget(null);
    setFailure(null);
  }, []);

  const toggle = useCallback(
    (targetUserId: string, emoji: ReactionEmoji) => {
      if (!canReact || userId === null) return;
      const key = `${targetUserId}:${emoji}`;
      // Begge trykk ville lest «finnes ikke», og det andre ville feilet.
      if (inFlight.current.has(key)) return;
      inFlight.current.add(key);
      setFailure(null);
      appliedSeq.current = ++seq.current;
      const readsAtStart = readsApplied.current;
      setSummary((prev) => applyToggle(prev, targetUserId, emoji));

      const write: Promise<ReactionToggleResult> = toggleReaction({
        gameId,
        userId,
        targetUserId,
        emoji,
      }).catch(() => ({ ok: false, failure: 'db_error' }));
      void write.then((result) => {
        inFlight.current.delete(key);
        if (!alive.current) return;
        if (!result.ok) {
          // Har en lesing landet etter trykket, er det den som er sannheten.
          if (readsApplied.current === readsAtStart) {
            setSummary((prev) => applyToggle(prev, targetUserId, emoji));
          }
          setFailure(result.failure === 'rls_denied' ? 'denied' : 'save');
        }
        schedule();
      });
    },
    [canReact, gameId, schedule, userId],
  );

  const showHint = useMemo(
    () => canReact && loaded && Object.values(summary).every((row) => row.mine.length === 0),
    [canReact, loaded, summary],
  );

  return { loaded, canReact, showHint, target, failure, getRow, openFor, close, toggle };
}
