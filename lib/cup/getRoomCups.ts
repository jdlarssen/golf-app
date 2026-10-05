import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { getMyCupIds } from './myCups';
import { getCupSnapshot } from './getCupSnapshot';
import { cupProgress, splitCupsForRoom } from './cupRoomRows';

/** One cup row in the Klubbhus room, before the view builds its link and line. */
export type RoomCupRead = {
  id: string;
  name: string;
  created_by: string;
  group_id: string | null;
  /** In the roster or played a match; `false` = you only created it. */
  playing: boolean;
  /** «X av N kamper spilt» from the cup snapshot; `null` = that read failed. */
  progress: { played: number; total: number } | null;
};

type CupStatusRow = {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'finished';
  created_by: string;
  group_id: string | null;
};

/**
 * The Klubbhus room's cups (#2493): every cup you are part of that is not
 * finished, with its progress, and how many are finished.
 *
 * Status is read FIRST, so a finished cup never builds a snapshot. Each
 * snapshot is read on its own (`allSettled`): one that fails marks that cup's
 * row, not the whole section (#2490). A failed read of the ids or the status
 * fails the section.
 */
export async function getRoomCups(
  supabase: Parameters<typeof getMyCupIds>[0],
  userId: string,
  unknownLabel: string,
): Promise<{ ok: true; live: RoomCupRead[]; finishedCount: number } | { ok: false }> {
  const idsRes = await getMyCupIds(supabase, userId);
  if (!idsRes.ok) return { ok: false };
  if (idsRes.ids.length === 0) return { ok: true, live: [], finishedCount: 0 };

  // Service role. Gate: `idsRes.ids` are the viewer's own cup rows
  // (`getMyCupIds`). A club cup's participant who is not a club member cannot
  // read the cup under RLS, so the request client would drop it (same authz
  // shape as /admin/cup).
  const { data, error } = await getAdminClient()
    .from('tournaments')
    .select('id, name, status, created_by, group_id')
    .in('id', idsRes.ids)
    .order('created_at', { ascending: false })
    .returns<CupStatusRow[]>();
  if (error || !data) {
    console.error('[getRoomCups] status', error);
    return { ok: false };
  }

  const { live, finishedCount } = splitCupsForRoom(data);
  // Service role inside `getCupSnapshot`. Gate: the same own cup ids, and only
  // the ones that are not finished.
  const snapshots = await Promise.allSettled(live.map((cup) => getCupSnapshot(cup.id, unknownLabel)));
  const playing = new Set(idsRes.playing);
  return {
    ok: true,
    finishedCount,
    live: live.map((cup, i) => {
      const snap = snapshots[i];
      if (snap.status === 'rejected') console.error('[getRoomCups] snapshot', cup.id, snap.reason);
      return {
        id: cup.id,
        name: cup.name,
        created_by: cup.created_by,
        group_id: cup.group_id,
        playing: playing.has(cup.id),
        progress: snap.status === 'fulfilled' ? cupProgress(snap.value?.leaderboard ?? null) : null,
      };
    }),
  };
}
