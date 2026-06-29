'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { ReactionEmoji } from '@/lib/games/reactions/palette';
import type { ReactionSummary } from '@/lib/games/reactions/aggregate';
import { subscribeRealtimeChannel } from '@/lib/sync/realtimeChannel';
import { toggleReaction, getReactionsSummary } from './actions';

export interface RowReactionState {
  counts: Partial<Record<ReactionEmoji, number>>;
  mine: ReactionEmoji[];
}

interface ReactionsContextValue {
  getRow: (targetUserId: string) => RowReactionState;
  toggle: (targetUserId: string, emoji: ReactionEmoji) => void;
  disabled: boolean;
}

const EMPTY_ROW: RowReactionState = { counts: {}, mine: [] };

const ReactionsContext = createContext<ReactionsContextValue | null>(null);

/**
 * Read the reactions context. Returns `null` when no `ReactionsProvider` is
 * mounted above — `RowReactionsForPlayer` uses that to render nothing, which
 * keeps the format-view unit tests (rendered without a provider) unchanged.
 */
export function useReactionsContext(): ReactionsContextValue | null {
  return useContext(ReactionsContext);
}

/** Apply a viewer's own optimistic toggle to the summary (pure). */
function applyToggle(
  summary: ReactionSummary,
  targetUserId: string,
  emoji: ReactionEmoji,
): ReactionSummary {
  const row = summary[targetUserId] ?? EMPTY_ROW;
  const wasActive = row.mine.includes(emoji);
  const nextMine = wasActive
    ? row.mine.filter((e) => e !== emoji)
    : [...row.mine, emoji];
  const nextVal = (row.counts[emoji] ?? 0) + (wasActive ? -1 : 1);
  const nextCounts = { ...row.counts };
  if (nextVal > 0) nextCounts[emoji] = nextVal;
  else delete nextCounts[emoji];
  return { ...summary, [targetUserId]: { counts: nextCounts, mine: nextMine } };
}

/**
 * Owns all emoji-reaction state for one leaderboard (#943). Mounted once in
 * `page.tsx` around each individual-player format result, seeded server-side
 * with `initial`.
 *
 * - **Live for others:** subscribes to `reactions` INSERT/DELETE for this game
 *   (REPLICA IDENTITY FULL + realtime publication, migration 0120) and refetches
 *   the authoritative summary — debounced 300ms to collapse bursts. Reuses
 *   `subscribeRealtimeChannel`, which owns the `setAuth` quirk + leak-safe
 *   cleanup (same helper as `LeaderboardRealtime`, #679).
 * - **Optimistic for me:** `toggle` updates local state immediately, then writes
 *   via the server action; the viewer's own write echoes back as a realtime
 *   event whose refetch reconciles any drift. On write failure it refetches to
 *   restore the truth.
 *
 * `RowReactions` is a pure function of the props this provider feeds it, so live
 * updates flow straight through without remount/stale-state issues.
 */
export function ReactionsProvider({
  gameId,
  initial,
  disabled = false,
  children,
}: {
  gameId: string;
  initial: ReactionSummary;
  disabled?: boolean;
  children: ReactNode;
}) {
  const [summary, setSummary] = useState<ReactionSummary>(initial);
  // Keep a live ref so the debounced refetch + error-revert read current state
  // without re-subscribing the realtime channel on every change.
  const summaryRef = useRef(summary);
  summaryRef.current = summary;

  const refetch = useCallback(async () => {
    try {
      setSummary(await getReactionsSummary(gameId));
    } catch (err) {
      console.error('[ReactionsProvider] refetch failed', err);
    }
  }, [gameId]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefetch = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refetch(), 300);
    };

    const unsubscribe = subscribeRealtimeChannel(
      `reactions:${gameId}`,
      (channel) =>
        channel
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'reactions', filter: `game_id=eq.${gameId}` },
            scheduleRefetch,
          )
          .on(
            'postgres_changes',
            { event: 'DELETE', schema: 'public', table: 'reactions', filter: `game_id=eq.${gameId}` },
            scheduleRefetch,
          ),
    );

    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [gameId, refetch]);

  const getRow = useCallback(
    (targetUserId: string): RowReactionState => summary[targetUserId] ?? EMPTY_ROW,
    [summary],
  );

  const toggle = useCallback(
    (targetUserId: string, emoji: ReactionEmoji) => {
      if (disabled) return;
      // Optimistic.
      setSummary((prev) => applyToggle(prev, targetUserId, emoji));
      void toggleReaction({ gameId, targetUserId, emoji }).catch((err: unknown) => {
        console.error('[ReactionsProvider] toggleReaction failed', err);
        // Write failed — restore the authoritative state.
        void refetch();
      });
    },
    [disabled, gameId, refetch],
  );

  return (
    <ReactionsContext.Provider value={{ getRow, toggle, disabled }}>
      {children}
    </ReactionsContext.Provider>
  );
}
