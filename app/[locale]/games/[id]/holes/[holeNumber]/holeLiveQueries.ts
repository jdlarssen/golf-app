'use client';

// De fire Dexie-live-queryene hull-flaten kjører, samlet på ett sted (#1716).
//
// ⚠️ REKKEFØLGE-KONTRAKT: `HoleClient` MÅ kalle disse hookene i rekkefølgen
// under, og `HoleClient.test.tsx` mocker `useLiveQuery` med en teller som er
// keyet på nøyaktig den rekkefølgen:
//   1. useHoleCards            — localRows (én rad per spillerkort)
//   2. useMyScoredHoles        — mine førte hull i denne runden
//   3. useSiblingScoredHoles   — søsken-halvdelens førte hull (#1578)
//   4. usePendingSyncCount     — sync-køen
// Legger du til en live-query her, legg den til i test-mocken i samme commit.

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDb, scoreKey, type LocalScore } from '@/lib/sync/db';
import { isActiveForGame } from '@/lib/sync/queueScope';
import { scoredHoleNumbers, scoreOwnerUserIds } from '@/lib/games/scoreOwner';
import type { GameMode } from '@/lib/scoring/modes/types';
import type { ClientPlayer, HoleStripSibling } from './holeClientProps';

/** Et spillerkort med den live Dexie-verdien for gjeldende hull lagt på. */
export type HoleCard = ClientPlayer & {
  score: number | null;
  putts: number | null;
};

/**
 * Live-query #1 — de lokale score-radene for kortene på gjeldende hull,
 * slått sammen med serverens spillerliste.
 */
export function useHoleCards(
  gameId: string,
  currentHole: number,
  players: ClientPlayer[],
): HoleCard[] {
  const scoreIds = useMemo(
    () => players.map((p) => scoreKey(gameId, p.userId, currentHole)),
    [gameId, currentHole, players],
  );
  const scoreIdsKey = scoreIds.join('|');

  const localRows = useLiveQuery<(LocalScore | undefined)[]>(
    () => localDb.scores.bulkGet(scoreIds),
    [scoreIdsKey],
  );

  return players.map((p, i) => {
    const row = localRows?.[i];
    const score = row?.strokes ?? null;
    const putts = row?.putts ?? null; // #939
    return { ...p, score, putts };
  });
}

/**
 * Live-query #2 — #668 / #1352: WHICH of THIS player's holes are entered
 * locally, across the whole round rather than just the current screen. The
 * server snapshot (`myScoredHoles`) misses strokes that are still in the
 * offline queue, so a player who taps in every hole offline would never see
 * the submit CTA. Unioned with the server set below — the server side is the
 * floor (synced holes from earlier sessions Dexie may not hold), the local
 * side adds the unsynced delta. `scores` is unique on
 * (game_id, user_id, hole_number), so the union is never smaller than either
 * side: it can only reveal the CTA earlier, never hide one that used to show.
 * Since #1352 the set — not a count — is the single source for both the CTA
 * and the hole strip.
 *
 * #1577: mirrors the server select — the shared team row lives under the
 * captain's id, so a non-captain reads both ids and keeps the one that owns
 * each hole. Identical to the old single-id query whenever I own my rows.
 */
export function useMyScoredHoles(args: {
  gameId: string;
  gameMode: GameMode;
  myUserId: string;
  myTeamScoreOwnerId: string | null;
  myScoredHoles: number[];
}): Set<number> {
  const { gameId, gameMode, myUserId, myTeamScoreOwnerId, myScoredHoles } = args;
  const scoredHoleOwnerIds = useMemo(
    () => scoreOwnerUserIds(gameMode, myUserId, myTeamScoreOwnerId),
    [gameMode, myUserId, myTeamScoreOwnerId],
  );
  const scoredHoleOwnerKey = scoredHoleOwnerIds.join('|');
  const localScoredRows = useLiveQuery(
    () =>
      localDb.scores
        .where('[gameId+userId]')
        .anyOf(scoredHoleOwnerIds.map((ownerId) => [gameId, ownerId]))
        .filter((r) => r.strokes != null)
        .toArray(),
    [gameId, scoredHoleOwnerKey],
  );
  // The id list is the fetch; `scoredHoleNumbers` is the rule. Applying it out
  // here rather than inside the Dexie callback means a captain's row only counts
  // on the holes where the mode actually collapses — patsome's 4BBB half stays
  // mine even though the same round's foursomes half is the team's.
  return new Set<number>([
    ...myScoredHoles,
    ...scoredHoleNumbers(localScoredRows, gameMode, myUserId, myTeamScoreOwnerId),
  ]);
}

/**
 * Live-query #3 — #1578: the same set as `useMyScoredHoles`, for the OTHER
 * half of a split cup day. The Dexie index `[gameId+userId]` is global across
 * games, so this is that query with the sibling's id — and the sibling's own
 * mode/owner decide who holds each row over there. When the server couldn't
 * read that half we keep null all the way to the strip: a partial local-only
 * set would mark synced-but-not-on-this-device holes as «missing», which is
 * exactly the false accusation the fallback exists to avoid.
 */
export function useSiblingScoredHoles(args: {
  holeStripSibling: HoleStripSibling | null;
  myUserId: string;
}): ReadonlySet<number> | null {
  const { holeStripSibling, myUserId } = args;
  const siblingGameId = holeStripSibling?.gameId ?? null;
  const siblingGameMode = holeStripSibling?.gameMode ?? null;
  const siblingTeamOwnerId = holeStripSibling?.teamOwnerId ?? null;
  const siblingOwnerIds = useMemo(
    () =>
      siblingGameMode == null
        ? []
        : scoreOwnerUserIds(siblingGameMode, myUserId, siblingTeamOwnerId),
    [siblingGameMode, myUserId, siblingTeamOwnerId],
  );
  const siblingOwnerKey = siblingOwnerIds.join('|');
  const siblingLocalScoredRows = useLiveQuery<LocalScore[]>(
    () =>
      siblingGameId == null || siblingOwnerIds.length === 0
        ? Promise.resolve<LocalScore[]>([])
        : localDb.scores
            .where('[gameId+userId]')
            .anyOf(siblingOwnerIds.map((ownerId) => [siblingGameId, ownerId]))
            .filter((r) => r.strokes != null)
            .toArray(),
    [siblingGameId, siblingOwnerKey],
  );
  if (holeStripSibling == null || holeStripSibling.scoredHoles == null) {
    return null;
  }
  return new Set<number>([
    ...holeStripSibling.scoredHoles,
    ...scoredHoleNumbers(
      siblingLocalScoredRows,
      holeStripSibling.gameMode,
      myUserId,
      holeStripSibling.teamOwnerId,
    ),
  ]);
}

/**
 * Live-query #4 — #754: count non-abandoned items in the sync queue so
 * SyncStatusLine can show a "waiting for network" state while scores are
 * queued but unsynced. #1370: scoped to THIS round — the queue is global, so
 * an unsynced stroke from another round used to show up here as "waiting".
 * The whole queue is read in one go and filtered in JS: syncQueue has no
 * gameId index (db.ts).
 */
export function usePendingSyncCount(gameId: string): number {
  const syncQueue = useLiveQuery(() => localDb.syncQueue.toArray(), []);
  return (syncQueue ?? []).filter(
    (item) => item != null && isActiveForGame(item, gameId),
  ).length;
}
