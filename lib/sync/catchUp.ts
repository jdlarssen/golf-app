import { currentDeviceUserId } from './currentUser';
import { mergeServerScore } from './mergeServerScore';
import { getBrowserClient } from '@/lib/supabase/client';
import { selectAllRowsResult } from '@/lib/supabase/selectAllRows';

/**
 * Pulls the game's scores from the server into Dexie. `RealtimeMount` runs it
 * on mount, focus, `online` and channel rejoin (#2093): exactly when an iOS PWA
 * wakes up and may have missed realtime events.
 */
export async function catchUpGameScores(gameId: string): Promise<void> {
  const supabase = getBrowserClient();
  const { data } = await selectAllRowsResult(
    (from, to) =>
      supabase
        .from('scores')
        .select(
          'game_id, user_id, hole_number, strokes, putts, entered_by, client_updated_at, updated_at',
        )
        .eq('game_id', gameId)
        .order('id')
        .range(from, to),
    'RealtimeMount catch-up scores',
  );
  if (!data) return;
  // Once per catch-up run, outside the merge: awaiting a non-Dexie promise
  // inside a Dexie transaction commits it early (PrematureCommitError).
  const currentUserId = await currentDeviceUserId();
  for (const row of data) {
    // #1611: LWW, conflict notice and queue cleanup all live in the shared
    // merge. Catch-up runs on mount/focus/online/rejoin — i.e. exactly when an iOS
    // PWA wakes up and finds someone else's number in place of yours.
    await mergeServerScore(
      {
        gameId: row.game_id,
        userId: row.user_id,
        holeNumber: row.hole_number,
        strokes: row.strokes,
        putts: row.putts ?? null, // #939
        enteredBy: row.entered_by,
        clientUpdatedAt: row.client_updated_at,
        serverUpdatedAt: row.updated_at,
      },
      currentUserId,
    );
  }
}
