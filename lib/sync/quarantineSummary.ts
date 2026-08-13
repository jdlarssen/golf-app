import type { SyncQueueItem } from './db';

/**
 * Pure summary of quarantined (#668 `abandonedAt`) sync-queue items, grouped
 * per game so SyncBanner can name the affected holes and link to them (#1369).
 *
 * No Dexie lookups: `scoreId` IS the score key `${gameId}:${userId}:${holeNumber}`
 * (see `scoreKey` in db.ts) and both uuids are colon-free, so a plain split
 * recovers gameId + holeNumber synchronously.
 */

export interface QuarantinedGame {
  gameId: string;
  /** Affected hole numbers, sorted ascending, deduped. */
  holes: number[];
  /** Quarantined queue items for this game. */
  count: number;
}

export interface QuarantineSummary {
  /** Group for `currentGameId`, or null when that game has no quarantined items. */
  currentGame: QuarantinedGame | null;
  /** Remaining games, sorted by gameId for deterministic rendering. */
  otherGames: QuarantinedGame[];
  /** Quarantined items whose scoreId could not be parsed (never expected, but
   * a malformed id must degrade to the generic message, not crash the banner). */
  unparsedCount: number;
  /** All quarantined items, parsed or not. */
  totalCount: number;
  /** Distinct non-empty lastError texts in queue order, across all games —
   * shown in the banner's details disclosure. */
  errors: string[];
}

function parseScoreId(
  scoreId: string,
): { gameId: string; holeNumber: number } | null {
  const parts = scoreId.split(':');
  if (parts.length !== 3) return null;
  const [gameId, userId, holePart] = parts;
  if (!gameId || !userId) return null;
  const holeNumber = Number(holePart);
  if (!Number.isInteger(holeNumber) || holeNumber < 1) return null;
  return { gameId, holeNumber };
}

export function summarizeQuarantine(
  items: readonly SyncQueueItem[],
  currentGameId: string | null,
): QuarantineSummary {
  const abandoned = items.filter((i) => i.abandonedAt != null);

  const byGame = new Map<string, { holes: Set<number>; count: number }>();
  let unparsedCount = 0;
  const errors: string[] = [];

  for (const item of abandoned) {
    if (item.lastError && !errors.includes(item.lastError)) {
      errors.push(item.lastError);
    }
    const parsed = parseScoreId(item.scoreId);
    if (!parsed) {
      unparsedCount++;
      continue;
    }
    const group = byGame.get(parsed.gameId) ?? { holes: new Set(), count: 0 };
    group.holes.add(parsed.holeNumber);
    group.count++;
    byGame.set(parsed.gameId, group);
  }

  const toGroup = (gameId: string): QuarantinedGame => {
    const g = byGame.get(gameId)!;
    return { gameId, holes: [...g.holes].sort((a, b) => a - b), count: g.count };
  };

  const currentGame =
    currentGameId != null && byGame.has(currentGameId)
      ? toGroup(currentGameId)
      : null;
  const otherGames = [...byGame.keys()]
    .filter((id) => id !== currentGameId)
    .sort()
    .map(toGroup);

  return {
    currentGame,
    otherGames,
    unparsedCount,
    totalCount: abandoned.length,
    errors,
  };
}

/**
 * Locale-aware "3, 7 og 12" / "3, 7 and 12" join for the banner message.
 * ICU messages can't join lists, so the string is built here and passed to
 * `t()` as a plain placeholder.
 */
export function formatHoleList(holes: number[], locale: string): string {
  return new Intl.ListFormat(locale, {
    style: 'long',
    type: 'conjunction',
  }).format(holes.map(String));
}
