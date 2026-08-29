import type { GameMode } from '@/lib/scoring/modes/types';
import { modeCollapsesToTeamCard } from '@/lib/scoring/modes/types';

/**
 * Who owns the `scores` row for ONE hole, seen from the viewer's seat (#1577).
 *
 * In the team-collapsed modes (scramble family, alternate-shot matchplay,
 * patsome from hole 7) the whole team taps into a single row owned by the
 * captain — `teamScoreOwnerId` in `./teamCaptain.ts` picks them. Everywhere
 * else the viewer owns their own row.
 *
 * The question is per HOLE, not per game: patsome plays 4BBB on holes 1-6
 * (own ball, own row) and foursomes on 7-18 (shared row). Asking once per
 * round and applying the answer to every hole would count the wrong rows on
 * one of the halves — which is why the completion sets that drive the
 * deliver-CTA call this per row rather than filtering on a flat id set.
 *
 * `teamOwnerId` is `null` when the viewer has no team, when the roster came
 * back empty, or when every member withdrew. All three mean the same thing
 * here: fall back to the viewer's own rows, exactly as before #1577.
 */
export function scoreOwnerForHole(
  mode: GameMode,
  holeNumber: number,
  viewerId: string,
  teamOwnerId: string | null,
): string {
  return teamOwnerId != null && modeCollapsesToTeamCard(mode, holeNumber)
    ? teamOwnerId
    : viewerId;
}

/**
 * The distinct `user_id`s a completion query has to ask for — the viewer, plus
 * the captain when this round ever collapses onto their row (#1577).
 *
 * Deliberately wider than `scoreOwnerForHole`: a query runs once for the whole
 * round, so it must cover both halves of a patsome round even though each
 * individual hole has exactly one owner. Callers narrow the result per row
 * with `scoreOwnerForHole` — the id list is the fetch, that call is the rule.
 *
 * Hole 18 answers «does this mode ever collapse»: patsome is the only mode
 * whose answer varies by hole, and its foursomes half runs 7-18.
 */
export function scoreOwnerUserIds(
  mode: GameMode,
  viewerId: string,
  teamOwnerId: string | null,
): string[] {
  if (teamOwnerId == null || teamOwnerId === viewerId) return [viewerId];
  return modeCollapsesToTeamCard(mode, 18) ? [viewerId, teamOwnerId] : [viewerId];
}

/** The minimum a score row must carry for us to ask who owns it. */
export type ScoredHoleRow = { holeNumber: number; userId: string };

/**
 * Rows fetched with `scoreOwnerUserIds` → the hole numbers the viewer actually
 * has a score on. The id list is the fetch, this is the rule: each row survives
 * only if it belongs to the id that owns THAT hole, so a captain's shared row
 * counts on the collapsed holes and the viewer's own row on the rest.
 *
 * Same shape for both sides of the sync line — the server passes PostgREST rows
 * (mapped to camelCase) and the client passes Dexie rows — so the hole strip
 * cannot end up with one semantics online and another offline (#1578).
 *
 * Never deduplicates: `scores` is unique on (game_id, user_id, hole_number) and
 * exactly one id owns each hole, so a hole can appear at most once.
 */
export function scoredHoleNumbers(
  rows: readonly (ScoredHoleRow | null | undefined)[] | null | undefined,
  mode: GameMode,
  viewerId: string,
  teamOwnerId: string | null,
): number[] {
  return ownedScoreRows(rows, mode, viewerId, teamOwnerId).map(
    (r) => r.holeNumber,
  );
}

/**
 * The same rule, keeping the rows instead of projecting to hole numbers —
 * for callers that render the surviving rows (the submit review page reads
 * strokes/entered_by off them). Generic so the input rows come back
 * unnarrowed (#1715).
 */
export function ownedScoreRows<T extends ScoredHoleRow>(
  rows: readonly (T | null | undefined)[] | null | undefined,
  mode: GameMode,
  viewerId: string,
  teamOwnerId: string | null,
): T[] {
  return (rows ?? []).filter(
    (r): r is T =>
      r != null &&
      r.userId === scoreOwnerForHole(mode, r.holeNumber, viewerId, teamOwnerId),
  );
}
