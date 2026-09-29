import { SERVER_SCORE_COLUMNS } from './conflict';
import { currentDeviceUserId } from './currentUser';
import { mergeServerScores } from './mergeServerScore';
import { getBrowserClient } from '@/lib/supabase/client';
import { selectAllRowsResult } from '@/lib/supabase/selectAllRows';

/**
 * Pulls the game's scores from the server into Dexie. `RealtimeMount` runs it
 * on mount, focus, `online` and channel rejoin (#2093): exactly when an iOS PWA
 * wakes up and may have missed realtime events.
 *
 * Cost (#2227): in a live or finished game RLS lets every player read every
 * row, ≈2 700 at 150 players, and the catch-up fires on every focus. So:
 *
 * - All rows merge in ONE Dexie transaction (`mergeServerScores`).
 * - After a full read, later runs read only rows whose `updated_at` is at or
 *   after the newest one seen, minus a 2-minute overlap for writes that
 *   committed late. Every applied score write sets `updated_at = now()`
 *   (`upsert_score_if_newer`, migration 0123; insert defaults to now()).
 * - A full read still happens every 15 minutes. It catches rows that become
 *   visible without a new `updated_at` (a flight moved, scores revealed at the
 *   end), and a first read that found no rows has no watermark to go from.
 */

export const FULL_CATCH_UP_EVERY_MS = 15 * 60_000;
export const CATCH_UP_OVERLAP_MS = 2 * 60_000;

export type CatchUpState = {
  /** Newest `updated_at` merged so far (ISO), null when nothing was read yet. */
  watermarkIso: string | null;
  /** When the last full read finished, in local clock ms. */
  lastFullAt: number;
};

export type CatchUpPlan = { kind: 'full' } | { kind: 'delta'; sinceIso: string };

/**
 * Per signed-in user and game. The user is part of the key so another user in
 * the same tab never inherits a watermark for a local database that was
 * cleared on the owner switch (`localDataCleanup.ts`). Logout is a full page
 * load, which drops this module state anyway.
 */
const states = new Map<string, CatchUpState>();

export function planCatchUp(state: CatchUpState | undefined, nowMs: number): CatchUpPlan {
  if (!state || state.watermarkIso === null || nowMs - state.lastFullAt >= FULL_CATCH_UP_EVERY_MS) {
    return { kind: 'full' };
  }
  const sinceMs = Date.parse(state.watermarkIso) - CATCH_UP_OVERLAP_MS;
  return { kind: 'delta', sinceIso: new Date(sinceMs).toISOString() };
}

/**
 * State after a successful read. PostgREST returns `+00:00` offsets, so the
 * stamps are compared as instants (#2211), never as strings.
 */
export function nextCatchUpState(
  prev: CatchUpState | undefined,
  plan: CatchUpPlan,
  rows: readonly { updated_at: string | null }[],
  nowMs: number,
): CatchUpState {
  let newestMs = prev?.watermarkIso ? Date.parse(prev.watermarkIso) : Number.NEGATIVE_INFINITY;
  for (const row of rows) {
    const ms = row.updated_at ? Date.parse(row.updated_at) : Number.NaN;
    if (ms > newestMs) newestMs = ms;
  }
  return {
    watermarkIso: Number.isFinite(newestMs) ? new Date(newestMs).toISOString() : null,
    lastFullAt: plan.kind === 'full' ? nowMs : (prev?.lastFullAt ?? nowMs),
  };
}

export async function catchUpGameScores(gameId: string): Promise<void> {
  const supabase = getBrowserClient();
  // Once per run, before the read (the state key needs it) and outside the
  // merge: awaiting a non-Dexie promise inside a Dexie transaction commits it
  // early (PrematureCommitError).
  const currentUserId = await currentDeviceUserId();
  const key = `${currentUserId ?? 'anon'}:${gameId}`;
  const plan = planCatchUp(states.get(key), Date.now());

  const { data } = await selectAllRowsResult(
    (from, to) => {
      const query = supabase
        .from('scores')
        .select(SERVER_SCORE_COLUMNS)
        .eq('game_id', gameId);
      return (plan.kind === 'delta' ? query.gte('updated_at', plan.sinceIso) : query)
        .order('id')
        .range(from, to);
    },
    'RealtimeMount catch-up scores',
  );
  // A failed read leaves the state alone; the next trigger tries again.
  if (!data) return;

  // #1611: LWW, conflict notice and queue cleanup all live in the shared merge.
  // Catch-up runs exactly when an iOS PWA wakes up and finds someone else's
  // number in place of yours.
  await mergeServerScores(
    data.map((row) => ({
      gameId: row.game_id,
      userId: row.user_id,
      holeNumber: row.hole_number,
      strokes: row.strokes,
      putts: row.putts ?? null, // #939
      enteredBy: row.entered_by,
      clientUpdatedAt: row.client_updated_at,
      serverUpdatedAt: row.updated_at,
    })),
    currentUserId,
  );

  // Only after the merge landed, so a failed merge is read again next time.
  states.set(key, nextCatchUpState(states.get(key), plan, data, Date.now()));
}
