import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { expectAffected } from '@/lib/supabase/affectedRows';
import { startScheduledGame } from './startScheduledGame';
import { persistResultSummaries } from './persistResultSummaries';
import { persistScoreDifferentials } from './persistScoreDifferentials';
import type { GameStatus } from './status';
import type { HoleSegment } from '@/lib/scoring';
import type { GameMode, GameModeConfig } from '@/lib/scoring/modes/types';

export type DerivedStatusPatch = {
  status: GameStatus;
  started_at?: string | null;
  ended_at?: string | null;
  round_report?: string | null;
};

/**
 * Every game whose `source_game_id` points at `hostGameId` (#1441 D3).
 * A derived game never has children of its own — nothing ever points at a
 * derived game as ITS source — so calling this with a derived game's own
 * id always returns `[]`, without any extra "is this a host" check.
 */
async function findDerivedGameIds(
  supabase: SupabaseClient<Database>,
  hostGameId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('games')
    .select('id')
    .eq('source_game_id', hostGameId)
    .returns<{ id: string }[]>();
  if (error) {
    throw new Error(`findDerivedGameIds: ${error.message}`);
  }
  return (data ?? []).map((row) => row.id);
}

/**
 * Fans a host game's reopen out to its derived games (#1441 D3): a raw
 * batch UPDATE that gives every derived game (`source_game_id =
 * hostGameId`) the identical status/timestamp patch as the host, in the
 * same operation. Used by `reopenGame` (→ 'active', clearing `ended_at` +
 * `round_report`) — reopening needs no per-player computation, unlike
 * finishing (see `finishDerivedGames` below, used by `endGame` /
 * `endGameWithSideWinners` instead of this for the finish transition).
 *
 * Deliberately NOT used for the scheduled→active transition either — see
 * `startDerivedGames` below for why that one needs the real
 * `startScheduledGame` per derived game instead of a raw patch.
 *
 * 0 derived games is the common case (most games aren't cup hosts) and a
 * valid no-op — this returns `{ count: 0 }` without issuing an UPDATE.
 * When derived games DO exist, `expectAffected` asserts the UPDATE
 * actually touched every row the lookup found — a silent 0-row UPDATE on
 * a non-empty set is the #667/#704 bug pattern, not a no-op.
 *
 * Best-effort by design (mirrors `persistResultSummaries` /
 * `notifyAchievementUnlocks`): every failure is caught and logged here so
 * a fan-out problem can never roll back or block the host's own status
 * change, which has already committed by the time this runs.
 */
export async function syncDerivedGamesStatus(
  supabase: SupabaseClient<Database>,
  hostGameId: string,
  patch: DerivedStatusPatch,
): Promise<{ count: number }> {
  try {
    const derivedIds = await findDerivedGameIds(supabase, hostGameId);
    if (derivedIds.length === 0) return { count: 0 };

    const updated = expectAffected(
      await supabase
        .from('games')
        .update(patch)
        .eq('source_game_id', hostGameId)
        .select('id'),
      'syncDerivedGamesStatus',
    );
    return { count: updated.length };
  } catch (err) {
    console.error('[syncDerivedGamesStatus] fan-out failed', {
      hostGameId,
      patch,
      err,
    });
    return { count: 0 };
  }
}

type DerivedGameForScoring = {
  id: string;
  game_mode: GameMode;
  mode_config: GameModeConfig;
  course_id: string;
  hole_segment: HoleSegment;
  source_game_id: string | null;
};

/**
 * Finishes every derived game belonging to `hostGameId` (#1441 D3): the
 * same raw status/`ended_at` patch as `syncDerivedGamesStatus`, PLUS —
 * unlike reopen, which needs nothing further — a `persistResultSummaries`
 * + `persistScoreDifferentials` pass per derived game, so a finished
 * derived singles match shows a real result (not a null/🏆-fallback) in
 * whatever list reads `game_players.result_summary`. Both persist helpers
 * already redirect scores via `source_game_id ?? id` and scope holes via
 * `hole_segment` (see `buildModeResultForGame`), so feeding them the
 * derived game's own row is all that's needed — no reshaping.
 * `persistScoreDifferentials` naturally no-ops on a 9-hole segment (WHS
 * needs a full 18 scored holes) — verified, not special-cased here.
 *
 * Used by `endGame`/`endGameWithSideWinners` in place of
 * `syncDerivedGamesStatus` for the finish transition specifically.
 *
 * Best-effort, same contract as `syncDerivedGamesStatus`: every failure is
 * caught and logged, never blocking or undoing the host's own finish.
 */
export async function finishDerivedGames(
  supabase: SupabaseClient<Database>,
  hostGameId: string,
  endedAt: string,
): Promise<{ count: number }> {
  try {
    const { data: derived, error } = await supabase
      .from('games')
      .select('id, game_mode, mode_config, course_id, hole_segment, source_game_id')
      .eq('source_game_id', hostGameId)
      .returns<DerivedGameForScoring[]>();
    if (error) {
      throw new Error(`finishDerivedGames lookup: ${error.message}`);
    }
    if (!derived || derived.length === 0) return { count: 0 };

    const updated = expectAffected(
      await supabase
        .from('games')
        .update({ status: 'finished', ended_at: endedAt })
        .eq('source_game_id', hostGameId)
        .select('id'),
      'finishDerivedGames',
    );

    for (const g of derived) {
      await persistResultSummaries(g);
      await persistScoreDifferentials(g.id);
    }

    return { count: updated.length };
  } catch (err) {
    console.error('[finishDerivedGames] fan-out failed', { hostGameId, err });
    return { count: 0 };
  }
}

/**
 * Starts every derived game belonging to `hostGameId` (#1441 D3) — used
 * when the HOST flips scheduled → active.
 *
 * Unlike `syncDerivedGamesStatus`'s raw patch (correct for finish/reopen,
 * which need no per-player computation), starting a game freezes each
 * player's `course_handicap` (`startScheduledGame`'s step 3) — a raw
 * status patch would leave that permanently null for derived games. That
 * matters here specifically because nothing else can ever start a derived
 * game independently: cup-generated matches never get a
 * `scheduled_tee_off_at` (the generator leaves it at its NULL default), so
 * neither the cron sweep (`scheduled_tee_off_at <= now` never matches
 * NULL) nor the E1 page-visit fallback (same NULL guard) can reach them,
 * and a derived game's own game-home is a read-only link to the host, not
 * a start affordance. This is the one lifecycle event where the fan-out
 * has to run the real per-game start flow rather than a shared raw patch.
 *
 * Best-effort: a derived game that fails to start (e.g. an incomplete
 * roster) is logged and skipped — it never blocks or undoes the host's
 * own start, which has already committed by the time this runs.
 */
export async function startDerivedGames(
  supabase: SupabaseClient<Database>,
  hostGameId: string,
): Promise<{ startedCount: number; failedIds: string[] }> {
  let derivedIds: string[];
  try {
    derivedIds = await findDerivedGameIds(supabase, hostGameId);
  } catch (err) {
    console.error('[startDerivedGames] lookup failed', { hostGameId, err });
    return { startedCount: 0, failedIds: [] };
  }
  if (derivedIds.length === 0) return { startedCount: 0, failedIds: [] };

  let startedCount = 0;
  const failedIds: string[] = [];
  for (const id of derivedIds) {
    try {
      const result = await startScheduledGame(supabase, id);
      if (result.ok) {
        startedCount += 1;
      } else {
        failedIds.push(id);
        console.error('[startDerivedGames] derived game could not start', {
          hostGameId,
          derivedGameId: id,
          reason: result.reason,
        });
      }
    } catch (err) {
      failedIds.push(id);
      console.error('[startDerivedGames] derived game start threw', {
        hostGameId,
        derivedGameId: id,
        err,
      });
    }
  }
  return { startedCount, failedIds };
}
