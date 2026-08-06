import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import type { GameStatus } from '@/lib/games/status';

/**
 * #1441 (owner-QA finding A): «når jeg sletter en cup for godt så slettes
 * ikke kampene som ble generert.» The original design (games.tournament_id
 * ON DELETE SET NULL) is right for a cup with real play — those matches
 * should survive as standalone history. It is wrong for a freshly generated,
 * never-played batch: deleting a draft/never-started cup should not strand a
 * pile of scheduled games (and their derived singles) on every player's home
 * screen.
 */
export type CupHostGameForDeletion = {
  id: string;
  status: GameStatus;
  /** Whether ANY `scores` row exists for this host game. Irrelevant for
   *  non-'active' statuses — see `selectNeverPlayedHostGameIds`. */
  hasScores: boolean;
};

/**
 * Pure predicate: which HOST games (never derived — see the module docstring
 * on `planTournamentGameDeletion` for why) never really happened, and should
 * be hard-deleted along with their tournament instead of surviving as
 * standalone history.
 *
 * A host is "never played":
 *  - status 'draft' or 'scheduled' — the round never started.
 *  - status 'active' with zero `scores` rows — started but nobody entered a
 *    stroke.
 *
 * A host is KEPT (unaffected by this predicate — its tournament_id gets SET
 * NULL by the FK instead, same as before #1441):
 *  - status 'finished' — always kept, regardless of scores. A finished round
 *    with zero scores is a pre-existing edge case (e.g. admin force-finished
 *    an empty game) this predicate deliberately does not second-guess.
 *  - status 'active' with at least one scores row — real play happened.
 */
export function selectNeverPlayedHostGameIds(
  hosts: CupHostGameForDeletion[],
): string[] {
  return hosts
    .filter(
      (g) =>
        g.status === 'draft' ||
        g.status === 'scheduled' ||
        (g.status === 'active' && !g.hasScores),
    )
    .map((g) => g.id);
}

export type TournamentDeletionPlan = {
  /** Host ids (`source_game_id` null) to hard-delete explicitly. */
  hostIdsToDelete: string[];
  /**
   * Derived ids (singles matches reading a host's scores) that ride along
   * via the `source_game_id … on delete cascade` FK (migration 0151) once
   * their host above is deleted — informational only, NEVER deleted
   * directly. A derived game never carries its own `scores` rows, so
   * running `selectNeverPlayedHostGameIds`'s own-scores test directly on a
   * derived row would misclassify every 'active' derived match as
   * never-played regardless of whether its host had real play — the trap
   * this two-pass shape avoids.
   */
  derivedIdsRidingAlong: string[];
  /** Every game currently linked to the tournament (host + derived) — for
   *  the confirm-page's "N matches / M remain" copy. */
  totalGames: number;
};

/**
 * Resolves the full deletion plan for a tournament's games (#1441 finding
 * A). Shared by `deleteTournament` (executes it) and `CupDeleteConfirm`
 * (previews it) — one home for the rule, per the multi-layer-rule discipline.
 *
 * Uses the admin client deliberately, mirroring `getCupSnapshot`/
 * `getGameWithPlayers`: the caller is already gated by
 * `requireAdminOrClubAdminOfCup`, and the `scores` SELECT RLS policy only
 * grants a non-participant (e.g. a club-admin who didn't play in the match)
 * visibility into an 'active' game's scores via `is_admin()` — a
 * request-scoped read from a non-global-admin club-admin would silently see
 * ZERO scores for an actively-played match and misclassify it as
 * never-played. That is a data-loss risk, not just a UX gap, so this read
 * path does not depend on the caller's own RLS visibility. The actual
 * DELETE in `deleteTournament` stays on the request-scoped client — see
 * that function's own comment for why.
 */
export async function planTournamentGameDeletion(
  tournamentId: string,
): Promise<TournamentDeletionPlan> {
  const supabase = getAdminClient();

  const { data: rows, error } = await supabase
    .from('games')
    .select('id, status, source_game_id')
    .eq('tournament_id', tournamentId)
    .returns<
      { id: string; status: GameStatus; source_game_id: string | null }[]
    >();
  if (error) throw error;
  const allGames = rows ?? [];
  const hosts = allGames.filter((g) => g.source_game_id == null);
  const derived = allGames.filter((g) => g.source_game_id != null);

  const activeHostIds = hosts
    .filter((h) => h.status === 'active')
    .map((h) => h.id);
  const scoredHostIds = new Set<string>();
  if (activeHostIds.length > 0) {
    const { data: scoreRows, error: scoresError } = await supabase
      .from('scores')
      .select('game_id')
      .in('game_id', activeHostIds)
      .returns<{ game_id: string }[]>();
    if (scoresError) throw scoresError;
    for (const row of scoreRows ?? []) scoredHostIds.add(row.game_id);
  }

  const hostIdsToDelete = selectNeverPlayedHostGameIds(
    hosts.map((h) => ({
      id: h.id,
      status: h.status,
      hasScores: scoredHostIds.has(h.id),
    })),
  );
  const hostIdsToDeleteSet = new Set(hostIdsToDelete);
  const derivedIdsRidingAlong = derived
    .filter(
      (d) => d.source_game_id != null && hostIdsToDeleteSet.has(d.source_game_id),
    )
    .map((d) => d.id);

  return {
    hostIdsToDelete,
    derivedIdsRidingAlong,
    totalGames: allGames.length,
  };
}
