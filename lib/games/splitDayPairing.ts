import type { HoleSegment } from '@/lib/scoring';
import { osloParts } from '@/lib/format/teeOff';

/**
 * Split-day cup pairing (#1449) — the single home for "which two host games are
 * the two halves of one physical cup round" (AGENTS.md trap 4). Pure and generic
 * so the active Home card and the finished cup-day card share one rule.
 *
 * A split cup day (#1441) runs 18 physical holes across two HOST games: a front9
 * host and a back9 host, both under the same tournament, played the same day.
 * (The derived singles game carries `source_game_id` and is filtered out by the
 * callers before pairing — it never reaches this function.) This pairs those two
 * halves; everything else — full-segment games, non-cup games, and any half that
 * can't find its opposite — degrades to a single entry. Never crashes, never
 * hides a game.
 */

/** A game handed to the pairing rule, carrying arbitrary caller `data`. */
export type PairableGame<T> = {
  gameId: string;
  /** The cup this game belongs to, or `null` for a non-cup game. */
  tournamentId: string | null;
  holeSegment: HoleSegment;
  /**
   * The instant used to bucket a game into an Oslo calendar day — the caller
   * passes `scheduled_tee_off_at ?? created_at` (active list) or
   * `scheduled_tee_off_at ?? ended_at` (finished list). `null` → the game can't
   * be bucketed and stays single.
   */
  dayAnchor: Date | null;
  /**
   * `false` forces the game to stay a single (never merged). Used to keep a
   * half the viewer has withdrawn from out of the pair (contract guardrail:
   * "degrade to single-card behavior for the remaining half"). Defaults to
   * `true`.
   */
  pairEligible?: boolean;
  data: T;
};

export type SplitDayEntry<T> =
  | { kind: 'single'; game: PairableGame<T> }
  | {
      kind: 'pair';
      tournamentId: string;
      dayKey: string;
      front9: PairableGame<T>;
      back9: PairableGame<T>;
    };

/**
 * Stable Oslo calendar-day key (`YYYY-MM-DD`) for an instant. Oslo-pinned via
 * {@link osloParts} so a UTC Vercel server and an Oslo browser bucket a game
 * into the same day — never the local-TZ `Date` getters (the DST/host-TZ trap).
 */
export function osloDayKey(date: Date): string {
  const { year, month, day } = osloParts(date);
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** A row carrying the two columns a split-day anchor is resolved from. */
export type SplitDayAnchored = {
  scheduled_tee_off_at: string | null;
  created_at: string | null;
};

/**
 * The instant a game buckets into for split-day pairing: its scheduled tee-off,
 * else its `created_at` fallback. This is the physical-day identity the active
 * Home list already uses (`scheduled_tee_off_at ?? created_at`); the finished
 * list passes `ended_at` in the fallback slot. `null` only when BOTH are missing
 * — a defensive case, `created_at` is a NOT NULL column in practice.
 */
export function splitDayAnchor(row: SplitDayAnchored): Date | null {
  const raw = row.scheduled_tee_off_at ?? row.created_at;
  return raw ? new Date(raw) : null;
}

/**
 * Pure: keeps only the `candidates` that share the SOURCE game's Oslo split-day.
 * The one home for the "which day is this host on" rule (AGENTS.md trap 4),
 * shared by segment-sibling resolution (#1466 delivery) and the admin
 * delivery-reminder exclusion — so a two-day cup (Ryder weekend, one
 * `tournament_id` spanning day-1 and day-2 hosts) can never resolve the wrong
 * day's host. A source (or candidate) that can't be anchored drops out, exactly
 * as {@link pairSplitDayGames} skips a null `dayAnchor`.
 */
export function candidatesOnSameSplitDay<T extends SplitDayAnchored>(
  source: SplitDayAnchored,
  candidates: T[],
): T[] {
  const sourceAnchor = splitDayAnchor(source);
  if (sourceAnchor == null) return [];
  const sourceDay = osloDayKey(sourceAnchor);
  return candidates.filter((c) => {
    const anchor = splitDayAnchor(c);
    return anchor != null && osloDayKey(anchor) === sourceDay;
  });
}

// Separator between a bucket's tournament id and its Oslo day key. `::` is safe
// and greppable: a UUID tournament id and a `YYYY-MM-DD` day key can neither
// contain a colon, so the first `::` is unambiguously the separator. (Was a
// literal NUL byte, which git treated as a binary diff — #1449 round 1.)
const BUCKET_KEY_SEP = '::';

/**
 * Groups `games` into single/pair entries. Preserves input order; a pair is
 * anchored at the position of its first-seen half, and the other half is
 * consumed (not re-emitted). Only a bucket with EXACTLY one eligible front9
 * and one eligible back9 forms a pair — a duplicated or missing half degrades
 * every member of that bucket to a single, so ambiguity never mis-merges.
 *
 * `dayKeyOf` is here for the native app (#2752): Hermes has no ICU time zones, so
 * `osloDayKey` cannot run on the phone, and the app buckets on the device's own
 * calendar day instead (the same choice as `native/app/src/lib/homeDates.ts`).
 */
export function pairSplitDayGames<T>(
  games: PairableGame<T>[],
  dayKeyOf: (date: Date) => string = osloDayKey,
): SplitDayEntry<T>[] {
  // Bucket the pair-eligible halves by (tournament, Oslo day).
  const buckets = new Map<string, PairableGame<T>[]>();
  for (const game of games) {
    if (game.pairEligible === false) continue;
    if (game.tournamentId == null || game.dayAnchor == null) continue;
    if (game.holeSegment !== 'front9' && game.holeSegment !== 'back9') continue;
    const key = `${game.tournamentId}${BUCKET_KEY_SEP}${dayKeyOf(game.dayAnchor)}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(game);
    else buckets.set(key, [game]);
  }

  // Resolve each bucket to a pair only when it holds exactly one of each half.
  // `pairedAnchor` maps the first-seen half's gameId → the pair entry to emit
  // at that position; `consumed` holds the second half's gameId to skip.
  const pairedAnchor = new Map<string, SplitDayEntry<T>>();
  const consumed = new Set<string>();
  const orderIndex = new Map<string, number>();
  games.forEach((game, i) => orderIndex.set(game.gameId, i));

  for (const [key, bucket] of buckets) {
    const front9s = bucket.filter((g) => g.holeSegment === 'front9');
    const back9s = bucket.filter((g) => g.holeSegment === 'back9');
    if (front9s.length !== 1 || back9s.length !== 1) continue;
    const front9 = front9s[0];
    const back9 = back9s[0];
    const dayKey = key.slice(key.indexOf(BUCKET_KEY_SEP) + BUCKET_KEY_SEP.length);
    const anchorId =
      (orderIndex.get(front9.gameId) ?? 0) <= (orderIndex.get(back9.gameId) ?? 0)
        ? front9.gameId
        : back9.gameId;
    const otherId = anchorId === front9.gameId ? back9.gameId : front9.gameId;
    pairedAnchor.set(anchorId, {
      kind: 'pair',
      tournamentId: front9.tournamentId as string,
      dayKey,
      front9,
      back9,
    });
    consumed.add(otherId);
  }

  const entries: SplitDayEntry<T>[] = [];
  for (const game of games) {
    if (consumed.has(game.gameId)) continue;
    const pair = pairedAnchor.get(game.gameId);
    if (pair) entries.push(pair);
    else entries.push({ kind: 'single', game });
  }
  return entries;
}
